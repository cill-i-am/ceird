import type {
  JobListCursorType,
  JobListQuery,
  JobPriority,
  JobStatus,
  UserIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";

import type { JobsAssigneeFilter, JobsListFilters } from "./jobs-state";

const JOBS_VIEW_MODES = ["list", "map"] as const;
const JOBS_ROUTE_LIMITS = [10, 15, 20, 25] as const;
const JOBS_LIST_LIMITS = [25, 50, 75, 100] as const;
const JOBS_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
] as const satisfies readonly JobStatus[];
const JOB_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
const DEFAULT_JOBS_LIST_FILTERS = {
  assigneeId: { kind: "all" },
  coordinatorId: "all",
  labelId: "all",
  priority: "all",
  query: "",
  siteId: "all",
  status: "active",
} as const satisfies JobsListFilters;

type JobsViewMode = (typeof JOBS_VIEW_MODES)[number];
type JobsRouteLimit = (typeof JOBS_ROUTE_LIMITS)[number];
type JobsListLimit = (typeof JOBS_LIST_LIMITS)[number];

export interface JobsSearch {
  readonly assigneeId?: UserIdType | "unassigned" | undefined;
  readonly coordinatorId?: UserIdType | undefined;
  readonly cursor?: JobListCursorType | undefined;
  readonly labelId?: LabelIdType | undefined;
  readonly limit?: JobsListLimit | undefined;
  readonly near?: boolean | undefined;
  readonly priority?: JobPriority | undefined;
  readonly query?: string | undefined;
  readonly routeLimit?: JobsRouteLimit | undefined;
  readonly siteId?: SiteIdType | undefined;
  readonly status?: JobsListFilters["status"] | undefined;
  readonly view?: JobsViewMode | undefined;
}

export function decodeJobsSearch(input: unknown): JobsSearch {
  const assigneeId = readSearchParam(input, "assigneeId");
  const coordinatorId = readSearchParam(input, "coordinatorId");
  const cursor = readSearchParam(input, "cursor");
  const labelId = readSearchParam(input, "labelId");
  const limit = readSearchParam(input, "limit");
  const near = readSearchParam(input, "near");
  const priority = readSearchParam(input, "priority");
  const query = readSearchParam(input, "query");
  const routeLimit = readSearchParam(input, "routeLimit");
  const siteId = readSearchParam(input, "siteId");
  const status = readSearchParam(input, "status");
  const view = readSearchParam(input, "view");

  return {
    assigneeId: decodeAssigneeId(assigneeId),
    coordinatorId: decodeUserId(coordinatorId),
    cursor: decodeCursor(cursor),
    labelId: decodeLabelId(labelId),
    limit: decodeJobsListLimit(limit),
    near: decodeJobsNearSearch(near),
    priority: decodePriority(priority),
    query: decodeQuery(query),
    routeLimit: decodeJobsRouteLimit(routeLimit),
    siteId: decodeSiteId(siteId),
    status: decodeStatus(status),
    view: isJobsViewMode(view) ? view : undefined,
  };
}

export function getJobsRouteLoaderDeps(search: JobsSearch) {
  return {
    assigneeId: search.assigneeId,
    coordinatorId: search.coordinatorId,
    cursor: search.cursor,
    labelId: search.labelId,
    limit: search.limit,
    priority: search.priority,
    query: search.query,
    siteId: search.siteId,
    status: search.status,
  } satisfies JobsSearch;
}

export function jobsSearchToFilters(search: JobsSearch): JobsListFilters {
  return {
    assigneeId: search.assigneeId
      ? toJobsAssigneeFilter(search.assigneeId)
      : DEFAULT_JOBS_LIST_FILTERS.assigneeId,
    coordinatorId:
      search.coordinatorId ?? DEFAULT_JOBS_LIST_FILTERS.coordinatorId,
    labelId: search.labelId ?? DEFAULT_JOBS_LIST_FILTERS.labelId,
    priority: search.priority ?? DEFAULT_JOBS_LIST_FILTERS.priority,
    query: search.query ?? DEFAULT_JOBS_LIST_FILTERS.query,
    siteId: search.siteId ?? DEFAULT_JOBS_LIST_FILTERS.siteId,
    status: search.status ?? DEFAULT_JOBS_LIST_FILTERS.status,
  };
}

