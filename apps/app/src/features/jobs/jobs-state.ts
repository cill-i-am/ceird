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
import { isActiveJobStatus } from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/query-core";
import { Cause, Effect, Exit, Option } from "effect";
import { use } from "react";
import * as React from "react";

import { executeDataPlaneCommandAction } from "#/data-plane/command-action";
import type { DataPlaneCommandAction } from "#/data-plane/command-action";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import type { DataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import { useOptionalDataPlaneSession } from "#/data-plane/session";
import type { DataPlaneSession } from "#/data-plane/session";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import {
  getOrCreateLabelsCollectionState,
  upsertLabelCollectionItem,
} from "#/features/labels/labels-data-plane";
import type { LabelsCollectionState } from "#/features/labels/labels-data-plane";
import {
  getSiteRelatedJobsCollectionState,
  upsertSiteRelatedJobCollectionItem,
} from "#/features/sites/sites-data-plane";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

import type {
  JobsCollectionSyncOptions,
  JobsListScope,
  JobOptionsCollectionState,
  JobsCollectionState,
} from "./jobs-data-plane";
import {
  createJobsListScope,
  jobOptionsFromCollectionState,
  jobsFromCollectionState,
  loadCurrentJobsOptionsForViewer,
  replaceJobOptionsCollectionData,
  replaceJobsCollectionData,
  upsertJobOptionsLabel,
  upsertJobOptionsSite,
  getOrCreateJobOptionsCollectionState,
  getOrCreateJobsCollectionState,
} from "./jobs-data-plane";

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
  readonly siteId: SiteIdType | "all";
  readonly status: JobsStatusFilter;
}

export interface JobsListState {
  readonly items: readonly JobListItem[];
  readonly nextCursor?: JobListCursorType | undefined;
  readonly organizationId: OrganizationId | null;
}

interface JobsNotice {
  readonly kind: "created";
  readonly title: string;
}

export interface JobsAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

interface JobsStateStore {
  readonly dataPlaneSession?: DataPlaneSession | undefined;
  readonly fallbackJobsRef: React.MutableRefObject<readonly JobListItem[]>;
  readonly fallbackOptionsRef: React.MutableRefObject<JobOptionsResponse>;
  readonly jobOrderRef: React.MutableRefObject<readonly JobListItem["id"][]>;
  readonly listScopeRef: React.MutableRefObject<JobsListScope>;
  readonly jobOptions: JobOptionsCollectionState;
  readonly jobs: JobsCollectionState;
  readonly labels: LabelsCollectionState;
  readonly mutationJournal: DataPlaneMutationJournal;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly queryScope: OrganizationDataScope;
  readonly queryClient: QueryClient;
  readonly viewer: JobsViewer;
}

interface JobsProviderState {
  readonly createJobResult: JobsAsyncResult;
  readonly nextCursor?: JobListCursorType | undefined;
  readonly notice: JobsNotice | null;
}

type JobsProviderStateAction =
  | {
      readonly nextCursor?: JobListCursorType | undefined;
      readonly type: "replace-list-state";
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
  readonly refreshJobsList: () => Promise<
    Exit.Exit<JobListResponse, AppApiError>
  >;
  readonly loadNextJobsPage: () => Promise<
    Exit.Exit<JobListResponse, AppApiError>
  >;
  readonly replaceJobsListState: (
    organizationId: OrganizationId,
    response: JobListResponse
  ) => Promise<void>;
  readonly replaceJobsOptionsState: (
    organizationId: OrganizationId,
    response: JobOptionsResponse
  ) => Promise<void>;
  readonly store: JobsStateStore;
  readonly upsertJobOptionLabel: (label: Label) => void;
  readonly upsertJobOptionSite: (site: SiteOption) => void;
  readonly upsertJobsListItem: (job: JobListItemSource) => Promise<void>;
  readonly viewer: JobsViewer;
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
  siteId: "all",
  status: "active",
};

