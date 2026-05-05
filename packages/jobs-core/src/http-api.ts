import { LabelId, LabelNotFoundError } from "@ceird/labels-core";
import {
  ServiceAreaNotFoundError,
  SiteGeocodingFailedError,
  SiteNotFoundError,
} from "@ceird/sites-core";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import {
  AddJobCostLineInputSchema,
  AddJobCostLineResponseSchema,
  AddJobCommentInputSchema,
  AddJobCommentResponseSchema,
  AddJobVisitInputSchema,
  AddJobVisitResponseSchema,
  AssignJobLabelInputSchema,
  AttachJobCollaboratorInputSchema,
  CreateJobInputSchema,
  CreateJobResponseSchema,
  CreateRateCardInputSchema,
  CreateRateCardResponseSchema,
  JobDetailResponseSchema,
  JobCollaboratorSchema,
  JobCollaboratorsResponseSchema,
  JobExternalMemberOptionsResponseSchema,
  JobMemberOptionsResponseSchema,
  JobListQuerySchema,
  JobOptionsResponseSchema,
  JobListResponseSchema,
  OrganizationActivityListResponseSchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  PatchJobResponseSchema,
  RateCardListResponseSchema,
  ReopenJobResponseSchema,
  TransitionJobInputSchema,
  TransitionJobResponseSchema,
  UpdateJobCollaboratorInputSchema,
  UpdateRateCardInputSchema,
  UpdateRateCardResponseSchema,
} from "./dto.js";
import {
  BlockedReasonRequiredError,
  ContactNotFoundError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JobAccessDeniedError,
  JobCostSummaryLimitExceededError,
  JobCollaboratorConflictError,
  JobCollaboratorNotFoundError,
  JobListCursorInvalidError,
  JobNotFoundError,
  JobStorageError,
  OrganizationActivityCursorInvalidError,
  OrganizationMemberNotFoundError,
  RateCardNotFoundError,
  VisitDurationIncrementError,
} from "./errors.js";
import { JobCollaboratorId, RateCardId, WorkItemId } from "./ids.js";

const jobsGroup = HttpApiGroup.make("jobs")
  .add(
    HttpApiEndpoint.get("listJobs", "/jobs")
      .setUrlParams(JobListQuerySchema)
      .addSuccess(JobListResponseSchema)
      .addError(JobListCursorInvalidError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("getJobOptions", "/jobs/options")
      .addSuccess(JobOptionsResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("getJobMemberOptions", "/jobs/member-options")
      .addSuccess(JobMemberOptionsResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get(
      "getJobExternalMemberOptions",
      "/jobs/external-member-options"
    )
      .addSuccess(JobExternalMemberOptionsResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createJob", "/jobs")
      .setPayload(CreateJobInputSchema)
      .addSuccess(CreateJobResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(SiteNotFoundError)
      .addError(SiteGeocodingFailedError)
      .addError(ContactNotFoundError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("listOrganizationActivity", "/activity")
      .setUrlParams(OrganizationActivityQuerySchema)
      .addSuccess(OrganizationActivityListResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(OrganizationActivityCursorInvalidError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get("getJobDetail", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(JobDetailResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("patchJob", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(PatchJobInputSchema)
      .addSuccess(PatchJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(CoordinatorMatchesAssigneeError)
      .addError(OrganizationMemberNotFoundError)
      .addError(SiteNotFoundError)
      .addError(ContactNotFoundError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("transitionJob", "/jobs/:workItemId/transitions")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(TransitionJobInputSchema)
      .addSuccess(TransitionJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(InvalidJobTransitionError)
      .addError(BlockedReasonRequiredError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("reopenJob", "/jobs/:workItemId/reopen")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(ReopenJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(InvalidJobTransitionError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("addJobComment", "/jobs/:workItemId/comments")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobCommentInputSchema)
      .addSuccess(AddJobCommentResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("addJobVisit", "/jobs/:workItemId/visits")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobVisitInputSchema)
      .addSuccess(AddJobVisitResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(VisitDurationIncrementError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("assignJobLabel", "/jobs/:workItemId/labels")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AssignJobLabelInputSchema)
      .addSuccess(JobDetailResponseSchema)
      .addError(JobNotFoundError)
      .addError(LabelNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.del("removeJobLabel", "/jobs/:workItemId/labels/:labelId")
      .setPath(Schema.Struct({ workItemId: WorkItemId, labelId: LabelId }))
      .addSuccess(JobDetailResponseSchema)
      .addError(JobNotFoundError)
      .addError(LabelNotFoundError)
      .addError(JobStorageError)
      .addError(JobAccessDeniedError)
  )
  .add(
    HttpApiEndpoint.post("addJobCostLine", "/jobs/:workItemId/cost-lines")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobCostLineInputSchema)
      .addSuccess(AddJobCostLineResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobCostSummaryLimitExceededError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.get(
      "listJobCollaborators",
      "/jobs/:workItemId/collaborators"
    )
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(JobCollaboratorsResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post(
      "attachJobCollaborator",
      "/jobs/:workItemId/collaborators"
    )
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AttachJobCollaboratorInputSchema)
      .addSuccess(JobCollaboratorSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(OrganizationMemberNotFoundError)
      .addError(JobCollaboratorConflictError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateJobCollaborator",
      "/jobs/:workItemId/collaborators/:collaboratorId"
    )
      .setPath(
        Schema.Struct({
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
        })
      )
      .setPayload(UpdateJobCollaboratorInputSchema)
      .addSuccess(JobCollaboratorSchema)
      .addError(JobNotFoundError)
      .addError(JobCollaboratorNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.del(
      "detachJobCollaborator",
      "/jobs/:workItemId/collaborators/:collaboratorId"
    )
      .setPath(
        Schema.Struct({
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
        })
      )
      .addSuccess(JobCollaboratorSchema)
      .addError(JobNotFoundError)
      .addError(JobCollaboratorNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  );

export const JobsApiGroup = jobsGroup;

const rateCardsGroup = HttpApiGroup.make("rateCards")
  .add(
    HttpApiEndpoint.get("listRateCards", "/rate-cards")
      .addSuccess(RateCardListResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createRateCard", "/rate-cards")
      .setPayload(CreateRateCardInputSchema)
      .addSuccess(CreateRateCardResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateRateCard", "/rate-cards/:rateCardId")
      .setPath(Schema.Struct({ rateCardId: RateCardId }))
      .setPayload(UpdateRateCardInputSchema)
      .addSuccess(UpdateRateCardResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(RateCardNotFoundError)
      .addError(JobStorageError)
  );

export const RateCardsApiGroup = rateCardsGroup;

export const JobsApi = HttpApi.make("JobsApi")
  .add(JobsApiGroup)
  .add(RateCardsApiGroup);

export type JobsApiGroupType = typeof JobsApiGroup;
export type RateCardsApiGroupType = typeof RateCardsApiGroup;
export type JobsApiType = typeof JobsApi;
