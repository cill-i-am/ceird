/* oxlint-disable eslint/max-classes-per-file */

import type {
  LabelNameConflictError,
  LabelNotFoundError,
} from "@ceird/labels-core";
import type {
  SiteGeocodingFailedError,
  SiteGeocodingProviderError,
  SiteNotFoundError,
} from "@ceird/sites-core";
import { Schema } from "effect";

import { JobStatusSchema } from "./domain.js";
import {
  ContactId,
  JobCollaboratorId,
  OrganizationId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

export const JOB_NOT_FOUND_ERROR_TAG =
  "@ceird/jobs-core/JobNotFoundError" as const;
export class JobNotFoundError extends Schema.TaggedErrorClass<JobNotFoundError>()(
  JOB_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
  },
  { httpApiStatus: 404 }
) {}

export const JOB_ACCESS_DENIED_ERROR_TAG =
  "@ceird/jobs-core/JobAccessDeniedError" as const;
export class JobAccessDeniedError extends Schema.TaggedErrorClass<JobAccessDeniedError>()(
  JOB_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: Schema.optional(WorkItemId),
  },
  { httpApiStatus: 403 }
) {}

export const JOB_LIST_CURSOR_INVALID_ERROR_TAG =
  "@ceird/jobs-core/JobListCursorInvalidError" as const;
export class JobListCursorInvalidError extends Schema.TaggedErrorClass<JobListCursorInvalidError>()(
  JOB_LIST_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export const ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG =
  "@ceird/jobs-core/OrganizationActivityCursorInvalidError" as const;
export class OrganizationActivityCursorInvalidError extends Schema.TaggedErrorClass<OrganizationActivityCursorInvalidError>()(
  ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export const JOB_STORAGE_ERROR_TAG =
  "@ceird/jobs-core/JobStorageError" as const;
export class JobStorageError extends Schema.TaggedErrorClass<JobStorageError>()(
  JOB_STORAGE_ERROR_TAG,
  {
    message: Schema.String,
    cause: Schema.optional(Schema.String),
  },
  { httpApiStatus: 503 }
) {}

export const INVALID_JOB_TRANSITION_ERROR_TAG =
  "@ceird/jobs-core/InvalidJobTransitionError" as const;
export class InvalidJobTransitionError extends Schema.TaggedErrorClass<InvalidJobTransitionError>()(
  INVALID_JOB_TRANSITION_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    fromStatus: JobStatusSchema,
    toStatus: JobStatusSchema,
  },
  { httpApiStatus: 400 }
) {}

export const BLOCKED_REASON_REQUIRED_ERROR_TAG =
  "@ceird/jobs-core/BlockedReasonRequiredError" as const;
export class BlockedReasonRequiredError extends Schema.TaggedErrorClass<BlockedReasonRequiredError>()(
  BLOCKED_REASON_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    status: Schema.Literal("blocked"),
  },
  { httpApiStatus: 400 }
) {}

export const COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG =
  "@ceird/jobs-core/CoordinatorMatchesAssigneeError" as const;
export class CoordinatorMatchesAssigneeError extends Schema.TaggedErrorClass<CoordinatorMatchesAssigneeError>()(
  COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: Schema.optional(WorkItemId),
  },
  { httpApiStatus: 400 }
) {}

export const VISIT_DURATION_INCREMENT_ERROR_TAG =
  "@ceird/jobs-core/VisitDurationIncrementError" as const;
export class VisitDurationIncrementError extends Schema.TaggedErrorClass<VisitDurationIncrementError>()(
  VISIT_DURATION_INCREMENT_ERROR_TAG,
  {
    message: Schema.String,
    workItemId: WorkItemId,
    visitId: Schema.optional(VisitId),
    durationMinutes: Schema.Int,
  },
  { httpApiStatus: 400 }
) {}

export const JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG =
  "@ceird/jobs-core/JobCollaboratorNotFoundError" as const;
export class JobCollaboratorNotFoundError extends Schema.TaggedErrorClass<JobCollaboratorNotFoundError>()(
  JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG,
  {
    collaboratorId: JobCollaboratorId,
    message: Schema.String,
    workItemId: WorkItemId,
  },
  { httpApiStatus: 404 }
) {}

export const JOB_COLLABORATOR_CONFLICT_ERROR_TAG =
  "@ceird/jobs-core/JobCollaboratorConflictError" as const;
export class JobCollaboratorConflictError extends Schema.TaggedErrorClass<JobCollaboratorConflictError>()(
  JOB_COLLABORATOR_CONFLICT_ERROR_TAG,
  {
    message: Schema.String,
    userId: UserId,
    workItemId: WorkItemId,
  },
  { httpApiStatus: 409 }
) {}

export const CONTACT_NOT_FOUND_ERROR_TAG =
  "@ceird/jobs-core/ContactNotFoundError" as const;
export class ContactNotFoundError extends Schema.TaggedErrorClass<ContactNotFoundError>()(
  CONTACT_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    contactId: ContactId,
  },
  { httpApiStatus: 404 }
) {}

export const ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG =
  "@ceird/jobs-core/OrganizationMemberNotFoundError" as const;
export class OrganizationMemberNotFoundError extends Schema.TaggedErrorClass<OrganizationMemberNotFoundError>()(
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  },
  { httpApiStatus: 404 }
) {}

export type JobsError =
  | JobNotFoundError
  | JobAccessDeniedError
  | JobListCursorInvalidError
  | OrganizationActivityCursorInvalidError
  | JobStorageError
  | InvalidJobTransitionError
  | BlockedReasonRequiredError
  | CoordinatorMatchesAssigneeError
  | VisitDurationIncrementError
  | LabelNotFoundError
  | LabelNameConflictError
  | JobCollaboratorNotFoundError
  | JobCollaboratorConflictError
  | SiteNotFoundError
  | SiteGeocodingFailedError
  | SiteGeocodingProviderError
  | ContactNotFoundError
  | OrganizationMemberNotFoundError;
