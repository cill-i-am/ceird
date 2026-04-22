/* oxlint-disable eslint/max-classes-per-file */

import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

import { JobStatusSchema } from "./domain.js";
import { ContactId, SiteId, VisitId, WorkItemId } from "./ids.js";

export const JOB_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/JobNotFoundError" as const;
export class JobNotFoundError extends Schema.TaggedError<JobNotFoundError>()(
  JOB_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const JOB_ACCESS_DENIED_ERROR_TAG =
  "@task-tracker/jobs-core/JobAccessDeniedError" as const;
export class JobAccessDeniedError extends Schema.TaggedError<JobAccessDeniedError>()(
  JOB_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: Schema.optional(WorkItemId),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

export const INVALID_JOB_TRANSITION_ERROR_TAG =
  "@task-tracker/jobs-core/InvalidJobTransitionError" as const;
export class InvalidJobTransitionError extends Schema.TaggedError<InvalidJobTransitionError>()(
  INVALID_JOB_TRANSITION_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    fromStatus: JobStatusSchema,
    toStatus: JobStatusSchema,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const BLOCKED_REASON_REQUIRED_ERROR_TAG =
  "@task-tracker/jobs-core/BlockedReasonRequiredError" as const;
export class BlockedReasonRequiredError extends Schema.TaggedError<BlockedReasonRequiredError>()(
  BLOCKED_REASON_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    status: Schema.Literal("blocked"),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG =
  "@task-tracker/jobs-core/CoordinatorMatchesAssigneeError" as const;
export class CoordinatorMatchesAssigneeError extends Schema.TaggedError<CoordinatorMatchesAssigneeError>()(
  COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const VISIT_DURATION_INCREMENT_ERROR_TAG =
  "@task-tracker/jobs-core/VisitDurationIncrementError" as const;
export class VisitDurationIncrementError extends Schema.TaggedError<VisitDurationIncrementError>()(
  VISIT_DURATION_INCREMENT_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    visitId: Schema.optional(VisitId),
    durationMinutes: Schema.Int,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const SITE_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/SiteNotFoundError" as const;
export class SiteNotFoundError extends Schema.TaggedError<SiteNotFoundError>()(
  SITE_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    siteId: SiteId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const CONTACT_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/ContactNotFoundError" as const;
export class ContactNotFoundError extends Schema.TaggedError<ContactNotFoundError>()(
  CONTACT_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    contactId: ContactId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export type JobsError =
  | JobNotFoundError
  | JobAccessDeniedError
  | InvalidJobTransitionError
  | BlockedReasonRequiredError
  | CoordinatorMatchesAssigneeError
  | VisitDurationIncrementError
  | SiteNotFoundError
  | ContactNotFoundError;
