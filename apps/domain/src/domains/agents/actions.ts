import {
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentActionNameSchema,
  AgentStorageError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import {
  BLOCKED_REASON_REQUIRED_ERROR_TAG,
  CONTACT_NOT_FOUND_ERROR_TAG,
  COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG,
  INVALID_JOB_TRANSITION_ERROR_TAG,
  JOB_ACCESS_DENIED_ERROR_TAG,
  JOB_COLLABORATOR_CONFLICT_ERROR_TAG,
  JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG,
  JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG,
  JOB_LIST_CURSOR_INVALID_ERROR_TAG,
  JOB_NOT_FOUND_ERROR_TAG,
  JOB_STORAGE_ERROR_TAG,
  ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG,
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  RATE_CARD_NOT_FOUND_ERROR_TAG,
  VISIT_DURATION_INCREMENT_ERROR_TAG,
  WorkItemId,
} from "@ceird/jobs-core";
import type { WorkItemIdType } from "@ceird/jobs-core";
import {
  LABEL_NAME_CONFLICT_ERROR_TAG,
  LABEL_NOT_FOUND_ERROR_TAG,
} from "@ceird/labels-core";
import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SITE_ACCESS_DENIED_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
  SITE_GEOCODING_PROVIDER_ERROR_TAG,
  SITE_LIST_CURSOR_INVALID_ERROR_TAG,
  SITE_NOT_FOUND_ERROR_TAG,
  SITE_STORAGE_ERROR_TAG,
} from "@ceird/sites-core";
import { Context, Effect, Layer, Schema } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";

import { CommentsRepository } from "../comments/repository.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import { ConfigurationService } from "../jobs/configuration-service.js";
import { WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG } from "../jobs/errors.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
  RateCardsRepository,
} from "../jobs/repositories.js";
import { JobsService } from "../jobs/service.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG } from "../organizations/errors.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import type { SiteGeocoderImplementation } from "../sites/geocoder.js";
import {
  ServiceAreasRepository,
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";
import { getDomainAgentActionHandler } from "./action-registry.js";

const ACCESS_DENIED_ERROR_TAGS = [
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
  JOB_ACCESS_DENIED_ERROR_TAG,
  SITE_ACCESS_DENIED_ERROR_TAG,
] as const;
const STORAGE_ERROR_TAGS = [
  JOB_STORAGE_ERROR_TAG,
  SITE_STORAGE_ERROR_TAG,
  SITE_GEOCODING_PROVIDER_ERROR_TAG,
] as const;
const REJECTED_ERROR_TAGS = [
  JOB_NOT_FOUND_ERROR_TAG,
  JOB_LIST_CURSOR_INVALID_ERROR_TAG,
  ORGANIZATION_ACTIVITY_CURSOR_INVALID_ERROR_TAG,
  JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG,
  INVALID_JOB_TRANSITION_ERROR_TAG,
  BLOCKED_REASON_REQUIRED_ERROR_TAG,
  COORDINATOR_MATCHES_ASSIGNEE_ERROR_TAG,
  VISIT_DURATION_INCREMENT_ERROR_TAG,
  JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG,
  JOB_COLLABORATOR_CONFLICT_ERROR_TAG,
  CONTACT_NOT_FOUND_ERROR_TAG,
  ORGANIZATION_MEMBER_NOT_FOUND_ERROR_TAG,
  WORK_ITEM_ORGANIZATION_MISMATCH_ERROR_TAG,
  RATE_CARD_NOT_FOUND_ERROR_TAG,
  LABEL_NOT_FOUND_ERROR_TAG,
  LABEL_NAME_CONFLICT_ERROR_TAG,
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SITE_NOT_FOUND_ERROR_TAG,
  SITE_LIST_CURSOR_INVALID_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
] as const;
const isAgentActionName = Schema.is(AgentActionNameSchema);
const isWorkItemId = Schema.is(WorkItemId);

export class AgentActions extends Context.Service<AgentActions>()(
  "@ceird/domains/agents/AgentActions",
  {
    make: Effect.gen(function* AgentActionsLive() {
      const commentsRepository = yield* CommentsRepository;
      const contactsRepository = yield* ContactsRepository;
      const jobLabelAssignmentsRepository =
        yield* JobLabelAssignmentsRepository;
      const jobsActivityRecorder = yield* JobsActivityRecorder;
      const jobsAuthorization = yield* JobsAuthorization;
      const jobsRepository = yield* JobsRepository;
      const labelsRepository = yield* LabelsRepository;
      const organizationAuthorization = yield* OrganizationAuthorization;
      const rateCardsRepository = yield* RateCardsRepository;
      const serviceAreasRepository = yield* ServiceAreasRepository;
      const siteGeocoder = yield* SiteGeocoder;
      const siteLabelAssignmentsRepository =
        yield* SiteLabelAssignmentsRepository;
      const sitesRepository = yield* SitesRepository;

      const execute = Effect.fn("AgentActions.execute")(function* (
        actor: OrganizationActor,
        name: AgentActionName,
        input: unknown
      ) {
        const handler = getDomainAgentActionHandler(name);
        const action =
          handler === undefined
            ? Effect.fail(
                new AgentActionRejectedError({
                  ...(isAgentActionName(name) ? { actionName: name } : {}),
                  message: `Unsupported agent action: ${name}`,
                })
              )
            : provideActionServices(
                handler.execute(actor, input),
                name,
                actor,
                {
                  commentsRepository,
                  contactsRepository,
                  jobLabelAssignmentsRepository,
                  jobsActivityRecorder,
                  jobsAuthorization,
                  jobsRepository,
                  labelsRepository,
                  organizationAuthorization,
                  rateCardsRepository,
                  serviceAreasRepository,
                  siteGeocoder,
                  siteLabelAssignmentsRepository,
                  sitesRepository,
                }
              );

        return yield* action.pipe(
          Effect.mapError((error) => mapActionError(name, error))
        );
      });

      return { execute };
    }),
  }
) {
  static readonly execute = (
    ...args: Parameters<Context.Service.Shape<typeof AgentActions>["execute"]>
  ) => AgentActions.use((service) => service.execute(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    AgentActions,
    AgentActions.make
  );
  static readonly Default = AgentActions.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        CommentsRepository.Default,
        ContactsRepository.Default,
        JobLabelAssignmentsRepository.Default,
        JobsActivityRecorder.Default,
        JobsAuthorization.Default,
        JobsRepository.Default,
        LabelsRepository.Default,
        OrganizationAuthorization.Default,
        RateCardsRepository.Default,
        ServiceAreasRepository.Default,
        SiteLabelAssignmentsRepository.Default,
        SitesRepository.Default
      )
    )
  );
}

