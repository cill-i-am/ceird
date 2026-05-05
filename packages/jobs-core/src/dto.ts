import { LabelId, LabelNameSchema, LabelSchema } from "@ceird/labels-core";
import {
  CreateSiteInputSchema,
  ServiceAreaId,
  ServiceAreaOptionSchema,
  SiteDetailSchema,
  SiteId,
  SiteOptionSchema,
} from "@ceird/sites-core";
import { Schema } from "effect";

import {
  ContactEmailSchema,
  ContactNameSchema,
  ContactNotesSchema,
  ContactPhoneSchema,
  IsoDateString,
  IsoDateTimeString,
  JobActivityEventTypeSchema,
  JobBlockedReasonSchema,
  JobCommentBodySchema,
  JobCollaboratorAccessLevelSchema,
  JobCollaboratorRoleLabelSchema,
  JobCollaboratorSubjectTypeSchema,
  JobCostLineDescriptionSchema,
  JobCostLineQuantitySchema,
  JobCostLineTaxRateBasisPointsSchema,
  JobCostLineTotalMinorSchema,
  JobCostLineTypeSchema,
  JobCostLineUnitPriceMinorSchema,
  JobExternalReferenceSchema,
  JobKindSchema,
  JobPrioritySchema,
  JobStatusSchema,
  JobTitleSchema,
  JobVisitNoteSchema,
  RateCardLineKindSchema,
} from "./domain.js";
import {
  ActivityId,
  CommentId,
  ContactId,
  CostLineId,
  JobCollaboratorId,
  OrganizationId,
  RateCardId,
  RateCardLineId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

const JobVisitDurationMinutesSchema = Schema.Int.pipe(Schema.positive());
const NonEmptyTrimmedString = Schema.Trim.pipe(Schema.minLength(1));
const ConfigurationNameSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(120)
);
const RateCardLineNameSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(120)
);
const RateCardLineUnitSchema = NonEmptyTrimmedString.pipe(Schema.maxLength(40));
const RateCardLineValueSchema = Schema.Number.pipe(
  Schema.finite(),
  Schema.greaterThanOrEqualTo(0)
);
const RateCardLinePositionSchema = Schema.Int.pipe(Schema.positive());

function hasUniqueRateCardLinePositions(
  lines: readonly { readonly position: number }[]
) {
  return new Set(lines.map((line) => line.position)).size === lines.length;
}

export const JobListCursor = Schema.String.pipe(
  Schema.brand("@ceird/jobs-core/JobListCursor")
);
export type JobListCursor = Schema.Schema.Type<typeof JobListCursor>;

export const RateCardLineSchema = Schema.Struct({
  id: RateCardLineId,
  rateCardId: RateCardId,
  kind: RateCardLineKindSchema,
  name: RateCardLineNameSchema,
  position: RateCardLinePositionSchema,
  unit: RateCardLineUnitSchema,
  value: RateCardLineValueSchema,
});
export type RateCardLine = Schema.Schema.Type<typeof RateCardLineSchema>;

