import { IsoDateTimeString as IdentityIsoDateTimeString } from "@ceird/identity-core";
import { Schema } from "effect";

export { CommentBodySchema as JobCommentBodySchema } from "@ceird/comments-core";
export type { CommentBody as JobCommentBody } from "@ceird/comments-core";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export const JOB_KINDS = [
  "job",
  "issue",
  "inspection",
  "maintenance_request",
] as const;
export const JobKindSchema = Schema.Literals(JOB_KINDS);
export type JobKind = Schema.Schema.Type<typeof JobKindSchema>;

export const JOB_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
] as const;
export const JobStatusSchema = Schema.Literals(JOB_STATUSES);
export type JobStatus = Schema.Schema.Type<typeof JobStatusSchema>;

export const JOB_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export const JobPrioritySchema = Schema.Literals(JOB_PRIORITIES);
export type JobPriority = Schema.Schema.Type<typeof JobPrioritySchema>;

export const JOB_COLLABORATOR_SUBJECT_TYPES = ["user"] as const;
export const JobCollaboratorSubjectTypeSchema = Schema.Literals(
  JOB_COLLABORATOR_SUBJECT_TYPES
);
export type JobCollaboratorSubjectType = Schema.Schema.Type<
  typeof JobCollaboratorSubjectTypeSchema
>;

export const JOB_COLLABORATOR_ACCESS_LEVELS = ["read", "comment"] as const;
export const JobCollaboratorAccessLevelSchema = Schema.Literals(
  JOB_COLLABORATOR_ACCESS_LEVELS
);
export type JobCollaboratorAccessLevel = Schema.Schema.Type<
  typeof JobCollaboratorAccessLevelSchema
>;

export const JobCollaboratorRoleLabelSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type JobCollaboratorRoleLabel = Schema.Schema.Type<
  typeof JobCollaboratorRoleLabelSchema
>;

export const RATE_CARD_LINE_KINDS = [
  "labour",
  "callout",
  "material_markup",
  "custom",
] as const;
export const RateCardLineKindSchema = Schema.Literals(RATE_CARD_LINE_KINDS);
export type RateCardLineKind = Schema.Schema.Type<
  typeof RateCardLineKindSchema
>;

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
  "label_added",
  "label_removed",
  "cost_line_added",
] as const;
export const JobActivityEventTypeSchema = Schema.Literals(
  JOB_ACTIVITY_EVENT_TYPES
);
export type JobActivityEventType = Schema.Schema.Type<
  typeof JobActivityEventTypeSchema
>;

export const IsoDateTimeString = IdentityIsoDateTimeString;
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const IsoDateString = Schema.String.pipe(
  Schema.refine((value): value is string => isIsoDateString(value), {
    description: "ISO-8601 date string",
    message: "Expected an ISO-8601 date string in the format YYYY-MM-DD",
  })
);
export type IsoDateString = Schema.Schema.Type<typeof IsoDateString>;

export const JobTitleSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type JobTitle = Schema.Schema.Type<typeof JobTitleSchema>;

export const JobExternalReferenceSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))
);
export type JobExternalReference = Schema.Schema.Type<
  typeof JobExternalReferenceSchema
>;

export const ContactNameSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type ContactName = Schema.Schema.Type<typeof ContactNameSchema>;

export const ContactEmailSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.refine((value): value is string => CONTACT_EMAIL_PATTERN.test(value), {
    message: "Expected a valid email address",
  })
);
export type ContactEmail = Schema.Schema.Type<typeof ContactEmailSchema>;

export const ContactPhoneSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type ContactPhone = Schema.Schema.Type<typeof ContactPhoneSchema>;

export const ContactNotesSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(2000))
);
export type ContactNotes = Schema.Schema.Type<typeof ContactNotesSchema>;

export const JobVisitNoteSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type JobVisitNote = Schema.Schema.Type<typeof JobVisitNoteSchema>;

export const JOB_COST_LINE_TYPES = ["labour", "material"] as const;
export const JobCostLineTypeSchema = Schema.Literals(JOB_COST_LINE_TYPES);
export type JobCostLineType = Schema.Schema.Type<typeof JobCostLineTypeSchema>;

export const MAX_JOB_COST_LINE_QUANTITY = 9_999_999_999.99;
export const MAX_JOB_COST_LINE_UNIT_PRICE_MINOR = 2_147_483_647;
export const MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS = 10_000;

export const JobCostLineDescriptionSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type JobCostLineDescription = Schema.Schema.Type<
  typeof JobCostLineDescriptionSchema
>;

export const JobCostLineQuantitySchema = Schema.Number.pipe(
  Schema.refine(
    (value): value is number =>
      value > 0 &&
      Number.isFinite(value) &&
      value <= MAX_JOB_COST_LINE_QUANTITY &&
      /^\d+(?:\.\d{1,2})?$/.test(String(value)),
    {
      message: `Expected a positive finite quantity with at most two decimal places less than or equal to ${MAX_JOB_COST_LINE_QUANTITY}`,
    }
  )
);
export type JobCostLineQuantity = Schema.Schema.Type<
  typeof JobCostLineQuantitySchema
>;

export const JobCostLineUnitPriceMinorSchema = Schema.Int.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(MAX_JOB_COST_LINE_UNIT_PRICE_MINOR)
  )
);
export type JobCostLineUnitPriceMinor = Schema.Schema.Type<
  typeof JobCostLineUnitPriceMinorSchema
>;

export const JobCostLineTaxRateBasisPointsSchema = Schema.Int.pipe(
  Schema.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS)
  )
);
export type JobCostLineTaxRateBasisPoints = Schema.Schema.Type<
  typeof JobCostLineTaxRateBasisPointsSchema
>;

export const JobCostLineTotalMinorSchema = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0))
);
export type JobCostLineTotalMinor = Schema.Schema.Type<
  typeof JobCostLineTotalMinorSchema
>;

export const JobBlockedReasonSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export type JobBlockedReason = Schema.Schema.Type<
  typeof JobBlockedReasonSchema
>;
