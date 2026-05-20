import { AgentActionRejectedError } from "@ceird/agents-core";
import type {
  AgentActionName,
  ExecutableAgentActionName,
} from "@ceird/agents-core";
import {
  AddJobCommentInputSchema,
  AddJobCostLineInputSchema,
  AddJobVisitInputSchema,
  AssignJobLabelInputSchema,
  AttachJobCollaboratorInputSchema,
  CreateJobInputSchema,
  CreateRateCardInputSchema,
  JobCollaboratorId,
  JobListQuerySchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  RateCardId,
  TransitionJobInputSchema,
  UpdateJobCollaboratorInputSchema,
  UpdateRateCardInputSchema,
  WorkItemId,
} from "@ceird/jobs-core";
import {
  CreateLabelInputSchema,
  LabelId,
  UpdateLabelInputSchema,
} from "@ceird/labels-core";
import {
  AddSiteCommentInputSchema,
  AssignSiteLabelInputSchema,
  CreateSiteInputSchema,
  CreateServiceAreaInputSchema,
  ServiceAreaId,
  SiteId,
  SiteListQuerySchema,
  UpdateSiteInputSchema,
  UpdateServiceAreaInputSchema,
} from "@ceird/sites-core";
import type { HttpServerRequest } from "@effect/platform";
import { Effect, Option, Schema } from "effect";

import { ConfigurationService } from "../jobs/configuration-service.js";
import { JobsService } from "../jobs/service.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import type { SitesRepository } from "../sites/repositories.js";
import { ServiceAreasRepository } from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";

const EmptyActionInputSchema = Schema.Struct({}).annotations({
  parseOptions: { onExcessProperty: "error" },
});
const JobDetailActionInputSchema = Schema.Struct({
  workItemId: WorkItemId,
});
const PatchJobActionInputSchema = Schema.Struct({
  input: PatchJobInputSchema,
  workItemId: WorkItemId,
});
const TransitionJobActionInputSchema = Schema.Struct({
  input: TransitionJobInputSchema,
  workItemId: WorkItemId,
});
const AddJobCommentActionInputSchema = Schema.Struct({
  body: AddJobCommentInputSchema.fields.body,
  workItemId: WorkItemId,
});
const JobNestedInputSchema = <A, I, R>(inputSchema: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    input: inputSchema,
    workItemId: WorkItemId,
  });
const AssignJobLabelActionInputSchema = Schema.Struct({
  labelId: AssignJobLabelInputSchema.fields.labelId,
  workItemId: WorkItemId,
});
const UpdateJobCollaboratorActionInputSchema = Schema.Struct({
  collaboratorId: JobCollaboratorId,
  input: UpdateJobCollaboratorInputSchema,
  workItemId: WorkItemId,
});
const JobCollaboratorPathInputSchema = Schema.Struct({
  collaboratorId: JobCollaboratorId,
  workItemId: WorkItemId,
});
const LabelPathInputSchema = Schema.Struct({
  labelId: LabelId,
});
const UpdateLabelActionInputSchema = Schema.Struct({
  input: UpdateLabelInputSchema,
  labelId: LabelId,
});
const SitePathInputSchema = Schema.Struct({
  siteId: SiteId,
});
const UpdateSiteActionInputSchema = Schema.Struct({
  input: UpdateSiteInputSchema,
  siteId: SiteId,
});
const SiteCommentActionInputSchema = Schema.Struct({
  input: AddSiteCommentInputSchema,
  siteId: SiteId,
});
const SiteLabelActionInputSchema = Schema.Struct({
  input: AssignSiteLabelInputSchema,
  siteId: SiteId,
});
const RemoveSiteLabelActionInputSchema = Schema.Struct({
  labelId: LabelId,
  siteId: SiteId,
});
const UpdateServiceAreaActionInputSchema = Schema.Struct({
  input: UpdateServiceAreaInputSchema,
  serviceAreaId: ServiceAreaId,
});
const UpdateRateCardActionInputSchema = Schema.Struct({
  input: UpdateRateCardInputSchema,
  rateCardId: RateCardId,
});