export const RateCardSchema = Schema.Struct({
  id: RateCardId,
  name: ConfigurationNameSchema,
  lines: Schema.Array(RateCardLineSchema),
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type RateCard = Schema.Schema.Type<typeof RateCardSchema>;

export const RateCardLineInputSchema = Schema.Struct({
  kind: RateCardLineKindSchema,
  name: RateCardLineNameSchema,
  position: RateCardLinePositionSchema,
  unit: RateCardLineUnitSchema,
  value: RateCardLineValueSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type RateCardLineInput = Schema.Schema.Type<
  typeof RateCardLineInputSchema
>;

const RateCardLineInputListSchema = Schema.Array(RateCardLineInputSchema).pipe(
  Schema.maxItems(50),
  Schema.filter(hasUniqueRateCardLinePositions),
  Schema.annotations({
    message: () => "Rate card line positions must be unique",
  })
);

export const CreateRateCardInputSchema = Schema.Struct({
  name: ConfigurationNameSchema,
  lines: RateCardLineInputListSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateRateCardInput = Schema.Schema.Type<
  typeof CreateRateCardInputSchema
>;

export const CreateRateCardResponseSchema = RateCardSchema;
export type CreateRateCardResponse = Schema.Schema.Type<
  typeof CreateRateCardResponseSchema
>;

export const UpdateRateCardInputSchema = Schema.Struct({
  name: Schema.optional(ConfigurationNameSchema),
  lines: Schema.optional(RateCardLineInputListSchema),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateRateCardInput = Schema.Schema.Type<
  typeof UpdateRateCardInputSchema
>;

export const UpdateRateCardResponseSchema = RateCardSchema;
export type UpdateRateCardResponse = Schema.Schema.Type<
  typeof UpdateRateCardResponseSchema
>;

export const RateCardListResponseSchema = Schema.Struct({
  items: Schema.Array(RateCardSchema),
});
export type RateCardListResponse = Schema.Schema.Type<
  typeof RateCardListResponseSchema
>;

export const JobSchema = Schema.Struct({
  id: WorkItemId,
  kind: JobKindSchema,
  title: JobTitleSchema,
  status: JobStatusSchema,
  priority: JobPrioritySchema,
  labels: Schema.Array(LabelSchema),
  externalReference: Schema.optional(JobExternalReferenceSchema),
  siteId: Schema.optional(SiteId),
  contactId: Schema.optional(ContactId),
  assigneeId: Schema.optional(UserId),
  coordinatorId: Schema.optional(UserId),
  blockedReason: Schema.optional(JobBlockedReasonSchema),
  completedAt: Schema.optional(IsoDateTimeString),
  completedByUserId: Schema.optional(UserId),
  createdByUserId: UserId,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type Job = Schema.Schema.Type<typeof JobSchema>;

export const JobListItemSchema = Schema.Struct({
  id: WorkItemId,
  kind: JobKindSchema,
  title: JobTitleSchema,
  status: JobStatusSchema,
  priority: JobPrioritySchema,
  labels: Schema.Array(LabelSchema),
  externalReference: Schema.optional(JobExternalReferenceSchema),
  siteId: Schema.optional(SiteId),
  contactId: Schema.optional(ContactId),
  assigneeId: Schema.optional(UserId),
  coordinatorId: Schema.optional(UserId),
  updatedAt: IsoDateTimeString,
  createdAt: IsoDateTimeString,
});
export type JobListItem = Schema.Schema.Type<typeof JobListItemSchema>;

export const JobCommentSchema = Schema.Struct({
  id: CommentId,
  workItemId: WorkItemId,
  authorUserId: UserId,
  authorName: Schema.optional(Schema.String),
  body: JobCommentBodySchema,
  createdAt: IsoDateTimeString,
});
export type JobComment = Schema.Schema.Type<typeof JobCommentSchema>;

export const JobCollaboratorSchema = Schema.Struct({
  id: JobCollaboratorId,
  workItemId: WorkItemId,
  subjectType: JobCollaboratorSubjectTypeSchema,
  userId: Schema.optional(UserId),
  roleLabel: JobCollaboratorRoleLabelSchema,
  accessLevel: JobCollaboratorAccessLevelSchema,
  createdAt: IsoDateTimeString,
  updatedAt: IsoDateTimeString,
});
export type JobCollaborator = Schema.Schema.Type<typeof JobCollaboratorSchema>;

export const JobActivityJobCreatedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("job_created"),
  title: JobTitleSchema,
  kind: JobKindSchema,
  priority: JobPrioritySchema,
});

export const JobActivityStatusChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("status_changed"),
  fromStatus: JobStatusSchema,
  toStatus: JobStatusSchema,
});

export const JobActivityBlockedReasonChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("blocked_reason_changed"),
  fromBlockedReason: Schema.NullOr(JobBlockedReasonSchema),
  toBlockedReason: Schema.NullOr(JobBlockedReasonSchema),
});

export const JobActivityPriorityChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("priority_changed"),
  fromPriority: JobPrioritySchema,
  toPriority: JobPrioritySchema,
});

export const JobActivityAssigneeChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("assignee_changed"),
  fromAssigneeId: Schema.optional(UserId),
  toAssigneeId: Schema.optional(UserId),
});

export const JobActivityCoordinatorChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("coordinator_changed"),
  fromCoordinatorId: Schema.optional(UserId),
  toCoordinatorId: Schema.optional(UserId),
});

export const JobActivitySiteChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("site_changed"),
  fromSiteId: Schema.optional(SiteId),
  toSiteId: Schema.optional(SiteId),
});

export const JobActivityContactChangedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("contact_changed"),
  fromContactId: Schema.optional(ContactId),
  toContactId: Schema.optional(ContactId),
});

export const JobActivityReopenedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("job_reopened"),
});

export const JobActivityVisitLoggedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("visit_logged"),
  visitId: VisitId,
});

