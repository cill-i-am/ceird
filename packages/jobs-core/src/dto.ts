import { Schema } from "effect";

import {
  IsoDateString,
  IsoDateTimeString,
  JobBlockedReasonSchema,
  JobCommentBodySchema,
  JobCostLineDescriptionSchema,
  JobCostLineQuantitySchema,
  JobCostLineTaxRateBasisPointsSchema,
  JobCostLineTotalMinorSchema,
  JobCostLineTypeSchema,
  JobCostLineUnitPriceMinorSchema,
  JobKindSchema,
  JobPrioritySchema,
  JobStatusSchema,
  JobTitleSchema,
  JobVisitNoteSchema,
  SiteCountrySchema,
  SiteGeocodingProviderSchema,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "./domain.js";
import {
  ActivityId,
  CommentId,
  ContactId,
  CostLineId,
  OrganizationId,
  RegionId,
  SiteId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

const JobVisitDurationMinutesSchema = Schema.Int.pipe(Schema.positive());
const NonEmptyTrimmedString = Schema.Trim.pipe(Schema.minLength(1));

export const JobListCursor = Schema.String.pipe(
  Schema.brand("@task-tracker/jobs-core/JobListCursor")
);
export type JobListCursor = Schema.Schema.Type<typeof JobListCursor>;

export const JobSchema = Schema.Struct({
  id: WorkItemId,
  kind: JobKindSchema,
  title: JobTitleSchema,
  status: JobStatusSchema,
  priority: JobPrioritySchema,
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
  body: JobCommentBodySchema,
  createdAt: IsoDateTimeString,
});
export type JobComment = Schema.Schema.Type<typeof JobCommentSchema>;

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
  regionId: Schema.optional(RegionId),
});
export type JobListQuery = Schema.Schema.Type<typeof JobListQuerySchema>;

export const CreateJobSiteExistingInputSchema = Schema.Struct({
  kind: Schema.Literal("existing"),
  siteId: SiteId,
});
export type CreateJobSiteExistingInput = Schema.Schema.Type<
  typeof CreateJobSiteExistingInputSchema
>;

export const CreateSiteInputSchema = Schema.Struct({
  name: NonEmptyTrimmedString,
  regionId: Schema.optional(RegionId),
  addressLine1: NonEmptyTrimmedString,
  addressLine2: Schema.optional(NonEmptyTrimmedString),
  town: Schema.optional(NonEmptyTrimmedString),
  county: NonEmptyTrimmedString,
  country: SiteCountrySchema,
  eircode: Schema.optional(NonEmptyTrimmedString),
  accessNotes: Schema.optional(NonEmptyTrimmedString),
})
  .annotations({
    parseOptions: { onExcessProperty: "error" },
  })
  .pipe(
    Schema.filter(
      ({ country, eircode }) => country !== "IE" || eircode !== undefined
    ),
    Schema.annotations({
      message: () => "Irish sites require an Eircode",
    })
  );
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;

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
    name: Schema.Trim.pipe(Schema.minLength(1)),
    email: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
    phone: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
    notes: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
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
  return Math.round(input.quantity * input.unitPriceMinor);
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

export const JobDetailSchema = Schema.Struct({
  job: JobSchema,
  comments: Schema.Array(JobCommentSchema),
  activity: Schema.Array(JobActivitySchema),
  visits: Schema.Array(JobVisitSchema),
  costLines: Schema.Array(JobCostLineSchema),
  costSummary: JobCostSummarySchema,
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

export const JobRegionOptionSchema = Schema.Struct({
  id: RegionId,
  name: Schema.String,
});
export type JobRegionOption = Schema.Schema.Type<typeof JobRegionOptionSchema>;

export const JobSiteOptionSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  regionId: Schema.optional(RegionId),
  regionName: Schema.optional(Schema.String),
  addressLine1: Schema.String,
  addressLine2: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
  county: Schema.String,
  country: SiteCountrySchema,
  eircode: Schema.optional(Schema.String),
  accessNotes: Schema.optional(Schema.String),
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
  geocodingProvider: SiteGeocodingProviderSchema,
  geocodedAt: IsoDateTimeString,
});
export type JobSiteOption = Schema.Schema.Type<typeof JobSiteOptionSchema>;

export const CreateSiteResponseSchema = JobSiteOptionSchema;
export type CreateSiteResponse = Schema.Schema.Type<
  typeof CreateSiteResponseSchema
>;

export const UpdateSiteInputSchema = CreateSiteInputSchema;
export type UpdateSiteInput = Schema.Schema.Type<typeof UpdateSiteInputSchema>;

export const UpdateSiteResponseSchema = JobSiteOptionSchema;
export type UpdateSiteResponse = Schema.Schema.Type<
  typeof UpdateSiteResponseSchema
>;

export const JobContactOptionSchema = Schema.Struct({
  id: ContactId,
  name: Schema.String,
  siteIds: Schema.Array(SiteId),
});
export type JobContactOption = Schema.Schema.Type<
  typeof JobContactOptionSchema
>;

export const JobOptionsResponseSchema = Schema.Struct({
  members: Schema.Array(JobMemberOptionSchema),
  regions: Schema.Array(JobRegionOptionSchema),
  sites: Schema.Array(JobSiteOptionSchema),
  contacts: Schema.Array(JobContactOptionSchema),
});
export type JobOptionsResponse = Schema.Schema.Type<
  typeof JobOptionsResponseSchema
>;

export const SitesOptionsResponseSchema = Schema.Struct({
  regions: Schema.Array(JobRegionOptionSchema),
  sites: Schema.Array(JobSiteOptionSchema),
});
export type SitesOptionsResponse = Schema.Schema.Type<
  typeof SitesOptionsResponseSchema
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
