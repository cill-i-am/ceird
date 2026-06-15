export type JobsWorkspaceView = "list" | "board";
export type JobsWorkspaceStatus = "active" | "blocked" | "completed";

export interface JobsWorkspaceSearch {
  readonly status?: JobsWorkspaceStatus;
  readonly view?: JobsWorkspaceView;
}

const JOBS_WORKSPACE_VIEWS = new Set<JobsWorkspaceView>(["list", "board"]);
const JOBS_WORKSPACE_STATUSES = new Set<JobsWorkspaceStatus>([
  "active",
  "blocked",
  "completed",
]);

export function decodeJobsWorkspaceSearch(
  search: Record<string, unknown>
): JobsWorkspaceSearch {
  return {
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