export const JobActivityLabelAddedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("label_added"),
  labelId: LabelId,
  labelName: LabelNameSchema,
});

export const JobActivityLabelRemovedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("label_removed"),
  labelId: LabelId,
  labelName: LabelNameSchema,
});

export const JobActivityCostLineAddedPayloadSchema = Schema.Struct({
  eventType: Schema.Literal("cost_line_added"),
  costLineId: CostLineId,
  costLineType: JobCostLineTypeSchema,
});

export const JobActivityPayloadSchema = Schema.Union(
  JobActivityJobCreatedPayloadSchema,
  JobActivityStatusChangedPayloadSchema,
  JobActivityBlockedReasonChangedPayloadSchema,
  JobActivityPriorityChangedPayloadSchema,
  JobActivityAssigneeChangedPayloadSchema,
  JobActivityCoordinatorChangedPayloadSchema,
  JobActivitySiteChangedPayloadSchema,
  JobActivityContactChangedPayloadSchema,
  JobActivityReopenedPayloadSchema,
  JobActivityVisitLoggedPayloadSchema,
  JobActivityLabelAddedPayloadSchema,
  JobActivityLabelRemovedPayloadSchema,
  JobActivityCostLineAddedPayloadSchema
);
export type JobActivityPayload = Schema.Schema.Type<
  typeof JobActivityPayloadSchema
>;

export const JobActivitySchema = Schema.Struct({
  id: ActivityId,
  workItemId: WorkItemId,
  actorUserId: Schema.optional(UserId),
  payload: JobActivityPayloadSchema,
  createdAt: IsoDateTimeString,
});
export type JobActivity = Schema.Schema.Type<typeof JobActivitySchema>;

export const OrganizationActivityCursor = Schema.String.pipe(
  Schema.brand("@ceird/jobs-core/OrganizationActivityCursor")
);
export type OrganizationActivityCursor = Schema.Schema.Type<
  typeof OrganizationActivityCursor
>;

export const OrganizationActivityQuerySchema = Schema.Struct({
  actorUserId: Schema.optional(UserId),
  cursor: Schema.optional(OrganizationActivityCursor),
  eventType: Schema.optional(JobActivityEventTypeSchema),
  fromDate: Schema.optional(IsoDateString),
  jobTitle: Schema.optional(NonEmptyTrimmedString),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(100)
    )
  ),
  toDate: Schema.optional(IsoDateString),
});
export type OrganizationActivityQuery = Schema.Schema.Type<
  typeof OrganizationActivityQuerySchema
>;

export const OrganizationActivityActorSchema = Schema.Struct({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
});
export type OrganizationActivityActor = Schema.Schema.Type<
  typeof OrganizationActivityActorSchema
>;

export const OrganizationActivityItemSchema = Schema.Struct({
  id: ActivityId,
  workItemId: WorkItemId,
  jobTitle: JobTitleSchema,
  actor: Schema.optional(OrganizationActivityActorSchema),
  eventType: JobActivityEventTypeSchema,
  payload: JobActivityPayloadSchema,
  createdAt: IsoDateTimeString,
}).pipe(
  Schema.filter(({ eventType, payload }) => eventType === payload.eventType),
  Schema.annotations({
    message: () => "eventType must match payload.eventType",
  })
);
export type OrganizationActivityItem = Schema.Schema.Type<
  typeof OrganizationActivityItemSchema
>;

export const OrganizationActivityListResponseSchema = Schema.Struct({
  items: Schema.Array(OrganizationActivityItemSchema),
  nextCursor: Schema.optional(OrganizationActivityCursor),
});
export type OrganizationActivityListResponse = Schema.Schema.Type<
  typeof OrganizationActivityListResponseSchema
>;

export const JobVisitSchema = Schema.Struct({
  id: VisitId,
  workItemId: WorkItemId,
  authorUserId: UserId,
  visitDate: IsoDateString,
  durationMinutes: JobVisitDurationMinutesSchema,
  note: JobVisitNoteSchema,
  createdAt: IsoDateTimeString,
});
export type JobVisit = Schema.Schema.Type<typeof JobVisitSchema>;

export const JobCostLineSchema = Schema.Struct({
  id: CostLineId,
  workItemId: WorkItemId,
  authorUserId: UserId,
  type: JobCostLineTypeSchema,
  description: JobCostLineDescriptionSchema,
  quantity: JobCostLineQuantitySchema,
  unitPriceMinor: JobCostLineUnitPriceMinorSchema,
  taxRateBasisPoints: Schema.optional(JobCostLineTaxRateBasisPointsSchema),
  lineTotalMinor: JobCostLineTotalMinorSchema,
  createdAt: IsoDateTimeString,
});
export type JobCostLine = Schema.Schema.Type<typeof JobCostLineSchema>;

