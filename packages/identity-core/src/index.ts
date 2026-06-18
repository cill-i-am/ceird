/* oxlint-disable eslint/max-classes-per-file */
import { Schema, SchemaTransformation } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_SLUG_MAX_LENGTH = 40;
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ORGANIZATION_SLUG_PREFIX = "team";
export const RESERVED_ORGANIZATION_SLUGS = [
  "app",
  "api",
  "agent",
  "mcp",
  "sync",
] as const;
const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isIsoDateTimeString(value: string): boolean {
  return (
    ISO_DATE_TIME_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function normalizeElectricPostgresDateTimeString(value: string): string {
  if (value.includes("T")) {
    return value;
  }

  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function isIsoDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const segments = value.split("-");
  const year = Number(segments[0]);
  const month = Number(segments[1]);
  const day = Number(segments[2]);
  if (
    segments.length !== 3 ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export const OrganizationId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/OrganizationId")
);
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>;

export const UserId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/UserId")
);
export type UserId = Schema.Schema.Type<typeof UserId>;

export const ProductActorId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/identity-core/ProductActorId")
);
export type ProductActorId = Schema.Schema.Type<typeof ProductActorId>;

export const SessionId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/SessionId")
);
export type SessionId = Schema.Schema.Type<typeof SessionId>;

export const ConnectedAppGrantId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/ConnectedAppGrantId")
);
export type ConnectedAppGrantId = Schema.Schema.Type<
  typeof ConnectedAppGrantId
>;

export const OAuthClientId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/OAuthClientId")
);
export type OAuthClientId = Schema.Schema.Type<typeof OAuthClientId>;

export const InvitationId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/InvitationId")
);
export type InvitationId = Schema.Schema.Type<typeof InvitationId>;

export const IsoDateTimeString = Schema.String.pipe(
  Schema.refine((value): value is string => isIsoDateTimeString(value), {
    message: "Expected an ISO-8601 UTC datetime string",
  }),
  Schema.annotate({
    description: "ISO-8601 UTC datetime string",
  })
);
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

const ElectricPostgresDateTimeString = Schema.String.pipe(
  Schema.decodeTo(
    IsoDateTimeString,
    SchemaTransformation.transform({
      decode: normalizeElectricPostgresDateTimeString,
      encode: (value) => value,
    })
  )
);

export const IsoDateString = Schema.String.pipe(
  Schema.refine((value): value is string => isIsoDateString(value), {
    message: "Expected an ISO-8601 date string",
  }),
  Schema.annotate({
    description: "ISO-8601 date string",
  })
);
export type IsoDateString = Schema.Schema.Type<typeof IsoDateString>;

export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
  "external",
] as const;
export const INTERNAL_ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
] as const;
export const ADMINISTRATIVE_ORGANIZATION_ROLES = ["owner", "admin"] as const;
export const INVITABLE_ORGANIZATION_ROLES = [
  "admin",
  "member",
  "external",
] as const;

export const OrganizationRole = Schema.Literals(ORGANIZATION_ROLES);
export type OrganizationRole = Schema.Schema.Type<typeof OrganizationRole>;

export const AdministrativeOrganizationRole = Schema.Literals(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
export type AdministrativeOrganizationRole = Schema.Schema.Type<
  typeof AdministrativeOrganizationRole
>;

export const InternalOrganizationRole = Schema.Literals(
  INTERNAL_ORGANIZATION_ROLES
);
export type InternalOrganizationRole = Schema.Schema.Type<
  typeof InternalOrganizationRole
>;

export const InvitableOrganizationRole = Schema.Literals(
  INVITABLE_ORGANIZATION_ROLES
);
export type InvitableOrganizationRole = Schema.Schema.Type<
  typeof InvitableOrganizationRole
>;

export const PRODUCT_ACTOR_KINDS = ["member", "agent", "system"] as const;
const PRODUCT_MEMBER_ACTOR_SUMMARY_KIND = "member";
export const ProductActorKind = Schema.Literals(PRODUCT_ACTOR_KINDS);
export type ProductActorKind = Schema.Schema.Type<typeof ProductActorKind>;

export const ProductActorDisplayName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120))
);
export type ProductActorDisplayName = Schema.Schema.Type<
  typeof ProductActorDisplayName