interface SitesServiceLayerDependencies {
  readonly commentsRepository: Context.Service.Shape<typeof CommentsRepository>;
  readonly organizationAuthorization: Context.Service.Shape<
    typeof OrganizationAuthorization
  >;
  readonly serviceAreasRepository: Context.Service.Shape<
    typeof ServiceAreasRepository
  >;
  readonly siteGeocoder: SiteGeocoderImplementation;
  readonly siteLabelAssignmentsRepository: Context.Service.Shape<
    typeof SiteLabelAssignmentsRepository
  >;
  readonly sitesRepository: Context.Service.Shape<typeof SitesRepository>;
}

interface JobsServiceLayerDependencies {
  readonly contactsRepository: Context.Service.Shape<typeof ContactsRepository>;
  readonly jobLabelAssignmentsRepository: Context.Service.Shape<
    typeof JobLabelAssignmentsRepository
  >;
  readonly jobsActivityRecorder: Context.Service.Shape<
    typeof JobsActivityRecorder
  >;
  readonly jobsAuthorization: Context.Service.Shape<typeof JobsAuthorization>;
  readonly jobsRepository: Context.Service.Shape<typeof JobsRepository>;
  readonly labelsRepository: Context.Service.Shape<typeof LabelsRepository>;
  readonly serviceAreasRepository: Context.Service.Shape<
    typeof ServiceAreasRepository
  >;
  readonly siteGeocoder: SiteGeocoderImplementation;
  readonly sitesRepository: Context.Service.Shape<typeof SitesRepository>;
}

