import {
  OrganizationId as IdentityOrganizationId,
  UserId as IdentityUserId,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  UserId as UserIdType,
} from "@ceird/identity-core";
import { Schema } from "effect";

export const OrganizationId = IdentityOrganizationId;
export type OrganizationId = OrganizationIdType;

export const UserId = IdentityUserId;
export type UserId = UserIdType;

export const WorkItemId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/WorkItemId")
);
export type WorkItemId = Schema.Schema.Type<typeof WorkItemId>;

export const RateCardId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/RateCardId")
);
export type RateCardId = Schema.Schema.Type<typeof RateCardId>;

export const RateCardLineId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/RateCardLineId")
);
export type RateCardLineId = Schema.Schema.Type<typeof RateCardLineId>;

export const ContactId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/ContactId")
);
export type ContactId = Schema.Schema.Type<typeof ContactId>;

export const CommentId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/CommentId")
);
export type CommentId = Schema.Schema.Type<typeof CommentId>;

export const ActivityId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/ActivityId")
);
export type ActivityId = Schema.Schema.Type<typeof ActivityId>;

export const VisitId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/VisitId")
);
export type VisitId = Schema.Schema.Type<typeof VisitId>;

export const JobCollaboratorId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/JobCollaboratorId")
);
export type JobCollaboratorId = Schema.Schema.Type<typeof JobCollaboratorId>;

export const CostLineId = Schema.UUID.pipe(
  Schema.brand("@ceird/jobs-core/CostLineId")
);
export type CostLineId = Schema.Schema.Type<typeof CostLineId>;
