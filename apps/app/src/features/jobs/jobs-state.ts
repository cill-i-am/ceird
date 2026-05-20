"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateJobInput,
  CreateJobResponse,
  Job,
  JobContactOption,
  JobListCursorType,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  JobPriority,
  JobStatus,
  UserIdType,
} from "@ceird/jobs-core";
import { JobListItemSchema } from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { Cause, Effect, Exit, Option, Schema } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { listAllCurrentServerJobs } from "#/features/jobs/jobs-server";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { upsertOrganizationLabel } from "#/features/labels/labels-state";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  markTanStackDbCollectionWrite,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceSyncedCollectionData,
  stripTanStackDbCollectionData,
} from "#/lib/tanstack-db-collection";
import type {
  TanStackDbCollectionSnapshot,
  TanStackDbCollectionWriteVersionRef,
} from "#/lib/tanstack-db-collection";
import { seedQueryCollectionInitialData } from "#/lib/tanstack-db-query";
import { useHydratedCollectionItems } from "#/lib/tanstack-db-react";

import { organizationJobsQueryKey } from "./jobs-query-keys";

type JobsStatusFilter = "active" | "all" | JobStatus;

export type JobsAssigneeFilter =
  | { readonly kind: "all" }
  | { readonly kind: "unassigned" }
  | { readonly kind: "user"; readonly userId: UserIdType };

export interface JobsListFilters {
  readonly assigneeId: JobsAssigneeFilter;
  readonly coordinatorId: UserIdType | "all";
  readonly labelId: LabelIdType | "all";
  readonly priority: JobPriority | "all";
  readonly query: string;
  readonly serviceAreaId: ServiceAreaIdType | "all";
  readonly siteId: SiteIdType | "all";
  readonly status: JobsStatusFilter;
}

export interface JobsListState {
  readonly items: readonly JobListItem[];
  readonly nextCursor?: JobListCursorType | undefined;
  readonly organizationId: OrganizationId | null;
}

export interface JobsOptionsState {
  readonly data: JobOptionsResponse;
  readonly organizationId: OrganizationId | null;
}

export interface JobsNotice {
  readonly kind: "created";
  readonly title: string;
}

export interface JobsAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

type JobsCollection = ReturnType<typeof makeJobsCollection>;

interface JobsStateStore {
  readonly collectionWriteVersionRef: TanStackDbCollectionWriteVersionRef;
  readonly fallbackJobsRef: React.MutableRefObject<readonly JobListItem[]>;
  readonly jobOrderRef: React.MutableRefObject<readonly JobListItem["id"][]>;
  readonly jobs: JobsCollection;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly queryClient: QueryClient;
}

interface JobsProviderState {
  readonly createJobResult: JobsAsyncResult;
  readonly nextCursor?: JobListCursorType | undefined;
  readonly notice: JobsNotice | null;
  readonly options: JobOptionsResponse;
}

type JobsProviderStateAction =
  | {
      readonly nextCursor?: JobListCursorType | undefined;
      readonly type: "replace-list-state";
    }
  | {
      readonly options: JobOptionsResponse;
      readonly type: "replace-options-state";
    }
  | {
      readonly notice: JobsNotice | null;
      readonly type: "set-notice";
    }
  | {
      readonly result: JobsAsyncResult;
      readonly type: "set-create-job-result";
    };

interface JobsStateContextValue {
  readonly clearNotice: () => void;
  readonly createJob: (
    input: CreateJobInput
  ) => Promise<Exit.Exit<CreateJobResponse, AppApiError>>;
  readonly createJobResult: JobsAsyncResult;
  readonly nextCursor?: JobListCursorType | undefined;
  readonly notice: JobsNotice | null;
  readonly options: JobOptionsResponse;
  readonly refreshJobsList: () => Promise<
    Exit.Exit<JobListResponse, AppApiError>
  >;
  readonly replaceJobsListState: (
    organizationId: OrganizationId,
    response: JobListResponse
  ) => Promise<void>;
  readonly replaceJobsOptionsState: (
    organizationId: OrganizationId,
    response: JobOptionsResponse
  ) => void;
  readonly store: JobsStateStore;
  readonly upsertJobOptionLabel: (label: Label) => void;
  readonly upsertJobsListItem: (job: JobListItemSource) => Promise<void>;
}