interface ConfigurationServiceLayerDependencies {
  readonly jobsAuthorization: Context.Service.Shape<typeof JobsAuthorization>;
  readonly rateCardsRepository: Context.Service.Shape<
    typeof RateCardsRepository
  >;
}

type AgentActionRequirements =
  | ConfigurationService
  | LabelsRepository
  | OrganizationAuthorization
  | ServiceAreasRepository
  | SitesRepository
  | JobsService
  | SitesService
  | HttpServerRequest.HttpServerRequest;

type DirectAgentActionRequirements =
  | ContactsRepository
  | JobLabelAssignmentsRepository
  | JobsActivityRecorder
  | JobsAuthorization
  | JobsRepository
  | LabelsRepository
  | OrganizationAuthorization
  | RateCardsRepository
  | ServiceAreasRepository
  | SiteLabelAssignmentsRepository
  | SitesRepository
  | HttpServerRequest.HttpServerRequest;

interface ActionServiceDependencies
  extends
    SitesServiceLayerDependencies,
    JobsServiceLayerDependencies,
    ConfigurationServiceLayerDependencies {}

function provideActionServices(
  action: Effect.Effect<unknown, unknown, AgentActionRequirements>,
  name: AgentActionName,
  actor: OrganizationActor,
  dependencies: ActionServiceDependencies
): Effect.Effect<unknown, unknown, HttpServerRequest.HttpServerRequest> {
  return provideDirectActionServices(
    provideDerivedActionService(action, name, actor, dependencies),
    dependencies
  );
}

function provideDerivedActionService(
  action: Effect.Effect<unknown, unknown, AgentActionRequirements>,
  name: AgentActionName,
  actor: OrganizationActor,
  dependencies: ActionServiceDependencies
): Effect.Effect<unknown, unknown, DirectAgentActionRequirements> {
  if (name.startsWith("ceird.jobs.")) {
    return action.pipe(
      Effect.provide(makeJobsServiceLayer(actor, dependencies))
    ) as Effect.Effect<unknown, unknown, DirectAgentActionRequirements>;
  }

  if (name.startsWith("ceird.sites.")) {
    return action.pipe(
      Effect.provide(makeSitesServiceLayer(actor, dependencies))
    ) as Effect.Effect<unknown, unknown, DirectAgentActionRequirements>;
  }

  if (name.startsWith("ceird.rate_cards.")) {
    return action.pipe(
      Effect.provide(makeConfigurationServiceLayer(actor, dependencies))
    ) as Effect.Effect<unknown, unknown, DirectAgentActionRequirements>;
  }

  return action as Effect.Effect<
    unknown,
    unknown,
    DirectAgentActionRequirements
  >;
}

function provideDirectActionServices(
  action: Effect.Effect<unknown, unknown, DirectAgentActionRequirements>,
  dependencies: ActionServiceDependencies
): Effect.Effect<unknown, unknown, HttpServerRequest.HttpServerRequest> {
  return action.pipe(
    Effect.provideService(ContactsRepository, dependencies.contactsRepository),
    Effect.provideService(
      JobLabelAssignmentsRepository,
      dependencies.jobLabelAssignmentsRepository
    ),
    Effect.provideService(
      JobsActivityRecorder,
      dependencies.jobsActivityRecorder
    ),
    Effect.provideService(JobsAuthorization, dependencies.jobsAuthorization),
    Effect.provideService(JobsRepository, dependencies.jobsRepository),
    Effect.provideService(LabelsRepository, dependencies.labelsRepository),
    Effect.provideService(
      OrganizationAuthorization,
      dependencies.organizationAuthorization
    ),
    Effect.provideService(
      RateCardsRepository,
      dependencies.rateCardsRepository
    ),
    Effect.provideService(
      ServiceAreasRepository,
      dependencies.serviceAreasRepository
    ),
    Effect.provideService(
      SiteLabelAssignmentsRepository,
      dependencies.siteLabelAssignmentsRepository
    ),
    Effect.provideService(SitesRepository, dependencies.sitesRepository)
  );
}

