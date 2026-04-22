/* oxlint-disable eslint/max-classes-per-file */

import {
  OrganizationId,
  RegionId,
  UserId,
  WorkItemId,
} from "@task-tracker/jobs-core";
import { Schema } from "effect";

export class JobListCursorInvalidError extends Schema.TaggedError<JobListCursorInvalidError>()(
  "@task-tracker/domains/jobs/JobListCursorInvalidError",
  {
    cursor: Schema.String,
    message: Schema.String,
  }
) {}

export class OrganizationMemberNotFoundError extends Schema.TaggedError<OrganizationMemberNotFoundError>()(
  "@task-tracker/domains/jobs/OrganizationMemberNotFoundError",
  {
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  }
) {}

export class RegionNotFoundError extends Schema.TaggedError<RegionNotFoundError>()(
  "@task-tracker/domains/jobs/RegionNotFoundError",
  {
    message: Schema.String,
    organizationId: OrganizationId,
    regionId: RegionId,
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
