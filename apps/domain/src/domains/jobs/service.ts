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
  JobListItem,
  JobExternalMemberOptionsResponse,
  JobMemberOptionsResponse,
  JobListQuery,
  JobOptionsResponse,
  JobProximityInput,
  JobProximityFilters,
  JobProximityResponse,
  JobRoutePreviewInput,
  JobRoutePreviewResponse,
  OrganizationActivityQuery,
  OrganizationMemberNotFoundError,
  OrganizationIdType as OrganizationId,
  PatchJobInput,
  TransitionJobInput,
  UpdateJobCollaboratorInput,
  WorkItemIdType as WorkItemId,
} from "@ceird/jobs-core";
import type { LabelIdType as LabelId } from "@ceird/labels-core";
import { ProximityRouteUnavailableError } from "@ceird/proximity-core";
import type { SiteIdType as SiteId } from "@ceird/sites-core";
import { Layer, Context, Effect, Option } from "effect";

import {
  describeDomainStorageFailure,
  isDomainDrizzleStorageFailure,
} from "../../platform/database/database.js";
import type { DomainDrizzleStorageFailure } from "../../platform/database/database.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { LabelsRepository } from "../labels/repositories.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { ensureCurrentLocationOriginAllowed } from "../proximity/current-location-access.js";
import {
  makeCurrentRouteCostContext,
  RouteProximityService,
} from "../proximity/service.js";
import { SiteLocationProvider } from "../sites/location-provider.js";
import type { ResolvedSiteLocationRecord } from "../sites/location-resolution.js";
import { resolveCreateSiteLocation } from "../sites/location-resolution.js";
import { SitesRepository } from "../sites/repositories.js";
import { JobsActivityRecorder } from "./activity-recorder.js";
import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG } from "./errors.js";
import type { WorkItemOrganizationMismatchError } from "./errors.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepositoriesLive,
  JobsRepository,
} from "./repositories.js";
import type { JobsRepositoryAccess } from "./repositories.js";

type ContactsRepositoryService = Context.Service.Shape<
  typeof ContactsRepository
>;
type JobsAuthorizationService = Context.Service.Shape<typeof JobsAuthorization>;
type JobsRepositoryService = Context.Service.Shape<typeof JobsRepository>;
type SitesRepositoryService = Context.Service.Shape<typeof SitesRepository>;
type CreateJobSiteResolution =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "existing";
      readonly siteId: SiteId;
    }
  | {
      readonly input: Extract<CreateJobSiteInput, { kind: "create" }>["input"];
      readonly kind: "create";
      readonly location: ResolvedSiteLocationRecord;
    };