const JobsStateContext = React.createContext<JobsStateContextValue | null>(
  null
);

const idleJobsAsyncResult: JobsAsyncResult = {
  error: null,
  waiting: false,
};

const waitingJobsAsyncResult: JobsAsyncResult = {
  error: null,
  waiting: true,
};

export const defaultJobsListFilters: JobsListFilters = {
  assigneeId: { kind: "all" },
  coordinatorId: "all",
  labelId: "all",
  priority: "all",
  query: "",
  serviceAreaId: "all",
  siteId: "all",
  status: "active",
};

export function buildJobsLookup(options: JobOptionsResponse) {
  return {
    contactById: new Map(
      options.contacts.map((contact) => [contact.id, contact])
    ),
    memberById: new Map(options.members.map((member) => [member.id, member])),
    labelById: new Map(options.labels.map((label) => [label.id, label])),
    serviceAreaById: new Map(
      options.serviceAreas.map((serviceArea) => [serviceArea.id, serviceArea])
    ),
    siteById: new Map(options.sites.map((site) => [site.id, site])),
  };
}

export function JobsStateProvider({
  activeOrganizationId,
  children,
  list,
  options,
  queryClient: providedQueryClient,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children: React.ReactNode;
  readonly list: JobListResponse;
  readonly options: JobOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly viewer: JobsViewer;
}) {
  const organizationIdRef = React.useRef(activeOrganizationId);
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const queryClient = providedQueryClient ?? fallbackQueryClient;
  const [store] = React.useState(() =>
    makeJobsStateStore(
      organizationIdRef,
      activeOrganizationId,
      viewer,
      queryClient,
      list.items
    )
  );
  const previousListRef = React.useRef(list);
  const previousOptionsRef = React.useRef(options);
  const [state, dispatch] = React.useReducer(jobsProviderStateReducer, {
    createJobResult: idleJobsAsyncResult,
    nextCursor: list.nextCursor,
    notice: null,
    options,
  } satisfies JobsProviderState);
  const { createJobResult, nextCursor, notice } = state;

  React.useEffect(() => {
    organizationIdRef.current = activeOrganizationId;
  }, [activeOrganizationId, organizationIdRef]);

  const replaceJobsListState = React.useCallback(
    async (organizationId: OrganizationId, response: JobListResponse) => {
      organizationIdRef.current = organizationId;
      await replaceJobs(store, response.items);
      dispatch({
        nextCursor: response.nextCursor,
        type: "replace-list-state",
      });
    },
    [organizationIdRef, store]
  );

  const replaceJobsOptionsState = React.useCallback(
    (organizationId: OrganizationId, response: JobOptionsResponse) => {
      organizationIdRef.current = organizationId;
      dispatch({
        options: response,
        type: "replace-options-state",
      });
    },
    [organizationIdRef]
  );

  React.useEffect(() => {
    if (previousListRef.current === list) {
      return;
    }

    previousListRef.current = list;
    void replaceJobsListState(activeOrganizationId, list);
  }, [activeOrganizationId, list, replaceJobsListState]);

  React.useEffect(() => {
    if (previousOptionsRef.current === options) {
      return;
    }

    previousOptionsRef.current = options;
    void replaceJobsOptionsState(activeOrganizationId, options);
  }, [activeOrganizationId, options, replaceJobsOptionsState]);

  const refreshJobsList = React.useCallback(async () => {
    const expectedOrganizationId = organizationIdRef.current;
    const exit = await Effect.runPromiseExit(listAllBrowserJobs());

    if (
      Exit.isSuccess(exit) &&
      organizationIdRef.current === expectedOrganizationId
    ) {
      await replaceJobsListState(expectedOrganizationId, exit.value);
    }

    return exit;
  }, [organizationIdRef, replaceJobsListState]);

  const createJob = React.useCallback(
    (input: CreateJobInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runTrackedJobsOperation(
        withMinimumMutationPendingDurationEffect(createBrowserJob(input)),
        (result) =>
          dispatch({
            result,
            type: "set-create-job-result",
          }),
        async (createdJob) => {
          const shouldRefreshOptions =
            input.site?.kind === "create" || input.contact?.kind === "create";

          await refreshJobsListOrUpsertState({
            currentNextCursor: nextCursor,
            expectedOrganizationId,
            job: createdJob,
            organizationIdRef,
            replaceJobsListState,
            store,
          });
          await refreshJobOptionsStateWhen({
            expectedOrganizationId,
            organizationIdRef,
            replaceJobsOptionsState,
            shouldRefresh: shouldRefreshOptions,
          });

          if (organizationIdRef.current === expectedOrganizationId) {
            dispatch({
              notice: {
                kind: "created",
                title: createdJob.title,
              },
              type: "set-notice",
            });
          }
        }
      );
    },
    [
      nextCursor,
      organizationIdRef,
      replaceJobsListState,
      replaceJobsOptionsState,
      store,
    ]
  );

  const clearNotice = React.useCallback(() => {
    dispatch({
      notice: null,
      type: "set-notice",
    });
  }, []);

  const upsertJobsListItem = React.useCallback(
    async (job: JobListItemSource) => {
      await replaceJobs(
        store,
        upsertJobListItem(jobsFromCollection(store), job)
      );
      dispatch({
        nextCursor,
        type: "replace-list-state",
      });
    },
    [nextCursor, store]
  );

  const upsertJobOptionLabel = React.useCallback(
    (label: Label) => {
      dispatch({
        options: {
          ...state.options,
          labels: upsertOrganizationLabel(state.options.labels, label),
        },
        type: "replace-options-state",
      });
    },
    [state.options]
  );

  const value = React.useMemo<JobsStateContextValue>(
    () => ({
      clearNotice,
      createJob,
      createJobResult,
      nextCursor,
      notice,
      options: state.options,
      refreshJobsList,
      replaceJobsListState,
      replaceJobsOptionsState,
      store,
      upsertJobOptionLabel,
      upsertJobsListItem,
    }),
    [
      clearNotice,
      createJob,
      createJobResult,
      nextCursor,
      notice,
      refreshJobsList,
      replaceJobsListState,
      replaceJobsOptionsState,
      state.options,
      store,
      upsertJobOptionLabel,
      upsertJobsListItem,
    ]
  );

  return React.createElement(JobsStateContext.Provider, { value }, children);
}

