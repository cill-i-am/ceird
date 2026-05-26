import { CommentId as SharedCommentId } from "@ceird/comments-core";
import type { CommentIdType as SharedCommentIdType } from "@ceird/comments-core";
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

export const CommentId = SharedCommentId;
export type CommentId = SharedCommentIdType;
export type CommentIdType = SharedCommentIdType;

export const WorkItemId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/jobs-core/WorkItemId")
);
export type WorkItemId = Schema.Schema.Type<typeof WorkItemId>;

export const ContactId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/jobs-core/ContactId")
);
export type ContactId = Schema.Schema.Type<typeof ContactId>;

export const ActivityId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/jobs-core/ActivityId")
);
export type ActivityId = Schema.Schema.Type<typeof ActivityId>;

export const VisitId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/jobs-core/VisitId")
);
export type VisitId = Schema.Schema.Type<typeof VisitId>;

export const JobCollaboratorId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/jobs-core/JobCollaboratorId")
);
export type JobCollaboratorId = Schema.Schema.Type<typeof JobCollaboratorId>;
