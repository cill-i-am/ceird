import { LabelId, LabelNotFoundError } from "@ceird/labels-core";
import {
  ProximityAccessDeniedError,
  ProximityCostGuardError,
  ProximityProviderError,
  ProximityRouteUnavailableError,
} from "@ceird/proximity-core";
import {
  SiteLocationProviderError,
  SiteLocationResolutionError,
  SiteNotFoundError,
} from "@ceird/sites-core";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";

import {
  AddJobCommentInputSchema,
  AddJobCommentResponseSchema,
  AddJobVisitInputSchema,
  AddJobVisitResponseSchema,
  AssignJobLabelInputSchema,
  AttachJobCollaboratorInputSchema,
  CreateJobInputSchema,
  CreateJobResponseSchema,
  JobDetailResponseSchema,
  JobCollaboratorSchema,
  JobCollaboratorsResponseSchema,
  JobExternalMemberOptionsResponseSchema,
  HomeDashboardSummaryResponseSchema,
  JobMemberOptionsResponseSchema,
  JobListQuerySchema,
  JobOptionsResponseSchema,
  JobListResponseSchema,
  JobProximityInputSchema,
  JobProximityResponseSchema,
  JobRoutePreviewInputSchema,
  JobRoutePreviewResponseSchema,
  OrganizationActivityListResponseSchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  PatchJobResponseSchema,
  ReopenJobResponseSchema,
  TransitionJobInputSchema,
  TransitionJobResponseSchema,
  UpdateJobCollaboratorInputSchema,
} from "./dto.js";
import {
  BlockedReasonRequiredError,
  ContactNotFoundError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JobAccessDeniedError,
  JobCollaboratorConflictError,
  JobCollaboratorNotFoundError,
  JobListCursorInvalidError,
  JobNotFoundError,
  JobStorageError,
  OrganizationActivityCursorInvalidError,
  OrganizationMemberNotFoundError,
  VisitDurationIncrementError,
} from "./errors.js";
import { JobCollaboratorId, WorkItemId } from "./ids.js";

