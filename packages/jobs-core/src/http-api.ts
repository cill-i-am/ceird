import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import {
  AddJobCommentInputSchema,
  AddJobCommentResponseSchema,
  AddJobVisitInputSchema,
  AddJobVisitResponseSchema,
  CreateJobInputSchema,
  CreateJobResponseSchema,
  JobDetailResponseSchema,
  JobListQuerySchema,
  JobListResponseSchema,
  PatchJobInputSchema,
  PatchJobResponseSchema,
  ReopenJobResponseSchema,
  TransitionJobInputSchema,
  TransitionJobResponseSchema,
} from "./dto.js";
import {
  BlockedReasonRequiredError,
  ContactNotFoundError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JobAccessDeniedError,
  JobNotFoundError,
  SiteNotFoundError,
  VisitDurationIncrementError,
} from "./errors.js";
import { WorkItemId } from "./ids.js";

const jobsGroup = HttpApiGroup.make("jobs")
  .add(
    HttpApiEndpoint.get("listJobs", "/jobs")
      .setUrlParams(JobListQuerySchema)
      .addSuccess(JobListResponseSchema)
      .addError(JobAccessDeniedError)
  )
  .add(
    HttpApiEndpoint.post("createJob", "/jobs")
      .setPayload(CreateJobInputSchema)
      .addSuccess(CreateJobResponseSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(SiteNotFoundError)
      .addError(ContactNotFoundError)
  )
  .add(
    HttpApiEndpoint.get("getJobDetail", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(JobDetailResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
  )
  .add(
    HttpApiEndpoint.patch("patchJob", "/jobs/:workItemId")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(PatchJobInputSchema)
      .addSuccess(PatchJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(CoordinatorMatchesAssigneeError)
      .addError(SiteNotFoundError)
      .addError(ContactNotFoundError)
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
  )
  .add(
    HttpApiEndpoint.post("reopenJob", "/jobs/:workItemId/reopen")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .addSuccess(ReopenJobResponseSchema)
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
  )
  .add(
    HttpApiEndpoint.post("addJobComment", "/jobs/:workItemId/comments")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobCommentInputSchema)
      .addSuccess(AddJobCommentResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
  )
  .add(
    HttpApiEndpoint.post("addJobVisit", "/jobs/:workItemId/visits")
      .setPath(Schema.Struct({ workItemId: WorkItemId }))
      .setPayload(AddJobVisitInputSchema)
      .addSuccess(AddJobVisitResponseSchema, { status: 201 })
      .addError(JobNotFoundError)
      .addError(JobAccessDeniedError)
      .addError(VisitDurationIncrementError)
  );

export const JobsApiGroup = jobsGroup;

export const JobsApi = HttpApi.make("JobsApi").add(JobsApiGroup);

export type JobsApiGroupType = typeof JobsApiGroup;
export type JobsApiType = typeof JobsApi;