export function filtersToJobsSearch(
  filters: JobsListFilters
): Pick<
  JobsSearch,
  | "assigneeId"
  | "coordinatorId"
  | "labelId"
  | "priority"
  | "query"
  | "siteId"
  | "status"
> {
  return {
    assigneeId: fromJobsAssigneeFilter(filters.assigneeId),
    coordinatorId:
      filters.coordinatorId === DEFAULT_JOBS_LIST_FILTERS.coordinatorId
        ? undefined
        : filters.coordinatorId,
    labelId:
      filters.labelId === DEFAULT_JOBS_LIST_FILTERS.labelId
        ? undefined
        : filters.labelId,
    priority:
      filters.priority === DEFAULT_JOBS_LIST_FILTERS.priority
        ? undefined
        : filters.priority,
    query: filters.query.trim() || undefined,
    siteId:
      filters.siteId === DEFAULT_JOBS_LIST_FILTERS.siteId
        ? undefined
        : filters.siteId,
    status:
      filters.status === DEFAULT_JOBS_LIST_FILTERS.status
        ? undefined
        : filters.status,
  };
}

export function toJobsListQuery(search: JobsSearch): JobListQuery {
  return {
    assigneeId: search.assigneeId,
    coordinatorId: search.coordinatorId,
    cursor: search.cursor,
    labelId: search.labelId,
    limit: search.limit ?? 50,
    priority: search.priority,
    query: search.query,
    siteId: search.siteId,
    status: search.status ?? "active",
  };
}

export function isJobsMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeJobsSearch(search).view === "map";
}

function readSearchParam(input: unknown, key: string): unknown {
  if (typeof input !== "object" || input === null) {
    return;
  }

  return (input as Record<string, unknown>)[key];
}

function isJobsViewMode(value: unknown): value is JobsViewMode {
  return value === "list" || value === "map";
}

function decodeJobsNearSearch(value: unknown) {
  if (value === undefined) {
    return;
  }

  return value === true || value === "true";
}

function decodeJobsRouteLimit(value: unknown): JobsRouteLimit | undefined {
  if (typeof value === "number") {
    return JOBS_ROUTE_LIMITS.find((limit) => limit === value);
  }

  if (typeof value !== "string") {
    return;
  }

  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return;
  }

  const parsed = Number(trimmedValue);

  return JOBS_ROUTE_LIMITS.find((limit) => limit === parsed);
}

function decodeJobsListLimit(value: unknown): JobsListLimit | undefined {
  if (typeof value === "number") {
    return JOBS_LIST_LIMITS.find((limit) => limit === value);
  }

  if (typeof value !== "string") {
    return;
  }

  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) {
    return;
  }

  const parsed = Number(trimmedValue);

  return JOBS_LIST_LIMITS.find((limit) => limit === parsed);
}

function decodeAssigneeId(
  value: unknown
): UserIdType | "unassigned" | undefined {
  if (value === "unassigned") {
    return "unassigned";
  }

  return decodeUserId(value);
}

function decodeUserId(value: unknown): UserIdType | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as UserIdType;
}

function decodeLabelId(value: unknown): LabelIdType | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as LabelIdType;
}

function decodeSiteId(value: unknown): SiteIdType | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as SiteIdType;
}

function decodeCursor(value: unknown): JobListCursorType | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as JobListCursorType;
}

function decodePriority(value: unknown): JobPriority | undefined {
  if (typeof value !== "string") {
    return;
  }

  return JOB_PRIORITIES.find((priority) => priority === value);
}

function decodeQuery(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function decodeStatus(value: unknown): JobsListFilters["status"] | undefined {
  if (value === "active" || value === "all") {
    return value;
  }

  if (typeof value !== "string") {
    return;
  }

  return JOBS_STATUSES.find((status) => status === value);
}

function toJobsAssigneeFilter(
  value: UserIdType | "unassigned"
): JobsAssigneeFilter {
  return value === "unassigned"
    ? { kind: "unassigned" }
    : { kind: "user", userId: value };
}

function fromJobsAssigneeFilter(
  filter: JobsAssigneeFilter
): UserIdType | "unassigned" | undefined {
  if (filter.kind === "all") {
    return;
  }

  return filter.kind === "unassigned" ? "unassigned" : filter.userId;
}