>;

export const ProductActorDisplayDetail = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(160))
);
export type ProductActorDisplayDetail = Schema.Schema.Type<
  typeof ProductActorDisplayDetail
>;

export const ProductActorRoute = Schema.Struct({
  href: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(512))
  ),
  label: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(80))
  ),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductActorRoute = Schema.Schema.Type<typeof ProductActorRoute>;

export const ProductActorSchema = Schema.Struct({
  displayDetail: Schema.optional(ProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  id: ProductActorId,
  kind: ProductActorKind,
  route: Schema.optional(ProductActorRoute),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductActor = Schema.Schema.Type<typeof ProductActorSchema>;

export const ProductMemberActorSummarySchema = Schema.Struct({
  displayDetail: Schema.optional(ProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  id: ProductActorId,
  kind: Schema.Literal("member"),
  organizationId: OrganizationId,
  route: Schema.optional(ProductActorRoute),
  userId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductMemberActorSummary = Schema.Schema.Type<
  typeof ProductMemberActorSummarySchema
>;

const NullableProductActorDisplayDetail = Schema.NullOr(
  ProductActorDisplayDetail
);

const ProductMemberActorSummaryElectricBaseFields = {
  actorId: ProductActorId,
  createdAt: ElectricPostgresDateTimeString,
  displayDetail: Schema.optional(NullableProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  organizationId: OrganizationId,
  updatedAt: ElectricPostgresDateTimeString,
  userId: UserId,
} as const;

export const ProductMemberActorSummaryElectricRowSchema = Schema.Union([
  Schema.Struct({
    ...ProductMemberActorSummaryElectricBaseFields,
    routeHref: Schema.String,
    routeLabel: Schema.String,
  }),
  Schema.Struct({
    ...ProductMemberActorSummaryElectricBaseFields,
    routeHref: Schema.optional(Schema.Null),
    routeLabel: Schema.optional(Schema.Null),
  }),
]).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ProductMemberActorSummaryElectricRow = Schema.Schema.Type<
  typeof ProductMemberActorSummaryElectricRowSchema
>;

export function decodeProductMemberActorSummaryElectricRow(
  input: unknown
): ProductMemberActorSummary {
  const row = Schema.decodeUnknownSync(
    ProductMemberActorSummaryElectricRowSchema
  )(input);

  return Schema.decodeUnknownSync(ProductMemberActorSummarySchema)({
    displayName: row.displayName,
    id: row.actorId,
    kind: PRODUCT_MEMBER_ACTOR_SUMMARY_KIND,
    organizationId: row.organizationId,
    userId: row.userId,
    ...(row.displayDetail === null || row.displayDetail === undefined
      ? {}
      : { displayDetail: row.displayDetail }),
    ...(typeof row.routeHref === "string" && typeof row.routeLabel === "string"
      ? {
          route: {
            href: row.routeHref,
            label: row.routeLabel,
          },
        }
      : {}),
  });
}

export const OrganizationMemberRoleResponseSchema = Schema.Struct({
  role: OrganizationRole,
});
export type OrganizationMemberRoleResponse = Schema.Schema.Type<
  typeof OrganizationMemberRoleResponseSchema
>;

export const OrganizationNameSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(ORGANIZATION_NAME_MIN_LENGTH))
);

export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(2),
    Schema.isMaxLength(ORGANIZATION_SLUG_MAX_LENGTH),
    Schema.isPattern(ORGANIZATION_SLUG_PATTERN)
  ),
  Schema.refine(
    (value): value is string => !isReservedOrganizationSlug(value),
    {
      message: "Organization slug is reserved for a system host",
    }
  )
);
export type OrganizationSlug = Schema.Schema.Type<
  typeof OrganizationSlugSchema
>;

const isOrganizationSlugValue = Schema.is(OrganizationSlugSchema);

export function isOrganizationSlug(value: unknown): value is OrganizationSlug {
  return isOrganizationSlugValue(value);
}

export function decodeOrganizationSlug(input: unknown): OrganizationSlug {
  return Schema.decodeUnknownSync(OrganizationSlugSchema)(input);
}

export function isReservedOrganizationSlug(value: string): boolean {
  return (RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(value);
}

function avoidReservedOrganizationSlug(slug: string): string {
  if (!isReservedOrganizationSlug(slug)) {
    return slug;
  }

  return `${slug}-org`;
}

function createRawOrganizationSlugFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replaceAll(/['’]/g, "")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
      .replaceAll(/^-+|-+$/g, "") || DEFAULT_ORGANIZATION_SLUG_PREFIX
  );
}

export function createOrganizationSlugFromName(name: string): string {
  return avoidReservedOrganizationSlug(createRawOrganizationSlugFromName(name));
}

export function appendOrganizationSlugSuffix(
  baseSlug: string,
  suffix: string
): string {
  const suffixSlug = createRawOrganizationSlugFromName(suffix)
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH - 2)
    .replaceAll(/^-+|-+$/g, "");
  const baseMaxLength = ORGANIZATION_SLUG_MAX_LENGTH - suffixSlug.length - 1;
  const truncatedBaseSlug = createRawOrganizationSlugFromName(baseSlug)
    .slice(0, baseMaxLength)
    .replaceAll(/-+$/g, "");

  return avoidReservedOrganizationSlug(`${truncatedBaseSlug}-${suffixSlug}`);
}

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: Schema.String,
  slug: OrganizationSlugSchema,
});
export type OrganizationSummary = Schema.Schema.Type<
  typeof OrganizationSummarySchema
>;

export const OrganizationSummaryListSchema = Schema.Array(
  OrganizationSummarySchema
);
export type OrganizationSummaryList = Schema.Schema.Type<
  typeof OrganizationSummaryListSchema
>;

export const CreateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const CreateOrganizationNameInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const UserPreferencesSchema = Schema.Struct({
  routeProximityLocationEnabled: Schema.Boolean,
  updatedAt: IsoDateTimeString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type UserPreferences = Schema.Schema.Type<typeof UserPreferencesSchema>;

export const UserPreferencesResponseSchema = Schema.Struct({
  preferences: UserPreferencesSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type UserPreferencesResponse = Schema.Schema.Type<
  typeof UserPreferencesResponseSchema
>;

export const UpdateUserPreferencesInputSchema = Schema.Struct({
  routeProximityLocationEnabled: Schema.Boolean,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type UpdateUserPreferencesInput = Schema.Schema.Type<
  typeof UpdateUserPreferencesInputSchema
>;

export const USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG =
  "@ceird/identity-core/UserPreferencesAccessDeniedError" as const;
export class UserPreferencesAccessDeniedError extends Schema.TaggedErrorClass<UserPreferencesAccessDeniedError>()(
  USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export const USER_PREFERENCES_STORAGE_ERROR_TAG =
  "@ceird/identity-core/UserPreferencesStorageError" as const;
export class UserPreferencesStorageError extends Schema.TaggedErrorClass<UserPreferencesStorageError>()(
  USER_PREFERENCES_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  },
  { httpApiStatus: 503 }
) {}

export const UserPreferencesApiGroup = HttpApiGroup.make("userPreferences")
  .add(
    HttpApiEndpoint.get("getUserPreferences", "/user/preferences", {
      success: UserPreferencesResponseSchema,
      error: [UserPreferencesAccessDeniedError, UserPreferencesStorageError],
    })
  )
  .add(
    HttpApiEndpoint.patch("updateUserPreferences", "/user/preferences", {
      payload: UpdateUserPreferencesInputSchema,
      success: UserPreferencesResponseSchema,
      error: [UserPreferencesAccessDeniedError, UserPreferencesStorageError],
    })
  );

export const UserPreferencesApi = HttpApi.make("UserPreferencesApi").add(
  UserPreferencesApiGroup
);

export const CONNECTED_APP_SCOPE_GROUP_KEYS = [
  "identity",
  "read",
  "write",
  "admin",
  "offline",
  "other",
] as const;

export const ConnectedAppScopeGroupKey = Schema.Literals(
  CONNECTED_APP_SCOPE_GROUP_KEYS
);
export type ConnectedAppScopeGroupKey = Schema.Schema.Type<
  typeof ConnectedAppScopeGroupKey
>;

export const ConnectedAppScopeGroupSchema = Schema.Struct({
  key: ConnectedAppScopeGroupKey,
  label: Schema.String,
  scopes: Schema.Array(Schema.NonEmptyString),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ConnectedAppScopeGroup = Schema.Schema.Type<
  typeof ConnectedAppScopeGroupSchema
>;

export const ConnectedAppGrantContextSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("account"),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
  Schema.Struct({
    organizationId: OrganizationId,
    organizationName: Schema.String,
    type: Schema.Literal("organization"),
  }).annotate({
    parseOptions: { onExcessProperty: "error" },
  }),
]);
export type ConnectedAppGrantContext = Schema.Schema.Type<
  typeof ConnectedAppGrantContextSchema
>;

const NonNegativeInteger = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
);

export const ConnectedAppGrantActiveTokenCountSchema = NonNegativeInteger;
export type ConnectedAppGrantActiveTokenCount = Schema.Schema.Type<
  typeof ConnectedAppGrantActiveTokenCountSchema
>;

export const ConnectedAppScopeSchema = Schema.NonEmptyString;
export type ConnectedAppScope = Schema.Schema.Type<
  typeof ConnectedAppScopeSchema
>;

export const ConnectedAppGrantSchema = Schema.Struct({
  activeAccessTokenCount: ConnectedAppGrantActiveTokenCountSchema,
  activeRefreshTokenCount: ConnectedAppGrantActiveTokenCountSchema,
  clientId: OAuthClientId,
  clientName: Schema.optional(Schema.String),
  clientUri: Schema.optional(Schema.String),
  context: ConnectedAppGrantContextSchema,
  grantId: ConnectedAppGrantId,
  grantedAt: IsoDateTimeString,
  latestAccessTokenExpiresAt: Schema.optional(IsoDateTimeString),
  latestRefreshTokenExpiresAt: Schema.optional(IsoDateTimeString),
  offlineAccess: Schema.Boolean,
  policyUri: Schema.optional(Schema.String),
  redirectHosts: Schema.Array(Schema.NonEmptyString),
  scopes: Schema.Array(ConnectedAppScopeSchema),
  scopeGroups: Schema.Array(ConnectedAppScopeGroupSchema),
  tosUri: Schema.optional(Schema.String),
  updatedAt: IsoDateTimeString,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ConnectedAppGrant = Schema.Schema.Type<
  typeof ConnectedAppGrantSchema
>;

export const ConnectedAppGrantListResponseSchema = Schema.Struct({
  grants: Schema.Array(ConnectedAppGrantSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type ConnectedAppGrantListResponse = Schema.Schema.Type<
  typeof ConnectedAppGrantListResponseSchema
>;

export const DisconnectConnectedAppGrantInputSchema = Schema.Struct({
  grantId: ConnectedAppGrantId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type DisconnectConnectedAppGrantInput = Schema.Schema.Type<
  typeof DisconnectConnectedAppGrantInputSchema
>;

export const DisconnectConnectedAppGrantResponseSchema = Schema.Struct({
  disconnectedGrantId: ConnectedAppGrantId,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type DisconnectConnectedAppGrantResponse = Schema.Schema.Type<
  typeof DisconnectConnectedAppGrantResponseSchema
>;

export const CONNECTED_APP_GRANT_ACCESS_DENIED_ERROR_TAG =
  "@ceird/identity-core/ConnectedAppGrantAccessDeniedError" as const;
export class ConnectedAppGrantAccessDeniedError extends Schema.TaggedErrorClass<ConnectedAppGrantAccessDeniedError>()(
  CONNECTED_APP_GRANT_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export const CONNECTED_APP_GRANT_NOT_FOUND_ERROR_TAG =
  "@ceird/identity-core/ConnectedAppGrantNotFoundError" as const;
export class ConnectedAppGrantNotFoundError extends Schema.TaggedErrorClass<ConnectedAppGrantNotFoundError>()(
  CONNECTED_APP_GRANT_NOT_FOUND_ERROR_TAG,
  {
    grantId: ConnectedAppGrantId,
    message: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export const CONNECTED_APP_GRANT_STORAGE_ERROR_TAG =
  "@ceird/identity-core/ConnectedAppGrantStorageError" as const;
export class ConnectedAppGrantStorageError extends Schema.TaggedErrorClass<ConnectedAppGrantStorageError>()(
  CONNECTED_APP_GRANT_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  },
  { httpApiStatus: 503 }
) {}

export type CreateOrganizationInput = Schema.Schema.Type<
  typeof CreateOrganizationInputSchema
>;

export type CreateOrganizationNameInput = Schema.Schema.Type<
  typeof CreateOrganizationNameInputSchema
>;

export type UpdateOrganizationInput = Schema.Schema.Type<
  typeof UpdateOrganizationInputSchema
>;

export const PublicInvitationPreviewSchema = Schema.Struct({
  email: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
});

export type PublicInvitationPreview = Schema.Schema.Type<
  typeof PublicInvitationPreviewSchema
>;

export const ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES = [
  "organization_created",
  "organization_updated",
  "organization_invitation_created",
  "organization_invitation_resent",
  "organization_invitation_canceled",
  "organization_invitation_accepted",
  "organization_member_role_updated",
  "organization_member_removed",
] as const;

export const ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES = [
  "organization",
  "invitation",
  "member",
] as const;

export const OrganizationSecurityActivityEventId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/OrganizationSecurityActivityEventId")
);
export type OrganizationSecurityActivityEventId = Schema.Schema.Type<
  typeof OrganizationSecurityActivityEventId
>;

export const OrganizationSecurityActivityCursor = Schema.String.pipe(
  Schema.brand("@ceird/identity-core/OrganizationSecurityActivityCursor")
);
export type OrganizationSecurityActivityCursor = Schema.Schema.Type<
  typeof OrganizationSecurityActivityCursor
>;

export const OrganizationSecurityActivityEventType = Schema.Literals(
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES
);
export type OrganizationSecurityActivityEventType = Schema.Schema.Type<
  typeof OrganizationSecurityActivityEventType
>;

export const OrganizationSecurityActivityTargetType = Schema.Literals(
  ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES
);
export type OrganizationSecurityActivityTargetType = Schema.Schema.Type<
  typeof OrganizationSecurityActivityTargetType
>;

const OrganizationSecurityActivityTargetSchema = Schema.Struct({
  label: Schema.optional(Schema.String),
  memberId: Schema.optional(Schema.NonEmptyString),
  type: OrganizationSecurityActivityTargetType,
  userId: Schema.optional(UserId),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityTarget = Schema.Schema.Type<
  typeof OrganizationSecurityActivityTargetSchema
>;

export const OrganizationSecurityActivityActorSchema = Schema.Struct({
  email: Schema.String,
  id: UserId,
  name: Schema.String,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityActor = Schema.Schema.Type<
  typeof OrganizationSecurityActivityActorSchema
>;

const OrganizationSecurityActivityRoleChangeSchema = Schema.Struct({
  after: Schema.optional(OrganizationRole),
  before: Schema.optional(OrganizationRole),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityRoleChange = Schema.Schema.Type<
  typeof OrganizationSecurityActivityRoleChangeSchema
>;

export const OrganizationSecurityActivityItemSchema = Schema.Struct({
  actor: Schema.optional(OrganizationSecurityActivityActorSchema),
  createdAt: IsoDateTimeString,
  eventType: OrganizationSecurityActivityEventType,
  id: OrganizationSecurityActivityEventId,
  organizationId: OrganizationId,
  roleChange: Schema.optional(OrganizationSecurityActivityRoleChangeSchema),
  summary: Schema.String,
  target: OrganizationSecurityActivityTargetSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityItem = Schema.Schema.Type<
  typeof OrganizationSecurityActivityItemSchema
>;

const NonEmptyTrimmedString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);

export const OrganizationSecurityActivityQuerySchema = Schema.Struct({
  actorUserId: Schema.optional(UserId),
  cursor: Schema.optional(OrganizationSecurityActivityCursor),
  eventType: Schema.optional(OrganizationSecurityActivityEventType),
  fromDate: Schema.optional(IsoDateString),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(100)
      )
    )
  ),
  targetSearch: Schema.optional(NonEmptyTrimmedString),
  targetType: Schema.optional(OrganizationSecurityActivityTargetType),
  toDate: Schema.optional(IsoDateString),
});
export type OrganizationSecurityActivityQuery = Schema.Schema.Type<
  typeof OrganizationSecurityActivityQuerySchema
>;

export const OrganizationSecurityActivityListResponseSchema = Schema.Struct({
  items: Schema.Array(OrganizationSecurityActivityItemSchema),
  nextCursor: Schema.optional(OrganizationSecurityActivityCursor),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type OrganizationSecurityActivityListResponse = Schema.Schema.Type<
  typeof OrganizationSecurityActivityListResponseSchema
>;

export const ORGANIZATION_SECURITY_ACTIVITY_CURSOR_INVALID_ERROR_TAG =
  "@ceird/identity-core/OrganizationSecurityActivityCursorInvalidError" as const;
export class OrganizationSecurityActivityCursorInvalidError extends Schema.TaggedErrorClass<OrganizationSecurityActivityCursorInvalidError>()(
  ORGANIZATION_SECURITY_ACTIVITY_CURSOR_INVALID_ERROR_TAG,
  {
    cursor: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export const ORGANIZATION_SECURITY_ACTIVITY_ACCESS_DENIED_ERROR_TAG =
  "@ceird/identity-core/OrganizationSecurityActivityAccessDeniedError" as const;
export class OrganizationSecurityActivityAccessDeniedError extends Schema.TaggedErrorClass<OrganizationSecurityActivityAccessDeniedError>()(
  ORGANIZATION_SECURITY_ACTIVITY_ACCESS_DENIED_ERROR_TAG,
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export const ORGANIZATION_SECURITY_ACTIVITY_STORAGE_ERROR_TAG =
  "@ceird/identity-core/OrganizationSecurityActivityStorageError" as const;
export class OrganizationSecurityActivityStorageError extends Schema.TaggedErrorClass<OrganizationSecurityActivityStorageError>()(
  ORGANIZATION_SECURITY_ACTIVITY_STORAGE_ERROR_TAG,
  {
    cause: Schema.optional(Schema.String),
    message: Schema.String,
  },
  { httpApiStatus: 503 }
) {}

export type IdentityError =
  | ConnectedAppGrantAccessDeniedError
  | ConnectedAppGrantNotFoundError
  | ConnectedAppGrantStorageError
  | OrganizationSecurityActivityAccessDeniedError
  | OrganizationSecurityActivityCursorInvalidError
  | OrganizationSecurityActivityStorageError
  | UserPreferencesAccessDeniedError
  | UserPreferencesStorageError;

export const IdentityApiGroup = HttpApiGroup.make("identity")
  .add(
    HttpApiEndpoint.get(
      "listOrganizationSecurityActivity",
      "/organization/security/activity",
      {
        error: [
          OrganizationSecurityActivityAccessDeniedError,
          OrganizationSecurityActivityCursorInvalidError,
          OrganizationSecurityActivityStorageError,
        ],
        query: OrganizationSecurityActivityQuerySchema,
        success: OrganizationSecurityActivityListResponseSchema,
      }
    )
  )
  .add(
    HttpApiEndpoint.get("listConnectedAppGrants", "/user/connected-apps", {
      error: [
        ConnectedAppGrantAccessDeniedError,
        ConnectedAppGrantStorageError,
      ],
      success: ConnectedAppGrantListResponseSchema,
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectConnectedAppGrant",
      "/user/connected-apps/:grantId",
      {
        error: [
          ConnectedAppGrantAccessDeniedError,
          ConnectedAppGrantNotFoundError,
          ConnectedAppGrantStorageError,
        ],
        params: { grantId: ConnectedAppGrantId },
        success: DisconnectConnectedAppGrantResponseSchema,
      }
    )
  );

export const IdentityApi = HttpApi.make("IdentityApi").add(IdentityApiGroup);

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return Schema.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}

export function decodeCreateOrganizationNameInput(
  input: unknown
): CreateOrganizationNameInput {
  return Schema.decodeUnknownSync(CreateOrganizationNameInputSchema)(input);
}

export function decodeUpdateOrganizationInput(
  input: unknown
): UpdateOrganizationInput {
  return Schema.decodeUnknownSync(UpdateOrganizationInputSchema)(input);
}

export function decodeUserPreferences(input: unknown): UserPreferences {
  return Schema.decodeUnknownSync(UserPreferencesSchema)(input);
}

export function decodeUpdateUserPreferencesInput(
  input: unknown
): UpdateUserPreferencesInput {
  return Schema.decodeUnknownSync(UpdateUserPreferencesInputSchema)(input);
}

export function decodePublicInvitationPreview(
  input: unknown
): PublicInvitationPreview {
  return Schema.decodeUnknownSync(PublicInvitationPreviewSchema)(input);
}

export function decodeOrganizationId(input: unknown): OrganizationId {
  return Schema.decodeUnknownSync(OrganizationId)(input);
}

export function decodeUserId(input: unknown): UserId {
  return Schema.decodeUnknownSync(UserId)(input);
}

export function decodeSessionId(input: unknown): SessionId {
  return Schema.decodeUnknownSync(SessionId)(input);
}

export function decodeOAuthClientId(input: unknown): OAuthClientId {
  return Schema.decodeUnknownSync(OAuthClientId)(input);
}

export function decodeConnectedAppGrantListResponse(
  input: unknown
): ConnectedAppGrantListResponse {
  return Schema.decodeUnknownSync(ConnectedAppGrantListResponseSchema)(input);
}

export function decodeDisconnectConnectedAppGrantInput(
  input: unknown
): DisconnectConnectedAppGrantInput {
  return Schema.decodeUnknownSync(DisconnectConnectedAppGrantInputSchema)(
    input
  );
}

export function decodeOrganizationSecurityActivityListResponse(
  input: unknown
): OrganizationSecurityActivityListResponse {
  return Schema.decodeUnknownSync(
    OrganizationSecurityActivityListResponseSchema
  )(input);
}

export function decodeInvitationId(input: unknown): InvitationId {
  return Schema.decodeUnknownSync(InvitationId)(input);
}

export function decodeOrganizationRole(input: unknown): OrganizationRole {
  return Schema.decodeUnknownSync(OrganizationRole)(input);
}

const administrativeOrganizationRoleSet = new Set<OrganizationRole>(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
const internalOrganizationRoleSet = new Set<OrganizationRole>(
  INTERNAL_ORGANIZATION_ROLES
);

export function isAdministrativeOrganizationRole(
  role: OrganizationRole
): role is AdministrativeOrganizationRole {
  return administrativeOrganizationRoleSet.has(role);
}

export function isInternalOrganizationRole(
  role: OrganizationRole
): role is InternalOrganizationRole {
  return internalOrganizationRoleSet.has(role);
}

export function isExternalOrganizationRole(
  role: OrganizationRole
): role is "external" {
  return role === "external";
}

export function decodeOrganizationMemberRoleResponse(
  input: unknown
): OrganizationMemberRoleResponse {
  return Schema.decodeUnknownSync(OrganizationMemberRoleResponseSchema)(input);
}

export function decodeOrganizationSummary(input: unknown): OrganizationSummary {
  return Schema.decodeUnknownSync(OrganizationSummarySchema)(input);
}

export function decodeOrganizationSummaryList(
  input: unknown
): OrganizationSummaryList {
  return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(input);
}
