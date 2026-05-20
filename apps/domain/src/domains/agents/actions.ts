import {
  AgentAccessDeniedError,
  AgentActionRejectedError,
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
} from "@ceird/jobs-core";
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
import type { HttpServerRequest } from "@effect/platform";
import { Effect, Layer } from "effect";

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

export class AgentActions extends Effect.Service<AgentActions>()(
  "@ceird/domains/agents/AgentActions",
  {
    accessors: true,
    dependencies: [
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
      SitesRepository.Default,
    ],
    effect: Effect.gen(function* AgentActionsLive() {
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
                  message: `Unsupported agent action: ${name}`,
                  name,
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
) {}

interface SitesServiceLayerDependencies {
  readonly commentsRepository: CommentsRepository;
  readonly organizationAuthorization: OrganizationAuthorization;
  readonly serviceAreasRepository: ServiceAreasRepository;
  readonly siteGeocoder: SiteGeocoderImplementation;
  readonly siteLabelAssignmentsRepository: SiteLabelAssignmentsRepository;
  readonly sitesRepository: SitesRepository;
}

interface JobsServiceLayerDependencies {
  readonly contactsRepository: ContactsRepository;
  readonly jobLabelAssignmentsRepository: JobLabelAssignmentsRepository;
  readonly jobsActivityRecorder: JobsActivityRecorder;
  readonly jobsAuthorization: JobsAuthorization;
  readonly jobsRepository: JobsRepository;
  readonly labelsRepository: LabelsRepository;
  readonly serviceAreasRepository: ServiceAreasRepository;
  readonly siteGeocoder: SiteGeocoderImplementation;
  readonly sitesRepository: SitesRepository;
}

interface ConfigurationServiceLayerDependencies {
  readonly jobsAuthorization: JobsAuthorization;
  readonly rateCardsRepository: RateCardsRepository;
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
        CurrentOrganizationActor.make({
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
        CurrentOrganizationActor.make({
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
        CurrentOrganizationActor.make({
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
      message: "Agent action storage operation failed",
      operation: "action.execute",
    });
  }

  if (isTaggedWithAny(error, REJECTED_ERROR_TAGS)) {
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
  if (typeof error === "object" && error !== null) {
    const value = (error as Record<string, unknown>)[property];

    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}
