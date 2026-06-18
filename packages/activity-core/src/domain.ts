import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export const ACTIVITY_FEED_RETENTION_DAYS = 30;
export const ACTIVITY_FEED_MAX_EVENTS_PER_ORG = 5000;

export const ACTIVITY_EVENT_TYPES = [
  "agent.product_effect",
  "comment.created",
  "job.assignee_changed",
  "job.blocked_reason_changed",
  "job.contact_changed",
  "job.coordinator_changed",
  "job.created",
  "job.label_added",
  "job.label_removed",
  "job.priority_changed",
  "job.reopened",
  "job.site_changed",
  "job.status_changed",
  "job.visit_logged",
  "label.archived",
  "label.created",
  "label.restored",
  "label.updated",
  "site.comment_created",
  "site.created",
  "site.label_added",
  "site.label_removed",
  "site.updated",
] as const;
export const ActivityEventTypeSchema = Schema.Literals(ACTIVITY_EVENT_TYPES);
export type ActivityEventType = Schema.Schema.Type<
  typeof ActivityEventTypeSchema
>;

export const ACTIVITY_EVENT_TARGET_TYPES = [
  "agent_action_run",
  "comment",
  "job",
  "label",
  "site",
] as const;
export const ActivityEventTargetTypeSchema = Schema.Literals(
  ACTIVITY_EVENT_TARGET_TYPES
);
export type ActivityEventTargetType = Schema.Schema.Type<
  typeof ActivityEventTargetTypeSchema
>;

export const ACTIVITY_EVENT_SOURCE_TYPES = [
  "agent_action_run",
  "comment",
  "job_activity",
  "label",
  "site",
] as const;
export const ActivityEventSourceTypeSchema = Schema.Literals(
  ACTIVITY_EVENT_SOURCE_TYPES
);
export type ActivityEventSourceType = Schema.Schema.Type<
  typeof ActivityEventSourceTypeSchema
>;

export const ACTIVITY_EVENT_STATUSES = ["failed", "pending", "synced"] as const;
export const ActivityEventStatusSchema = Schema.Literals(
  ACTIVITY_EVENT_STATUSES
);
export type ActivityEventStatus = Schema.Schema.Type<
  typeof ActivityEventStatusSchema
>;

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;
