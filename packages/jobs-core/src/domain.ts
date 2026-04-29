import { Schema } from "effect";

const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
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

export const JOB_COLLABORATOR_SUBJECT_TYPES = ["user"] as const;
export const JobCollaboratorSubjectTypeSchema = Schema.Literal(
  ...JOB_COLLABORATOR_SUBJECT_TYPES
);
export type JobCollaboratorSubjectType = Schema.Schema.Type<
  typeof JobCollaboratorSubjectTypeSchema
>;

export const JOB_COLLABORATOR_ACCESS_LEVELS = ["read", "comment"] as const;
export const JobCollaboratorAccessLevelSchema = Schema.Literal(
  ...JOB_COLLABORATOR_ACCESS_LEVELS
);
export type JobCollaboratorAccessLevel = Schema.Schema.Type<
  typeof JobCollaboratorAccessLevelSchema
>;

export const JobCollaboratorRoleLabelSchema = Schema.Trim.pipe(
  Schema.minLength(1)
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
export const RateCardLineKindSchema = Schema.Literal(...RATE_CARD_LINE_KINDS);
export type RateCardLineKind = Schema.Schema.Type<
  typeof RateCardLineKindSchema
>;

export const SiteLatitudeSchema = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(-90),
  Schema.lessThanOrEqualTo(90)
);
export type SiteLatitude = Schema.Schema.Type<typeof SiteLatitudeSchema>;

export const SiteLongitudeSchema = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(-180),
  Schema.lessThanOrEqualTo(180)
);
export type SiteLongitude = Schema.Schema.Type<typeof SiteLongitudeSchema>;

export const SITE_COUNTRIES = ["IE", "GB"] as const;
export const SiteCountrySchema = Schema.Literal(...SITE_COUNTRIES);
export type SiteCountry = Schema.Schema.Type<typeof SiteCountrySchema>;

export const SITE_GEOCODING_PROVIDERS = ["google", "stub"] as const;
export const SiteGeocodingProviderSchema = Schema.Literal(
  ...SITE_GEOCODING_PROVIDERS
);
export type SiteGeocodingProvider = Schema.Schema.Type<
  typeof SiteGeocodingProviderSchema
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

export const JobExternalReferenceSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(120)
);
export type JobExternalReference = Schema.Schema.Type<
  typeof JobExternalReferenceSchema
>;

export const ContactNameSchema = Schema.Trim.pipe(Schema.minLength(1));
export type ContactName = Schema.Schema.Type<typeof ContactNameSchema>;

export const ContactEmailSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.filter((value) => CONTACT_EMAIL_PATTERN.test(value)),
  Schema.annotations({
    message: () => "Expected a valid email address",
  })
);
export type ContactEmail = Schema.Schema.Type<typeof ContactEmailSchema>;

export const ContactPhoneSchema = Schema.Trim.pipe(Schema.minLength(1));
export type ContactPhone = Schema.Schema.Type<typeof ContactPhoneSchema>;

export const ContactNotesSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(2000)
);
export type ContactNotes = Schema.Schema.Type<typeof ContactNotesSchema>;

export const JobCommentBodySchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobCommentBody = Schema.Schema.Type<typeof JobCommentBodySchema>;

export const JobVisitNoteSchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobVisitNote = Schema.Schema.Type<typeof JobVisitNoteSchema>;

export const JOB_COST_LINE_TYPES = ["labour", "material"] as const;
export const JobCostLineTypeSchema = Schema.Literal(...JOB_COST_LINE_TYPES);
export type JobCostLineType = Schema.Schema.Type<typeof JobCostLineTypeSchema>;

export const MAX_JOB_COST_LINE_QUANTITY = 9_999_999_999.99;
export const MAX_JOB_COST_LINE_UNIT_PRICE_MINOR = 2_147_483_647;
export const MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS = 10_000;

export const JobCostLineDescriptionSchema = Schema.Trim.pipe(
  Schema.minLength(1)
);
export type JobCostLineDescription = Schema.Schema.Type<
  typeof JobCostLineDescriptionSchema
>;

export const JobCostLineQuantitySchema = Schema.Number.pipe(
  Schema.filter(
    (value) =>
      value > 0 &&
      Number.isFinite(value) &&
      value <= MAX_JOB_COST_LINE_QUANTITY &&
      /^\d+(?:\.\d{1,2})?$/.test(String(value))
  ),
  Schema.annotations({
    message: () =>
      `Expected a positive finite quantity with at most two decimal places less than or equal to ${MAX_JOB_COST_LINE_QUANTITY}`,
  })
);
export type JobCostLineQuantity = Schema.Schema.Type<
  typeof JobCostLineQuantitySchema
>;

export const JobCostLineUnitPriceMinorSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(MAX_JOB_COST_LINE_UNIT_PRICE_MINOR)
);
export type JobCostLineUnitPriceMinor = Schema.Schema.Type<
  typeof JobCostLineUnitPriceMinorSchema
>;

export const JobCostLineTaxRateBasisPointsSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(MAX_JOB_COST_LINE_TAX_RATE_BASIS_POINTS)
);
export type JobCostLineTaxRateBasisPoints = Schema.Schema.Type<
  typeof JobCostLineTaxRateBasisPointsSchema
>;

export const JobCostLineTotalMinorSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(0)
);
export type JobCostLineTotalMinor = Schema.Schema.Type<
  typeof JobCostLineTotalMinorSchema
>;

export const JobBlockedReasonSchema = Schema.Trim.pipe(Schema.minLength(1));
export type JobBlockedReason = Schema.Schema.Type<
  typeof JobBlockedReasonSchema
>;

export const JobLabelNameSchema = Schema.Trim.pipe(
  Schema.minLength(1),
  Schema.maxLength(48)
);
export type JobLabelName = Schema.Schema.Type<typeof JobLabelNameSchema>;

export function normalizeJobLabelName(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en");
}