export const JobCostSummarySchema = Schema.Struct({
  subtotalMinor: JobCostLineTotalMinorSchema,
});
export type JobCostSummary = Schema.Schema.Type<typeof JobCostSummarySchema>;

export const JobListQuerySchema = Schema.Struct({
  cursor: Schema.optional(JobListCursor),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.int(),
      Schema.positive(),
      Schema.lessThanOrEqualTo(100)
    )
  ),
  status: Schema.optional(JobStatusSchema),
  assigneeId: Schema.optional(UserId),
  coordinatorId: Schema.optional(UserId),
  priority: Schema.optional(JobPrioritySchema),
  siteId: Schema.optional(SiteId),
  labelId: Schema.optional(LabelId),
  serviceAreaId: Schema.optional(ServiceAreaId),
});
export type JobListQuery = Schema.Schema.Type<typeof JobListQuerySchema>;

export const CreateJobSiteExistingInputSchema = Schema.Struct({
  kind: Schema.Literal("existing"),
  siteId: SiteId,
});
export type CreateJobSiteExistingInput = Schema.Schema.Type<
  typeof CreateJobSiteExistingInputSchema
>;

export const CreateJobSiteInlineInputSchema = Schema.Struct({
  kind: Schema.Literal("create"),
  input: CreateSiteInputSchema,
});
export type CreateJobSiteInlineInput = Schema.Schema.Type<
  typeof CreateJobSiteInlineInputSchema
>;

export const CreateJobSiteInputSchema = Schema.Union(
  CreateJobSiteExistingInputSchema,
  CreateJobSiteInlineInputSchema
);
export type CreateJobSiteInput = Schema.Schema.Type<
  typeof CreateJobSiteInputSchema
>;

export const CreateJobContactExistingInputSchema = Schema.Struct({
  kind: Schema.Literal("existing"),
  contactId: ContactId,
});
export type CreateJobContactExistingInput = Schema.Schema.Type<
  typeof CreateJobContactExistingInputSchema
>;

export const CreateJobContactInlineInputSchema = Schema.Struct({
  kind: Schema.Literal("create"),
  input: Schema.Struct({
    name: ContactNameSchema,
    email: Schema.optional(ContactEmailSchema),
    phone: Schema.optional(ContactPhoneSchema),
    notes: Schema.optional(ContactNotesSchema),
  }),
});
export type CreateJobContactInlineInput = Schema.Schema.Type<
  typeof CreateJobContactInlineInputSchema
>;

export const CreateJobContactInputSchema = Schema.Union(
  CreateJobContactExistingInputSchema,
  CreateJobContactInlineInputSchema
);
export type CreateJobContactInput = Schema.Schema.Type<
  typeof CreateJobContactInputSchema
>;

export const CreateJobInputSchema = Schema.Struct({
  title: JobTitleSchema,
  externalReference: Schema.optional(JobExternalReferenceSchema),
  priority: Schema.optional(JobPrioritySchema),
  site: Schema.optional(CreateJobSiteInputSchema),
  contact: Schema.optional(CreateJobContactInputSchema),
});
export type CreateJobInput = Schema.Schema.Type<typeof CreateJobInputSchema>;

export const CreateJobResponseSchema = JobSchema;
export type CreateJobResponse = Schema.Schema.Type<
  typeof CreateJobResponseSchema
>;

export const PatchJobInputSchema = Schema.Struct({
  title: Schema.optional(JobTitleSchema),
  externalReference: Schema.optional(Schema.NullOr(JobExternalReferenceSchema)),
  priority: Schema.optional(JobPrioritySchema),
  siteId: Schema.optional(Schema.NullOr(SiteId)),
  contactId: Schema.optional(Schema.NullOr(ContactId)),
  assigneeId: Schema.optional(Schema.NullOr(UserId)),
  coordinatorId: Schema.optional(Schema.NullOr(UserId)),
});
export type PatchJobInput = Schema.Schema.Type<typeof PatchJobInputSchema>;

export const PatchJobResponseSchema = JobSchema;
export type PatchJobResponse = Schema.Schema.Type<
  typeof PatchJobResponseSchema
>;

export const TransitionJobInputSchema = Schema.Struct({
  status: JobStatusSchema,
  blockedReason: Schema.optional(JobBlockedReasonSchema),
});
export type TransitionJobInput = Schema.Schema.Type<
  typeof TransitionJobInputSchema
