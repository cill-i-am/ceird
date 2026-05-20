import {
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import { CommentBodyInputSchema } from "@ceird/comments-core";
import {
  JOB_ACCESS_DENIED_ERROR_TAG,
  JOB_NOT_FOUND_ERROR_TAG,
  JobListQuerySchema,
  WorkItemId,
} from "@ceird/jobs-core";
import type {
  Job,
  JobCollaborator,
  JobListQuery,
  WorkItemIdType,
} from "@ceird/jobs-core";
import { LABEL_NOT_FOUND_ERROR_TAG, LabelId } from "@ceird/labels-core";
import type { ServiceAreaOption } from "@ceird/sites-core";
import { Effect, Option, Schema } from "effect";

import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "../jobs/repositories.js";
import type { JobsRepositoryAccess } from "../jobs/repositories.js";
import { LabelsRepository } from "../labels/repositories.js";
import {
  hasElevatedOrganizationAccess,
  OrganizationAuthorization,
} from "../organizations/authorization.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG } from "../organizations/errors.js";
import {
  ServiceAreasRepository,
  SitesRepository,
} from "../sites/repositories.js";

const EmptyActionInputSchema = Schema.Struct({});
const JobDetailActionInputSchema = Schema.Struct({
  workItemId: WorkItemId,
});
const AddJobCommentActionInputSchema = Schema.Struct({
  body: CommentBodyInputSchema,
  workItemId: WorkItemId,
});
const AssignJobLabelActionInputSchema = Schema.Struct({
  labelId: LabelId,
  workItemId: WorkItemId,
});
const WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG =
  "@ceird/domains/jobs/WorkItemOrganizationMismatchError";

export class AgentActions extends Effect.Service<AgentActions>()(
  "@ceird/domains/agents/AgentActions",
  {
    accessors: true,
    dependencies: [
      ContactsRepository.Default,
      JobLabelAssignmentsRepository.Default,
      JobsActivityRecorder.Default,
      JobsAuthorization.Default,
      JobsRepository.Default,
      LabelsRepository.Default,
      OrganizationAuthorization.Default,
      ServiceAreasRepository.Default,
      SitesRepository.Default,
    ],
    effect: Effect.gen(function* AgentActionsLive() {
      const contactsRepository = yield* ContactsRepository;
      const jobLabelAssignmentsRepository =
        yield* JobLabelAssignmentsRepository;
      const jobsActivityRecorder = yield* JobsActivityRecorder;
      const jobsAuthorization = yield* JobsAuthorization;
      const jobsRepository = yield* JobsRepository;
      const labelsRepository = yield* LabelsRepository;
      const organizationAuthorization = yield* OrganizationAuthorization;
      const serviceAreasRepository = yield* ServiceAreasRepository;
      const sitesRepository = yield* SitesRepository;

      const execute = Effect.fn("AgentActions.execute")(function* (
        actor: OrganizationActor,
        name: AgentActionName,
        input: unknown
      ) {
        const action = Effect.gen(function* () {
          switch (name) {
            case "ceird.labels.list": {
              yield* decodeActionInput(name, EmptyActionInputSchema, input);
              yield* organizationAuthorization.ensureCanViewOrganizationData(
                actor
              );
              const labels = yield* labelsRepository.list(actor.organizationId);

              return { labels } as const;
            }
            case "ceird.sites.options": {
              yield* decodeActionInput(name, EmptyActionInputSchema, input);
              yield* organizationAuthorization.ensureCanViewOrganizationData(
                actor
              );
              const sites = yield* sitesRepository.listOptions(
                actor.organizationId
              );
              const serviceAreas = hasElevatedOrganizationAccess(actor)
                ? yield* serviceAreasRepository.listOptions(
                    actor.organizationId
                  )
                : deriveServiceAreaOptionsFromSites(sites);

              return { serviceAreas, sites } as const;
            }
            case "ceird.jobs.options": {
              yield* decodeActionInput(name, EmptyActionInputSchema, input);
              yield* organizationAuthorization.ensureCanViewOrganizationData(
                actor
              );
              const [contacts, labels, members, sites] = yield* Effect.all(
                [
                  contactsRepository.listOptions(actor.organizationId),
                  labelsRepository.list(actor.organizationId),
                  jobsRepository.listMemberOptions(actor.organizationId),
                  sitesRepository.listOptions(actor.organizationId),
                ],
                { concurrency: 3 }
              );
              const serviceAreas = hasElevatedOrganizationAccess(actor)
                ? yield* serviceAreasRepository.listOptions(
                    actor.organizationId
                  )
                : deriveServiceAreaOptionsFromSites(sites);

              return {
                contacts,
                labels,
                members,
                serviceAreas,
                sites,
              } as const;
            }
            case "ceird.jobs.list": {
              const query = yield* decodeActionInput(
                name,
                JobListQuerySchema,
                input
              );
              yield* jobsAuthorization.ensureCanView(actor);

              return yield* jobsRepository.list(
                actor.organizationId,
                query satisfies JobListQuery,
                getRepositoryAccess(actor)
              );
            }
            case "ceird.jobs.detail": {
              const payload = yield* decodeActionInput(
                name,
                JobDetailActionInputSchema,
                input
              );
              const grant = Option.getOrUndefined(
                yield* loadExternalGrantIfNeeded(
                  actor,
                  payload.workItemId,
                  jobsRepository
                )
              );
              yield* jobsAuthorization.ensureCanViewJobDetail(
                actor,
                payload.workItemId,
                grant
              );

              return yield* loadJobDetailOrReject(
                name,
                actor,
                payload.workItemId,
                jobsRepository,
                grant
              );
            }
            case "ceird.jobs.add_comment": {
              const payload = yield* decodeActionInput(
                name,
                AddJobCommentActionInputSchema,
                input
              );
              const grant = Option.getOrUndefined(
                yield* loadExternalGrantIfNeeded(
                  actor,
                  payload.workItemId,
                  jobsRepository
                )
              );
              yield* jobsAuthorization.ensureCanComment(
                actor,
                payload.workItemId,
                grant
              );

              return yield* jobsRepository.withTransaction(
                Effect.gen(function* () {
                  yield* loadJobForUpdateOrReject(
                    name,
                    actor,
                    payload.workItemId,
                    jobsRepository
                  );

                  return yield* jobsRepository.addComment({
                    authorUserId: actor.userId,
                    body: payload.body,
                    organizationId: actor.organizationId,
                    workItemId: payload.workItemId,
                  });
                })
              );
            }
            case "ceird.jobs.assign_label": {
              const payload = yield* decodeActionInput(
                name,
                AssignJobLabelActionInputSchema,
                input
              );

              yield* jobsRepository.withTransaction(
                Effect.gen(function* () {
                  const job = yield* loadJobForUpdateOrReject(
                    name,
                    actor,
                    payload.workItemId,
                    jobsRepository
                  );
                  yield* jobsAuthorization.ensureCanAssignLabels(actor, job);
                  const assignment =
                    yield* jobLabelAssignmentsRepository.assignToJob({
                      labelId: payload.labelId,
                      organizationId: actor.organizationId,
                      workItemId: payload.workItemId,
                    });

                  if (assignment.changed) {
                    yield* jobsActivityRecorder.recordLabelAssigned(
                      actor,
                      job,
                      assignment.label
                    );
                  }
                })
              );

              return yield* loadJobDetailOrReject(
                name,
                actor,
                payload.workItemId,
                jobsRepository
              );
            }
            case "ceird.jobs.remove_label": {
              const payload = yield* decodeActionInput(
                name,
                AssignJobLabelActionInputSchema,
                input
              );

              yield* jobsRepository.withTransaction(
                Effect.gen(function* () {
                  const job = yield* loadJobForUpdateOrReject(
                    name,
                    actor,
                    payload.workItemId,
                    jobsRepository
                  );
                  yield* jobsAuthorization.ensureCanAssignLabels(actor, job);
                  const assignment =
                    yield* jobLabelAssignmentsRepository.removeFromJob({
                      labelId: payload.labelId,
                      organizationId: actor.organizationId,
                      workItemId: payload.workItemId,
                    });

                  if (assignment.changed) {
                    yield* jobsActivityRecorder.recordLabelRemoved(
                      actor,
                      job,
                      assignment.label
                    );
                  }
                })
              );

              return yield* loadJobDetailOrReject(
                name,
                actor,
                payload.workItemId,
                jobsRepository
              );
            }
            default: {
              return yield* Effect.fail(
                new AgentActionRejectedError({
                  message: `Unsupported agent action: ${name}`,
                  name,
                })
              );
            }
          }
        });

        return yield* action.pipe(
          Effect.mapError((error) => mapActionError(name, error))
        );
      });

      return { execute };
    }),
  }
) {}

function decodeActionInput<A, I, R>(
  actionName: AgentActionName,
  schema: Schema.Schema<A, I, R>,
  input: unknown
) {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError(
      () =>
        new AgentActionRejectedError({
          message: `Invalid input for ${actionName}`,
          name: actionName,
        })
    )
  );
}

