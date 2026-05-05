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
import type { LabelIdType } from "@ceird/labels-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
import { Atom } from "@effect-atom/atom-react";
import { Effect, Option } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";

export type JobsStatusFilter = "active" | "all" | JobStatus;

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

export const emptyJobOptions: JobOptionsResponse = {
  contacts: [],
  labels: [],
  members: [],
  serviceAreas: [],
  sites: [],
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

export const jobsListStateAtom = Atom.make<JobsListState>({
  items: [],
  nextCursor: undefined,
  organizationId: null,
}).pipe(Atom.keepAlive);

export const jobsOptionsStateAtom = Atom.make<JobsOptionsState>({
  data: emptyJobOptions,
  organizationId: null,
}).pipe(Atom.keepAlive);

export const jobsListFiltersAtom = Atom.make<JobsListFilters>(
  defaultJobsListFilters
).pipe(Atom.keepAlive);

export const jobsNoticeAtom = Atom.make<JobsNotice | null>(null).pipe(
  Atom.keepAlive
);

export const jobsLookupAtom = Atom.make((get) => {
  const options = get(jobsOptionsStateAtom).data;

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
}).pipe(Atom.keepAlive);

export const visibleJobsAtom = Atom.make((get) => {
  const { items } = get(jobsListStateAtom);
  const filters = get(jobsListFiltersAtom);
  const { contactById, siteById } = get(jobsLookupAtom);
  const normalizedQuery = filters.query.trim().toLowerCase();

  return items.filter((item) =>
    matchesVisibleJob(
      item,
      filters,
      {
        contactById,
        siteById,
      },
      normalizedQuery
    )
  );
}).pipe(Atom.keepAlive);

export const jobsSummaryAtom = Atom.make((get) => {
  const items = get(visibleJobsAtom);
  const counts = {
    active: 0,
    blocked: 0,
    completed: 0,
    total: items.length,
  };

  for (const item of items) {
    if (isActiveStatus(item.status)) {
      counts.active += 1;
    }

    if (item.status === "blocked") {
      counts.blocked += 1;
    }

    if (item.status === "completed") {
      counts.completed += 1;
    }
  }

  return counts;
}).pipe(Atom.keepAlive);

export const refreshJobsListAtom = Atom.fn<AppApiError, JobListResponse>(
  (_, get) =>
    listAllBrowserJobs().pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          const state = get(jobsListStateAtom);

          get.set(jobsListStateAtom, {
            items: response.items,
            nextCursor: response.nextCursor,
            organizationId: state.organizationId,
          });
        })
      )
    )
).pipe(Atom.keepAlive);

export const refreshJobOptionsAtom = Atom.fn<AppApiError, JobOptionsResponse>(
  (_, get) =>
    getBrowserJobOptions().pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          const state = get(jobsOptionsStateAtom);

          get.set(jobsOptionsStateAtom, {
            data: response,
            organizationId: state.organizationId,
          });
        })
      )
    )
).pipe(Atom.keepAlive);

export const createJobMutationAtom = Atom.fn<
  AppApiError,
  CreateJobResponse,
  CreateJobInput
>((input, get) =>
  createBrowserJob(input).pipe(
    Effect.tap((createdJob) =>
      Effect.gen(function* () {
        const shouldRefreshOptions =
          input.site?.kind === "create" || input.contact?.kind === "create";
        yield* refreshJobListOrUpsert(get, createdJob);
        yield* refreshJobOptionsWhen(get, shouldRefreshOptions);
        yield* Effect.sync(() => {
          get.set(jobsNoticeAtom, {
            kind: "created",
            title: createdJob.title,
          });
        });

        return createdJob;
      })
    )
  )
).pipe(Atom.keepAlive);

export function seedJobsListState(
  organizationId: OrganizationId,
  response: JobListResponse
): JobsListState {
  return {
    items: response.items,
    nextCursor: response.nextCursor,
    organizationId,
  };
}

export function seedJobsOptionsState(
  organizationId: OrganizationId,
  response: JobOptionsResponse
): JobsOptionsState {
  return {
    data: response,
    organizationId,
  };
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

function refreshJobListOrUpsert(get: Atom.FnContext, job: CreateJobResponse) {
  return Effect.gen(function* () {
    const listResult = yield* listAllBrowserJobs().pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Jobs list refresh failed; using optimistic job", {
          error: error.message,
          jobId: job.id,
        })
      ),
      Effect.option
    );
    const currentListState = get(jobsListStateAtom);

    const nextListState = Option.match(listResult, {
      onNone: (): JobsListState => ({
        items: upsertJobListItem(currentListState.items, job),
        nextCursor: currentListState.nextCursor,
        organizationId: currentListState.organizationId,
      }),
      onSome: (list): JobsListState => ({
        items: list.items,
        nextCursor: list.nextCursor,
        organizationId: currentListState.organizationId,
      }),
    });

    yield* Effect.sync(() => {
      get.set(jobsListStateAtom, nextListState);
    });
  });
}

function refreshJobOptionsWhen(get: Atom.FnContext, shouldRefresh: boolean) {
  return shouldRefresh
    ? getBrowserJobOptions().pipe(
        Effect.tap((options) =>
          Effect.sync(() => {
            const currentOptionsState = get(jobsOptionsStateAtom);

            get.set(jobsOptionsStateAtom, {
              data: options,
              organizationId: currentOptionsState.organizationId,
            });
          })
        ),
        Effect.catchAll((error) =>
          Effect.logWarning("Jobs options refresh failed after job create", {
            error: error.message,
          })
        )
      )
    : Effect.void;
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