export function useJobsListState(): JobsListState {
  const { nextCursor, store } = useJobsStateContext();
  const items = useJobsCollectionItems(store);

  return React.useMemo(
    () => ({
      items,
      nextCursor,
      organizationId: store.organizationIdRef.current,
    }),
    [items, nextCursor, store.organizationIdRef]
  );
}

export function useJobsOptions(): JobOptionsResponse {
  return useJobsStateContext().options;
}

export function useJobsOptionsState(): JobsOptionsState {
  const { options, store } = useJobsStateContext();

  return React.useMemo(
    () => ({
      data: options,
      organizationId: store.organizationIdRef.current,
    }),
    [options, store.organizationIdRef]
  );
}

export function useJobsLookup() {
  const options = useJobsOptions();

  return React.useMemo(() => buildJobsLookup(options), [options]);
}

export function useJobsNotice() {
  const { clearNotice, notice } = useJobsStateContext();

  return [notice, clearNotice] as const;
}

export function useRefreshJobsListMutation() {
  return useJobsStateContext().refreshJobsList;
}

export function useCreateJobMutation() {
  const { createJob, createJobResult } = useJobsStateContext();

  return [createJobResult, createJob] as const;
}

export function useReplaceJobsListState() {
  return useJobsStateContext().replaceJobsListState;
}

export function useReplaceJobsOptionsState() {
  return useJobsStateContext().replaceJobsOptionsState;
}

export function useUpsertJobsListItem() {
  return useJobsStateContext().upsertJobsListItem;
}

export function useUpsertJobOptionLabel() {
  return useJobsStateContext().upsertJobOptionLabel;
}

export function isJobsAsyncFailure(result: JobsAsyncResult): boolean {
  return result.error !== null;
}

export function getJobsAsyncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function filterVisibleJobs({
  filters,
  items,
  lookup,
}: {
  readonly filters: JobsListFilters;
  readonly items: readonly JobListItem[];
  readonly lookup: VisibleJobsLookup;
}) {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return items.filter((item) =>
    matchesVisibleJob(item, filters, lookup, normalizedQuery)
  );
}

