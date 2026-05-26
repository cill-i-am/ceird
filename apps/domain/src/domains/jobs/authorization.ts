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
import { Layer, Context, Effect } from "effect";

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

type JobAuthorizationCheck = Effect.Effect<void, JobAccessDeniedError>;

export class JobsAuthorization extends Context.Service<JobsAuthorization>()(
  "@ceird/domains/jobs/JobsAuthorization",
  {
    make: Effect.sync(() => {
      const ensureCanView = (
        _actor: OrganizationActor
      ): JobAuthorizationCheck => Effect.void;

      const ensureCanViewJobDetail = (
        actor: OrganizationActor,
        workItemId: WorkItemId,
        grant?: JobAuthorizationGrant
      ): JobAuthorizationCheck =>
        isInternalActor(actor) || grant !== undefined
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "External collaborators can only view jobs granted to them",
                workItemId
              )
            );

      const ensureCanCreate = (
        actor: OrganizationActor
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can create jobs"
              )
            );

      const ensureCanViewOrganizationActivity = (
        actor: OrganizationActor
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can view organization activity"
              )
            );

      const ensureCanPatch = (
        actor: OrganizationActor,
        workItemId: WorkItemId
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can edit jobs",
                workItemId
              )
            );

      const ensureCanManageCollaborators = (
        actor: OrganizationActor,
        workItemId?: WorkItemId
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Only organization owners and admins can manage job collaborators",
                workItemId
              )
            );

      const ensureCanAssignLabels = (
        actor: OrganizationActor,
        job: Job
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only assign labels on jobs assigned to them",
                job.id
              )
            );

      const ensureCanComment = (
        actor: OrganizationActor,
        workItemId?: WorkItemId,
        grant?: JobAuthorizationGrant
      ): JobAuthorizationCheck => {
        if (isInternalActor(actor)) {
          return Effect.void;
        }

        return grant?.accessLevel === "comment"
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "External collaborators need comment access to comment on jobs",
                workItemId
              )
            );
      };

      const ensureCanAddVisit = (
        actor: OrganizationActor,
        job: Job
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only log visits on jobs assigned to them",
                job.id
              )
            );

      const ensureCanTransition = (
        actor: OrganizationActor,
        job: Job,
        nextStatus: JobStatus
      ): JobAuthorizationCheck => {
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
      };

      const ensureCanReopen = (
        actor: OrganizationActor,
        job: Job
      ): JobAuthorizationCheck =>
        hasElevatedAccess(actor) ||
        (isInternalActor(actor) && job.assigneeId === actor.userId)
          ? Effect.void
          : Effect.fail(
              makeAccessDenied(
                "Members can only reopen jobs assigned to them",
                job.id
              )
            );

      return {
        ensureCanAddVisit,
        ensureCanAssignLabels,
        ensureCanComment,
        ensureCanCreate,
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
) {
  static readonly ensureCanAddVisit = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanAddVisit"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanAddVisit(...args));
  static readonly ensureCanAssignLabels = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanAssignLabels"]
    >
  ) =>
    JobsAuthorization.use((service) => service.ensureCanAssignLabels(...args));
  static readonly ensureCanComment = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanComment"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanComment(...args));
  static readonly ensureCanCreate = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanCreate"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanCreate(...args));
  static readonly ensureCanManageCollaborators = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof JobsAuthorization
      >["ensureCanManageCollaborators"]
    >
  ) =>
    JobsAuthorization.use((service) =>
      service.ensureCanManageCollaborators(...args)
    );
  static readonly ensureCanPatch = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanPatch"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanPatch(...args));
  static readonly ensureCanReopen = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanReopen"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanReopen(...args));
  static readonly ensureCanTransition = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanTransition"]
    >
  ) => JobsAuthorization.use((service) => service.ensureCanTransition(...args));
  static readonly ensureCanViewJobDetail = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsAuthorization>["ensureCanViewJobDetail"]
    >
  ) =>
    JobsAuthorization.use((service) => service.ensureCanViewJobDetail(...args));
  static readonly ensureCanViewOrganizationActivity = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof JobsAuthorization
      >["ensureCanViewOrganizationActivity"]
    >
  ) =>
    JobsAuthorization.use((service) =>
      service.ensureCanViewOrganizationActivity(...args)
    );
  static readonly DefaultWithoutDependencies = Layer.effect(
    JobsAuthorization,
    JobsAuthorization.make
  );
  static readonly Default = JobsAuthorization.DefaultWithoutDependencies;
}

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
