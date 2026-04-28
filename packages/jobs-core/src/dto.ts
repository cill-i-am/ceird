import { Schema } from "effect";

import {
  IsoDateString,
  IsoDateTimeString,
  JobBlockedReasonSchema,
  JobCommentBodySchema,
  JobKindSchema,
  JobPrioritySchema,
  JobStatusSchema,
  JobTitleSchema,
  JobVisitNoteSchema,
  RateCardLineKindSchema,
  SiteCountrySchema,
  SiteGeocodingProviderSchema,
  SiteLatitudeSchema,
  SiteLongitudeSchema,
} from "./domain.js";
import {
  ActivityId,
  CommentId,
  ContactId,
  OrganizationId,
  RateCardId,
  RateCardLineId,
  ServiceAreaId,
  SiteId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

const JobVisitDurationMinutesSchema = Schema.Int.pipe(Schema.positive());
const NonEmptyTrimmedString = Schema.Trim.pipe(Schema.minLength(1));
const ConfigurationNameSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(120)
);
const ConfigurationDescriptionSchema = NonEmptyTrimmedString.pipe(
  Schema.maxLength(500)
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
  Schema.brand("@task-tracker/jobs-core/JobListCursor")
);
export type JobListCursor = Schema.Schema.Type<typeof JobListCursor>;

export const ServiceAreaSchema = Schema.Struct({
  id: ServiceAreaId,
  name: ConfigurationNameSchema,
  description: Schema.optional(ConfigurationDescriptionSchema),
});
export type ServiceArea = Schema.Schema.Type<typeof ServiceAreaSchema>;

export const ServiceAreaOptionSchema = Schema.Struct({
  id: ServiceAreaId,
  name: ConfigurationNameSchema,
});
export type ServiceAreaOption = Schema.Schema.Type<
  typeof ServiceAreaOptionSchema
>;

export const CreateServiceAreaInputSchema = Schema.Struct({
  name: ConfigurationNameSchema,
  description: Schema.optional(ConfigurationDescriptionSchema),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CreateServiceAreaInput = Schema.Schema.Type<
  typeof CreateServiceAreaInputSchema
>;

export const CreateServiceAreaResponseSchema = ServiceAreaSchema;
export type CreateServiceAreaResponse = Schema.Schema.Type<
  typeof CreateServiceAreaResponseSchema
>;

export const UpdateServiceAreaInputSchema = Schema.Struct({
  name: Schema.optional(ConfigurationNameSchema),
  description: Schema.optional(Schema.NullOr(ConfigurationDescriptionSchema)),
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type UpdateServiceAreaInput = Schema.Schema.Type<
  typeof UpdateServiceAreaInputSchema
>;

export const UpdateServiceAreaResponseSchema = ServiceAreaSchema;
export type UpdateServiceAreaResponse = Schema.Schema.Type<
  typeof UpdateServiceAreaResponseSchema
>;

export const ServiceAreaListResponseSchema = Schema.Struct({
  items: Schema.Array(ServiceAreaSchema),
});
export type ServiceAreaListResponse = Schema.Schema.Type<
  typeof ServiceAreaListResponseSchema
>;

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
  JobActivityVisitLoggedPayloadSchema
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

export const CreateSiteInputSchema = Schema.Struct({
  name: NonEmptyTrimmedString,
  serviceAreaId: Schema.optional(ServiceAreaId),
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

export const JobDetailSchema = Schema.Struct({
  job: JobSchema,
  comments: Schema.Array(JobCommentSchema),
  activity: Schema.Array(JobActivitySchema),
  visits: Schema.Array(JobVisitSchema),
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

export const JobSiteOptionSchema = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  serviceAreaId: Schema.optional(ServiceAreaId),
  serviceAreaName: Schema.optional(Schema.String),
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
  serviceAreas: Schema.Array(ServiceAreaOptionSchema),
  sites: Schema.Array(JobSiteOptionSchema),
  contacts: Schema.Array(JobContactOptionSchema),
});
export type JobOptionsResponse = Schema.Schema.Type<
  typeof JobOptionsResponseSchema
>;

export const SitesOptionsResponseSchema = Schema.Struct({
  serviceAreas: Schema.Array(ServiceAreaOptionSchema),
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
