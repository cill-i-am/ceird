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
  return <Value, Requirements>(
    effect: Effect.Effect<Value, ActorResolutionError, Requirements>
  ) =>
    effect.pipe(
      Effect.catchTags({
        [JOBS_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [JOBS_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [JOBS_ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [JOBS_SESSION_REQUIRED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
      })
    );
}

function makeAccessDenied(message: string, workItemId?: WorkItemId) {
  return new JobAccessDeniedError({
    message,
    ...(workItemId === undefined ? {} : { workItemId }),
  });
}
