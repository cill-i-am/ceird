import { JobAccessDeniedError } from "@task-tracker/jobs-core";
import type { WorkItemIdType as WorkItemId } from "@task-tracker/jobs-core";
import { Effect } from "effect";

import {
  JOBS_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  JOBS_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  JOBS_ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  JOBS_SESSION_REQUIRED_ERROR_TAG,
} from "./errors.js";
import type {
  JobsActiveOrganizationRequiredError,
  JobsActorMembershipNotFoundError,
  JobsOrganizationRoleNotSupportedError,
  JobsSessionRequiredError,
} from "./errors.js";

export type ActorResolutionError =
  | JobsActiveOrganizationRequiredError
  | JobsActorMembershipNotFoundError
  | JobsOrganizationRoleNotSupportedError
  | JobsSessionRequiredError;

export function mapActorResolutionErrorsToAccessDenied(
  workItemId?: WorkItemId
) {
  return <Value, AdditionalError, Requirements>(
    effect: Effect.Effect<
      Value,
      ActorResolutionError | AdditionalError,
      Requirements
    >
  ): Effect.Effect<
    Value,
    JobAccessDeniedError | AdditionalError,
    Requirements
  > =>
    Effect.catchAll(
      effect,
      (error): Effect.Effect<never, JobAccessDeniedError | AdditionalError> =>
        isActorResolutionError(error)
          ? Effect.fail(makeAccessDenied(error.message, workItemId))
          : Effect.fail(error as AdditionalError)
    );
}

function makeAccessDenied(message: string, workItemId?: WorkItemId) {
  return new JobAccessDeniedError({
    message,
    ...(workItemId === undefined ? {} : { workItemId }),
  });
}

function isActorResolutionError(error: unknown): error is ActorResolutionError {
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? error._tag
      : undefined;

  switch (tag) {
    case JOBS_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG:
    case JOBS_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG:
    case JOBS_ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG:
    case JOBS_SESSION_REQUIRED_ERROR_TAG: {
      return true;
    }
    default: {
      return false;
    }
  }
}
