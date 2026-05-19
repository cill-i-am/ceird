import { JobAccessDeniedError, JobStorageError } from "@ceird/jobs-core";
import type { WorkItemIdType as WorkItemId } from "@ceird/jobs-core";
import { Effect } from "effect";

import {
  ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG,
  ORGANIZATION_SESSION_REQUIRED_ERROR_TAG,
} from "../organizations/errors.js";
import type {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "../organizations/errors.js";

export type ActorResolutionError =
  | OrganizationActiveOrganizationRequiredError
  | OrganizationActorMembershipNotFoundError
  | OrganizationActorStorageError
  | OrganizationRoleNotSupportedError
  | OrganizationSessionIdentityInvalidError
  | OrganizationSessionRequiredError;

export function mapActorResolutionErrorsToAccessDenied(
  workItemId?: WorkItemId
) {
  return <Value, Requirements>(
    effect: Effect.Effect<
      Value,
      ActorResolutionError | JobStorageError,
      Requirements
    >
  ): Effect.Effect<
    Value,
    JobAccessDeniedError | JobStorageError,
    Requirements
  > =>
    effect.pipe(
      Effect.catchTags({
        [ORGANIZATION_ACTOR_STORAGE_ERROR_TAG]: (error) =>
          Effect.fail(
            new JobStorageError({
              cause: error.cause,
              message: error.message,
            })
          ),
        [ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message, workItemId)),
        [ORGANIZATION_SESSION_REQUIRED_ERROR_TAG]: (error) =>
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