export function deriveContactsForSite(
  contacts: readonly JobContactOption[],
  siteId: SiteIdType | undefined
) {
  if (siteId === undefined) {
    return {
      linked: [] as readonly JobContactOption[],
      others: contacts,
    };
  }

  return {
    linked: contacts.filter((contact) => contact.siteIds.includes(siteId)),
    others: contacts.filter((contact) => !contact.siteIds.includes(siteId)),
  };
}

function makeJobsStateStore(
  organizationIdRef: React.MutableRefObject<OrganizationId>,
  organizationId: OrganizationId,
  viewer: JobsViewer,
  queryClient: QueryClient,
  jobs: readonly JobListItem[]
): JobsStateStore {
  const collectionWriteVersionRef = { current: 0 };
  const fallbackJobsRef = {
    current: jobs,
  };

  return {
    collectionWriteVersionRef,
    fallbackJobsRef,
    jobOrderRef: {
      current: jobs.map((job) => job.id),
    },
    jobs: makeJobsCollection(
      organizationId,
      viewer,
      queryClient,
      jobs,
      collectionWriteVersionRef
    ),
    organizationIdRef,
    queryClient,
  };
}

function makeJobsCollection(
  organizationId: OrganizationId,
  viewer: JobsViewer,
  queryClient: QueryClient,
  jobs: readonly JobListItem[],
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  const queryKey = organizationJobsQueryKey({
    organizationId,
    role: viewer.role,
    userId: viewer.userId,
  });
  seedQueryCollectionInitialData(queryClient, queryKey, [...jobs]);

  const collection: {
    current?: TanStackDbCollectionSnapshot<JobListItem>;
  } = {};
  const createdCollection = createCollection(
    queryCollectionOptions({
      getKey: (job) => job.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: `organization:${organizationId}:user:${viewer.userId}:role:${viewer.role}:jobs`,
      queryClient,
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await listAllCurrentServerJobs({});

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: collection.current,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.standardSchemaV1(JobListItemSchema),
      staleTime: 30_000,
    })
  );
  collection.current = createdCollection;
  return createdCollection;
}

function useJobsStateContext() {
  const context = use(JobsStateContext);

  if (!context) {
    throw new Error("Jobs state must be used inside JobsStateProvider.");
  }

  return context;
}

