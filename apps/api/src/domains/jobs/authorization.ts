import { JobAccessDeniedError } from "@task-tracker/jobs-core";
import type {
  Job,
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

export class JobsAuthorization extends Effect.Service<JobsAuthorization>()(
  "@task-tracker/domains/jobs/JobsAuthorization",
  {
    accessors: true,
    effect: Effect.sync(() => {
      const ensureCanView = Effect.fn("JobsAuthorization.ensureCanView")(
        (_actor: JobsActor) => Effect.void
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

      const ensureCanComment = Effect.fn("JobsAuthorization.ensureCanComment")(
        (actor: JobsActor) => ensureCanView(actor)
      );

      const ensureCanAddVisit = Effect.fn(
        "JobsAuthorization.ensureCanAddVisit"
      )((actor: JobsActor, job: Job) =>
        hasElevatedAccess(actor) || job.assigneeId === actor.userId
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
        hasElevatedAccess(actor) || job.assigneeId === actor.userId
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
          hasElevatedAccess(actor) || job.assigneeId === actor.userId
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
        ensureCanComment,
        ensureCanCreate,
        ensureCanCreateSite,
        ensureCanManageConfiguration,
        ensureCanPatch,
        ensureCanReopen,
        ensureCanTransition,
        ensureCanView,
        ensureCanViewOrganizationActivity,
      };
    }),
  }
) {}

function hasElevatedAccess(actor: JobsActor): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function makeAccessDenied(message: string, workItemId?: WorkItemId) {
  return new JobAccessDeniedError({
    message,
    workItemId,
  });
}