function buildJobsLookup(options: JobOptionsResponse) {
  return {
    contactById: new Map(
      options.contacts.map((contact) => [contact.id, contact])
    ),
    memberById: new Map(options.members.map((member) => [member.id, member])),
    labelById: new Map(options.labels.map((label) => [label.id, label])),
    siteById: new Map(options.sites.map((site) => [site.id, site])),
  };
}

export function JobsStateProvider({
  activeOrganizationId,
  children,
  list,
  listScope = createJobsListScope(),
  options,
  queryClient: providedQueryClient,
  sync,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children: React.ReactNode;
  readonly list: JobListResponse;
  readonly listScope?: JobsListScope | undefined;
  readonly options: JobOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly sync?: JobsCollectionSyncOptions | undefined;
  readonly viewer: JobsViewer;
}) {
  const organizationIdRef = React.useRef(activeOrganizationId);
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const dataPlaneSession = useOptionalDataPlaneSession();
  const queryClient =
    providedQueryClient ?? dataPlaneSession?.queryClient ?? fallbackQueryClient;
  const [store] = React.useState(() =>
    makeJobsStateStore(
      organizationIdRef,
      activeOrganizationId,
      viewer,
      queryClient,
      list.items,
      listScope,
      options,
      sync,
      dataPlaneSession
    )
  );
  const previousListRef = React.useRef<JobListResponse | null>(null);
  const previousOptionsRef = React.useRef<JobOptionsResponse | null>(null);
  const [state, dispatch] = React.useReducer(jobsProviderStateReducer, {
    createJobResult: idleJobsAsyncResult,
    nextCursor: list.nextCursor,
    notice: null,
  } satisfies JobsProviderState);
  const { createJobResult, nextCursor, notice } = state;

  React.useEffect(() => {
    organizationIdRef.current = activeOrganizationId;
    store.listScopeRef.current = listScope;
  }, [activeOrganizationId, listScope, organizationIdRef, store]);

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
    async (organizationId: OrganizationId, response: JobOptionsResponse) => {
      organizationIdRef.current = organizationId;
      await replaceJobOptions(store, response);
    },
    [organizationIdRef, store]
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

  const refreshJobsList = React.useCallback(() => {
    const expectedOrganizationId = organizationIdRef.current;
    const { query } = store.listScopeRef.current;

    return executeDataPlaneCommandAction(
      {
        affectedCollections: ["jobs"],
        execute: () => Effect.runPromiseExit(listCurrentBrowserJobs(query)),
        name: "jobs.refresh-list",
        optimistic: "none",
        reconcile: async (response) => {
          if (organizationIdRef.current !== expectedOrganizationId) {
            return;
          }

          await replaceJobsListState(expectedOrganizationId, response);
        },
      },
      undefined,
      { journal: store.mutationJournal }
    );
  }, [organizationIdRef, replaceJobsListState, store]);

  const loadNextJobsPage = React.useCallback(() => {
    const cursor = nextCursor;
    const expectedOrganizationId = organizationIdRef.current;

    if (cursor === undefined) {
      return Promise.resolve(
        Exit.succeed({
          items: [],
          nextCursor: undefined,
        } satisfies JobListResponse)
      );
    }

    const query = {
      ...store.listScopeRef.current.query,
      cursor,
    } satisfies JobListQuery;

    return executeDataPlaneCommandAction(
      {
        affectedCollections: ["jobs"],
        execute: () => Effect.runPromiseExit(listCurrentBrowserJobs(query)),
        name: "jobs.load-next-page",
        optimistic: "none",
        reconcile: async (response) => {
          if (organizationIdRef.current !== expectedOrganizationId) {
            return;
          }

          await replaceJobsListState(expectedOrganizationId, {
            items: mergeJobListItems(jobsFromCollection(store), response.items),
            nextCursor: response.nextCursor,
          });
        },
      },
      undefined,
      { journal: store.mutationJournal }
    );
  }, [nextCursor, organizationIdRef, replaceJobsListState, store]);

  const createJob = React.useCallback(
    (input: CreateJobInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runTrackedJobsCommand(
        {
          affectedCollections: ["jobs", "job-options", "site-related-jobs"],
          execute: (commandInput: CreateJobInput) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                createBrowserJob(commandInput)
              )
            ),
          name: "jobs.create",
          optimistic: "none",
          reconcile: async (response, commandInput) => {
            const shouldRefreshOptions =
              commandInput.site?.kind === "create" ||
              commandInput.contact?.kind === "create";
            const createdJob = response.job;

            await refreshJobsListOrUpsertState({
              currentNextCursor: nextCursor,
              expectedOrganizationId,
              job: createdJob,
              organizationIdRef,
              replaceJobsListState,
              store,
            });

            if (organizationIdRef.current !== expectedOrganizationId) {
              return;
            }

            await upsertLoadedSiteRelatedJob(store, createdJob);
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
          },
        },
        input,
        (result) =>
          dispatch({
            result,
            type: "set-create-job-result",
          }),
        store.mutationJournal
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
      const expectedOrganizationId = organizationIdRef.current;
      const listExit = await Effect.runPromiseExit(
        listCurrentBrowserJobs(store.listScopeRef.current.query)
      );

      if (organizationIdRef.current !== expectedOrganizationId) {
        return;
      }

      if (Exit.isSuccess(listExit)) {
        await replaceJobsListState(expectedOrganizationId, listExit.value);
        return;
      }

      await replaceJobs(
        store,
        upsertJobListItem(jobsFromCollection(store), job)
      );
      dispatch({
        nextCursor,
        type: "replace-list-state",
      });
    },
    [nextCursor, organizationIdRef, replaceJobsListState, store]
  );

  const upsertJobOptionLabel = React.useCallback(
    (label: Label) => {
      void upsertJobOptionLabelState(store, label);
    },
    [store]
  );
  const upsertJobOptionSiteCallback = React.useCallback(
    (site: SiteOption) => {
      void upsertJobOptionSiteState(store, site);
    },
    [store]
  );

  const value = React.useMemo<JobsStateContextValue>(
    () => ({
      clearNotice,
      createJob,
      createJobResult,
      loadNextJobsPage,
      nextCursor,
      notice,
      refreshJobsList,
      replaceJobsListState,
      replaceJobsOptionsState,
      store,
      upsertJobOptionLabel,
      upsertJobOptionSite: upsertJobOptionSiteCallback,
      upsertJobsListItem,
      viewer,
    }),
    [
      clearNotice,
      createJob,
      createJobResult,
      loadNextJobsPage,
      nextCursor,
      notice,
      refreshJobsList,
      replaceJobsListState,
      replaceJobsOptionsState,
      store,
      upsertJobOptionLabel,
      upsertJobOptionSiteCallback,
      upsertJobsListItem,
      viewer,
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
  const { store } = useJobsStateContext();

  return useJobOptionsCollectionOptions(store);
}

export function useOptionalJobsViewer(): JobsViewer | undefined {
  return use(JobsStateContext)?.viewer;
}

export function useJobsViewer(): JobsViewer {
  return useJobsStateContext().viewer;
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

export function useLoadNextJobsPageMutation() {
  return useJobsStateContext().loadNextJobsPage;
}

export function useCreateJobMutation() {
  const { createJob, createJobResult } = useJobsStateContext();

  return [createJobResult, createJob] as const;
}

export function useUpsertJobsListItem() {
  return useJobsStateContext().upsertJobsListItem;
}

export function useUpsertJobOptionLabel() {
  return useJobsStateContext().upsertJobOptionLabel;
}

export function useUpsertJobOptionSite() {
  return useJobsStateContext().upsertJobOptionSite;
}

export function isJobsAsyncFailure(result: JobsAsyncResult): boolean {
  return result.error !== null;
}

export function upsertJobOptionSite(
  sites: readonly SiteOption[],
  site: SiteOption
): readonly SiteOption[] {
  const existingIndex = sites.findIndex((current) => current.id === site.id);

  if (existingIndex === -1) {
    return [...sites, site];
  }

  return sites.map((current, index) =>
    index === existingIndex ? site : current
  );
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
  jobs: readonly JobListItem[],
  listScope: JobsListScope,
  options: JobOptionsResponse,
  sync: JobsCollectionSyncOptions | undefined,
  dataPlaneSession: ReturnType<typeof useOptionalDataPlaneSession>
): JobsStateStore {
  const fallbackJobsRef = {
    current: jobs,
  };
  const fallbackOptionsRef = {
    current: options,
  };
  const queryScope =
    dataPlaneSession?.scope ??
    createOrganizationDataScope({
      organizationId,
      role: viewer.role,
      userId: viewer.userId,
    });
  const collectionState = getOrCreateJobsCollectionState({
    initialJobs: jobs,
    listScope,
    queryClient,
    scope: queryScope,
    session: dataPlaneSession,
    sync,
  });
  const jobOptionsState = getOrCreateJobOptionsCollectionState({
    initialOptions: options,
    loadOptions: () => loadCurrentJobsOptionsForViewer(viewer),
    queryClient,
    scope: queryScope,
    session: dataPlaneSession,
  });
  const labelsState = getOrCreateLabelsCollectionState({
    initialLabels: options.labels,
    queryClient,
    scope: queryScope,
    session: dataPlaneSession,
  });

  return {
    dataPlaneSession,
    fallbackJobsRef,
    fallbackOptionsRef,
    jobOrderRef: {
      current: jobs.map((job) => job.id),
    },
    listScopeRef: {
      current: listScope,
    },
    jobOptions: jobOptionsState,
    jobs: collectionState,
    labels: labelsState,
    mutationJournal:
      dataPlaneSession?.mutationJournal ?? createDataPlaneMutationJournal(),
    organizationIdRef,
    queryScope,
    queryClient,
    viewer,
  };
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
    store.jobs.collection,
    store.fallbackJobsRef.current
  );

  return React.useMemo(
    () => jobsFromCollectionData(store, items),
    [items, store]
  );
}

function useJobOptionsCollectionOptions(
  store: JobsStateStore
): JobOptionsResponse {
  const items = useHydratedCollectionItems(store.jobOptions.collection, [
    {
      id: "job-options",
      options: store.fallbackOptionsRef.current,
    },
  ]);

  return React.useMemo(
    () => items[0]?.options ?? store.fallbackOptionsRef.current,
    [items, store.fallbackOptionsRef]
  );
}

function replaceJobs(
  store: JobsStateStore,
  jobs: readonly JobListItem[]
): Promise<void> {
  store.fallbackJobsRef.current = jobs;
  store.jobOrderRef.current = jobs.map((job) => job.id);

  return replaceJobsCollectionData(store.jobs, jobs);
}

function jobsFromCollection(store: JobsStateStore): readonly JobListItem[] {
  return jobsFromCollectionData(
    store,
    jobsFromCollectionState(store.jobs, store.fallbackJobsRef.current)
  );
}

function jobsOptionsFromCollection(store: JobsStateStore): JobOptionsResponse {
  return jobOptionsFromCollectionState(
    store.jobOptions,
    store.fallbackOptionsRef.current
  );
}

async function replaceJobOptions(
  store: JobsStateStore,
  options: JobOptionsResponse
) {
  store.fallbackOptionsRef.current = options;
  await Promise.all([
    replaceJobOptionsCollectionData(store.jobOptions, options),
    replaceLabelsCollectionDataFromOptions(store, options),
  ]);
}

async function replaceLabelsCollectionDataFromOptions(
  store: JobsStateStore,
  options: JobOptionsResponse
) {
  await Promise.all(
    options.labels.map((label) =>
      upsertLabelCollectionItem(store.labels, label)
    )
  );
}

async function upsertJobOptionLabelState(store: JobsStateStore, label: Label) {
  await upsertLabelCollectionItem(store.labels, label);
  await replaceJobOptions(
    store,
    upsertJobOptionsLabel(jobsOptionsFromCollection(store), label)
  );
}

async function upsertJobOptionSiteState(
  store: JobsStateStore,
  site: SiteOption
) {
  await replaceJobOptions(
    store,
    upsertJobOptionsSite(jobsOptionsFromCollection(store), site)
  );
}

async function upsertLoadedSiteRelatedJob(
  store: JobsStateStore,
  job: JobListItemSource
) {
  if (!store.dataPlaneSession || job.siteId === undefined) {
    return;
  }

  const relatedJobs = getSiteRelatedJobsCollectionState({
    scope: store.queryScope,
    session: store.dataPlaneSession,
    siteId: job.siteId,
  });

  if (!relatedJobs) {
    return;
  }

  await upsertSiteRelatedJobCollectionItem(relatedJobs, toJobListItem(job));
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

async function runTrackedJobsCommand<Input, Success>(
  action: DataPlaneCommandAction<Input, Success, AppApiError>,
  input: Input,
  setResult: (result: JobsAsyncResult) => void,
  mutationJournal: DataPlaneMutationJournal
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingJobsAsyncResult);
  const exit = await executeDataPlaneCommandAction(action, input, {
    journal: mutationJournal,
  });

  if (Exit.isSuccess(exit)) {
    setResult(idleJobsAsyncResult);
    return exit;
  }

  setResult({
    error: failureFromCause(exit.cause),
    waiting: false,
  });

  return exit;
}

function listCurrentBrowserJobs(query: JobListQuery) {
  return runBrowserAppApiRequest("JobsBrowser.listJobs", (client) =>
    client.jobs.listJobs({ query })
  );
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
  readonly job: Job;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly replaceJobsListState: (
    organizationId: OrganizationId,
    response: JobListResponse
  ) => Promise<void>;
  readonly store: JobsStateStore;
}) {
  const listExit = await Effect.runPromiseExit(
    listCurrentBrowserJobs(store.listScopeRef.current.query)
  );

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
  ) => Promise<void>;
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
    await replaceJobsOptionsState(expectedOrganizationId, optionsExit.value);
    return;
  }

  await Effect.runPromise(
    Effect.logWarning("Jobs options refresh failed after job create", {
      error: getJobsAsyncErrorMessage(failureFromCause(optionsExit.cause)),
    })
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
    return isActiveJobStatus(status);
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
    matchesQueryFilter(item, normalizedQuery, lookup)
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
    siteName ?? "",
    contact?.name ?? "",
    contact?.email ?? "",
    contact?.phone ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

interface JobListItemSource {
  readonly assigneeId?: JobListItem["assigneeId"] | undefined;
  readonly contactId?: JobListItem["contactId"] | undefined;
  readonly coordinatorId?: JobListItem["coordinatorId"] | undefined;
  readonly createdAt: JobListItem["createdAt"];
  readonly id: JobListItem["id"];
  readonly kind: JobListItem["kind"];
  readonly labels: JobListItem["labels"];
  readonly priority: JobListItem["priority"];
  readonly siteId?: JobListItem["siteId"] | undefined;
  readonly status: JobListItem["status"];
  readonly title: JobListItem["title"];
  readonly updatedAt: JobListItem["updatedAt"];
}

export function toJobListItem(job: JobListItemSource): JobListItem {
  return {
    assigneeId: job.assigneeId,
    contactId: job.contactId,
    coordinatorId: job.coordinatorId,
    createdAt: job.createdAt,
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

export function mergeJobListItems(
  currentItems: readonly JobListItem[],
  nextItems: readonly JobListItem[]
) {
  const mergedById = new Map<JobListItem["id"], JobListItem>();

  for (const item of currentItems) {
    mergedById.set(item.id, item);
  }

  for (const item of nextItems) {
    mergedById.set(item.id, item);
  }

  return [...mergedById.values()];
}

function failureFromCause<Failure>(cause: Cause.Cause<Failure>): unknown {
  const failure = Cause.findErrorOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