const jobsGroup = HttpApiGroup.make("jobs")
  .add(
    HttpApiEndpoint.get("listJobs", "/jobs", {
      query: JobListQuerySchema,
      success: JobListResponseSchema,
      error: [JobListCursorInvalidError, JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("getJobOptions", "/jobs/options", {
      success: JobOptionsResponseSchema,
      error: [JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("getExternalJobOptions", "/jobs/external-options", {
      success: JobOptionsResponseSchema,
      error: [JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("getJobMemberOptions", "/jobs/member-options", {
      success: JobMemberOptionsResponseSchema,
      error: [JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get("getHomeDashboardSummary", "/home/dashboard-summary", {
      success: HomeDashboardSummaryResponseSchema,
      error: [JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.get(
      "getJobExternalMemberOptions",
      "/jobs/external-member-options",
      {
        success: JobExternalMemberOptionsResponseSchema,
        error: [JobAccessDeniedError, JobStorageError],
      }
    )
  )
  .add(
    HttpApiEndpoint.post("createJob", "/jobs", {
      payload: CreateJobInputSchema,
      success: CreateJobResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [
        JobAccessDeniedError,
        SiteNotFoundError,
        SiteLocationProviderError,
        SiteLocationResolutionError,
        ContactNotFoundError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get("listOrganizationActivity", "/activity", {
      query: OrganizationActivityQuerySchema,
      success: OrganizationActivityListResponseSchema,
      error: [
        JobAccessDeniedError,
        OrganizationActivityCursorInvalidError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("rankNearbyJobs", "/jobs/proximity", {
      payload: JobProximityInputSchema,
      success: JobProximityResponseSchema,
      error: [
        JobAccessDeniedError,
        ProximityAccessDeniedError,
        ProximityCostGuardError,
        ProximityProviderError,
        ProximityRouteUnavailableError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.get("getJobDetail", "/jobs/:workItemId", {
      params: { workItemId: WorkItemId },
      success: JobDetailResponseSchema,
      error: [JobNotFoundError, JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post(
      "getJobRoutePreview",
      "/jobs/:workItemId/route-preview",
      {
        params: { workItemId: WorkItemId },
        payload: JobRoutePreviewInputSchema,
        success: JobRoutePreviewResponseSchema,
        error: [
          JobNotFoundError,
          JobAccessDeniedError,
          ProximityAccessDeniedError,
          ProximityCostGuardError,
          ProximityProviderError,
          ProximityRouteUnavailableError,
          JobStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.patch("patchJob", "/jobs/:workItemId", {
      params: { workItemId: WorkItemId },
      payload: PatchJobInputSchema,
      success: PatchJobResponseSchema,
      error: [
        JobNotFoundError,
        JobAccessDeniedError,
        CoordinatorMatchesAssigneeError,
        OrganizationMemberNotFoundError,
        SiteNotFoundError,
        ContactNotFoundError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("transitionJob", "/jobs/:workItemId/transitions", {
      params: { workItemId: WorkItemId },
      payload: TransitionJobInputSchema,
      success: TransitionJobResponseSchema,
      error: [
        JobNotFoundError,
        JobAccessDeniedError,
        InvalidJobTransitionError,
        BlockedReasonRequiredError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("reopenJob", "/jobs/:workItemId/reopen", {
      params: { workItemId: WorkItemId },
      success: ReopenJobResponseSchema,
      error: [
        JobNotFoundError,
        JobAccessDeniedError,
        InvalidJobTransitionError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("addJobComment", "/jobs/:workItemId/comments", {
      params: { workItemId: WorkItemId },
      payload: AddJobCommentInputSchema,
      success: AddJobCommentResponseSchema.pipe(
        HttpApiSchema.status("Created")
      ),
      error: [JobNotFoundError, JobAccessDeniedError, JobStorageError],
    })
  )
  .add(
    HttpApiEndpoint.post("addJobVisit", "/jobs/:workItemId/visits", {
      params: { workItemId: WorkItemId },
      payload: AddJobVisitInputSchema,
      success: AddJobVisitResponseSchema.pipe(HttpApiSchema.status("Created")),
      error: [
        JobNotFoundError,
        JobAccessDeniedError,
        VisitDurationIncrementError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("assignJobLabel", "/jobs/:workItemId/labels", {
      params: { workItemId: WorkItemId },
      payload: AssignJobLabelInputSchema,
      success: JobDetailResponseSchema,
      error: [
        JobNotFoundError,
        LabelNotFoundError,
        JobAccessDeniedError,
        JobStorageError,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "removeJobLabel",
      "/jobs/:workItemId/labels/:labelId",
      {
        params: { workItemId: WorkItemId, labelId: LabelId },
        success: JobDetailResponseSchema,
        error: [
          JobNotFoundError,
          LabelNotFoundError,
          JobStorageError,
          JobAccessDeniedError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      "listJobCollaborators",
      "/jobs/:workItemId/collaborators",
      {
        params: { workItemId: WorkItemId },
        success: JobCollaboratorsResponseSchema,
        error: [JobNotFoundError, JobAccessDeniedError, JobStorageError],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      "attachJobCollaborator",
      "/jobs/:workItemId/collaborators",
      {
        params: { workItemId: WorkItemId },
        payload: AttachJobCollaboratorInputSchema,
        success: JobCollaboratorSchema.pipe(HttpApiSchema.status("Created")),
        error: [
          JobNotFoundError,
          JobAccessDeniedError,
          OrganizationMemberNotFoundError,
          JobCollaboratorConflictError,
          JobStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.patch(
      "updateJobCollaborator",
      "/jobs/:workItemId/collaborators/:collaboratorId",
      {
        params: {
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
        },
        payload: UpdateJobCollaboratorInputSchema,
        success: JobCollaboratorSchema,
        error: [
          JobNotFoundError,
          JobCollaboratorNotFoundError,
          JobAccessDeniedError,
          JobStorageError,
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      "detachJobCollaborator",
      "/jobs/:workItemId/collaborators/:collaboratorId",
      {
        params: {
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
        },
        success: JobCollaboratorSchema,
        error: [
          JobNotFoundError,
          JobCollaboratorNotFoundError,
          JobAccessDeniedError,
          JobStorageError,
        ],
      }
    )
  );

export const JobsApiGroup = jobsGroup;

export const JobsApi = HttpApi.make("JobsApi").add(JobsApiGroup);

export type JobsApiGroupType = typeof JobsApiGroup;
export type JobsApiType = typeof JobsApi;