export class JobsService extends Context.Service<JobsService>()(
  "@ceird/domains/jobs/JobsService",
  {
    make: Effect.gen(function* JobsServiceLive() {
      const activityRecorder = yield* JobsActivityRecorder;
      const authorization = yield* JobsAuthorization;
      const contactsRepository = yield* ContactsRepository;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const jobLabelAssignmentsRepository =
        yield* JobLabelAssignmentsRepository;
      const labelsRepository = yield* LabelsRepository;
      const jobsRepository = yield* JobsRepository;
      const routeProximityService = yield* RouteProximityService;
      const siteLocationProvider = yield* SiteLocationProvider;
      const sitesRepository = yield* SitesRepository;
      const userPreferencesRepository = yield* UserPreferencesRepository;

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
          .pipe(
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
          );
      });

      const getOptions = Effect.fn("JobsService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationJobsData(actor, authorization);

        const [members, sites, contacts, labels] = yield* Effect.all([
          jobsRepository.listMemberOptions(actor.organizationId),
          sitesRepository.listOptions(actor.organizationId),
          contactsRepository.listOptions(actor.organizationId),
          labelsRepository.list(actor.organizationId),
        ]).pipe(catchJobsStorageError());

        return {
          contacts,
          labels,
          members,
          sites,
        } as const;
      });

      const getMemberOptions = Effect.fn("JobsService.getMemberOptions")(
        function* () {
          const actor = yield* loadActor();
          yield* ensureCanViewOrganizationJobsData(actor, authorization);

          const members = yield* jobsRepository
            .listMemberOptions(actor.organizationId)
            .pipe(
              Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
            );

          return {
            members,
          } satisfies JobMemberOptionsResponse;
        }
      );

      const getExternalOptions = Effect.fn("JobsService.getExternalOptions")(
        function* () {
          const actor = yield* loadActor();
          yield* ensureCanViewScopedExternalJobsData(actor, authorization);

          const scopedOptions = yield* jobsRepository
            .listExternalScopedOptions(actor.organizationId, actor.userId)
            .pipe(
              Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
            );

          return {
            ...scopedOptions,
            members: [],
          } satisfies JobOptionsResponse;
        }
      );

      const getExternalMemberOptions = Effect.fn(
        "JobsService.getExternalMemberOptions"
      )(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanManageCollaborators(actor);

        const members = yield* jobsRepository
          .listExternalMemberOptions(actor.organizationId)
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
          );

        return {
          members,
        } satisfies JobExternalMemberOptionsResponse;
      });

      const getHomeDashboardSummary = Effect.fn(
        "JobsService.getHomeDashboardSummary"
      )(function* () {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationJobsData(actor, authorization);

        return yield* jobsRepository
          .getHomeDashboardSummary(actor.organizationId)
          .pipe(Effect.catchTag("SqlError", failJobsStorageError));
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

      const rankNearbyJobs = Effect.fn("JobsService.rankNearbyJobs")(function* (
        input: JobProximityInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanView(actor);
        yield* Effect.annotateCurrentSpan("action", "rankNearbyJobs");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);
        yield* Effect.annotateCurrentSpan("limit", input.limit ?? 10);
        yield* Effect.annotateCurrentSpan(
          "includeRouteLines",
          input.includeRouteLines === true
        );
        yield* ensureCurrentLocationOriginAllowed({
          origin: input.origin,
          userId: actor.userId,
          userPreferencesRepository,
        });

        const candidateSet = yield* jobsRepository
          .listProximityCandidates(
            actor.organizationId,
            normalizeJobProximityFilters(input.filters),
            getRepositoryAccess(actor)
          )
          .pipe(
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
          );
        const routeCostContext = yield* makeCurrentRouteCostContext({
          actorUserId: actor.userId,
          organizationId: actor.organizationId,
        });
        const ranked = yield* routeProximityService.rank({
          candidateCount: candidateSet.candidateCount,
          candidateLimitApplied: candidateSet.candidateLimitApplied,
          candidates: candidateSet.candidates.flatMap((candidate) =>
            candidate.site.latitude === undefined ||
            candidate.site.longitude === undefined
              ? []
              : [
                  {
                    coordinates: {
                      latitude: candidate.site.latitude,
                      longitude: candidate.site.longitude,
                    },
                    destinationId: candidate.job.id,
                    row: candidate,
                  },
                ]
          ),
          context: routeCostContext,
          excluded: candidateSet.excluded,
          includeRouteLines: input.includeRouteLines,
          limit: input.limit,
          origin: input.origin,
        });

        return {
          meta: ranked.meta,
          origin: ranked.origin,
          rows: ranked.rows.map((row) => ({
            job: row.row.job,
            routeLine: row.routeLine,
            routeSummary: row.routeSummary,
            site: row.row.site,
          })),
        } satisfies JobProximityResponse;
      });

      const getJobRoutePreview = Effect.fn("JobsService.getJobRoutePreview")(
        function* (workItemId: WorkItemId, input: JobRoutePreviewInput) {
          const actor = yield* loadActor(workItemId);
          const grant = yield* loadExternalGrantIfNeeded(
            actor,
            workItemId,
            jobsRepository
          );
          yield* authorization.ensureCanViewJobDetail(actor, workItemId, grant);
          yield* ensureCurrentLocationOriginAllowed({
            origin: input.origin,
            userId: actor.userId,
            userPreferencesRepository,
          });
          const detail = yield* loadJobDetailOrFail(
            actor.organizationId,
            workItemId,
            jobsRepository,
            getRepositoryAccess(actor, grant)
          );
          yield* Effect.annotateCurrentSpan("action", "getJobRoutePreview");
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            actor.organizationId
          );
          yield* Effect.annotateCurrentSpan("workItemId", workItemId);
          yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
          yield* Effect.annotateCurrentSpan("actorRole", actor.role);
          yield* Effect.annotateCurrentSpan(
            "includeRouteLine",
            input.includeRouteLine === true
          );

          if (
            detail.site === undefined ||
            detail.site.latitude === undefined ||
            detail.site.longitude === undefined
          ) {
            return yield* failDestinationUnmapped(
              "Job does not have a mapped site with usable coordinates."
            );
          }

          const routeCostContext = yield* makeCurrentRouteCostContext({
            actorUserId: actor.userId,
            organizationId: actor.organizationId,
          });
          const preview = yield* routeProximityService.preview({
            context: routeCostContext,
            destination: {
              coordinates: {
                latitude: detail.site.latitude,
                longitude: detail.site.longitude,
              },
              destinationId: workItemId,
            },
            includeRouteLine: input.includeRouteLine,
            origin: input.origin,
          });

          return {
            job: toJobListItem(detail.job),
            origin: preview.origin,
            routeLine: preview.routeLine,
            routeSummary: preview.routeSummary,
            site: detail.site,
          } satisfies JobRoutePreviewResponse;
        }
      );

      const create = Effect.fn("JobsService.create")(function* (
        input: CreateJobInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanCreate(actor);
        yield* Effect.annotateCurrentSpan("action", "create");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const siteResolution = yield* resolveCreateJobSite(
          input.site,
          siteLocationProvider
        );

        return yield* jobsRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* createResolvedJobSite(
                actor.organizationId,
                siteResolution,
                sitesRepository
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
                organizationId: actor.organizationId,
                priority: input.priority,
                siteId,
                title: input.title,
              });

              yield* activityRecorder.recordCreated(actor, job);

              return job;
            })
          )
          .pipe(
            catchJobsStorageError(),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, { actor })
            ),
            Effect.catchTag(JOB_NOT_FOUND_ERROR_TAG, (error) =>
              Effect.die(error)
            ),
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            )
          );
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

        yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrPreserveOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );

        return yield* loadJobOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository
        );
      });

      const transition = Effect.fn("JobsService.transition")(function* (
        workItemId: WorkItemId,
        input: TransitionJobInput
      ) {
        const actor = yield* loadActor(workItemId);

        yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );

        return yield* loadJobOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository
        );
      });

      const reopen = Effect.fn("JobsService.reopen")(function* (
        workItemId: WorkItemId
      ) {
        const actor = yield* loadActor(workItemId);

        yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );

        return yield* loadJobOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository
        );
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

        return yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );
      });

      const assignLabel = Effect.fn("JobsService.assignLabel")(function* (
        workItemId: WorkItemId,
        input: AssignJobLabelInput
      ) {
        const actor = yield* loadActor(workItemId);

        yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );

        return yield* loadJobDetailOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository
        );
      });

      const removeLabel = Effect.fn("JobsService.removeLabel")(function* (
        workItemId: WorkItemId,
        labelId: LabelId
      ) {
        const actor = yield* loadActor(workItemId);

        yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );

        return yield* loadJobDetailOrFail(
          actor.organizationId,
          workItemId,
          jobsRepository
        );
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

        return yield* jobsRepository
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
          .pipe(
            Effect.catchTag(
              WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
              dieWorkItemOrganizationMismatch
            ),
            Effect.catchTag("SqlError", failJobsStorageError),
            Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
            Effect.catchTag(ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG, (error) =>
              failActorMembershipLossOrDieOtherMember(error, {
                actor,
                workItemId,
              })
            )
          );
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
                failWorkItemOrganizationMismatchAsNotFound
              ),
              Effect.catchTag("SqlError", failJobsStorageError),
              Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError)
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
                failWorkItemOrganizationMismatchAsNotFound
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
        addVisit,
        attachCollaborator,
        assignLabel,
        create,
        getDetail,
        getExternalOptions,
        getJobRoutePreview,
        getExternalMemberOptions,
        getHomeDashboardSummary,
        getMemberOptions,
        getOptions,
        list,
        listCollaborators,
        listOrganizationActivity,
        patch,
        rankNearbyJobs,
        removeCollaborator,
        removeLabel,
        reopen,
        transition,
        updateCollaborator,
      };
    }),
  }
) {
  static readonly addComment = (
    ...args: Parameters<Context.Service.Shape<typeof JobsService>["addComment"]>
  ) => JobsService.use((service) => service.addComment(...args));
  static readonly assignLabel = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsService>["assignLabel"]
    >
  ) => JobsService.use((service) => service.assignLabel(...args));
  static readonly getDetail = (
    ...args: Parameters<Context.Service.Shape<typeof JobsService>["getDetail"]>
  ) => JobsService.use((service) => service.getDetail(...args));
  static readonly getOptions = (
    ...args: Parameters<Context.Service.Shape<typeof JobsService>["getOptions"]>
  ) => JobsService.use((service) => service.getOptions(...args));
  static readonly getExternalOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsService>["getExternalOptions"]
    >
  ) => JobsService.use((service) => service.getExternalOptions(...args));
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof JobsService>["list"]>
  ) => JobsService.use((service) => service.list(...args));
  static readonly rankNearbyJobs = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsService>["rankNearbyJobs"]
    >
  ) => JobsService.use((service) => service.rankNearbyJobs(...args));
  static readonly listOrganizationActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsService>["listOrganizationActivity"]
    >
  ) => JobsService.use((service) => service.listOrganizationActivity(...args));
  static readonly removeLabel = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsService>["removeLabel"]
    >
  ) => JobsService.use((service) => service.removeLabel(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    JobsService,
    JobsService.make
  );
  static readonly Default = JobsService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        CurrentOrganizationActor.Default,
        JobsAuthorization.Default,
        JobsActivityRecorder.Default,
        JobsRepositoriesLive,
        LabelsRepository.Default,
        RouteProximityService.Default,
        SitesRepository.Default,
        UserPreferencesRepository.Default
      )
    )
  );
}

