"use client";

import { Atom } from "@effect-atom/atom-react";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  CreateJobInput,
  CreateJobResponse,
  JobContactOption,
  JobListCursorType,
  JobListQuery,
  JobListItem,
  JobListResponse,
  JobOptionsResponse,
  JobPriority,
  JobStatus,
  Job,
  RegionIdType,
  SiteIdType,
  UserIdType,
} from "@task-tracker/jobs-core";
import { Effect, Option } from "effect";

import { runBrowserJobsRequest } from "./jobs-client";
import type { AppJobsError } from "./jobs-errors";

export type JobsStatusFilter = "active" | "all" | JobStatus;

export type JobsAssigneeFilter =
  | { readonly kind: "all" }
  | { readonly kind: "unassigned" }
  | { readonly kind: "user"; readonly userId: UserIdType };

export interface JobsListFilters {
  readonly assigneeId: JobsAssigneeFilter;
  readonly coordinatorId: UserIdType | "all";
  readonly priority: JobPriority | "all";
  readonly query: string;
  readonly regionId: RegionIdType | "all";
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
  members: [],
  regions: [],
  sites: [],
};

export const defaultJobsListFilters: JobsListFilters = {
  assigneeId: { kind: "all" },
  coordinatorId: "all",
  priority: "all",
  query: "",
  regionId: "all",
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
    regionById: new Map(options.regions.map((region) => [region.id, region])),
    siteById: new Map(options.sites.map((site) => [site.id, site])),
  };
}).pipe(Atom.keepAlive);

export const visibleJobsAtom = Atom.make((get) => {
  const { items } = get(jobsListStateAtom);
  const filters = get(jobsListFiltersAtom);
  const { siteById } = get(jobsLookupAtom);

  return items.filter((item) => {
    if (!matchesStatusFilter(item.status, filters.status)) {
      return false;
    }

    if (!matchesAssigneeFilter(item.assigneeId, filters.assigneeId)) {
      return false;
    }

    if (
      filters.coordinatorId !== "all" &&
      item.coordinatorId !== filters.coordinatorId
    ) {
      return false;
    }

    if (filters.priority !== "all" && item.priority !== filters.priority) {
      return false;
    }

    if (filters.siteId !== "all" && item.siteId !== filters.siteId) {
      return false;
    }

    if (filters.query.trim().length > 0) {
      const siteName =
        item.siteId === undefined ? undefined : siteById.get(item.siteId)?.name;
      const searchable =
        `${item.title} ${item.kind} ${siteName ?? ""}`.toLowerCase();

      if (!searchable.includes(filters.query.trim().toLowerCase())) {
        return false;
      }
    }

    if (filters.regionId !== "all") {
      const regionId =
        item.siteId === undefined
          ? undefined
          : siteById.get(item.siteId)?.regionId;

      if (regionId !== filters.regionId) {
        return false;
      }
    }

    return true;
  });
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

export const refreshJobsListAtom = Atom.fn<AppJobsError, JobListResponse>(
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

export const refreshJobOptionsAtom = Atom.fn<AppJobsError, JobOptionsResponse>(
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
  AppJobsError,
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

        get.set(jobsNoticeAtom, {
          kind: "created",
          title: createdJob.title,
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
  return runBrowserJobsRequest("JobsBrowser.listAllJobs", (client) => {
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
  return runBrowserJobsRequest("JobsBrowser.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

function createBrowserJob(input: CreateJobInput) {
  return runBrowserJobsRequest("JobsBrowser.createJob", (client) =>
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

    get.set(jobsListStateAtom, nextListState);
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

type JobListItemSource = Pick<
  Job | CreateJobResponse,
  | "assigneeId"
  | "contactId"
  | "coordinatorId"
  | "createdAt"
  | "id"
  | "kind"
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
    id: job.id,
    kind: job.kind,
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
