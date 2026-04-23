/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId, UserId, WorkItemId } from "@task-tracker/jobs-core";
import { Schema } from "effect";

export const JOBS_SESSION_REQUIRED_ERROR_TAG =
  "@task-tracker/domains/jobs/JobsSessionRequiredError" as const;
export class JobsSessionRequiredError extends Schema.TaggedError<JobsSessionRequiredError>()(
  JOBS_SESSION_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

export const JOBS_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG =
  "@task-tracker/domains/jobs/JobsActiveOrganizationRequiredError" as const;
export class JobsActiveOrganizationRequiredError extends Schema.TaggedError<JobsActiveOrganizationRequiredError>()(
  JOBS_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
    userId: UserId,
  }
) {}

export const JOBS_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG =
  "@task-tracker/domains/jobs/JobsActorMembershipNotFoundError" as const;
export class JobsActorMembershipNotFoundError extends Schema.TaggedError<JobsActorMembershipNotFoundError>()(
  JOBS_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  }
) {}

export const JOBS_ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG =
  "@task-tracker/domains/jobs/JobsOrganizationRoleNotSupportedError" as const;
export class JobsOrganizationRoleNotSupportedError extends Schema.TaggedError<JobsOrganizationRoleNotSupportedError>()(
  JOBS_ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  {
    message: Schema.String,
    membershipRole: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  }
) {}

export class WorkItemOrganizationMismatchError extends Schema.TaggedError<WorkItemOrganizationMismatchError>()(
  "@task-tracker/domains/jobs/WorkItemOrganizationMismatchError",
  {
    message: Schema.String,
    organizationId: OrganizationId,
    workItemId: WorkItemId,
  }
) {}
