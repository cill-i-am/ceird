/* oxlint-disable eslint/max-classes-per-file */

import { OrganizationId, UserId } from "@ceird/identity-core";
import { Schema } from "effect";

export const ORGANIZATION_SESSION_REQUIRED_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationSessionRequiredError" as const;
export class OrganizationSessionRequiredError extends Schema.TaggedError<OrganizationSessionRequiredError>()(
  ORGANIZATION_SESSION_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
  }
) {}

export const ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationSessionIdentityInvalidError" as const;
export class OrganizationSessionIdentityInvalidError extends Schema.TaggedError<OrganizationSessionIdentityInvalidError>()(
  ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    field: Schema.Literal("activeOrganizationId", "userId"),
    message: Schema.String,
  }
) {}

export const ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationActiveOrganizationRequiredError" as const;
export class OrganizationActiveOrganizationRequiredError extends Schema.TaggedError<OrganizationActiveOrganizationRequiredError>()(
  ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  {
    message: Schema.String,
    userId: UserId,
  }
) {}

export const ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationActorMembershipNotFoundError" as const;
export class OrganizationActorMembershipNotFoundError extends Schema.TaggedError<OrganizationActorMembershipNotFoundError>()(
  ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  }
) {}

export const ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationRoleNotSupportedError" as const;
export class OrganizationRoleNotSupportedError extends Schema.TaggedError<OrganizationRoleNotSupportedError>()(
  ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  {
    membershipRole: Schema.String,
    message: Schema.String,
    organizationId: OrganizationId,
    userId: UserId,
  }
) {}

export const ORGANIZATION_ACTOR_STORAGE_ERROR_TAG =
  "@ceird/domains/organizations/OrganizationActorStorageError" as const;
export class OrganizationActorStorageError extends Schema.TaggedError<OrganizationActorStorageError>()(
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  }
) {}

export class OrganizationAuthorizationDeniedError extends Schema.TaggedError<OrganizationAuthorizationDeniedError>()(
  "OrganizationAuthorizationDeniedError",
  {
    message: Schema.String,
  }
) {}
