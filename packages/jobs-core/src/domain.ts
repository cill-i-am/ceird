import { Schema } from "effect";

const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isIsoDateTimeString(value: string): boolean {
  return (
    ISO_DATE_TIME_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

export const JOB_KINDS = [
  "job",
  "issue",
  "inspection",
  "maintenance_request",
] as const;
export const JobKindSchema = Schema.Literal(...JOB_KINDS);
export type JobKind = Schema.Schema.Type<typeof JobKindSchema>;

export const JOB_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
] as const;
export const JobStatusSchema = Schema.Literal(...JOB_STATUSES);
export type JobStatus = Schema.Schema.Type<typeof JobStatusSchema>;

export const JOB_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export const JobPrioritySchema = Schema.Literal(...JOB_PRIORITIES);
export type JobPriority = Schema.Schema.Type<typeof JobPrioritySchema>;

export const JOB_ACTIVITY_EVENT_TYPES = [
  "job_created",
  "status_changed",
  "blocked_reason_changed",
  "priority_changed",
  "assignee_changed",
  "coordinator_changed",
  "site_changed",
  "contact_changed",
  "job_reopened",
  "visit_logged",
] as const;
export const JobActivityEventTypeSchema = Schema.Literal(
  ...JOB_ACTIVITY_EVENT_TYPES
);
export type JobActivityEventType = Schema.Schema.Type<
  typeof JobActivityEventTypeSchema
>;

export const IsoDateTimeString = Schema.String.pipe(
  Schema.filter((value) => isIsoDateTimeString(value)),
  Schema.annotations({
    description: "ISO-8601 UTC datetime string",
    message: () => "Expected an ISO-8601 UTC datetime string",
  })
);
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const IsoDateString = Schema.String.pipe(
  Schema.filter((value) => isIsoDateString(value)),
  Schema.annotations({
    description: "ISO-8601 date string",
    message: () => "Expected an ISO-8601 date string in the format YYYY-MM-DD",
  })
);
export type IsoDateString = Schema.Schema.Type<typeof IsoDateString>;

export const JobTitleSchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobTitle = Schema.Schema.Type<typeof JobTitleSchema>;

export const JobCommentBodySchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobCommentBody = Schema.Schema.Type<typeof JobCommentBodySchema>;

export const JobVisitNoteSchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobVisitNote = Schema.Schema.Type<typeof JobVisitNoteSchema>;

export const JobBlockedReasonSchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobBlockedReason = Schema.Schema.Type<
  typeof JobBlockedReasonSchema
>;
