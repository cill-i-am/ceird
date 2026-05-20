import { AgentActionRejectedError } from "@ceird/agents-core";
import type {
  AgentActionName,
  ExecutableAgentActionName,
} from "@ceird/agents-core";
import { CommentBodyInputSchema } from "@ceird/comments-core";
import { JobListQuerySchema, WorkItemId } from "@ceird/jobs-core";
import type {
  Job,
  JobCollaborator,
  JobListQuery,
  WorkItemIdType,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
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

type DomainAgentActionRequirements =
  | ContactsRepository
  | JobLabelAssignmentsRepository
  | JobsActivityRecorder
  | JobsAuthorization
  | JobsRepository
  | LabelsRepository
  | OrganizationAuthorization
  | ServiceAreasRepository
  | SitesRepository;

export interface DomainAgentActionHandler<
  Name extends ExecutableAgentActionName,
> {
  readonly name: Name;
  readonly execute: (
    actor: OrganizationActor,
    input: unknown
  ) => Effect.Effect<unknown, unknown, DomainAgentActionRequirements>;
}

export function defineDomainAgentAction<
  const Name extends ExecutableAgentActionName,
>(handler: DomainAgentActionHandler<Name>): DomainAgentActionHandler<Name> {
  return handler;
}

const domainAgentActions = [
  defineDomainAgentAction({
    name: "ceird.labels.list",
    execute: (actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.labels.list",
          EmptyActionInputSchema,
          input
        );
        const organizationAuthorization = yield* OrganizationAuthorization;
        const labelsRepository = yield* LabelsRepository;

        yield* organizationAuthorization.ensureCanViewOrganizationData(actor);
        const labels = yield* labelsRepository.list(actor.organizationId);

        return { labels } as const;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.options",
    execute: (actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.sites.options",
          EmptyActionInputSchema,
          input
        );
        const organizationAuthorization = yield* OrganizationAuthorization;
        const serviceAreasRepository = yield* ServiceAreasRepository;
        const sitesRepository = yield* SitesRepository;

        yield* organizationAuthorization.ensureCanViewOrganizationData(actor);
        const sites = yield* sitesRepository.listOptions(actor.organizationId);
        const serviceAreas = hasElevatedOrganizationAccess(actor)
          ? yield* serviceAreasRepository.listOptions(actor.organizationId)
          : deriveServiceAreaOptionsFromSites(sites);

        return { serviceAreas, sites } as const;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.options",
    execute: (actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.jobs.options",
          EmptyActionInputSchema,
          input
        );
        const contactsRepository = yield* ContactsRepository;
        const jobsRepository = yield* JobsRepository;
        const labelsRepository = yield* LabelsRepository;
        const organizationAuthorization = yield* OrganizationAuthorization;
        const serviceAreasRepository = yield* ServiceAreasRepository;
        const sitesRepository = yield* SitesRepository;

        yield* organizationAuthorization.ensureCanViewOrganizationData(actor);
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
          ? yield* serviceAreasRepository.listOptions(actor.organizationId)
          : deriveServiceAreaOptionsFromSites(sites);

        return {
          contacts,
          labels,
          members,
          serviceAreas,
          sites,
        } as const;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.list",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput(
          "ceird.jobs.list",
          JobListQuerySchema,
          input
        );
        const jobsAuthorization = yield* JobsAuthorization;
        const jobsRepository = yield* JobsRepository;

        yield* jobsAuthorization.ensureCanView(actor);

        return yield* jobsRepository.list(
          actor.organizationId,
          query satisfies JobListQuery,
          getRepositoryAccess(actor)
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.detail",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.detail",
          JobDetailActionInputSchema,
          input
        );
        const jobsAuthorization = yield* JobsAuthorization;
        const jobsRepository = yield* JobsRepository;
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
          "ceird.jobs.detail",
          actor,
          payload.workItemId,
          jobsRepository,
          grant
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.add_comment",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.add_comment",
          AddJobCommentActionInputSchema,
          input
        );
        const jobsAuthorization = yield* JobsAuthorization;
        const jobsRepository = yield* JobsRepository;
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
              "ceird.jobs.add_comment",
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
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.assign_label",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.assign_label",
          AssignJobLabelActionInputSchema,
          input
        );
        const jobLabelAssignmentsRepository =
          yield* JobLabelAssignmentsRepository;
        const jobsActivityRecorder = yield* JobsActivityRecorder;
        const jobsAuthorization = yield* JobsAuthorization;
        const jobsRepository = yield* JobsRepository;

        yield* jobsRepository.withTransaction(
          Effect.gen(function* () {
            const job = yield* loadJobForUpdateOrReject(
              "ceird.jobs.assign_label",
              actor,
              payload.workItemId,
              jobsRepository
            );
            yield* jobsAuthorization.ensureCanAssignLabels(actor, job);
            const assignment = yield* jobLabelAssignmentsRepository.assignToJob(
              {
                labelId: payload.labelId,
                organizationId: actor.organizationId,
                workItemId: payload.workItemId,
              }
            );

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
          "ceird.jobs.assign_label",
          actor,
          payload.workItemId,
          jobsRepository
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.remove_label",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.remove_label",
          AssignJobLabelActionInputSchema,
          input
        );
        const jobLabelAssignmentsRepository =
          yield* JobLabelAssignmentsRepository;
        const jobsActivityRecorder = yield* JobsActivityRecorder;
        const jobsAuthorization = yield* JobsAuthorization;
        const jobsRepository = yield* JobsRepository;

        yield* jobsRepository.withTransaction(
          Effect.gen(function* () {
            const job = yield* loadJobForUpdateOrReject(
              "ceird.jobs.remove_label",
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
          "ceird.jobs.remove_label",
          actor,
          payload.workItemId,
          jobsRepository
        );
      }),
  }),
] as const satisfies readonly DomainAgentActionHandler<ExecutableAgentActionName>[];

const domainAgentActionsByName = new Map<
  ExecutableAgentActionName,
  DomainAgentActionHandler<ExecutableAgentActionName>
>(domainAgentActions.map((action) => [action.name, action]));

export function getDomainAgentActionHandler(
  name: AgentActionName | ExecutableAgentActionName
): DomainAgentActionHandler<ExecutableAgentActionName> | undefined {
  return domainAgentActionsByName.get(name as ExecutableAgentActionName);
}

export function getDomainAgentActionHandlerNames(): readonly ExecutableAgentActionName[] {
  return domainAgentActions.map((action) => action.name);
}

function decodeActionInput<A, I, R>(
  actionName: ExecutableAgentActionName,
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
  actionName: ExecutableAgentActionName,
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
  actionName: ExecutableAgentActionName,
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
