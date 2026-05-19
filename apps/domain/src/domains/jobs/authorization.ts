import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import { JobAccessDeniedError } from "@ceird/jobs-core";
import type {
  Job,
  JobCollaboratorAccessLevel,
  JobStatus,
  WorkItemIdType as WorkItemId,
} from "@ceird/jobs-core";
import { Effect } from "effect";

import type { OrganizationActor } from "../organizations/current-actor.js";

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
  "@ceird/domains/jobs/JobsAuthorization",
  {
    accessors: true,
    effect: Effect.sync(() => {
      const ensureCanView = Effect.fn("JobsAuthorization.ensureCanView")(
        (_actor: OrganizationActor) => Effect.void
      );

      const ensureCanViewJobDetail = Effect.fn(
        "JobsAuthorization.ensureCanViewJobDetail"
      )(
        (
          actor: OrganizationActor,
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
        (actor: OrganizationActor) =>
          hasElevatedAccess(actor)
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "Only organization owners and admins can create jobs"
                )
              )
      );

      const ensureCanManageConfiguration = Effect.fn(
        "JobsAuthorization.ensureCanManageConfiguration"
      )((actor: OrganizationActor) =>
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
      )((actor: OrganizationActor) =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can view organization activity"
              )
            )
      );

      const ensureCanPatch = Effect.fn("JobsAuthorization.ensureCanPatch")(
        (actor: OrganizationActor, workItemId: WorkItemId) =>
          hasElevatedAccess(actor)
            ? Effect.void
            : Effect.fail(
                makeAccessDenied(
                  "Only organization owners and admins can edit jobs",
                  workItemId
                )
              )
      );

      const ensureCanManageCollaborators = Effect.fn(
        "JobsAuthorization.ensureCanManageCollaborators"
      )((actor: OrganizationActor, workItemId?: WorkItemId) =>
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
      )((actor: OrganizationActor, job: Job) =>
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
        actor: OrganizationActor,
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
      )((actor: OrganizationActor, job: Job) =>
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
      )((actor: OrganizationActor, job: Job) =>
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
      )((actor: OrganizationActor, job: Job, nextStatus: JobStatus) => {
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
        (actor: OrganizationActor, job: Job) =>
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
        ensureCanManageConfiguration,
        ensureCanManageCollaborators,
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

function hasElevatedAccess(actor: OrganizationActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function isInternalActor(actor: OrganizationActor): boolean {
  return isInternalOrganizationRole(actor.role);
}

function isExternalActor(actor: OrganizationActor): boolean {
  return isExternalOrganizationRole(actor.role);
}

function makeAccessDenied(message: string, workItemId?: WorkItemId) {
  return new JobAccessDeniedError({
    message,
    workItemId,
  });
}
