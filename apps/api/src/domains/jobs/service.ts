import { isExternalOrganizationRole } from "@ceird/identity-core";
import {
  BlockedReasonRequiredError,
  CoordinatorMatchesAssigneeError,
  InvalidJobTransitionError,
  JOB_NOT_FOUND_ERROR_TAG,
  JobAccessDeniedError,
  JobNotFoundError,
  JobStorageError,
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  VisitDurationIncrementError,
} from "@ceird/jobs-core";
import type {
  AddJobCommentInput,
  AddJobCostLineInput,
  AddJobVisitInput,
  AssignJobLabelInput,
  ContactIdType as ContactId,
  CreateJobContactInput,
  CreateJobInput,
  CreateJobSiteInput,
  AttachJobCollaboratorInput,
  Job,
  JobCollaborator,
  JobCollaboratorIdType as JobCollaboratorId,
  JobCollaboratorsResponse,
  JobDetail,
  JobExternalMemberOptionsResponse,
  JobMemberOptionsResponse,
  JobListQuery,
  OrganizationActivityQuery,
  OrganizationIdType as OrganizationId,
  PatchJobInput,
  TransitionJobInput,
  UpdateJobCollaboratorInput,
  WorkItemIdType as WorkItemId,
} from "@ceird/jobs-core";
import type { LabelIdType as LabelId } from "@ceird/labels-core";
import type {
  ServiceAreaOption,
  SiteIdType as SiteId,
} from "@ceird/sites-core";
import { Effect, Either, Option } from "effect";

import { LabelsRepository } from "../labels/repositories.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import type { GeocodedSiteLocation } from "../sites/geocoder.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import {
  ServiceAreasRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { JobsActivityRecorder } from "./activity-recorder.js";
import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepositoriesLive,
  JobsRepository,
} from "./repositories.js";
import type { JobsRepositoryAccess } from "./repositories.js";

const WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG =
  "@ceird/domains/jobs/WorkItemOrganizationMismatchError" as const;

