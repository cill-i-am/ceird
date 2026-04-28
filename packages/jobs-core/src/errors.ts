/* oxlint-disable eslint/max-classes-per-file */

import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

import { JobStatusSchema, SiteCountrySchema } from "./domain.js";
import {
  ContactId,
  OrganizationId,
  RateCardId,
  ServiceAreaId,
  SiteId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

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

export const JOB_LIST_CURSOR_INVALID_ERROR_TAG =
  "@task-tracker/jobs-core/JobListCursorInvalidError" as const;
export class JobListCursorInvalidError extends Schema.TaggedError<JobListCursorInvalidError>()(
  JOB_LIST_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG =
  "@task-tracker/jobs-core/OrganizationActivityCursorInvalidError" as const;
export class OrganizationActivityCursorInvalidError extends Schema.TaggedError<OrganizationActivityCursorInvalidError>()(
  ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export const JOB_STORAGE_ERROR_TAG =
  "@task-tracker/jobs-core/JobStorageError" as const;
export class JobStorageError extends Schema.TaggedError<JobStorageError>()(
  JOB_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 503 })
) {}

export const JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG =
  "@task-tracker/jobs-core/JobCostSummaryLimitExceededError" as const;
export class JobCostSummaryLimitExceededError extends Schema.TaggedError<JobCostSummaryLimitExceededError>()(
  JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
  },
  HttpApiSchema.annotations({ status: 422 })
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
    workItemId: Schema.optional(WorkItemId),
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

export const SITE_GEOCODING_FAILED_ERROR_TAG =
  "@task-tracker/jobs-core/SiteGeocodingFailedError" as const;
export class SiteGeocodingFailedError extends Schema.TaggedError<SiteGeocodingFailedError>()(
  SITE_GEOCODING_FAILED_ERROR_TAG,
  {
    message: Schema.String,
    country: SiteCountrySchema,
    eircode: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 422 })
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

export const ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/OrganizationMemberNotFoundError" as const;
export class OrganizationMemberNotFoundError extends Schema.TaggedError<OrganizationMemberNotFoundError>()(
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const SERVICE_AREA_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/ServiceAreaNotFoundError" as const;
export class ServiceAreaNotFoundError extends Schema.TaggedError<ServiceAreaNotFoundError>()(
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    serviceAreaId: ServiceAreaId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export const RATE_CARD_NOT_FOUND_ERROR_TAG =
  "@task-tracker/jobs-core/RateCardNotFoundError" as const;
export class RateCardNotFoundError extends Schema.TaggedError<RateCardNotFoundError>()(
  RATE_CARD_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    rateCardId: RateCardId,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export type JobsError =
  | JobNotFoundError
  | JobAccessDeniedError
  | JobListCursorInvalidError
  | OrganizationActivityCursorInvalidError
  | JobStorageError
  | JobCostSummaryLimitExceededError
  | InvalidJobTransitionError
  | BlockedReasonRequiredError
  | CoordinatorMatchesAssigneeError
  | VisitDurationIncrementError
  | SiteNotFoundError
  | SiteGeocodingFailedError
  | ContactNotFoundError
  | OrganizationMemberNotFoundError
  | ServiceAreaNotFoundError
  | RateCardNotFoundError;
