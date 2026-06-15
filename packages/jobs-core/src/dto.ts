import { AddCommentInputSchema, CommentSchema } from "@ceird/comments-core";
import { ProductActorSchema } from "@ceird/identity-core";
import { LabelId, LabelNameSchema, LabelSchema } from "@ceird/labels-core";
import {
  ProximityLimitSchema,
  ProximityOriginInputSchema,
  ProximityOriginSummarySchema,
  ProximityResultMetadataSchema,
  RouteDisplayLineSchema,
  RouteSummarySchema,
} from "@ceird/proximity-core";
import {
  CreateSiteInputSchema,
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
  JobCollaboratorAccessLevelSchema,
  JobCollaboratorRoleLabelSchema,
  JobCollaboratorSubjectTypeSchema,
  JobKindSchema,
  JOB_STATUSES,
  JobPrioritySchema,
  JobStatusSchema,
  JobTitleSchema,
  JobVisitNoteSchema,
} from "./domain.js";
import {
  ActivityId,
  ContactId,
  JobCollaboratorId,
  OrganizationId,
  UserId,
  VisitId,
  WorkItemId,
} from "./ids.js";

const JobVisitDurationMinutesSchema = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThan(0)),
  Schema.refine((value): value is number => value % 60 === 0, {
    message: "Visit duration must be entered in whole-hour increments",
  })
);
const NonEmptyTrimmedString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);
export const JobListCursor = Schema.String.pipe(
  Schema.brand("@ceird/jobs-core/JobListCursor")
);
export type JobListCursor = Schema.Schema.Type<typeof JobListCursor>;

export const JobSchema = Schema.Struct({
  id: WorkItemId,
  kind: JobKindSchema,
  title: JobTitleSchema,
  status: JobStatusSchema,
  priority: JobPrioritySchema,
  labels: Schema.Array(LabelSchema),
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
  siteId: Schema.optional(SiteId),
  contactId: Schema.optional(ContactId),
  assigneeId: Schema.optional(UserId),
  coordinatorId: Schema.optional(UserId),
  updatedAt: IsoDateTimeString,
  createdAt: IsoDateTimeString,
});
export type JobListItem = Schema.Schema.Type<typeof JobListItemSchema>;

export const JobCommentSchema = Schema.Struct({
  ...CommentSchema.fields,
  workItemId: WorkItemId,
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

export const JobActivityPayloadSchema = Schema.Union([
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
]);
export type JobActivityPayload = Schema.Schema.Type<
  typeof JobActivityPayloadSchema
>;

export const JobActivitySchema = Schema.Struct({
  id: ActivityId,
  workItemId: WorkItemId,
  actor: Schema.optional(ProductActorSchema),
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
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(100)
      )
    )
  ),
  toDate: Schema.optional(IsoDateString),
});
export type OrganizationActivityQuery = Schema.Schema.Type<
  typeof OrganizationActivityQuerySchema
>;

export const OrganizationActivityActorSchema = ProductActorSchema;
export type OrganizationActivityActor = Schema.Schema.Type<
  typeof OrganizationActivityActorSchema
>;

const OrganizationActivityItemBaseSchema = Schema.Struct({
  id: ActivityId,
  workItemId: WorkItemId,
  jobTitle: JobTitleSchema,
  actor: Schema.optional(OrganizationActivityActorSchema),
  eventType: JobActivityEventTypeSchema,
  payload: JobActivityPayloadSchema,
  createdAt: IsoDateTimeString,
});