function normalizeJobProximityFilters(
  filters: JobProximityInput["filters"] | undefined
): JobProximityFilters {
  return {
    ...filters,
    status: filters?.status ?? "active",
  };
}

function toJobListItem(job: Job): JobListItem {
  return {
    assigneeId: job.assigneeId,
    contactId: job.contactId,
    coordinatorId: job.coordinatorId,
    createdAt: job.createdAt,
    id: job.id,
    kind: job.kind,
    labels: job.labels,
    priority: job.priority,
    siteId: job.siteId,
    status: job.status,
    title: job.title,
    updatedAt: job.updatedAt,
  };
}

function failDestinationUnmapped(
  message: string
): Effect.Effect<never, ProximityRouteUnavailableError> {
  return Effect.fail(
    new ProximityRouteUnavailableError({
      message,
      reason: "destination_unmapped",
    })
  );
}

function loadJobDetailOrFail(
  organizationId: OrganizationId,
  workItemId: WorkItemId,
  jobsRepository: JobsRepositoryService,
  access?: JobsRepositoryAccess
): Effect.Effect<JobDetail, JobNotFoundError | JobStorageError> {
  return Effect.gen(function* () {
    const detail = yield* jobsRepository
      .getDetail(organizationId, workItemId, access)
      .pipe(
        Effect.catchTag("SqlError", failJobsStorageError),
        Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
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
  jobsRepository: JobsRepositoryService
): Effect.Effect<Job, JobNotFoundError | JobStorageError> {
  return loadJobDetailOrFail(organizationId, workItemId, jobsRepository).pipe(
    Effect.map((detail) => detail.job)
  );
}

function loadExternalGrantIfNeeded(
  actor: OrganizationActor,
  workItemId: WorkItemId,
  jobsRepository: JobsRepositoryService
): Effect.Effect<JobCollaborator | undefined, JobStorageError> {
  if (!isExternalOrganizationRole(actor.role)) {
    const noGrant = Option.getOrUndefined(Option.none<JobCollaborator>());
    return Effect.succeed(noGrant);
  }

  return jobsRepository
    .findUserCollaboratorGrant(actor.organizationId, workItemId, actor.userId)
    .pipe(
      Effect.catchTag("EffectDrizzleQueryError", failJobsStorageError),
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

function catchJobsStorageError<Value, Error, Requirements>(): (
  effect: Effect.Effect<Value, Error, Requirements>
) => Effect.Effect<
  Value,
  Exclude<Error, DomainDrizzleStorageFailure> | JobStorageError,
  Requirements
> {
  return ((effect: Effect.Effect<Value, Error, Requirements>) =>
    effect.pipe(
      Effect.catchIf(isDomainDrizzleStorageFailure, failJobsStorageError)
    )) as (
    effect: Effect.Effect<Value, Error, Requirements>
  ) => Effect.Effect<
    Value,
    Exclude<Error, DomainDrizzleStorageFailure> | JobStorageError,
    Requirements
  >;
}

function failActorMembershipLossOrDieOtherMember(
  error: OrganizationMemberNotFoundError,
  options: {
    readonly actor: OrganizationActor;
    readonly workItemId?: WorkItemId;
  }
): Effect.Effect<never, JobAccessDeniedError> {
  return error.userId === options.actor.userId
    ? failActorMembershipLoss(options)
    : Effect.die(error);
}

function failActorMembershipLossOrPreserveOtherMember(
  error: OrganizationMemberNotFoundError,
  options: {
    readonly actor: OrganizationActor;
    readonly workItemId?: WorkItemId;
  }
): Effect.Effect<
  never,
  OrganizationMemberNotFoundError | JobAccessDeniedError
> {
  if (error.userId === options.actor.userId) {
    return failActorMembershipLoss(options);
  }

  return Effect.fail(error);
}

function failActorMembershipLoss(options: {
  readonly workItemId?: WorkItemId;
}): Effect.Effect<never, JobAccessDeniedError> {
  return Effect.fail(
    new JobAccessDeniedError({
      message: "Your organization access changed while the request was running",
      ...(options.workItemId === undefined
        ? {}
        : { workItemId: options.workItemId }),
    })
  );
}

function dieWorkItemOrganizationMismatch(error: unknown) {
  return Effect.die(error);
}

function failWorkItemOrganizationMismatchAsNotFound(
  error: WorkItemOrganizationMismatchError
) {
  return Effect.fail(
    new JobNotFoundError({
      message: "Job does not exist",
      workItemId: error.workItemId,
    })
  );
}

function ensureCanViewOrganizationJobsData(
  actor: OrganizationActor,
  authorization: JobsAuthorizationService
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

function ensureCanViewScopedExternalJobsData(
  actor: OrganizationActor,
  authorization: JobsAuthorizationService
) {
  return Effect.gen(function* () {
    yield* authorization.ensureCanView(actor);

    if (isExternalOrganizationRole(actor.role)) {
      return;
    }

    return yield* Effect.fail(
      new JobAccessDeniedError({
        message:
          "Scoped external job options are only available to external collaborators",
      })
    );
  });
}

function makeJobsStorageError(error: unknown): JobStorageError {
  return new JobStorageError({
    cause: describeDomainStorageFailure(error),
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
    input.priority !== undefined ||
    input.siteId !== undefined ||
    input.title !== undefined
  );
}

function resolveCreateContactId(
  organizationId: OrganizationId,
  input: CreateJobContactInput | undefined,
  contactsRepository: ContactsRepositoryService
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

function resolveCreateJobSite(
  input: CreateJobSiteInput | undefined,
  siteLocationProvider: Context.Service.Shape<typeof SiteLocationProvider>
) {
  if (input === undefined) {
    return Effect.succeed({ kind: "none" } satisfies CreateJobSiteResolution);
  }

  if (input.kind === "existing") {
    return Effect.succeed({
      kind: "existing",
      siteId: input.siteId,
    } satisfies CreateJobSiteResolution);
  }

  return Effect.gen(function* () {
    const location = yield* resolveCreateSiteLocation(
      input.input.location,
      siteLocationProvider
    );

    return {
      input: input.input,
      kind: "create",
      location,
    } satisfies CreateJobSiteResolution;
  });
}

function createResolvedJobSite(
  organizationId: OrganizationId,
  resolution: CreateJobSiteResolution,
  sitesRepository: SitesRepositoryService
) {
  if (resolution.kind === "none") {
    return Effect.sync((): SiteId | undefined => undefined);
  }

  if (resolution.kind === "existing") {
    return Effect.succeed<SiteId | undefined>(resolution.siteId);
  }

  return sitesRepository.create({
    ...resolution.location,
    accessNotes: resolution.input.accessNotes,
    name: resolution.input.name,
    organizationId,
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
