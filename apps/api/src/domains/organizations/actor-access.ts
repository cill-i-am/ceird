import { Effect } from "effect";

import {
  ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG,
  ORGANIZATION_SESSION_REQUIRED_ERROR_TAG,
} from "./errors.js";
import type {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "./errors.js";

export type OrganizationActorResolutionError =
  | OrganizationActiveOrganizationRequiredError
  | OrganizationActorMembershipNotFoundError
  | OrganizationRoleNotSupportedError
  | OrganizationSessionIdentityInvalidError
  | OrganizationSessionRequiredError;

export function mapOrganizationActorResolutionErrors<AccessDeniedError>(
  makeAccessDenied: (message: string) => AccessDeniedError
) {
  return <Value, Requirements>(
    effect: Effect.Effect<
      Value,
      OrganizationActorResolutionError | OrganizationActorStorageError,
      Requirements
    >
  ): Effect.Effect<
    Value,
    AccessDeniedError | OrganizationActorStorageError,
    Requirements
  > =>
    effect.pipe(
      Effect.catchTags({
        [ORGANIZATION_ACTOR_STORAGE_ERROR_TAG]: (error) => Effect.fail(error),
        [ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message)),
        [ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message)),
        [ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message)),
        [ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message)),
        [ORGANIZATION_SESSION_REQUIRED_ERROR_TAG]: (error) =>
          Effect.fail(makeAccessDenied(error.message)),
      })
    );
}