export const OrganizationActivityItemSchema =
  OrganizationActivityItemBaseSchema.pipe(
    Schema.refine(
      (
        item
      ): item is Schema.Schema.Type<
        typeof OrganizationActivityItemBaseSchema
      > => item.eventType === item.payload.eventType,
      {
        message: "eventType must match payload.eventType",
      }
    )
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

export const JobListQuerySchema = Schema.Struct({
  cursor: Schema.optional(JobListCursor),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(100)
      )
    )
  ),
  status: Schema.optional(Schema.Literals(["active", "all", ...JOB_STATUSES])),
  assigneeId: Schema.optional(
    Schema.Union([UserId, Schema.Literal("unassigned")])
  ),
  coordinatorId: Schema.optional(UserId),
  priority: Schema.optional(JobPrioritySchema),
  query: Schema.optional(
    NonEmptyTrimmedString.pipe(Schema.check(Schema.isMaxLength(256)))
  ),
  siteId: Schema.optional(SiteId),
  labelId: Schema.optional(LabelId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobListQuery = Schema.Schema.Type<typeof JobListQuerySchema>;

export const JOB_PROXIMITY_STATUS_FILTERS = [
  "active",
  "all",
  ...JOB_STATUSES,
] as const;
export const JobProximityStatusFilterSchema = Schema.Literals(
  JOB_PROXIMITY_STATUS_FILTERS
);
export type JobProximityStatusFilter = Schema.Schema.Type<
  typeof JobProximityStatusFilterSchema
>;

export const JobProximityAssigneeFilterSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("all") }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  Schema.Struct({ kind: Schema.Literal("unassigned") }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  Schema.Struct({
    kind: Schema.Literal("user"),
    userId: UserId,
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
]);
export type JobProximityAssigneeFilter = Schema.Schema.Type<
  typeof JobProximityAssigneeFilterSchema
>;

export const JobProximityFiltersSchema = Schema.Struct({
  assigneeId: Schema.optional(JobProximityAssigneeFilterSchema),
  coordinatorId: Schema.optional(UserId),
  labelId: Schema.optional(LabelId),
  priority: Schema.optional(JobPrioritySchema),
  query: Schema.optional(
    NonEmptyTrimmedString.pipe(Schema.check(Schema.isMaxLength(256)))
  ),
  siteId: Schema.optional(SiteId),
  status: Schema.optional(JobProximityStatusFilterSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobProximityFilters = Schema.Schema.Type<
  typeof JobProximityFiltersSchema
>;

export const JobProximityInputSchema = Schema.Struct({
  filters: Schema.optional(JobProximityFiltersSchema),
  includeRouteLines: Schema.optional(Schema.Boolean),
  limit: Schema.optional(ProximityLimitSchema),
  origin: ProximityOriginInputSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobProximityInput = Schema.Schema.Type<
  typeof JobProximityInputSchema
>;

export const JobProximityRowSchema = Schema.Struct({
  job: JobListItemSchema,
  routeLine: Schema.optional(RouteDisplayLineSchema),
  routeSummary: RouteSummarySchema,
  site: SiteOptionSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobProximityRow = Schema.Schema.Type<typeof JobProximityRowSchema>;

export const JobProximityResponseSchema = Schema.Struct({
  meta: ProximityResultMetadataSchema,
  origin: ProximityOriginSummarySchema,
  rows: Schema.Array(JobProximityRowSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobProximityResponse = Schema.Schema.Type<
  typeof JobProximityResponseSchema
>;

export const JobRoutePreviewInputSchema = Schema.Struct({
  includeRouteLine: Schema.optional(Schema.Boolean),
  origin: ProximityOriginInputSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobRoutePreviewInput = Schema.Schema.Type<
  typeof JobRoutePreviewInputSchema
>;

export const JobRoutePreviewResponseSchema = Schema.Struct({
  job: JobListItemSchema,
  origin: ProximityOriginSummarySchema,
  routeLine: Schema.optional(RouteDisplayLineSchema),
  routeSummary: RouteSummarySchema,
  site: SiteOptionSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobRoutePreviewResponse = Schema.Schema.Type<
  typeof JobRoutePreviewResponseSchema
>;

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

export const CreateJobSiteInputSchema = Schema.Union([
  CreateJobSiteExistingInputSchema,
  CreateJobSiteInlineInputSchema,
]);
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

export const CreateJobContactInputSchema = Schema.Union([
  CreateJobContactExistingInputSchema,
  CreateJobContactInlineInputSchema,
]);
export type CreateJobContactInput = Schema.Schema.Type<
  typeof CreateJobContactInputSchema
>;

export const CreateJobInputSchema = Schema.Struct({
  title: JobTitleSchema,
  priority: Schema.optional(JobPrioritySchema),
  site: Schema.optional(CreateJobSiteInputSchema),
  contact: Schema.optional(CreateJobContactInputSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
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
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type PatchJobInput = Schema.Schema.Type<typeof PatchJobInputSchema>;

export const PatchJobResponseSchema = JobSchema;
export type PatchJobResponse = Schema.Schema.Type<
  typeof PatchJobResponseSchema
>;

export const TransitionJobInputSchema = Schema.Struct({
  status: JobStatusSchema,
  blockedReason: Schema.optional(JobBlockedReasonSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
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

export const AddJobCommentInputSchema = AddCommentInputSchema;
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
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type AttachJobCollaboratorInput = Schema.Schema.Type<
  typeof AttachJobCollaboratorInputSchema
>;

const UpdateJobCollaboratorInputBaseSchema = Schema.Struct({
  roleLabel: Schema.optional(JobCollaboratorRoleLabelSchema),
  accessLevel: Schema.optional(JobCollaboratorAccessLevelSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const UpdateJobCollaboratorInputSchema =
  UpdateJobCollaboratorInputBaseSchema.pipe(
    Schema.refine(
      (
        input
      ): input is Schema.Schema.Type<
        typeof UpdateJobCollaboratorInputBaseSchema
      > => input.roleLabel !== undefined || input.accessLevel !== undefined,
      {
        message: "Expected at least one collaborator field to update",
      }
    )
  ).annotate({
    parseOptions: { onExcessProperty: "error" },
  });
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
}).annotate({
  parseOptions: { onExcessProperty: "error" },
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
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type AssignJobLabelInput = Schema.Schema.Type<
  typeof AssignJobLabelInputSchema
>;

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
  visibility: Schema.Literals(["internal", "external"] as const),
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
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type JobDetail = Schema.Schema.Type<typeof JobDetailSchema>;

export const JobListResponseSchema = Schema.Struct({
  items: Schema.Array(JobListItemSchema),
  nextCursor: Schema.optional(JobListCursor),
});
export type JobListResponse = Schema.Schema.Type<typeof JobListResponseSchema>;

const NonNegativeIntegerSchema = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
);

export const HomeDashboardJobStatsSchema = Schema.Struct({
  activeJobs: NonNegativeIntegerSchema,
  blockedJobs: NonNegativeIntegerSchema,
  priorityWatchJobs: NonNegativeIntegerSchema,
  totalJobs: NonNegativeIntegerSchema,
  unassignedJobs: NonNegativeIntegerSchema,
});
export type HomeDashboardJobStats = Schema.Schema.Type<
  typeof HomeDashboardJobStatsSchema
>;

export const HomeDashboardJobSummaryItemSchema = Schema.Struct({
  assigneeName: Schema.optional(Schema.String),
  id: WorkItemId,
  priority: JobPrioritySchema,
  siteName: Schema.optional(Schema.String),
  status: JobStatusSchema,
  title: JobTitleSchema,
  updatedAt: IsoDateTimeString,
});
export type HomeDashboardJobSummaryItem = Schema.Schema.Type<
  typeof HomeDashboardJobSummaryItemSchema
>;

export const HomeDashboardSiteStatsSchema = Schema.Struct({
  mappedSites: NonNegativeIntegerSchema,
  totalSites: NonNegativeIntegerSchema,
});
export type HomeDashboardSiteStats = Schema.Schema.Type<
  typeof HomeDashboardSiteStatsSchema
>;

export const HomeDashboardSiteSummaryItemSchema = Schema.Struct({
  activeJobCount: NonNegativeIntegerSchema,
  addressLine1: Schema.optional(Schema.String),
  addressLine2: Schema.optional(Schema.String),
  county: Schema.optional(Schema.String),
  displayLocation: Schema.String,
  eircode: Schema.optional(Schema.String),
  formattedAddress: Schema.optional(Schema.String),
  id: SiteId,
  locationResolvedAt: Schema.optional(IsoDateTimeString),
  name: Schema.String,
  rawLocationInput: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
});
export type HomeDashboardSiteSummaryItem = Schema.Schema.Type<
  typeof HomeDashboardSiteSummaryItemSchema
>;

export const HomeDashboardSummaryResponseSchema = Schema.Struct({
  jobs: Schema.Struct({
    items: Schema.Array(HomeDashboardJobSummaryItemSchema),
    stats: HomeDashboardJobStatsSchema,
  }),
  members: Schema.Struct({
    total: NonNegativeIntegerSchema,
  }),
  sites: Schema.Struct({
    items: Schema.Array(HomeDashboardSiteSummaryItemSchema),
    stats: HomeDashboardSiteStatsSchema,
  }),
});
export type HomeDashboardSummaryResponse = Schema.Schema.Type<
  typeof HomeDashboardSummaryResponseSchema
>;

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