export class JobsService extends Effect.Service<JobsService>()(
  "@ceird/domains/jobs/JobsService",
  {
    accessors: true,
    dependencies: [
      CurrentOrganizationActor.Default,
      JobsAuthorization.Default,
      JobsActivityRecorder.Default,
      JobsRepositoriesLive,
      LabelsRepository.Default,
      ServiceAreasRepository.Default,
      SitesRepository.Default,
      SiteGeocoder.Default,
    ],
    effect: Effect.gen(function* JobsServiceLive() {
      const activityRecorder = yield* JobsActivityRecorder;
      const authorization = yield* JobsAuthorization;
      const contactsRepository = yield* ContactsRepository;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const jobLabelAssignmentsRepository =
        yield* JobLabelAssignmentsRepository;
      const labelsRepository = yield* LabelsRepository;
      const jobsRepository = yield* JobsRepository;
      const serviceAreasRepository = yield* ServiceAreasRepository;
      const siteGeocoder = yield* SiteGeocoder;
      const sitesRepository = yield* SitesRepository;

      const loadActor = Effect.fn("JobsService.loadActor")(function* (
        workItemId?: WorkItemId
      ) {
        return yield* currentOrganizationActor
          .get()
          .pipe(mapActorResolutionErrorsToAccessDenied(workItemId));
      });

      const list = Effect.fn("JobsService.list")(function* (
        query: JobListQuery
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanView(actor);

        return yield* jobsRepository
          .list(actor.organizationId, query, getRepositoryAccess(actor))
          .pipe(Effect.catchTag("SqlError", failJobsStorageError));
      });

      const getOptions = Effect.fn("JobsService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationJobsData(actor, authorization);

        if (hasElevatedAccess(actor)) {
          const [members, sites, contacts, labels, serviceAreas] =
            yield* Effect.all([
              jobsRepository.listMemberOptions(actor.organizationId),
              sitesRepository.listOptions(actor.organizationId),
              contactsRepository.listOptions(actor.organizationId),
              labelsRepository.list(actor.organizationId),
              serviceAreasRepository.listOptions(actor.organizationId),
            ]).pipe(Effect.catchTag("SqlError", failJobsStorageError));

          return {
            contacts,
            labels,
            members,
            serviceAreas,
            sites,
          } as const;
        }

        const [members, sites, contacts, labels] = yield* Effect.all([
          jobsRepository.listMemberOptions(actor.organizationId),
          sitesRepository.listOptions(actor.organizationId),
          contactsRepository.listOptions(actor.organizationId),
          labelsRepository.list(actor.organizationId),
        ]).pipe(Effect.catchTag("SqlError", failJobsStorageError));

        return {
          contacts,
          labels,
          members,
          serviceAreas: deriveServiceAreaOptionsFromSites(sites),
          sites,
        } as const;
      });

      const getMemberOptions = Effect.fn("JobsService.getMemberOptions")(
        function* () {
          const actor = yield* loadActor();
          yield* ensureCanViewOrganizationJobsData(actor, authorization);

          const members = yield* jobsRepository
            .listMemberOptions(actor.organizationId)
            .pipe(Effect.catchTag("SqlError", failJobsStorageError));

          return {
            members,
          } satisfies JobMemberOptionsResponse;
        }
      );

      const getExternalMemberOptions = Effect.fn(
        "JobsService.getExternalMemberOptions"
      )(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanManageCollaborators(actor);

        const members = yield* jobsRepository
          .listExternalMemberOptions(actor.organizationId)
          .pipe(Effect.catchTag("SqlError", failJobsStorageError));

        return {
          members,
        } satisfies JobExternalMemberOptionsResponse;
      });

      const listOrganizationActivity = Effect.fn(
        "JobsService.listOrganizationActivity"
      )(function* (query: OrganizationActivityQuery) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanViewOrganizationActivity(actor);

        return yield* jobsRepository
          .listOrganizationActivity(actor.organizationId, query)
          .pipe(Effect.catchTag("SqlError", failJobsStorageError));
      });
      const create = Effect.fn("JobsService.create")(function* (
        input: CreateJobInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanCreate(actor);

        if (
          input.site?.kind === "create" &&
          input.site.input.serviceAreaId !== undefined
        ) {
          yield* sitesRepository
            .ensureServiceAreaInOrganization(
              actor.organizationId,
              input.site.input.serviceAreaId
            )
            .pipe(Effect.catchTag("SqlError", failJobsStorageError));
        }

        const geocodedSiteLocation =
          input.site?.kind === "create"
            ? yield* siteGeocoder.geocode(input.site.input)
            : undefined;

        const result = yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* resolveCreateSiteId(
                actor.organizationId,
                input.site,
                sitesRepository,
                geocodedSiteLocation
              );
              const contactId = yield* resolveCreateContactId(
                actor.organizationId,
                input.contact,
                contactsRepository
              );

              if (siteId !== undefined && contactId !== undefined) {
                yield* jobsRepository.linkSiteContact({
                  contactId,
                  organizationId: actor.organizationId,
                  siteId,
                });
              }

              const job = yield* jobsRepository.create({
                contactId,
                createdByUserId: actor.userId,
                externalReference: input.externalReference,
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG:
          case JOB_NOT_FOUND_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
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
        const grant = yield* loadExternalGrantIfNeeded(
          actor,
          workItemId,
          jobsRepository
        );
        yield* authorization.ensureCanViewJobDetail(actor, workItemId, grant);

        return yield* loadJobDetailOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository,
          getRepositoryAccess(actor, grant)
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
                yield* jobsRepository.linkSiteContact({
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
          return yield* loadJobOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository
          );
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
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

              if (isExternalOrganizationRole(actor.role)) {
                yield* authorization.ensureCanTransition(
                  actor,
                  existing,
                  input.status
                );
                yield* validateTransitionInput(existing, input);
              } else {
                yield* validateTransitionInput(existing, input);
                yield* authorization.ensureCanTransition(
                  actor,
                  existing,
                  input.status
                );
              }

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
          return yield* loadJobOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository
          );
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
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

              if (isExternalOrganizationRole(actor.role)) {
                yield* authorization.ensureCanReopen(actor, existing);
                yield* validateReopen(existing);
              } else {
                yield* validateReopen(existing);
                yield* authorization.ensureCanReopen(actor, existing);
              }

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
          return yield* loadJobOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository
          );
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
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
        const grant = yield* loadExternalGrantIfNeeded(
          actor,
          workItemId,
          jobsRepository
        );
        yield* authorization.ensureCanComment(actor, workItemId, grant);

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
                organizationId: actor.organizationId,
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const assignLabel = Effect.fn("JobsService.assignLabel")(function* (
        workItemId: WorkItemId,
        input: AssignJobLabelInput
      ) {
        const actor = yield* loadActor(workItemId);

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

              yield* authorization.ensureCanAssignLabels(actor, job);

              const assignment =
                yield* jobLabelAssignmentsRepository.assignToJob({
                  labelId: input.labelId,
                  organizationId: actor.organizationId,
                  workItemId,
                });

              if (assignment.changed) {
                yield* activityRecorder.recordLabelAssigned(
                  actor,
                  job,
                  assignment.label
                );
              }
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return yield* loadJobDetailOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository
          );
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const removeLabel = Effect.fn("JobsService.removeLabel")(function* (
        workItemId: WorkItemId,
        labelId: LabelId
      ) {
        const actor = yield* loadActor(workItemId);

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

              yield* authorization.ensureCanAssignLabels(actor, job);

              const assignment =
                yield* jobLabelAssignmentsRepository.removeFromJob({
                  labelId,
                  organizationId: actor.organizationId,
                  workItemId,
                });

              if (assignment.changed) {
                yield* activityRecorder.recordLabelRemoved(
                  actor,
                  job,
                  assignment.label
                );
              }
            })
          )
          .pipe(Effect.either);

        if (Either.isRight(result)) {
          return yield* loadJobDetailOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository
          );
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
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
        const isExternalActor = isExternalOrganizationRole(actor.role);

        if (!isExternalActor) {
          yield* validateVisitDuration(workItemId, input.durationMinutes);
        }

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
              if (isExternalActor) {
                yield* validateVisitDuration(workItemId, input.durationMinutes);
              }

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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const addCostLine = Effect.fn("JobsService.addCostLine")(function* (
        workItemId: WorkItemId,
        input: AddJobCostLineInput
      ) {
        const actor = yield* loadActor(workItemId);

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

              yield* authorization.ensureCanAddCostLine(actor, job);

              const costLine = yield* jobsRepository.addCostLine({
                authorUserId: actor.userId,
                description: input.description,
                organizationId: actor.organizationId,
                quantity: input.quantity,
                taxRateBasisPoints: input.taxRateBasisPoints,
                type: input.type,
                unitPriceMinor: input.unitPriceMinor,
                workItemId,
              });

              yield* activityRecorder.recordCostLineAdded(actor, {
                costLineId: costLine.id,
                costLineType: costLine.type,
                workItemId,
              });

              return costLine;
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
          case WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG: {
            return yield* Effect.die(result.left);
          }
          case "SqlError": {
            return yield* failJobsStorageError(result.left);
          }
          default: {
            return yield* Effect.fail(result.left);
          }
        }
      });

      const listCollaborators = Effect.fn("JobsService.listCollaborators")(
        function* (workItemId: WorkItemId) {
          const actor = yield* loadActor(workItemId);
          yield* authorization.ensureCanManageCollaborators(actor, workItemId);

          const collaborators = yield* jobsRepository
            .listCollaborators(actor.organizationId, workItemId)
            .pipe(
              Effect.catchTag(
                WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
                dieWorkItemOrganizationMismatch
              ),
              Effect.catchTag("SqlError", failJobsStorageError)
            );

          return { collaborators } satisfies JobCollaboratorsResponse;
        }
      );

      const attachCollaborator = Effect.fn("JobsService.attachCollaborator")(
        function* (workItemId: WorkItemId, input: AttachJobCollaboratorInput) {
          const actor = yield* loadActor(workItemId);
          yield* authorization.ensureCanManageCollaborators(actor, workItemId);

          return yield* jobsRepository
            .attachCollaborator({
              accessLevel: input.accessLevel,
              createdByUserId: actor.userId,
              organizationId: actor.organizationId,
              roleLabel: input.roleLabel,
              userId: input.userId,
              workItemId,
            })
            .pipe(
              Effect.catchTag(
                WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
                dieWorkItemOrganizationMismatch
              ),
              Effect.catchTag("SqlError", failJobsStorageError)
            );
        }
      );

      const updateCollaborator = Effect.fn("JobsService.updateCollaborator")(
        function* (
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
          input: UpdateJobCollaboratorInput
        ) {
          const actor = yield* loadActor(workItemId);
          yield* authorization.ensureCanManageCollaborators(actor, workItemId);

          return yield* jobsRepository
            .updateCollaborator(
              actor.organizationId,
              workItemId,
              collaboratorId,
              input
            )
            .pipe(Effect.catchTag("SqlError", failJobsStorageError));
        }
      );

      const removeCollaborator = Effect.fn("JobsService.removeCollaborator")(
        function* (workItemId: WorkItemId, collaboratorId: JobCollaboratorId) {
          const actor = yield* loadActor(workItemId);
          yield* authorization.ensureCanManageCollaborators(actor, workItemId);

          return yield* jobsRepository
            .removeCollaborator(
              actor.organizationId,
              workItemId,
              collaboratorId
            )
            .pipe(Effect.catchTag("SqlError", failJobsStorageError));
        }
      );

      return {
        addComment,
        addCostLine,
        addVisit,
        attachCollaborator,
        assignLabel,
        create,
        getDetail,
        getExternalMemberOptions,
        getMemberOptions,
        getOptions,
        list,
        listCollaborators,
        listOrganizationActivity,
        patch,
        removeCollaborator,
        removeLabel,
        reopen,
        transition,
        updateCollaborator,
      };
    }),
  }
) {}

