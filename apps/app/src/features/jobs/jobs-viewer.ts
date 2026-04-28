import { isAdministrativeOrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import { UserId } from "@task-tracker/jobs-core";
import type { JobStatus, UserIdType } from "@task-tracker/jobs-core";
import { ParseResult } from "effect";

export type JobsViewerRole = OrganizationRole;

export interface JobsViewer {
  readonly role: JobsViewerRole;
  readonly userId: UserIdType;
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
  return isAdministrativeOrganizationRole(role);
}

export function hasAssignedJobAccess(
  viewer: JobsViewer,
  assigneeId: UserIdType | undefined
): boolean {
  return hasJobsElevatedAccess(viewer.role) || assigneeId === viewer.userId;
}

export function getAvailableJobTransitions(
  viewer: JobsViewer,
  job: {
    readonly assigneeId?: UserIdType | undefined;
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

export function decodeJobsViewerUserId(input: unknown): UserIdType {
  return ParseResult.decodeUnknownSync(UserId)(input);
}
