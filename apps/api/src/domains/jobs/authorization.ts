import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@task-tracker/identity-core";
import { JobAccessDeniedError } from "@task-tracker/jobs-core";
import type {
  Job,
  JobCollaboratorAccessLevel,
  JobStatus,
  WorkItemIdType as WorkItemId,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import type { JobsActor } from "./current-jobs-actor.js";

const MEMBER_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  blocked: ["in_progress"],
  canceled: [],
  completed: [],
  in_progress: ["blocked", "completed"],
  new: ["in_progress"],
  triaged: ["in_progress"],
};

export interface JobAuthorizationGrant {
  readonly accessLevel: JobCollaboratorAccessLevel;
}

export class JobsAuthorization extends Effect.Service<JobsAuthorization>()(
  "@task-tracker/domains/jobs/JobsAuthorization",
  {
    accessors: true,
    effect: Effect.sync(() => {
      const ensureCanView = Effect.fn("JobsAuthorization.ensureCanView")(
        (_actor: JobsActor) => Effect.void
      );

      const ensureCanViewJobDetail = Effect.fn(
        "JobsAuthorization.ensureCanViewJobDetail"
      )(
        (
          actor: JobsActor,
          workItemId: WorkItemId,
          grant?: JobAuthorizationGrant
        ) =>
          isInternalActor(actor) || grant !== undefined
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "External collaborators can only view jobs granted to them",
                  workItemId
                )
              )
      );

      const ensureCanCreate = Effect.fn("JobsAuthorization.ensureCanCreate")(
        (actor: JobsActor) =>
          hasElevatedAccess(actor)
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "Only organization owners and admins can create jobs"
                )
              )
      );

      const ensureCanCreateSite = Effect.fn(
        "JobsAuthorization.ensureCanCreateSite"
      )((actor: JobsActor) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can create sites"
              )
            )
      );

      const ensureCanManageConfiguration = Effect.fn(
        "JobsAuthorization.ensureCanManageConfiguration"
      )((actor: JobsActor) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can manage job configuration"
              )
            )
      );

      const ensureCanViewOrganizationActivity = Effect.fn(
        "JobsAuthorization.ensureCanViewOrganizationActivity"
      )((actor: JobsActor) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can view organization activity"
              )
            )
      );

      const ensureCanPatch = Effect.fn("JobsAuthorization.ensureCanPatch")(
        (actor: JobsActor, workItemId: WorkItemId) =>
          hasElevatedAccess(actor)
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "Only organization owners and admins can edit jobs",
                  workItemId
                )
              )
      );

      const ensureCanManageLabels = Effect.fn(
        "JobsAuthorization.ensureCanManageLabels"
      )((actor: JobsActor) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can manage job labels"
              )
            )
      );

      const ensureCanManageCollaborators = Effect.fn(
        "JobsAuthorization.ensureCanManageCollaborators"
      )((actor: JobsActor, workItemId?: WorkItemId) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can manage job collaborators",
                workItemId
              )
            )
      );

      const ensureCanAssignLabels = Effect.fn(
        "JobsAuthorization.ensureCanAssignLabels"
      )((actor: JobsActor, job: Job) =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only assign labels on jobs assigned to them",
                job.id
              )
            )
      );

      const ensureCanComment = Effect.fn("JobsAuthorization.ensureCanComment")((
        actor: JobsActor,
        workItemId?: WorkItemId,
        grant?: JobAuthorizationGrant
      ) => {
        if (isInternalActor(actor)) {
          return Effect.void;
        }

        return grant === undefined
          ? Effect.fail(
              makeAccessDenied(
                "External collaborators need job access to comment on jobs",
                workItemId
              )
            )
          : Effect.void;
      });

      const ensureCanAddVisit = Effect.fn(
        "JobsAuthorization.ensureCanAddVisit"
      )((actor: JobsActor, job: Job) =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only log visits on jobs assigned to them",
                job.id
              )
            )
      );

      const ensureCanAddCostLine = Effect.fn(
        "JobsAuthorization.ensureCanAddCostLine"
      )((actor: JobsActor, job: Job) =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only add cost lines on jobs assigned to them",
                job.id
              )
            )
      );

      const ensureCanTransition = Effect.fn(
        "JobsAuthorization.ensureCanTransition"
      )((actor: JobsActor, job: Job, nextStatus: JobStatus) => {
        if (hasElevatedAccess(actor)) {
          return Effect.void;
        }

        if (isExternalActor(actor)) {
          return Effect.fail(
            makeAccessDenied(
              "External collaborators cannot change job status",
              job.id
            )
          );
        }

        if (job.assigneeId !== actor.userId) {
          return Effect.fail(
            makeAccessDenied(
              "Members can only change status on jobs assigned to them",
              job.id
            )
          );
        }

        const allowedStatuses = MEMBER_TRANSITIONS[job.status];

        return allowedStatuses.includes(nextStatus)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members cannot make that status change on the job",
                job.id
              )
            );
      });

      const ensureCanReopen = Effect.fn("JobsAuthorization.ensureCanReopen")(
        (actor: JobsActor, job: Job) =>
          hasElevatedAccess(actor) ||
          (isInternalActor(actor) && job.assigneeId === actor.userId)
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "Members can only reopen jobs assigned to them",
                  job.id
                )
              )
      );

      return {
        ensureCanAddCostLine,
        ensureCanAddVisit,
        ensureCanAssignLabels,
        ensureCanComment,
        ensureCanCreate,
        ensureCanCreateSite,
        ensureCanManageConfiguration,
        ensureCanManageCollaborators,
        ensureCanManageLabels,
        ensureCanPatch,
        ensureCanReopen,
        ensureCanTransition,
        ensureCanView,
        ensureCanViewJobDetail,
        ensureCanViewOrganizationActivity,
      };
    }),
  }
) {}

function hasElevatedAccess(actor: JobsActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function isInternalActor(actor: JobsActor): boolean {
  return isInternalOrganizationRole(actor.role);
}

function isExternalActor(actor: JobsActor): boolean {
  return isExternalOrganizationRole(actor.role);
}

function makeAccessDenied(message: string, workItemId?: WorkItemId) {
  return new JobAccessDeniedError({
    message,
    workItemId,
  });
}
