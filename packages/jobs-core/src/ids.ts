import { OrganizationId as IdentityOrganizationId } from "@task-tracker/identity-core";
import type { OrganizationId as OrganizationIdType } from "@task-tracker/identity-core";
import { Schema } from "effect";

export const OrganizationId = IdentityOrganizationId;
export type OrganizationId = OrganizationIdType;

export const UserId = Schema.NonEmptyString.pipe(
  Schema.brand("@task-tracker/jobs-core/UserId")
);
export type UserId = Schema.Schema.Type<typeof UserId>;

export const WorkItemId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/WorkItemId")
);
export type WorkItemId = Schema.Schema.Type<typeof WorkItemId>;

export const ServiceAreaId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/ServiceAreaId")
);
export type ServiceAreaId = Schema.Schema.Type<typeof ServiceAreaId>;

export const RateCardId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/RateCardId")
);
export type RateCardId = Schema.Schema.Type<typeof RateCardId>;

export const RateCardLineId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/RateCardLineId")
);
export type RateCardLineId = Schema.Schema.Type<typeof RateCardLineId>;

export const SiteId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/SiteId")
);
export type SiteId = Schema.Schema.Type<typeof SiteId>;

export const ContactId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/ContactId")
);
export type ContactId = Schema.Schema.Type<typeof ContactId>;

export const CommentId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/CommentId")
);
export type CommentId = Schema.Schema.Type<typeof CommentId>;

export const ActivityId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/ActivityId")
);
export type ActivityId = Schema.Schema.Type<typeof ActivityId>;

export const VisitId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/VisitId")
);
export type VisitId = Schema.Schema.Type<typeof VisitId>;

export const JobLabelId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/JobLabelId")
);
export type JobLabelId = Schema.Schema.Type<typeof JobLabelId>;

export const CostLineId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/CostLineId")
);
export type CostLineId = Schema.Schema.Type<typeof CostLineId>;
