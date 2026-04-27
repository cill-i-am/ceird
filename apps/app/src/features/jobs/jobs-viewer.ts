import type { JobStatus } from "@task-tracker/jobs-core";

export type JobsViewerRole = "owner" | "admin" | "member";

export interface JobsViewer {
  readonly role: JobsViewerRole;
  readonly userId: string;
}

const ELEVATED_TRANSITION_OPTIONS: Readonly<
  Record<JobStatus, readonly JobStatus[]>
> = {
  blocked: ["in_progress", "canceled"],
  canceled: [],
  completed: [],
  in_progress: ["blocked", "completed", "canceled"],
  new: ["triaged", "in_progress", "canceled"],
  triaged: ["in_progress", "blocked", "canceled"],
};

export const MEMBER_TRANSITION_OPTIONS: Readonly<
  Record<JobStatus, readonly JobStatus[]>
> = {
  blocked: ["in_progress"],
  canceled: [],
  completed: [],
  in_progress: ["blocked", "completed"],
  new: ["in_progress"],
  triaged: ["in_progress"],
};

export function hasJobsElevatedAccess(role: JobsViewerRole): boolean {
  return role === "owner" || role === "admin";
}

export function decodeJobsViewerRole(role: string): JobsViewerRole {
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }

  throw new Error("Organization member role is not supported by Jobs.");
}

export function hasAssignedJobAccess(
  viewer: JobsViewer,
  assigneeId: string | undefined
): boolean {
  return hasJobsElevatedAccess(viewer.role) || assigneeId === viewer.userId;
}

export function getAvailableJobTransitions(
  viewer: JobsViewer,
  job: {
    readonly assigneeId?: string | undefined;
    readonly status: JobStatus;
  }
): readonly JobStatus[] {
  if (hasJobsElevatedAccess(viewer.role)) {
    return ELEVATED_TRANSITION_OPTIONS[job.status];
  }

  if (job.assigneeId !== viewer.userId) {
    return [];
  }

  return MEMBER_TRANSITION_OPTIONS[job.status];
}
