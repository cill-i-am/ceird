export type JobsWorkspaceView = "list" | "board";
export type JobsWorkspaceStatus = "active" | "blocked" | "completed" | "all";
export type JobsWorkspaceSort = "updated-desc" | "updated-asc" | "priority";

export interface JobsWorkspaceSearch {
  readonly labelId?: string | undefined;
  readonly query?: string | undefined;
  readonly recentSearch?: string | undefined;
  readonly sort?: JobsWorkspaceSort | undefined;
  readonly status?: JobsWorkspaceStatus;
  readonly view?: JobsWorkspaceView;
}

const JOBS_WORKSPACE_VIEWS = new Set<JobsWorkspaceView>(["list", "board"]);
const JOBS_WORKSPACE_STATUSES = new Set<JobsWorkspaceStatus>([
  "all",
  "active",
  "blocked",
  "completed",
]);
const JOBS_WORKSPACE_SORTS = new Set<JobsWorkspaceSort>([
  "updated-desc",
  "updated-asc",
  "priority",
]);

export function decodeJobsWorkspaceSearch(
  search: Record<string, unknown>
): JobsWorkspaceSearch {
  return {
    labelId: parseNonEmptyString(search.labelId),
    query: parseNonEmptyString(search.query),
    recentSearch: parseNonEmptyString(search.recentSearch),
    sort: parseJobsWorkspaceSort(search.sort),
    status: parseJobsWorkspaceStatus(search.status),
    view: parseJobsWorkspaceView(search.view),
  };
}

function parseJobsWorkspaceView(value: unknown) {
  return typeof value === "string" &&
    JOBS_WORKSPACE_VIEWS.has(value as JobsWorkspaceView)
    ? (value as JobsWorkspaceView)
    : undefined;
}

function parseJobsWorkspaceStatus(value: unknown) {
  return typeof value === "string" &&
    JOBS_WORKSPACE_STATUSES.has(value as JobsWorkspaceStatus)
    ? (value as JobsWorkspaceStatus)
    : undefined;
}

function parseJobsWorkspaceSort(value: unknown) {
  return typeof value === "string" &&
    JOBS_WORKSPACE_SORTS.has(value as JobsWorkspaceSort)
    ? (value as JobsWorkspaceSort)
    : undefined;
}

function parseNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}
