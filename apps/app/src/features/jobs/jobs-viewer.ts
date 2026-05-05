import { isInternalOrganizationRole } from "@ceird/identity-core";
import type { JobStatus } from "@ceird/jobs-core";

import {
  decodeOrganizationViewerUserId,
  hasOrganizationElevatedAccess,
  isExternalOrganizationViewer,
} from "#/features/organizations/organization-viewer";
import type {
  OrganizationViewer,
  OrganizationViewerRole,
} from "#/features/organizations/organization-viewer";

export type JobsViewerRole = OrganizationViewerRole;

export type JobsViewer = OrganizationViewer;

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

const NO_TRANSITION_OPTIONS: readonly JobStatus[] = [];

export function hasJobsElevatedAccess(role: JobsViewerRole): boolean {
  return hasOrganizationElevatedAccess(role);
}

export function isExternalJobsViewer(
  viewer: Pick<JobsViewer, "role">
): boolean {
  return isExternalOrganizationViewer(viewer);
}

export function canViewOrganizationJobs(
  _viewer: Pick<JobsViewer, "role">
): boolean {
  return true;
}

export function canUseInternalJobOptions(
  viewer: Pick<JobsViewer, "role">
): boolean {
  return isInternalOrganizationRole(viewer.role);
}

export function canCommentOnJob(viewer: Pick<JobsViewer, "role">): boolean {
  return canViewOrganizationJobs(viewer);
}

export function hasAssignedJobAccess(
  viewer: JobsViewer,
  assigneeId: JobsViewer["userId"] | undefined
): boolean {
  return (
    isInternalOrganizationRole(viewer.role) &&
    (hasJobsElevatedAccess(viewer.role) || assigneeId === viewer.userId)
  );
}

export function getAvailableJobTransitions(
  viewer: JobsViewer,
  job: {
    readonly assigneeId?: JobsViewer["userId"] | undefined;
    readonly status: JobStatus;
  }
): readonly JobStatus[] {
  if (hasJobsElevatedAccess(viewer.role)) {
    return ELEVATED_TRANSITION_OPTIONS[job.status];
  }

  return hasAssignedJobAccess(viewer, job.assigneeId)
    ? MEMBER_TRANSITION_OPTIONS[job.status]
    : NO_TRANSITION_OPTIONS;
}

export function decodeJobsViewerUserId(input: unknown): JobsViewer["userId"] {
  return decodeOrganizationViewerUserId(input);
}