>;

export const TransitionJobResponseSchema = JobSchema;
export type TransitionJobResponse = Schema.Schema.Type<
  typeof TransitionJobResponseSchema
>;

export const ReopenJobResponseSchema = JobSchema;
export type ReopenJobResponse = Schema.Schema.Type<
  typeof ReopenJobResponseSchema
>;

export const AddJobCommentInputSchema = Schema.Struct({
  body: JobCommentBodySchema,
});
export type AddJobCommentInput = Schema.Schema.Type<
  typeof AddJobCommentInputSchema
>;

export const AddJobCommentResponseSchema = JobCommentSchema;
export type AddJobCommentResponse = Schema.Schema.Type<
  typeof AddJobCommentResponseSchema
>;

export const AttachJobCollaboratorInputSchema = Schema.Struct({
  userId: UserId,
  roleLabel: JobCollaboratorRoleLabelSchema,
  accessLevel: JobCollaboratorAccessLevelSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type AttachJobCollaboratorInput = Schema.Schema.Type<
  typeof AttachJobCollaboratorInputSchema
>;

export const UpdateJobCollaboratorInputSchema = Schema.Struct({
  roleLabel: Schema.optional(JobCollaboratorRoleLabelSchema),
  accessLevel: Schema.optional(JobCollaboratorAccessLevelSchema),
}).pipe(
  Schema.filter(
    (input) => input.roleLabel !== undefined || input.accessLevel !== undefined
  ),
  Schema.annotations({
    message: () => "Expected at least one collaborator field to update",
    parseOptions: { onExcessProperty: "error" },
  })
);
export type UpdateJobCollaboratorInput = Schema.Schema.Type<
  typeof UpdateJobCollaboratorInputSchema
>;

export const JobCollaboratorsResponseSchema = Schema.Struct({
  collaborators: Schema.Array(JobCollaboratorSchema),
});
export type JobCollaboratorsResponse = Schema.Schema.Type<
  typeof JobCollaboratorsResponseSchema
>;

export const AddJobVisitInputSchema = Schema.Struct({
  visitDate: IsoDateString,
  note: JobVisitNoteSchema,
  durationMinutes: JobVisitDurationMinutesSchema,
});
export type AddJobVisitInput = Schema.Schema.Type<
  typeof AddJobVisitInputSchema
>;

export const AddJobVisitResponseSchema = JobVisitSchema;
export type AddJobVisitResponse = Schema.Schema.Type<
  typeof AddJobVisitResponseSchema
>;

export const AssignJobLabelInputSchema = Schema.Struct({
  labelId: LabelId,
});
export type AssignJobLabelInput = Schema.Schema.Type<
  typeof AssignJobLabelInputSchema
>;

export const AddJobCostLineInputSchema = Schema.Struct({
  type: JobCostLineTypeSchema,
  description: JobCostLineDescriptionSchema,
  quantity: JobCostLineQuantitySchema,
  unitPriceMinor: JobCostLineUnitPriceMinorSchema,
  taxRateBasisPoints: Schema.optional(JobCostLineTaxRateBasisPointsSchema),
}).pipe(
  Schema.filter((input) =>
    Number.isSafeInteger(
      calculateJobCostLineTotalMinor({
        quantity: input.quantity,
        unitPriceMinor: input.unitPriceMinor,
      })
    )
  ),
  Schema.annotations({
    message: () => "Expected a safe integer line total",
    parseOptions: { onExcessProperty: "error" },
  })
);
export type AddJobCostLineInput = Schema.Schema.Type<
  typeof AddJobCostLineInputSchema
>;

export const AddJobCostLineResponseSchema = JobCostLineSchema;
export type AddJobCostLineResponse = Schema.Schema.Type<
  typeof AddJobCostLineResponseSchema
>;

export function calculateJobCostLineTotalMinor(input: {
  readonly quantity: number;
  readonly unitPriceMinor: number;
}): number {
  const quantityParts = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(input.quantity));

  if (!quantityParts) {
    return Number.NaN;
  }

  const quantityHundredths =
    Number(quantityParts[1]) * 100 +
    Number((quantityParts[2] ?? "").padEnd(2, "0"));

  if (
    !Number.isSafeInteger(quantityHundredths) ||
    !Number.isSafeInteger(input.unitPriceMinor)
  ) {
    return Number.NaN;
  }

  const totalHundredthMinor =
    BigInt(quantityHundredths) * BigInt(input.unitPriceMinor);
  const roundedTotalMinor =
    totalHundredthMinor / 100n + (totalHundredthMinor % 100n >= 50n ? 1n : 0n);

  return Number(roundedTotalMinor);
}

export function calculateJobCostSummary(
  costLines: readonly Pick<JobCostLine, "lineTotalMinor">[]
): JobCostSummary {
  let subtotalMinor = 0;

  for (const costLine of costLines) {
    subtotalMinor += costLine.lineTotalMinor;

    if (!Number.isSafeInteger(subtotalMinor)) {
      throw new RangeError("Expected a safe integer job cost subtotal");
    }
  }

  return {
    subtotalMinor,
  };
}

export const JobContactDetailSchema = Schema.Struct({
  id: ContactId,
  name: ContactNameSchema,
  email: Schema.optional(ContactEmailSchema),
  phone: Schema.optional(ContactPhoneSchema),
  notes: Schema.optional(ContactNotesSchema),
});
export type JobContactDetail = Schema.Schema.Type<
  typeof JobContactDetailSchema
>;

export const JobViewerAccessSchema = Schema.Struct({
  visibility: Schema.Literal("internal", "external"),
  canComment: Schema.Boolean,
});
export type JobViewerAccess = Schema.Schema.Type<typeof JobViewerAccessSchema>;

export const JobDetailSchema = Schema.Struct({
  job: JobSchema,
  contact: Schema.optional(JobContactDetailSchema),
  site: Schema.optional(SiteDetailSchema),
  viewerAccess: JobViewerAccessSchema,
  comments: Schema.Array(JobCommentSchema),
  activity: Schema.Array(JobActivitySchema),
  visits: Schema.Array(JobVisitSchema),
  costs: Schema.optional(
    Schema.Struct({
      lines: Schema.Array(JobCostLineSchema),
      summary: JobCostSummarySchema,
    })
  ),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type JobDetail = Schema.Schema.Type<typeof JobDetailSchema>;

export const JobListResponseSchema = Schema.Struct({
  items: Schema.Array(JobListItemSchema),
  nextCursor: Schema.optional(JobListCursor),
});
export type JobListResponse = Schema.Schema.Type<typeof JobListResponseSchema>;

export const JobMemberOptionSchema = Schema.Struct({
  id: UserId,
  name: Schema.String,
});
export type JobMemberOption = Schema.Schema.Type<typeof JobMemberOptionSchema>;

export const JobExternalMemberOptionSchema = Schema.Struct({
  email: Schema.String,
  id: UserId,
  name: Schema.String,
});
export type JobExternalMemberOption = Schema.Schema.Type<
  typeof JobExternalMemberOptionSchema
>;

export const JobContactOptionSchema = Schema.Struct({
  id: ContactId,
  name: ContactNameSchema,
  email: Schema.optional(ContactEmailSchema),
  phone: Schema.optional(ContactPhoneSchema),
  siteIds: Schema.Array(SiteId),
});
export type JobContactOption = Schema.Schema.Type<
  typeof JobContactOptionSchema
>;

export const JobOptionsResponseSchema = Schema.Struct({
  members: Schema.Array(JobMemberOptionSchema),
  serviceAreas: Schema.Array(ServiceAreaOptionSchema),
  sites: Schema.Array(SiteOptionSchema),
  contacts: Schema.Array(JobContactOptionSchema),
  labels: Schema.Array(LabelSchema),
});
export type JobOptionsResponse = Schema.Schema.Type<
  typeof JobOptionsResponseSchema
>;

export const JobMemberOptionsResponseSchema = Schema.Struct({
  members: Schema.Array(JobMemberOptionSchema),
});
export type JobMemberOptionsResponse = Schema.Schema.Type<
  typeof JobMemberOptionsResponseSchema
>;

export const JobExternalMemberOptionsResponseSchema = Schema.Struct({
  members: Schema.Array(JobExternalMemberOptionSchema),
});
export type JobExternalMemberOptionsResponse = Schema.Schema.Type<
  typeof JobExternalMemberOptionsResponseSchema
>;

export const JobDetailResponseSchema = JobDetailSchema;
export type JobDetailResponse = Schema.Schema.Type<
  typeof JobDetailResponseSchema
>;

export const JobsContextSchema = Schema.Struct({
  organizationId: OrganizationId,
  userId: UserId,
});
export type JobsContext = Schema.Schema.Type<typeof JobsContextSchema>;
