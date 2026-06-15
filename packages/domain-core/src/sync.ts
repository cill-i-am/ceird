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
  "product-activity-actors",
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

export interface SyncShapeDefinition {
  readonly scope: SyncShapeAuthorizationScope;
  readonly table: string;
  readonly where: string;
}

export const ORGANIZATION_SYNC_WHERE = "organization_id = $1" as const;
export const ORGANIZATION_USER_SYNC_WHERE =
  "organization_id = $1 AND user_id = $2" as const;
export const ACTIVE_LABELS_SYNC_WHERE =
  "organization_id = $1 AND archived_at IS NULL" as const;

export const SYNC_SHAPE_AUTHORIZATION_DEFINITIONS = {
  "agent-action-runs": {
    scope: "organization-user",
    table: "agent_action_runs",
    where: ORGANIZATION_USER_SYNC_WHERE,
  },
  "agent-threads": {
    scope: "organization-user",
    table: "agent_threads",
    where: ORGANIZATION_USER_SYNC_WHERE,
  },
  comments: {
    scope: "organization",
    table: "comments",
    where: ORGANIZATION_SYNC_WHERE,
  },
  contacts: {
    scope: "organization",
    table: "contacts",
    where: ORGANIZATION_SYNC_WHERE,
  },
  jobs: {
    scope: "organization",
    table: "work_items",
    where: ORGANIZATION_SYNC_WHERE,
  },
  labels: {
    scope: "organization",
    table: "labels",
    where: ACTIVE_LABELS_SYNC_WHERE,
  },
  "product-activity-actors": {
    scope: "organization",
    table: "product_activity_actors",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "site-comments": {
    scope: "organization",
    table: "site_comments",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "site-contacts": {
    scope: "organization",
    table: "site_contacts",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "site-labels": {
    scope: "organization",
    table: "site_labels",
    where: ORGANIZATION_SYNC_WHERE,
  },
  sites: {
    scope: "organization",
    table: "sites",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "work-item-activity": {
    scope: "organization",
    table: "work_item_activity",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "work-item-collaborators": {
    scope: "organization",
    table: "work_item_collaborators",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "work-item-comments": {
    scope: "organization",
    table: "work_item_comments",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "work-item-labels": {
    scope: "organization",
    table: "work_item_labels",
    where: ORGANIZATION_SYNC_WHERE,
  },
  "work-item-visits": {
    scope: "organization",
    table: "work_item_visits",
    where: ORGANIZATION_SYNC_WHERE,
  },
} as const satisfies Record<SyncShapeName, SyncShapeDefinition>;

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

function makeOrganizationShapeAuthorizationSchema<
  const Shape extends SyncShapeName,
  const Table extends string,
  const Where extends string = typeof ORGANIZATION_SYNC_WHERE,
>(shape: Shape, table: Table, where: Where = ORGANIZATION_SYNC_WHERE as Where) {
  return Schema.Struct({
    organizationId: SyncOrganizationId,
    params: OrganizationSyncShapeAuthorizationParamsSchema,
    shape: Schema.Literal(shape),
    scope: Schema.Literal("organization"),
    table: Schema.Literal(table),
    userId: SyncUserId,
    where: Schema.Literal(where),
  });
}

function makeOrganizationUserShapeAuthorizationSchema<
  const Shape extends SyncShapeName,
  const Table extends string,
>(shape: Shape, table: Table) {
  return Schema.Struct({
    organizationId: SyncOrganizationId,
    params: OrganizationUserSyncShapeAuthorizationParamsSchema,
    shape: Schema.Literal(shape),
    scope: Schema.Literal("organization-user"),
    table: Schema.Literal(table),
    userId: SyncUserId,
    where: Schema.Literal(ORGANIZATION_USER_SYNC_WHERE),
  });
}

export const OrganizationSyncShapeAuthorizationSchema = Schema.Union([
  makeOrganizationShapeAuthorizationSchema("comments", "comments"),
  makeOrganizationShapeAuthorizationSchema("contacts", "contacts"),
  makeOrganizationShapeAuthorizationSchema("jobs", "work_items"),
  makeOrganizationShapeAuthorizationSchema(
    "labels",
    "labels",
    ACTIVE_LABELS_SYNC_WHERE
  ),
  makeOrganizationShapeAuthorizationSchema(
    "product-activity-actors",
    "product_activity_actors"
  ),
  makeOrganizationShapeAuthorizationSchema("site-comments", "site_comments"),
  makeOrganizationShapeAuthorizationSchema("site-contacts", "site_contacts"),
  makeOrganizationShapeAuthorizationSchema("site-labels", "site_labels"),
  makeOrganizationShapeAuthorizationSchema("sites", "sites"),
  makeOrganizationShapeAuthorizationSchema(
    "work-item-activity",
    "work_item_activity"
  ),
  makeOrganizationShapeAuthorizationSchema(
    "work-item-collaborators",
    "work_item_collaborators"
  ),
  makeOrganizationShapeAuthorizationSchema(
    "work-item-comments",
    "work_item_comments"
  ),
  makeOrganizationShapeAuthorizationSchema(
    "work-item-labels",
    "work_item_labels"
  ),
  makeOrganizationShapeAuthorizationSchema(
    "work-item-visits",
    "work_item_visits"
  ),
]);
export type OrganizationSyncShapeAuthorization = Schema.Schema.Type<
  typeof OrganizationSyncShapeAuthorizationSchema
>;

export const OrganizationUserSyncShapeAuthorizationSchema = Schema.Union([
  makeOrganizationUserShapeAuthorizationSchema(
    "agent-action-runs",
    "agent_action_runs"
  ),
  makeOrganizationUserShapeAuthorizationSchema(
    "agent-threads",
    "agent_threads"
  ),
]);
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