function loadJobDetailOrFail(
  organizationId: OrganizationId,
  workItemId: WorkItemId,
  jobsRepository: JobsRepository,
  access?: JobsRepositoryAccess
): Effect.Effect<JobDetail, JobNotFoundError | JobStorageError> {
  return Effect.gen(function* () {
    const detail = yield* jobsRepository
      .getDetail(organizationId, workItemId, access)
      .pipe(
        Effect.catchTag("SqlError", failJobsStorageError),
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
}

function loadJobOrFail(
  organizationId: OrganizationId,
  workItemId: WorkItemId,
  jobsRepository: JobsRepository
): Effect.Effect<Job, JobNotFoundError | JobStorageError> {
  return loadJobDetailOrFail(organizationId, workItemId, jobsRepository).pipe(
    Effect.map((detail) => detail.job)
  );
}

function loadExternalGrantIfNeeded(
  actor: OrganizationActor,
  workItemId: WorkItemId,
  jobsRepository: JobsRepository
): Effect.Effect<JobCollaborator | undefined, JobStorageError> {
  if (!isExternalOrganizationRole(actor.role)) {
    const noGrant = Option.getOrUndefined(Option.none<JobCollaborator>());
    return Effect.succeed(noGrant);
  }

  return jobsRepository
    .findUserCollaboratorGrant(actor.organizationId, workItemId, actor.userId)
    .pipe(
      Effect.catchTag("SqlError", failJobsStorageError),
      Effect.map(Option.getOrUndefined)
    );
}

function getRepositoryAccess(
  actor: OrganizationActor,
  grant?: JobCollaborator | undefined
): JobsRepositoryAccess {
  return isExternalOrganizationRole(actor.role)
    ? { grant, userId: actor.userId, visibility: "external" }
    : { visibility: "internal" };
}

function failJobsStorageError(
  error: unknown
): Effect.Effect<never, JobStorageError> {
  return Effect.fail(makeJobsStorageError(error));
}

function dieWorkItemOrganizationMismatch(error: unknown) {
  return Effect.die(error);
}

function ensureCanViewOrganizationJobsData(
  actor: OrganizationActor,
  authorization: JobsAuthorization
) {
  return Effect.gen(function* () {
    yield* authorization.ensureCanView(actor);

    if (!isExternalOrganizationRole(actor.role)) {
      return;
    }

    return yield* Effect.fail(
      new JobAccessDeniedError({
        message:
          "External collaborators cannot view organization-wide jobs data",
      })
    );
  });
}

function makeJobsStorageError(error: unknown): JobStorageError {
  return new JobStorageError({
    cause: error instanceof Error ? error.message : String(error),
    message: "Jobs storage operation failed",
  });
}

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
    input.externalReference !== undefined ||
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
  sitesRepository: SitesRepository,
  geocodedLocation: GeocodedSiteLocation | undefined
) {
  if (input === undefined) {
    return Effect.succeed<SiteId | undefined>(input);
  }

  if (input.kind === "existing") {
    return Effect.succeed<SiteId | undefined>(input.siteId);
  }

  if (geocodedLocation === undefined) {
    return Effect.die(new Error("Inline site creation was not geocoded"));
  }

  return sitesRepository.create({
    accessNotes: input.input.accessNotes,
    addressLine1: input.input.addressLine1,
    addressLine2: input.input.addressLine2,
    country: input.input.country,
    county: input.input.county,
    eircode: input.input.eircode,
    geocodedAt: geocodedLocation.geocodedAt,
    geocodingProvider: geocodedLocation.provider,
    latitude: geocodedLocation.latitude,
    name: input.input.name,
    organizationId,
    longitude: geocodedLocation.longitude,
    serviceAreaId: input.input.serviceAreaId,
    town: input.input.town,
  });
}

function hasElevatedAccess(actor: { readonly role: string }): boolean {
  return actor.role === "owner" || actor.role === "admin";
}

function deriveServiceAreaOptionsFromSites(
  sites: readonly {
    readonly serviceAreaId?: ServiceAreaOption["id"] | undefined;
    readonly serviceAreaName?: string | undefined;
  }[]
): readonly ServiceAreaOption[] {
  const serviceAreasById = new Map<
    ServiceAreaOption["id"],
    ServiceAreaOption
  >();

  for (const site of sites) {
    if (
      site.serviceAreaId === undefined ||
      site.serviceAreaName === undefined
    ) {
      continue;
    }

    serviceAreasById.set(site.serviceAreaId, {
      id: site.serviceAreaId,
      name: site.serviceAreaName,
    });
  }

  return [...serviceAreasById.values()].toSorted(compareServiceAreaOptions);
}

function compareServiceAreaOptions(
  left: ServiceAreaOption,
  right: ServiceAreaOption
): number {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
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
