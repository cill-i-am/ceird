import {
  AgentActionRejectedError,
  getAgentActionInputSchema,
} from "@ceird/agents-core";
import type {
  AgentActionInput,
  AgentActionName,
  ExecutableAgentActionName,
} from "@ceird/agents-core";
import { Effect, Option, Schema } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";

import type { DomainDrizzleService } from "../../platform/database/database.js";
import { JobsService } from "../jobs/service.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import type { SitesRepository } from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";

type DomainAgentActionRequirements =
  | LabelsRepository
  | OrganizationAuthorization
  | SitesRepository
  | JobsService
  | SitesService
  | DomainDrizzleService
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
        yield* decodeActionInput("ceird.labels.list", input);
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
        const payload = yield* decodeActionInput("ceird.labels.create", input);
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
        const payload = yield* decodeActionInput("ceird.labels.update", input);
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
              actionName: "ceird.labels.update",
              message: "Label does not exist in the organization",
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
        const payload = yield* decodeActionInput("ceird.labels.delete", input);
        const labelsRepository = yield* LabelsRepository;
        const organizationAuthorization = yield* OrganizationAuthorization;

        yield* organizationAuthorization.ensureCanManageLabels(actor);

        const label = yield* labelsRepository
          .archive(actor.organizationId, payload.labelId)
          .pipe(Effect.map(Option.getOrUndefined));

        if (label === undefined) {
          return yield* Effect.fail(
            new AgentActionRejectedError({
              actionName: "ceird.labels.delete",
              message: "Label does not exist in the organization",
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
        yield* decodeActionInput("ceird.sites.options", input);
        const sitesService = yield* SitesService;

        return yield* sitesService.getOptions();
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput("ceird.sites.list", input);
        const sitesService = yield* SitesService;

        return yield* sitesService.list(query);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.proximity",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.proximity",
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.rankNearbySites({
          ...payload,
          includeRouteLines: false,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.route_preview",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.sites.route_preview",
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.getSiteRoutePreview(
          payload.siteId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.create",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.sites.create", input);
        const sitesService = yield* SitesService;

        return yield* sitesService.create(
          normalizeCreateSiteActionInput(payload),
          {
            manualLocationResolution: "google-first",
          }
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.sites.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.sites.update", input);
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
          input
        );
        const sitesService = yield* SitesService;

        return yield* sitesService.removeLabel(payload.siteId, payload.labelId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.options",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        yield* decodeActionInput("ceird.jobs.options", input);
        const jobsService = yield* JobsService;

        return yield* jobsService.getOptions();
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const query = yield* decodeActionInput("ceird.jobs.list", input);
        const jobsService = yield* JobsService;

        return yield* jobsService.list(query);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.detail",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.jobs.detail", input);
        const jobsService = yield* JobsService;

        return yield* jobsService.getDetail(payload.workItemId);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.proximity",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.jobs.proximity", input);
        const jobsService = yield* JobsService;

        return yield* jobsService.rankNearbyJobs({
          ...payload,
          includeRouteLines: false,
        });
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.route_preview",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.route_preview",
          input
        );
        const jobsService = yield* JobsService;

        return yield* jobsService.getJobRoutePreview(
          payload.workItemId,
          payload.input
        );
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.create",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.jobs.create", input);
        const jobsService = yield* JobsService;

        return yield* jobsService.create(payload);
      }),
  }),
  defineDomainAgentAction({
    name: "ceird.jobs.update",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput("ceird.jobs.update", input);
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
        const payload = yield* decodeActionInput("ceird.jobs.reopen", input);
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
    name: "ceird.jobs.collaborators.list",
    execute: (_actor, input) =>
      Effect.gen(function* () {
        const payload = yield* decodeActionInput(
          "ceird.jobs.collaborators.list",
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

const domainAgentActionsByName: ReadonlyMap<
  AgentActionName,
  DomainAgentActionHandler<ExecutableAgentActionName>
> = new Map(domainAgentActions.map((action) => [action.name, action]));

export function getDomainAgentActionHandler(
  name: AgentActionName
): DomainAgentActionHandler<ExecutableAgentActionName> | undefined {
  return domainAgentActionsByName.get(name);
}

export function getDomainAgentActionHandlerNames(): readonly ExecutableAgentActionName[] {
  return domainAgentActions.map((action) => action.name);
}

function normalizeCreateSiteActionInput(
  input: AgentActionInput<"ceird.sites.create">
) {
  if ("eircode" in input) {
    return {
      location: {
        country: "IE",
        kind: "manual",
        rawInput: input.eircode,
      },
      name: input.name,
    } as const;
  }

  return input;
}

function decodeActionInput<const Name extends ExecutableAgentActionName>(
  actionName: Name,
  input: unknown
): Effect.Effect<AgentActionInput<Name>, AgentActionRejectedError> {
  const inputSchema = getAgentActionInputSchema(actionName);

  return Schema.decodeUnknownEffect(inputSchema)(input, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (issue) =>
        new AgentActionRejectedError({
          actionName,
          cause: summarizeParseIssue(issue),
          message: `Invalid input for ${actionName}`,
        })
    )
  ) as Effect.Effect<AgentActionInput<Name>, AgentActionRejectedError>;
}

function summarizeParseIssue(issue: unknown): string {
  const tag = getParseIssueTag(issue);

  switch (tag) {
    case "Pointer": {
      const path = getParseIssuePath(issue);
      const nestedIssue = getParseIssueProperty(issue, "issue");

      return `Invalid field ${formatParseIssuePath(path)}: ${summarizeParseIssue(nestedIssue)}`;
    }
    case "Refinement":
    case "Transformation": {
      return summarizeParseIssue(getParseIssueProperty(issue, "issue"));
    }
    case "Composite": {
      return "Input failed multiple validation checks";
    }
    case "Missing": {
      return getParseIssueMessage(issue) ?? "Missing required field";
    }
    case "Unexpected": {
      return getParseIssueMessage(issue) ?? "Unexpected field";
    }
    case "Type":
    case "Forbidden": {
      return getParseIssueMessage(issue) ?? tag;
    }
    default: {
      return "Invalid input";
    }
  }
}

function getParseIssueTag(issue: unknown): string | undefined {
  return typeof issue === "object" &&
    issue !== null &&
    "_tag" in issue &&
    typeof issue._tag === "string"
    ? issue._tag
    : undefined;
}

function getParseIssueMessage(issue: unknown): string | undefined {
  const message = getParseIssueProperty(issue, "message");

  return typeof message === "string" ? message : undefined;
}

function getParseIssuePath(issue: unknown): readonly unknown[] {
  const path = getParseIssueProperty(issue, "path");

  if (Array.isArray(path)) {
    return path;
  }

  if (path === undefined) {
    return [];
  }

  return [path];
}

function getParseIssueProperty(issue: unknown, property: string): unknown {
  if (typeof issue === "object" && issue !== null) {
    return (issue as Record<string, unknown>)[property];
  }

  return undefined;
}

function formatParseIssuePath(path: readonly unknown[]): string {
  return path.map(String).join(".");
}
