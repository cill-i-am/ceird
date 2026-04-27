import {
  BlockedReasonRequiredError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JOB_NOT_FOUND_ERROR_TAG,
  JobAccessDeniedError,
  JobNotFoundError,
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  VisitDurationIncrementError,
} from "@task-tracker/jobs-core";
import type {
  AddJobCommentInput,
  AddJobVisitInput,
  ContactIdType as ContactId,
  CreateJobContactInput,
  CreateJobInput,
  CreateJobSiteInput,
  Job,
  JobListQuery,
  OrganizationIdType as OrganizationId,
  PatchJobInput,
  SiteIdType as SiteId,
  TransitionJobInput,
  WorkItemIdType as WorkItemId,
} from "@task-tracker/jobs-core";
import { Effect, Either, Option } from "effect";

import { JobsActivityRecorder } from "./activity-recorder.js";
import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import {
  ContactsRepository,
  JobsRepositoriesLive,
  JobsRepository,
  SitesRepository,
} from "./repositories.js";

const WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG =
  "@task-tracker/domains/jobs/WorkItemOrganizationMismatchError" as const;

export class JobsService extends Effect.Service<JobsService>()(
  "@task-tracker/domains/jobs/JobsService",
  {
    accessors: true,
    dependencies: [
      CurrentJobsActor.Default,
      JobsAuthorization.Default,
      JobsActivityRecorder.Default,
      JobsRepositoriesLive,
    ],
    effect: Effect.gen(function* JobsServiceLive() {
      const activityRecorder = yield* JobsActivityRecorder;
      const authorization = yield* JobsAuthorization;
      const contactsRepository = yield* ContactsRepository;
      const currentJobsActor = yield* CurrentJobsActor;
      const jobsRepository = yield* JobsRepository;
      const sitesRepository = yield* SitesRepository;

      const loadActor = Effect.fn("JobsService.loadActor")(function* (
        workItemId?: WorkItemId
      ) {
        return yield* currentJobsActor
          .get()
          .pipe(mapActorResolutionErrorsToAccessDenied(workItemId));
      });

      const list = Effect.fn("JobsService.list")(function* (
        query: JobListQuery
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanView(actor);

        return yield* jobsRepository
          .list(actor.organizationId, query)
          .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));
      });

      const getOptions = Effect.fn("JobsService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanView(actor);

        const [members, regions, sites, contacts] = yield* Effect.all([
          jobsRepository.listMemberOptions(actor.organizationId),
          sitesRepository.listRegions(actor.organizationId),
          sitesRepository.listOptions(actor.organizationId),
          contactsRepository.listOptions(actor.organizationId),
        ]).pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));

        return {
          contacts,
          members,
          regions,
          sites,
        } as const;
      });

      const create = Effect.fn("JobsService.create")(function* (
        input: CreateJobInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanCreate(actor);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* resolveCreateSiteId(
                actor.organizationId,
                input.site,
                sitesRepository
              );
              const contactId = yield* resolveCreateContactId(
                actor.organizationId,
                input.contact,
                contactsRepository
              );

              if (siteId !== undefined && contactId !== undefined) {
                yield* sitesRepository.linkContact({
                  contactId,
                  organizationId: actor.organizationId,
                  siteId,
                });
              }

              const job = yield* jobsRepository.create({
                contactId,
                createdByUserId: actor.userId,
                organizationId: actor.organizationId,
                priority: input.priority,
                siteId,
                title: input.title,
              });

              yield* activityRecorder.recordCreated(actor, job);

              return job;
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                  })
                )
              : Effect.die(result.left);
          }
          case JOB_NOT_FOUND_ERROR_TAG:
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const getDetail = Effect.fn("JobsService.getDetail")(function* (
        workItemId: WorkItemId
      ) {
        const actor = yield* loadActor(workItemId);
        yield* authorization.ensureCanView(actor);

        const detail = yield* jobsRepository
          .getDetail(actor.organizationId, workItemId)
          .pipe(
            Effect.catchTag("SqlError", (error) => Effect.die(error)),
            Effect.map(Option.getOrUndefined)
          );

        if (detail !== undefined) {
          return detail;
        }

        return yield* Effect.fail(
          new JobNotFoundError({
            message: "Job does not exist",
            workItemId,
          })
        );
      });

      const patch = Effect.fn("JobsService.patch")(function* (
        workItemId: WorkItemId,
        input: PatchJobInput
      ) {
        const actor = yield* loadActor(workItemId);
        yield* authorization.ensureCanPatch(actor, workItemId);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* jobsRepository
                .findByIdForUpdate(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (existing === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              if (!hasPatchChanges(input)) {
                return existing;
              }

              const nextAssigneeId = resolvePatchedOptionalValue(
                existing.assigneeId,
                input.assigneeId
              );
              const nextCoordinatorId = resolvePatchedOptionalValue(
                existing.coordinatorId,
                input.coordinatorId
              );
              const nextSiteId = resolvePatchedOptionalValue(
                existing.siteId,
                input.siteId
              );
              const nextContactId = resolvePatchedOptionalValue(
                existing.contactId,
                input.contactId
              );

              yield* ensureCoordinatorDiffersFromAssignee({
                assigneeId: nextAssigneeId,
                coordinatorId: nextCoordinatorId,
                workItemId,
              });

              const job = yield* jobsRepository
                .patch(actor.organizationId, workItemId, input)
                .pipe(Effect.map(Option.getOrUndefined));

              if (job === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              if (nextSiteId !== undefined && nextContactId !== undefined) {
                yield* sitesRepository.linkContact({
                  contactId: nextContactId,
                  organizationId: actor.organizationId,
                  siteId: nextSiteId,
                });
              }

              yield* activityRecorder.recordPatched(actor, existing, job);

              return job;
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                    workItemId,
                  })
                )
              : Effect.fail(result.left);
          }
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const transition = Effect.fn("JobsService.transition")(function* (
        workItemId: WorkItemId,
        input: TransitionJobInput
      ) {
        const actor = yield* loadActor(workItemId);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* jobsRepository
                .findByIdForUpdate(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (existing === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              yield* validateTransitionInput(existing, input);
              yield* authorization.ensureCanTransition(
                actor,
                existing,
                input.status
              );

              const job = yield* jobsRepository
                .transition(actor.organizationId, workItemId, {
                  blockedReason: input.blockedReason,
                  completedAt:
                    input.status === "completed"
                      ? new Date().toISOString()
                      : undefined,
                  completedByUserId:
                    input.status === "completed" ? actor.userId : null,
                  status: input.status,
                })
                .pipe(Effect.map(Option.getOrUndefined));

              if (job === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              yield* activityRecorder.recordTransition(actor, existing, job);

              return job;
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                    workItemId,
                  })
                )
              : Effect.die(result.left);
          }
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const reopen = Effect.fn("JobsService.reopen")(function* (
        workItemId: WorkItemId
      ) {
        const actor = yield* loadActor(workItemId);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* jobsRepository
                .findByIdForUpdate(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (existing === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              yield* validateReopen(existing);
              yield* authorization.ensureCanReopen(actor, existing);

              const job = yield* jobsRepository
                .reopen(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (job === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              yield* activityRecorder.recordReopened(actor, job);

              return job;
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                    workItemId,
                  })
                )
              : Effect.die(result.left);
          }
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const addComment = Effect.fn("JobsService.addComment")(function* (
        workItemId: WorkItemId,
        input: AddJobCommentInput
      ) {
        const actor = yield* loadActor(workItemId);
        yield* authorization.ensureCanComment(actor);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* jobsRepository
                .findByIdForUpdate(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (existing === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              return yield* jobsRepository.addComment({
                authorUserId: actor.userId,
                body: input.body,
                workItemId,
              });
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                    workItemId,
                  })
                )
              : Effect.die(result.left);
          }
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const addVisit = Effect.fn("JobsService.addVisit")(function* (
        workItemId: WorkItemId,
        input: AddJobVisitInput
      ) {
        const actor = yield* loadActor(workItemId);
        yield* validateVisitDuration(workItemId, input.durationMinutes);

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const job = yield* jobsRepository
                .findByIdForUpdate(actor.organizationId, workItemId)
                .pipe(Effect.map(Option.getOrUndefined));

              if (job === undefined) {
                return yield* Effect.fail(
                  new JobNotFoundError({
                    message: "Job does not exist",
                    workItemId,
                  })
                );
              }

              yield* authorization.ensureCanAddVisit(actor, job);

              const visit = yield* jobsRepository.addVisit({
                authorUserId: actor.userId,
                durationMinutes: input.durationMinutes,
                note: input.note,
                organizationId: actor.organizationId,
                visitDate: input.visitDate,
                workItemId,
              });

              yield* activityRecorder.recordVisitLogged(actor, {
                visitId: visit.id,
                workItemId,
              });

              return visit;
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return result.right;
        }

        switch (result.left._tag) {
          case ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG: {
            return yield* result.left.userId === actor.userId
              ? Effect.fail(
                  new JobAccessDeniedError({
                    message:
                      "Your organization access changed while the request was running",
                    workItemId,
                  })
                )
              : Effect.die(result.left);
          }
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case "SqlError": {
            return yield* Effect.die(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      return {
        addComment,
        addVisit,
        create,
        getDetail,
        getOptions,
        list,
        patch,
        reopen,
        transition,
      };
    }),
  }
) {}

function ensureCoordinatorDiffersFromAssignee(input: {
  readonly assigneeId?: Job["assigneeId"];
  readonly coordinatorId?: Job["coordinatorId"];
  readonly workItemId: WorkItemId;
}) {
  if (
    input.assigneeId === undefined ||
    input.coordinatorId === undefined ||
    input.assigneeId !== input.coordinatorId
  ) {
    return Effect.void;
  }

  return Effect.fail(
    new CoordinatorMatchesAssigneeError({
      message: "Coordinator and assignee must be different people",
      workItemId: input.workItemId,
    })
  );
}

function hasPatchChanges(input: PatchJobInput): boolean {
  return (
    input.assigneeId !== undefined ||
    input.contactId !== undefined ||
    input.coordinatorId !== undefined ||
    input.priority !== undefined ||
    input.siteId !== undefined ||
    input.title !== undefined
  );
}

function resolveCreateContactId(
  organizationId: OrganizationId,
  input: CreateJobContactInput | undefined,
  contactsRepository: ContactsRepository
) {
  if (input === undefined) {
    return Effect.succeed<ContactId | undefined>(input);
  }

  if (input.kind === "existing") {
    return Effect.succeed<ContactId | undefined>(input.contactId);
  }

  return contactsRepository.create({
    email: input.input.email,
    name: input.input.name,
    notes: input.input.notes,
    organizationId,
    phone: input.input.phone,
  });
}

function resolveCreateSiteId(
  organizationId: OrganizationId,
  input: CreateJobSiteInput | undefined,
  sitesRepository: SitesRepository
) {
  if (input === undefined) {
    return Effect.succeed<SiteId | undefined>(input);
  }

  if (input.kind === "existing") {
    return Effect.succeed<SiteId | undefined>(input.siteId);
  }

  return sitesRepository.create({
    accessNotes: input.input.accessNotes,
    addressLine1: input.input.addressLine1,
    addressLine2: input.input.addressLine2,
    county: input.input.county,
    eircode: input.input.eircode,
    latitude: input.input.latitude,
    name: input.input.name,
    organizationId,
    longitude: input.input.longitude,
    regionId: input.input.regionId,
    town: input.input.town,
  });
}

function resolvePatchedOptionalValue<Value>(
  current: Value | undefined,
  next: Value | null | undefined
): Value | undefined {
  if (next === undefined) {
    return current;
  }

  return next ?? undefined;
}

function validateReopen(job: Job) {
  if (job.status === "completed") {
    return Effect.void;
  }

  return Effect.fail(
    new InvalidJobTransitionError({
      fromStatus: job.status,
      message: "Only completed jobs can be reopened",
      toStatus: "in_progress",
      workItemId: job.id,
    })
  );
}

function validateTransitionInput(job: Job, input: TransitionJobInput) {
  if (job.status === "completed") {
    return Effect.fail(
      new InvalidJobTransitionError({
        fromStatus: job.status,
        message: "Completed jobs must be reopened instead of transitioned",
        toStatus: input.status,
        workItemId: job.id,
      })
    );
  }

  if (job.status === "canceled") {
    return Effect.fail(
      new InvalidJobTransitionError({
        fromStatus: job.status,
        message: "Canceled jobs cannot be transitioned",
        toStatus: input.status,
        workItemId: job.id,
      })
    );
  }

  if (input.status === "blocked" && input.blockedReason === undefined) {
    return Effect.fail(
      new BlockedReasonRequiredError({
        message: "A blocked reason is required when moving a job to blocked",
        status: "blocked",
        workItemId: job.id,
      })
    );
  }

  if (job.status === input.status) {
    return Effect.fail(
      new InvalidJobTransitionError({
        fromStatus: job.status,
        message: "Job is already in that status",
        toStatus: input.status,
        workItemId: job.id,
      })
    );
  }

  return Effect.void;
}

function validateVisitDuration(
  workItemId: WorkItemId,
  durationMinutes: number
) {
  if (durationMinutes % 60 === 0) {
    return Effect.void;
  }

  return Effect.fail(
    new VisitDurationIncrementError({
      durationMinutes,
      message: "Visit duration must be entered in whole-hour increments",
      workItemId,
    })
  );
}