function getRepositoryAccess(
  actor: OrganizationActor,
  grant?: JobCollaborator | undefined
): JobsRepositoryAccess {
  return actor.role === "external"
    ? { grant, userId: actor.userId, visibility: "external" }
    : { visibility: "internal" };
}

function loadExternalGrantIfNeeded(
  actor: OrganizationActor,
  workItemId: WorkItemIdType,
  jobsRepository: JobsRepository
) {
  return actor.role === "external"
    ? jobsRepository.findUserCollaboratorGrant(
        actor.organizationId,
        workItemId,
        actor.userId
      )
    : Effect.succeed(Option.none<JobCollaborator>());
}

function loadJobForUpdateOrReject(
  actionName: AgentActionName,
  actor: OrganizationActor,
  workItemId: WorkItemIdType,
  jobsRepository: JobsRepository
) {
  return jobsRepository
    .findByIdForUpdate(actor.organizationId, workItemId)
    .pipe(
      Effect.map(Option.getOrUndefined),
      Effect.flatMap((job) =>
        job === undefined
          ? Effect.fail(
              new AgentActionRejectedError({
                message: "Job does not exist",
                name: actionName,
                workItemId,
              })
            )
          : Effect.succeed(job satisfies Job)
      )
    );
}

function loadJobDetailOrReject(
  actionName: AgentActionName,
  actor: OrganizationActor,
  workItemId: WorkItemIdType,
  jobsRepository: JobsRepository,
  grant?: JobCollaborator | undefined
) {
  return jobsRepository
    .getDetail(
      actor.organizationId,
      workItemId,
      getRepositoryAccess(actor, grant)
    )
    .pipe(
      Effect.map(Option.getOrUndefined),
      Effect.flatMap((detail) =>
        detail === undefined
          ? Effect.fail(
              new AgentActionRejectedError({
                message: "Job does not exist",
                name: actionName,
                workItemId,
              })
            )
          : Effect.succeed(detail)
      )
    );
}