function makeJobsServiceLayer(
  actor: OrganizationActor,
  dependencies: JobsServiceLayerDependencies
) {
  return Layer.provide(
    JobsService.DefaultWithoutDependencies,
    Layer.mergeAll(
      Layer.succeed(ContactsRepository, dependencies.contactsRepository),
      Layer.succeed(
        CurrentOrganizationActor,
        CurrentOrganizationActor.of({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(
        JobLabelAssignmentsRepository,
        dependencies.jobLabelAssignmentsRepository
      ),
      Layer.succeed(JobsActivityRecorder, dependencies.jobsActivityRecorder),
      Layer.succeed(JobsAuthorization, dependencies.jobsAuthorization),
      Layer.succeed(JobsRepository, dependencies.jobsRepository),
      Layer.succeed(LabelsRepository, dependencies.labelsRepository),
      Layer.succeed(
        ServiceAreasRepository,
        dependencies.serviceAreasRepository
      ),
      Layer.succeed(SiteGeocoder, dependencies.siteGeocoder),
      Layer.succeed(SitesRepository, dependencies.sitesRepository)
    )
  );
}

function makeSitesServiceLayer(
  actor: OrganizationActor,
  dependencies: SitesServiceLayerDependencies
) {
  return Layer.provide(
    SitesService.DefaultWithoutDependencies,
    Layer.mergeAll(
      Layer.succeed(CommentsRepository, dependencies.commentsRepository),
      Layer.succeed(
        CurrentOrganizationActor,
        CurrentOrganizationActor.of({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(
        OrganizationAuthorization,
        dependencies.organizationAuthorization
      ),
      Layer.succeed(
        ServiceAreasRepository,
        dependencies.serviceAreasRepository
      ),
      Layer.succeed(SiteGeocoder, dependencies.siteGeocoder),
      Layer.succeed(
        SiteLabelAssignmentsRepository,
        dependencies.siteLabelAssignmentsRepository
      ),
      Layer.succeed(SitesRepository, dependencies.sitesRepository)
    )
  );
}

function makeConfigurationServiceLayer(
  actor: OrganizationActor,
  dependencies: ConfigurationServiceLayerDependencies
) {
  return Layer.provide(
    ConfigurationService.DefaultWithoutDependencies,
    Layer.mergeAll(
      Layer.succeed(
        CurrentOrganizationActor,
        CurrentOrganizationActor.of({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(JobsAuthorization, dependencies.jobsAuthorization),
      Layer.succeed(RateCardsRepository, dependencies.rateCardsRepository)
    )
  );
}

function mapActionError(
  actionName: AgentActionName,
  error: unknown
): AgentAccessDeniedError | AgentActionRejectedError | AgentStorageError {
  if (isTaggedError(error, "SqlError")) {
    return new AgentStorageError({
      cause: formatUnknownCause(error),
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

  if (isTaggedWithAny(error, ACCESS_DENIED_ERROR_TAGS)) {
    return new AgentAccessDeniedError({
      message: getStringProperty(error, "message") ?? "Agent action denied",
    });
  }

  if (isTaggedWithAny(error, STORAGE_ERROR_TAGS)) {
    return new AgentStorageError({
      cause: formatUnknownCause(error),
      message: "Agent action storage operation failed",
      operation: "action.execute",
    });
  }

  if (isTaggedWithAny(error, REJECTED_ERROR_TAGS)) {
    return new AgentActionRejectedError({
      actionName,
      message: getStringProperty(error, "message") ?? "Agent action failed",
      workItemId: getWorkItemIdProperty(error, "workItemId"),
    });
  }

  return new AgentActionRejectedError({
    actionName,
    message: "Agent action failed",
  });
}

function isTaggedWithAny(error: unknown, tags: readonly string[]): boolean {
  return tags.some((tag) => isTaggedError(error, tag));
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
  const value = getUnknownProperty(error, property);

  return typeof value === "string" ? value : undefined;
}

function getWorkItemIdProperty(
  error: unknown,
  property: string
): WorkItemIdType | undefined {
  const value = getUnknownProperty(error, property);

  return isWorkItemId(value) ? value : undefined;
}

function getUnknownProperty(error: unknown, property: string): unknown {
  if (typeof error === "object" && error !== null) {
    return (error as Record<string, unknown>)[property];
  }

  return undefined;
}

function formatUnknownCause(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