type DomainAgentActionRequirements =
  | ConfigurationService
  | LabelsRepository
  | OrganizationAuthorization
  | ServiceAreasRepository
  | SitesRepository
  | JobsService
  | SitesService
  | HttpServerRequest.HttpServerRequest;

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
    name: "ceird.labels.create",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.labels.create",
          CreateLabelInputSchema,
          input
        );
        const labelsRepository = yield* LabelsRepository;
        const organizationAuthorization = yield* OrganizationAuthorization;

        yield* organizationAuthorization.ensureCanManageLabels(actor);

        return yield* labelsRepository.create({
          name: payload.name,
          organizationId: actor.organizationId,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.labels.update",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.labels.update",
          UpdateLabelActionInputSchema,
          input
        );
        const labelsRepository = yield* LabelsRepository;
        const organizationAuthorization = yield* OrganizationAuthorization;

        yield* organizationAuthorization.ensureCanManageLabels(actor);

        const label = yield* labelsRepository
          .update(actor.organizationId, payload.labelId, {
            name: payload.input.name,
          })
          .pipe(Effect.map(Option.getOrUndefined));

        if (label === undefined) {
          return yield* Effect.fail(
            new AgentActionRejectedError({
              message: "Label does not exist in the organization",
              name: "ceird.labels.update",
            })
          );
        }

        return label;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.labels.delete",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.labels.delete",
          LabelPathInputSchema,
          input
        );
        const labelsRepository = yield* LabelsRepository;
        const organizationAuthorization = yield* OrganizationAuthorization;

        yield* organizationAuthorization.ensureCanManageLabels(actor);

        const label = yield* labelsRepository
          .archive(actor.organizationId, payload.labelId)
          .pipe(Effect.map(Option.getOrUndefined));

        if (label === undefined) {
          return yield* Effect.fail(
            new AgentActionRejectedError({
              message: "Label does not exist in the organization",
              name: "ceird.labels.delete",
            })
          );
        }

        return label;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.options",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.sites.options",
          EmptyActionInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.getOptions();
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput(
          "ceird.sites.list",
          SiteListQuerySchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.list(query);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.create",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.create",
          CreateSiteInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.create(payload);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.update",
          UpdateSiteActionInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.update(payload.siteId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.comments.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.comments.list",
          SitePathInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.listComments(payload.siteId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.comments.add",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.comments.add",
          SiteCommentActionInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.addComment(payload.siteId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.assign_label",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.assign_label",
          SiteLabelActionInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.assignLabel(payload.siteId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.remove_label",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.remove_label",
          RemoveSiteLabelActionInputSchema,
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.removeLabel(payload.siteId, payload.labelId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.service_areas.list",
    execute: (actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.service_areas.list",
          EmptyActionInputSchema,
          input
        );
        const organizationAuthorization = yield* OrganizationAuthorization;
        const serviceAreasRepository = yield* ServiceAreasRepository;

        yield* organizationAuthorization.ensureCanManageConfiguration(actor);
        const serviceAreas = yield* serviceAreasRepository.list(
          actor.organizationId
        );

        return { items: serviceAreas } as const;
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.service_areas.create",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.service_areas.create",
          CreateServiceAreaInputSchema,
          input
        );
        const organizationAuthorization = yield* OrganizationAuthorization;
        const serviceAreasRepository = yield* ServiceAreasRepository;

        yield* organizationAuthorization.ensureCanManageConfiguration(actor);

        return yield* serviceAreasRepository.create({
          description: payload.description,
          name: payload.name,
          organizationId: actor.organizationId,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.service_areas.update",
    execute: (actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.service_areas.update",
          UpdateServiceAreaActionInputSchema,
          input
        );
        const organizationAuthorization = yield* OrganizationAuthorization;
        const serviceAreasRepository = yield* ServiceAreasRepository;

        yield* organizationAuthorization.ensureCanManageConfiguration(actor);

        return yield* serviceAreasRepository.update(
          actor.organizationId,
          payload.serviceAreaId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.rate_cards.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        yield* decodeStrictEmptyActionInput("ceird.rate_cards.list", input);
        const configurationService = yield* ConfigurationService;

        return yield* configurationService.listRateCards();
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.rate_cards.create",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.rate_cards.create",
          CreateRateCardInputSchema,
          input
        );
        const configurationService = yield* ConfigurationService;

        return yield* configurationService.createRateCard(payload);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.rate_cards.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.rate_cards.update",
          UpdateRateCardActionInputSchema,
          input
        );
        const configurationService = yield* ConfigurationService;

        return yield* configurationService.updateRateCard(
          payload.rateCardId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.options",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput(
          "ceird.jobs.options",
          EmptyActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.getOptions();
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput(
          "ceird.jobs.list",
          JobListQuerySchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.list(query);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.detail",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.detail",
          JobDetailActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.getDetail(payload.workItemId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.create",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.create",
          CreateJobInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.create(payload);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.update",
          PatchJobActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.patch(payload.workItemId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.transition",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.transition",
          TransitionJobActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.transition(payload.workItemId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.reopen",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.reopen",
          JobDetailActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.reopen(payload.workItemId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.activity.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput(
          "ceird.jobs.activity.list",
          OrganizationActivityQuerySchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.listOrganizationActivity(query);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.add_comment",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.add_comment",
          AddJobCommentActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.addComment(payload.workItemId, {
          body: payload.body,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.visits.add",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.visits.add",
          JobNestedInputSchema(AddJobVisitInputSchema),
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.addVisit(payload.workItemId, payload.input);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.assign_label",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.assign_label",
          AssignJobLabelActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.assignLabel(payload.workItemId, {
          labelId: payload.labelId,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.remove_label",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.remove_label",
          AssignJobLabelActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.removeLabel(
          payload.workItemId,
          payload.labelId
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.cost_lines.add",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.cost_lines.add",
          JobNestedInputSchema(AddJobCostLineInputSchema),
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.addCostLine(
          payload.workItemId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.collaborators.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.collaborators.list",
          JobDetailActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.listCollaborators(payload.workItemId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.collaborators.attach",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.collaborators.attach",
          JobNestedInputSchema(AttachJobCollaboratorInputSchema),
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.attachCollaborator(
          payload.workItemId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.collaborators.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.collaborators.update",
          UpdateJobCollaboratorActionInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.updateCollaborator(
          payload.workItemId,
          payload.collaboratorId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.collaborators.detach",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.collaborators.detach",
          JobCollaboratorPathInputSchema,
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.removeCollaborator(
          payload.workItemId,
          payload.collaboratorId
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
  return Schema.decodeUnknown(schema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      () =>
        new AgentActionRejectedError({
          message: `Invalid input for ${actionName}`,
          name: actionName,
        })
    )
  );
}

function decodeStrictEmptyActionInput(
  actionName: ExecutableAgentActionName,
  input: unknown
) {
  if (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 0
  ) {
    return Effect.void;
  }

  return Effect.fail(
    new AgentActionRejectedError({
      message: `Invalid input for ${actionName}`,
      name: actionName,
    })
  );
}