function mapActionError(
  actionName: AgentActionName,
  error: unknown
): AgentAccessDeniedError | AgentActionRejectedError | AgentStorageError {
  if (isTaggedError(error, "SqlError")) {
    return new AgentStorageError({
      message: "Agent action storage operation failed",
      operation: "action.execute",
    });
  }

  if (
    error instanceof AgentAccessDeniedError ||
    error instanceof AgentActionRejectedError ||
    error instanceof AgentStorageError
  ) {
    return error;
  }

  if (
    isTaggedError(error, ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG) ||
    isTaggedError(error, JOB_ACCESS_DENIED_ERROR_TAG)
  ) {
    return new AgentAccessDeniedError({
      message: getStringProperty(error, "message") ?? "Agent action denied",
    });
  }

  if (
    isTaggedError(error, JOB_NOT_FOUND_ERROR_TAG) ||
    isTaggedError(error, WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG) ||
    isTaggedError(error, LABEL_NOT_FOUND_ERROR_TAG)
  ) {
    return new AgentActionRejectedError({
      message: getStringProperty(error, "message") ?? "Agent action failed",
      name: actionName,
      workItemId: getStringProperty(error, "workItemId"),
    });
  }

  return new AgentActionRejectedError({
    message: "Agent action failed",
    name: actionName,
  });
}

function isTaggedError(error: unknown, tag: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === tag
  );
}

function getStringProperty(
  error: unknown,
  property: string
): string | undefined {
  if (typeof error === "object" && error !== null) {
    const value = (error as Record<string, unknown>)[property];

    return typeof value === "string" ? value : undefined;
  }

  return undefined;
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
      site.serviceAreaId !== undefined &&
      site.serviceAreaName !== undefined
    ) {
      serviceAreasById.set(site.serviceAreaId, {
        id: site.serviceAreaId,
        name: site.serviceAreaName,
      });
    }
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
