import {
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
} from "@ceird/agents-core";
import type { AgentActionName } from "@ceird/agents-core";
import {
  JOB_ACCESS_DENIED_ERROR_TAG,
  JOB_NOT_FOUND_ERROR_TAG,
} from "@ceird/jobs-core";
import {
  LABEL_NAME_CONFLICT_ERROR_TAG,
  LABEL_NOT_FOUND_ERROR_TAG,
} from "@ceird/labels-core";
import { SERVICE_AREA_NOT_FOUND_ERROR_TAG } from "@ceird/sites-core";
import { Effect } from "effect";

import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "../jobs/repositories.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG } from "../organizations/errors.js";
import {
  ServiceAreasRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { getDomainAgentActionHandler } from "./action-registry.js";

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
        const handler = getDomainAgentActionHandler(name);
        const action =
          handler === undefined
            ? Effect.fail(
                new AgentActionRejectedError({
                  message: `Unsupported agent action: ${name}`,
                  name,
                })
              )
            : handler
                .execute(actor, input)
                .pipe(
                  Effect.provideService(ContactsRepository, contactsRepository),
                  Effect.provideService(
                    JobLabelAssignmentsRepository,
                    jobLabelAssignmentsRepository
                  ),
                  Effect.provideService(
                    JobsActivityRecorder,
                    jobsActivityRecorder
                  ),
                  Effect.provideService(JobsAuthorization, jobsAuthorization),
                  Effect.provideService(JobsRepository, jobsRepository),
                  Effect.provideService(LabelsRepository, labelsRepository),
                  Effect.provideService(
                    OrganizationAuthorization,
                    organizationAuthorization
                  ),
                  Effect.provideService(
                    ServiceAreasRepository,
                    serviceAreasRepository
                  ),
                  Effect.provideService(SitesRepository, sitesRepository)
                );

        return yield* action.pipe(
          Effect.mapError((error) => mapActionError(name, error))
        );
      });

      return { execute };
    }),
  }
) {}

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
    isTaggedError(error, LABEL_NOT_FOUND_ERROR_TAG) ||
    isTaggedError(error, LABEL_NAME_CONFLICT_ERROR_TAG) ||
    isTaggedError(error, SERVICE_AREA_NOT_FOUND_ERROR_TAG)
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