function jobsProviderStateReducer(
  state: JobsProviderState,
  action: JobsProviderStateAction
): JobsProviderState {
  switch (action.type) {
    case "replace-list-state": {
      return {
        ...state,
        nextCursor: action.nextCursor,
      };
    }

    case "replace-options-state": {
      return {
        ...state,
        options: action.options,
      };
    }

    case "set-create-job-result": {
      return {
        ...state,
        createJobResult: action.result,
      };
    }

    case "set-notice": {
      return {
        ...state,
        notice: action.notice,
      };
    }

    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

function useJobsCollectionItems(store: JobsStateStore): readonly JobListItem[] {
  const items = useHydratedCollectionItems(
    store.jobs,
    store.fallbackJobsRef.current
  );

  return React.useMemo(
    () => jobsFromCollectionData(store, items),
    [items, store]
  );
}

function replaceJobs(
  store: JobsStateStore,
  jobs: readonly JobListItem[]
): Promise<void> {
  store.fallbackJobsRef.current = jobs;
  store.jobOrderRef.current = jobs.map((job) => job.id);
  markTanStackDbCollectionWrite(store.collectionWriteVersionRef);
  replaceSyncedCollectionData(store.jobs, jobs);
  return Promise.resolve();
}

function jobsFromCollection(store: JobsStateStore): readonly JobListItem[] {
  return jobsFromCollectionData(
    store,
    stripTanStackDbCollectionData(store.jobs.toArray)
  );
}

function jobsFromCollectionData(
  store: JobsStateStore,
  jobs: readonly JobListItem[]
): readonly JobListItem[] {
  const orderByJobId = new Map(
    store.jobOrderRef.current.map((jobId, index) => [jobId, index])
  );

  return jobs.toSorted(
    (left, right) =>
      (orderByJobId.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderByJobId.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
}

async function runTrackedJobsOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  setResult: (result: JobsAsyncResult) => void,
  onSuccess: (value: Success) => Promise<void>
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingJobsAsyncResult);
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess(exit.value);
    setResult(idleJobsAsyncResult);
    return exit;
  }

  setResult({
    error: failureFromCause(exit.cause),
    waiting: false,
  });

  return exit;
}

function listAllBrowserJobs() {
  return runBrowserAppApiRequest("JobsBrowser.listAllJobs", (client) => {
    const loadPage = (cursor: JobListQuery["cursor"]) =>
      client.jobs.listJobs({
        urlParams: cursor ? { cursor } : {},
      });

    const loadRemainingPages = (
      cursor: JobListQuery["cursor"],
      items: readonly JobListItem[]
    ): Effect.Effect<JobListResponse, unknown> =>
      loadPage(cursor).pipe(
        Effect.flatMap((page) => {
          const nextItems = [...items, ...page.items];

          return page.nextCursor === undefined
            ? Effect.succeed({
                items: nextItems,
                nextCursor: undefined,
              } satisfies JobListResponse)
            : loadRemainingPages(page.nextCursor, nextItems);
        })
      );

    return loadRemainingPages(undefined, []);
  });
}

function getBrowserJobOptions() {
  return runBrowserAppApiRequest("JobsBrowser.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

function createBrowserJob(input: CreateJobInput) {
  return runBrowserAppApiRequest("JobsBrowser.createJob", (client) =>
    client.jobs.createJob({ payload: input })
  );
}

async function refreshJobsListOrUpsertState({
  currentNextCursor,
  expectedOrganizationId,
  job,
  organizationIdRef,
  replaceJobsListState,
  store,
}: {
  readonly currentNextCursor?: JobListCursorType | undefined;
  readonly expectedOrganizationId: OrganizationId;
  readonly job: CreateJobResponse;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly replaceJobsListState: (
    organizationId: OrganizationId,
    response: JobListResponse
  ) => Promise<void>;
  readonly store: JobsStateStore;
}) {
  const listExit = await Effect.runPromiseExit(listAllBrowserJobs());

  if (organizationIdRef.current !== expectedOrganizationId) {
    return;
  }

  if (Exit.isSuccess(listExit)) {
    await replaceJobsListState(expectedOrganizationId, listExit.value);
    return;
  }

  await Effect.runPromise(
    Effect.logWarning("Jobs list refresh failed; using optimistic job", {
      error: getJobsAsyncErrorMessage(failureFromCause(listExit.cause)),
      jobId: job.id,
    })
  );
  await replaceJobsListState(expectedOrganizationId, {
    items: upsertJobListItem(jobsFromCollection(store), job),
    nextCursor: currentNextCursor,
  });
}

async function refreshJobOptionsStateWhen({
  expectedOrganizationId,
  organizationIdRef,
  replaceJobsOptionsState,
  shouldRefresh,
}: {
  readonly expectedOrganizationId: OrganizationId;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly replaceJobsOptionsState: (
    organizationId: OrganizationId,
    response: JobOptionsResponse
  ) => void;
  readonly shouldRefresh: boolean;
}) {
  if (!shouldRefresh) {
    return;
  }

  const optionsExit = await Effect.runPromiseExit(getBrowserJobOptions());

  if (organizationIdRef.current !== expectedOrganizationId) {
    return;
  }

  if (Exit.isSuccess(optionsExit)) {
    replaceJobsOptionsState(expectedOrganizationId, optionsExit.value);
    return;
  }

  await Effect.runPromise(
    Effect.logWarning("Jobs options refresh failed after job create", {
      error: getJobsAsyncErrorMessage(failureFromCause(optionsExit.cause)),
    })
  );
}

function isActiveStatus(status: JobStatus) {
  return (
    status === "new" ||
    status === "triaged" ||
    status === "in_progress" ||
    status === "blocked"
  );
}

function matchesAssigneeFilter(
  assigneeId: UserIdType | undefined,
  filter: JobsAssigneeFilter
) {
  if (filter.kind === "all") {
    return true;
  }

  if (filter.kind === "unassigned") {
    return assigneeId === undefined;
  }

  return assigneeId === filter.userId;
}

export function isJobsAssigneeFilterEqual(
  left: JobsAssigneeFilter,
  right: JobsAssigneeFilter
) {
  if (left.kind !== right.kind) {
    return false;
  }

  return left.kind === "user" && right.kind === "user"
    ? left.userId === right.userId
    : true;
}

function matchesStatusFilter(status: JobStatus, filter: JobsStatusFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return isActiveStatus(status);
  }

  return status === filter;
}

function matchesLabelFilter(item: JobListItem, filters: JobsListFilters) {
  return (
    filters.labelId === "all" ||
    item.labels.some((label) => label.id === filters.labelId)
  );
}

function matchesSiteFilter(item: JobListItem, filters: JobsListFilters) {
  return filters.siteId === "all" || item.siteId === filters.siteId;
}

interface VisibleJobsLookup {
  readonly contactById: ReadonlyMap<JobContactOption["id"], JobContactOption>;
  readonly siteById: ReadonlyMap<
    JobOptionsResponse["sites"][number]["id"],
    JobOptionsResponse["sites"][number]
  >;
}

function matchesVisibleJob(
  item: JobListItem,
  filters: JobsListFilters,
  lookup: VisibleJobsLookup,
  normalizedQuery: string
) {
  return (
    matchesStatusFilter(item.status, filters.status) &&
    matchesAssigneeFilter(item.assigneeId, filters.assigneeId) &&
    matchesOptionalFilter(item.coordinatorId, filters.coordinatorId) &&
    matchesOptionalFilter(item.priority, filters.priority) &&
    matchesLabelFilter(item, filters) &&
    matchesSiteFilter(item, filters) &&
    matchesQueryFilter(item, normalizedQuery, lookup) &&
    matchesServiceAreaFilter(item, filters.serviceAreaId, lookup.siteById)
  );
}

function matchesOptionalFilter<Value extends string>(
  value: Value | undefined,
  filter: Value | "all"
) {
  return filter === "all" || value === filter;
}

function matchesQueryFilter(
  item: JobListItem,
  normalizedQuery: string,
  lookup: VisibleJobsLookup
) {
  return (
    normalizedQuery.length === 0 ||
    buildJobSearchText(item, lookup).includes(normalizedQuery)
  );
}

function buildJobSearchText(item: JobListItem, lookup: VisibleJobsLookup) {
  const siteName =
    item.siteId === undefined
      ? undefined
      : lookup.siteById.get(item.siteId)?.name;
  const contact =
    item.contactId === undefined
      ? undefined
      : lookup.contactById.get(item.contactId);

  return [
    item.title,
    item.kind,
    item.externalReference ?? "",
    siteName ?? "",
    item.siteId === undefined
      ? ""
      : (lookup.siteById.get(item.siteId)?.serviceAreaName ?? ""),
    contact?.name ?? "",
    contact?.email ?? "",
    contact?.phone ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function matchesServiceAreaFilter(
  item: JobListItem,
  serviceAreaFilter: JobsListFilters["serviceAreaId"],
  siteById: VisibleJobsLookup["siteById"]
) {
  if (serviceAreaFilter === "all") {
    return true;
  }

  const serviceAreaId =
    item.siteId === undefined
      ? undefined
      : siteById.get(item.siteId)?.serviceAreaId;

  return serviceAreaId === serviceAreaFilter;
}

type JobListItemSource = Pick<
  Job | CreateJobResponse,
  | "assigneeId"
  | "contactId"
  | "coordinatorId"
  | "createdAt"
  | "externalReference"
  | "id"
  | "kind"
  | "labels"
  | "priority"
  | "siteId"
  | "status"
  | "title"
  | "updatedAt"
>;

export function toJobListItem(job: JobListItemSource): JobListItem {
  return {
    assigneeId: job.assigneeId,
    contactId: job.contactId,
    coordinatorId: job.coordinatorId,
    createdAt: job.createdAt,
    externalReference: job.externalReference,
    id: job.id,
    kind: job.kind,
    labels: job.labels,
    priority: job.priority,
    siteId: job.siteId,
    status: job.status,
    title: job.title,
    updatedAt: job.updatedAt,
  };
}

export function upsertJobListItem(
  items: readonly JobListItem[],
  job: JobListItemSource
) {
  return [toJobListItem(job), ...items.filter((item) => item.id !== job.id)];
}

function failureFromCause<Failure>(cause: Cause.Cause<Failure>): unknown {
  const failure = Cause.failureOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
