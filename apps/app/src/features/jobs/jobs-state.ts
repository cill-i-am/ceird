"use client";

import { Atom } from "@effect-atom/atom-react";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  CreateJobInput,
  CreateJobResponse,
  JobContactOption,
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
import { Effect } from "effect";

import { makeBrowserJobsClient, provideBrowserJobsHttp } from "./jobs-client";
import type { AppJobsError } from "./jobs-errors";
import { normalizeJobsError } from "./jobs-errors";

export type JobsStatusFilter = "active" | "all" | JobStatus;

export interface JobsListFilters {
  readonly assigneeId: UserIdType | "all";
  readonly coordinatorId: UserIdType | "all";
  readonly priority: JobPriority | "all";
  readonly query: string;
  readonly regionId: RegionIdType | "all";
  readonly siteId: SiteIdType | "all";
  readonly status: JobsStatusFilter;
}

export interface JobsListState {
  readonly items: readonly JobListItem[];
  readonly nextCursor?: string | undefined;
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
  assigneeId: "all",
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

    if (
      filters.assigneeId !== "all" &&
      item.assigneeId !== filters.assigneeId
    ) {
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
        const listResult = yield* listAllBrowserJobs().pipe(Effect.either);
        const optionsResult = shouldRefreshOptions
          ? yield* getBrowserJobOptions().pipe(Effect.either)
          : undefined;
        const currentListState = get(jobsListStateAtom);
        const currentOptionsState = get(jobsOptionsStateAtom);

        if (listResult._tag === "Right") {
          const list = listResult.right;
          get.set(jobsListStateAtom, {
            items: list.items,
            nextCursor: list.nextCursor,
            organizationId: currentListState.organizationId,
          });
        } else {
          get.set(jobsListStateAtom, {
            items: upsertJobListItem(currentListState.items, createdJob),
            nextCursor: currentListState.nextCursor,
            organizationId: currentListState.organizationId,
          });
        }

        if (optionsResult?._tag === "Right") {
          const options = optionsResult.right;

          get.set(jobsOptionsStateAtom, {
            data: options,
            organizationId: currentOptionsState.organizationId,
          });
        }

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
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();
    const items: JobListItem[] = [];
    let cursor: JobListQuery["cursor"];

    while (true) {
      const page: JobListResponse = yield* client.jobs.listJobs({
        urlParams: cursor ? { cursor } : {},
      });

      items.push(...page.items);

      if (!page.nextCursor) {
        return {
          items,
          nextCursor: undefined,
        } satisfies JobListResponse;
      }

      cursor = page.nextCursor;
    }
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function getBrowserJobOptions() {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.getJobOptions();
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function createBrowserJob(input: CreateJobInput) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.createJob({ payload: input });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function isActiveStatus(status: JobStatus) {
  return (
    status === "new" ||
    status === "triaged" ||
    status === "in_progress" ||
    status === "blocked"
  );
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
