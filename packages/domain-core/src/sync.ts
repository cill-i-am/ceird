/* eslint-disable max-classes-per-file -- Sync API error contracts are kept together at this boundary. */

import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

const SyncOrganizationId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/OrganizationId")
);
const SyncUserId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/UserId")
);

export const SYNC_SHAPE_NAMES = [
  "agent-action-runs",
  "agent-threads",
  "comments",
  "contacts",
  "jobs",
  "labels",
  "site-comments",
  "site-contacts",
  "site-labels",
  "sites",
  "work-item-activity",
  "work-item-collaborators",
  "work-item-comments",
  "work-item-labels",
  "work-item-visits",
] as const;

export const SyncShapeNameSchema = Schema.Literals(SYNC_SHAPE_NAMES);
export type SyncShapeName = Schema.Schema.Type<typeof SyncShapeNameSchema>;

export const SyncShapeAuthorizationScopeSchema = Schema.Literals([
  "organization",
  "organization-user",
] as const);
export type SyncShapeAuthorizationScope = Schema.Schema.Type<
  typeof SyncShapeAuthorizationScopeSchema
>;

export const OrganizationSyncShapeAuthorizationParamsSchema = Schema.Struct({
  "1": SyncOrganizationId,
});
export type OrganizationSyncShapeAuthorizationParams = Schema.Schema.Type<
  typeof OrganizationSyncShapeAuthorizationParamsSchema
>;

export const OrganizationUserSyncShapeAuthorizationParamsSchema = Schema.Struct(
  {
    "1": SyncOrganizationId,
    "2": SyncUserId,
  }
);
export type OrganizationUserSyncShapeAuthorizationParams = Schema.Schema.Type<
  typeof OrganizationUserSyncShapeAuthorizationParamsSchema
>;

export const OrganizationSyncShapeAuthorizationSchema = Schema.Struct({
  organizationId: SyncOrganizationId,
  params: OrganizationSyncShapeAuthorizationParamsSchema,
  shape: SyncShapeNameSchema,
  scope: Schema.Literal("organization"),
  table: Schema.NonEmptyString,
  userId: SyncUserId,
  where: Schema.NonEmptyString,
});
export type OrganizationSyncShapeAuthorization = Schema.Schema.Type<
  typeof OrganizationSyncShapeAuthorizationSchema
>;

export const OrganizationUserSyncShapeAuthorizationSchema = Schema.Struct({
  organizationId: SyncOrganizationId,
  params: OrganizationUserSyncShapeAuthorizationParamsSchema,
  shape: SyncShapeNameSchema,
  scope: Schema.Literal("organization-user"),
  table: Schema.NonEmptyString,
  userId: SyncUserId,
  where: Schema.NonEmptyString,
});
export type OrganizationUserSyncShapeAuthorization = Schema.Schema.Type<
  typeof OrganizationUserSyncShapeAuthorizationSchema
>;

export const SyncShapeAuthorizationSchema = Schema.Union([
  OrganizationSyncShapeAuthorizationSchema,
  OrganizationUserSyncShapeAuthorizationSchema,
]);
export type SyncShapeAuthorization = Schema.Schema.Type<
  typeof SyncShapeAuthorizationSchema
>;

export const SYNC_INTERNAL_PATH_PREFIX = "/sync/internal/";

export function makeSyncShapeAuthorizationPath(shapeName: SyncShapeName) {
  return `/sync/internal/shapes/${shapeName}/authorize`;
}

export function isSyncInternalPath(pathname: string) {
  return pathname.startsWith(SYNC_INTERNAL_PATH_PREFIX);
}

export const SYNC_SHAPE_NOT_FOUND_ERROR_TAG =
  "@ceird/domain-core/SyncShapeNotFoundError" as const;
export class SyncShapeNotFoundError extends Schema.TaggedErrorClass<SyncShapeNotFoundError>()(
  SYNC_SHAPE_NOT_FOUND_ERROR_TAG,
  {
    message: Schema.String,
    shapeName: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export const SYNC_ACCESS_DENIED_ERROR_TAG =
  "@ceird/domain-core/SyncAccessDeniedError" as const;
export class SyncAccessDeniedError extends Schema.TaggedErrorClass<SyncAccessDeniedError>()(
  SYNC_ACCESS_DENIED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
    shapeName: Schema.optional(SyncShapeNameSchema),
  },
  { httpApiStatus: 403 }
) {}

export const SYNC_UNAUTHORIZED_ERROR_TAG =
  "@ceird/domain-core/SyncUnauthorizedError" as const;
export class SyncUnauthorizedError extends Schema.TaggedErrorClass<SyncUnauthorizedError>()(
  SYNC_UNAUTHORIZED_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
    shapeName: Schema.optional(SyncShapeNameSchema),
  },
  { httpApiStatus: 401 }
) {}

export const SYNC_AUTHORIZATION_STORAGE_ERROR_TAG =
  "@ceird/domain-core/SyncAuthorizationStorageError" as const;
export class SyncAuthorizationStorageError extends Schema.TaggedErrorClass<SyncAuthorizationStorageError>()(
  SYNC_AUTHORIZATION_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
    shapeName: Schema.optional(SyncShapeNameSchema),
  },
  { httpApiStatus: 503 }
) {}

export const SyncInternalApiGroup = HttpApiGroup.make("syncInternal").add(
  HttpApiEndpoint.get(
    "authorizeShape",
    "/sync/internal/shapes/:shapeName/authorize",
    {
      params: {
        shapeName: SyncShapeNameSchema,
      },
      success: SyncShapeAuthorizationSchema,
      error: [
        SyncAccessDeniedError,
        SyncAuthorizationStorageError,
        SyncShapeNotFoundError,
        SyncUnauthorizedError,
      ],
    }
  )
);
