import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import {
  OAuthClientId,
  OrganizationId,
  OrganizationRole,
  SessionId,
  UserId,
} from "@ceird/identity-core";
import { getIp } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Option, Schema, SchemaGetter } from "effect";

import {
  OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES,
  AuthBoundaryRecordSchema,
  makeAuthBoundaryRequestEnvelope,
  maskInvitationEmail,
  readAuthBoundaryJsonOrFormRequestBody,
  readAuthBoundaryJsonRequestBody,
  sanitizeAuthFailureLogValue,
} from "./auth-boundary-utils.js";
import type {
  AuthBoundaryRecord,
  AuthEffectRuntimeContext,
  AuthenticationSessionResult,
} from "./auth-boundary-utils.js";
import {
  CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES,
  CEIRD_OAUTH_SCOPES,
} from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  AUTH_SECURITY_AUDIT_EVENT_TYPES,
  authSecurityAuditEvent as authSecurityAuditEventTable,
  invitation as invitationTable,
  member as memberTable,
  oauthAccessToken as oauthAccessTokenTable,
  oauthConsent as oauthConsentTable,
  oauthRefreshToken as oauthRefreshTokenTable,
  user as userTable,
} from "./schema.js";
import type { AuthSecurityAuditEventType } from "./schema.js";

const OAUTH_CONSENT_ENDPOINT_PATH = "/oauth2/consent";
const OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH = "/oauth2/register";
const OAUTH_TOKEN_ENDPOINT_PATH = "/oauth2/token";
const OAUTH_REVOKE_ENDPOINT_PATH = "/oauth2/revoke";
const OAUTH_CLIENT_MANAGEMENT_DISABLED_ERROR_CODE =
  "OAUTH_CLIENT_MANAGEMENT_DISABLED";
const OAUTH_CLIENT_MANAGEMENT_ENDPOINT_PATHS = new Set([
  "/oauth2/create-client",
  "/oauth2/delete-consent",
  "/oauth2/update-client",
  "/oauth2/update-consent",
  "/oauth2/delete-client",
  "/oauth2/get-consent",
  "/oauth2/get-consents",
  "/oauth2/client/rotate-secret",
  "/admin/oauth2/create-client",
  "/admin/oauth2/update-client",
]);
const ORGANIZATION_CREATE_ENDPOINT_PATH = "/organization/create";
const ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH = "/organization/invite-member";
const ORGANIZATION_UPDATE_ENDPOINT_PATH = "/organization/update";
const ORGANIZATION_ACCEPT_INVITATION_ENDPOINT_PATH =
  "/organization/accept-invitation";
const ORGANIZATION_CANCEL_INVITATION_ENDPOINT_PATH =
  "/organization/cancel-invitation";
const ORGANIZATION_SET_ACTIVE_ENDPOINT_PATH = "/organization/set-active";
const ORGANIZATION_UPDATE_MEMBER_ROLE_ENDPOINT_PATH =
  "/organization/update-member-role";
const ORGANIZATION_REMOVE_MEMBER_ENDPOINT_PATH = "/organization/remove-member";
const ORGANIZATION_AUDIT_EMAIL_MAX_LENGTH = 320;
const OAUTH_CLIENT_REGISTRATION_MAX_REDIRECT_URIS = 10;
const OAUTH_CLIENT_REGISTRATION_MAX_CONTACTS = 5;
const OAUTH_CLIENT_REGISTRATION_MAX_CLIENT_NAME_LENGTH = 120;
const OAUTH_CLIENT_REGISTRATION_MAX_URL_LENGTH = 2048;
const OAUTH_CLIENT_REGISTRATION_MAX_SCOPE_LENGTH = 512;
const OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_ID_LENGTH = 128;
const OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_VERSION_LENGTH = 64;
const OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_STATEMENT_LENGTH = 4096;
const OAUTH_CLIENT_REGISTRATION_ALLOWED_GRANT_TYPES = new Set([
  "authorization_code",
  "refresh_token",
]);
const OAUTH_CLIENT_REGISTRATION_ALLOWED_RESPONSE_TYPES = new Set(["code"]);
const OAUTH_CLIENT_REGISTRATION_REDIRECT_URI_FIELDS = new Set([
  "redirect_uris",
  "post_logout_redirect_uris",
]);
const OAUTH_CLIENT_REGISTRATION_ALLOWED_FIELDS = new Set([
  "redirect_uris",
  "scope",
  "client_name",
  "client_uri",
  "logo_uri",
  "contacts",
  "tos_uri",
  "policy_uri",
  "software_id",
  "software_version",
  "software_statement",
  "post_logout_redirect_uris",
  "token_endpoint_auth_method",
  "grant_types",
  "response_types",
  "type",
  "subject_type",
  "skip_consent",
]);
const OAuthClientRegistrationStringArraySchema = Schema.Array(Schema.String);
const OAuthClientRegistrationAllowedScopeSchema = Schema.Literals(
  CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES
);
type OAuthClientRegistrationAllowedScope = Schema.Schema.Type<
  typeof OAuthClientRegistrationAllowedScopeSchema
>;
const OAuthClientRegistrationAllowedScopesSchema = Schema.Array(
  OAuthClientRegistrationAllowedScopeSchema
);
const decodeOAuthClientRegistrationAllowedScopeOption =
  Schema.decodeUnknownOption(OAuthClientRegistrationAllowedScopeSchema);
const decodeOAuthClientRegistrationAllowedScopes = Schema.decodeUnknownSync(
  OAuthClientRegistrationAllowedScopesSchema
);
const OAuthClientRegistrationRequestBodySchema = Schema.Struct({
  client_name: Schema.optional(Schema.String),
  client_uri: Schema.optional(Schema.String),
  contacts: Schema.optional(OAuthClientRegistrationStringArraySchema),
  grant_types: Schema.optional(OAuthClientRegistrationStringArraySchema),
  logo_uri: Schema.optional(Schema.String),
  policy_uri: Schema.optional(Schema.String),
  post_logout_redirect_uris: Schema.optional(
    OAuthClientRegistrationStringArraySchema
  ),
  redirect_uris: Schema.optional(OAuthClientRegistrationStringArraySchema),
  response_types: Schema.optional(OAuthClientRegistrationStringArraySchema),
  scope: Schema.optional(Schema.String),
  skip_consent: Schema.optional(Schema.Unknown),
  software_id: Schema.optional(Schema.String),
  software_statement: Schema.optional(Schema.String),
  software_version: Schema.optional(Schema.String),
  subject_type: Schema.optional(Schema.String),
  token_endpoint_auth_method: Schema.optional(Schema.String),
  tos_uri: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
type OAuthClientRegistrationRequestBody = Schema.Schema.Type<
  typeof OAuthClientRegistrationRequestBodySchema
>;
const OAuthClientRegistrationPolicyInputSchema = Schema.Struct({
  body: OAuthClientRegistrationRequestBodySchema,
  clientName: Schema.optional(Schema.String),
  clientUri: Schema.optional(Schema.String),
  contacts: Schema.optional(OAuthClientRegistrationStringArraySchema),
  grantTypes: Schema.optional(OAuthClientRegistrationStringArraySchema),
  logoUri: Schema.optional(Schema.String),
  policyUri: Schema.optional(Schema.String),
  postLogoutRedirectUris: Schema.optional(
    OAuthClientRegistrationStringArraySchema
  ),
  redirectUris: Schema.optional(OAuthClientRegistrationStringArraySchema),
  responseTypes: Schema.optional(OAuthClientRegistrationStringArraySchema),
  scope: Schema.optional(Schema.String),
  skipConsentRequested: Schema.Boolean,
  softwareId: Schema.optional(Schema.String),
  softwareStatement: Schema.optional(Schema.String),
  softwareVersion: Schema.optional(Schema.String),
  subjectType: Schema.optional(Schema.String),
  tosUri: Schema.optional(Schema.String),
  tokenEndpointAuthMethod: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
type OAuthClientRegistrationPolicyInput = Schema.Schema.Type<
  typeof OAuthClientRegistrationPolicyInputSchema
>;
const decodeOAuthClientRegistrationRequestBody = Schema.decodeUnknownOption(
  OAuthClientRegistrationRequestBodySchema
);
const OAUTH_SECURITY_AUDIT_ENDPOINT_PATHS = new Set([
  OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH,
  OAUTH_CONSENT_ENDPOINT_PATH,
  OAUTH_TOKEN_ENDPOINT_PATH,
  OAUTH_REVOKE_ENDPOINT_PATH,
]);
const ORGANIZATION_SECURITY_AUDIT_ENDPOINT_PATHS = new Set([
  ORGANIZATION_CREATE_ENDPOINT_PATH,
  ORGANIZATION_UPDATE_ENDPOINT_PATH,
  ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH,
  ORGANIZATION_ACCEPT_INVITATION_ENDPOINT_PATH,
  ORGANIZATION_CANCEL_INVITATION_ENDPOINT_PATH,
  ORGANIZATION_UPDATE_MEMBER_ROLE_ENDPOINT_PATH,
  ORGANIZATION_REMOVE_MEMBER_ENDPOINT_PATH,
  ORGANIZATION_SET_ACTIVE_ENDPOINT_PATH,
]);
const OAUTH_SECURITY_AUDIT_MAX_SCOPES = 16;
const OAUTH_SECURITY_AUDIT_MAX_SCOPE_LENGTH = 128;
const OAuthSecurityAuditScopeSchema = Schema.Literals(CEIRD_OAUTH_SCOPES).pipe(
  Schema.brand("OAuthSecurityAuditScope")
);
type OAuthSecurityAuditScope = Schema.Schema.Type<
  typeof OAuthSecurityAuditScopeSchema
>;
const OAuthSecurityAuditScopesSchema = Schema.Array(
  OAuthSecurityAuditScopeSchema
).pipe(Schema.check(Schema.isMaxLength(OAUTH_SECURITY_AUDIT_MAX_SCOPES)));
const decodeOAuthSecurityAuditScopeOption = Schema.decodeUnknownOption(
  OAuthSecurityAuditScopeSchema
);
const OAuthAuditRequestBodySchema = Schema.Struct({
  accept: Schema.optional(Schema.Boolean),
  client_id: Schema.optional(Schema.String),
  grant_type: Schema.optional(Schema.String),
  oauth_query: Schema.optional(Schema.String),
  refresh_token: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
  token: Schema.optional(Schema.String),
  token_type_hint: Schema.optional(Schema.String),
});
type OAuthAuditRequestBody = Schema.Schema.Type<
  typeof OAuthAuditRequestBodySchema
>;
const OAuthAuditQuerySchema = Schema.Struct({
  client_id: Schema.optional(OAuthClientId),
  scope: Schema.optional(Schema.String),
});
const OAuthAuditResponseBodySchema = Schema.Struct({
  client_id: Schema.optional(OAuthClientId),
  error: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
  user_id: Schema.optional(UserId),
});
const OrganizationMemberId = Schema.NonEmptyString.pipe(
  Schema.brand("OrganizationMemberId")
);
const decodeOrganizationMemberIdOption =
  Schema.decodeUnknownOption(OrganizationMemberId);
const OrganizationAuditEmail = Schema.Trim.pipe(
  Schema.decode({
    decode: SchemaGetter.transform((value) => value.toLowerCase()),
    encode: SchemaGetter.transform((value) => value),
  }),
  Schema.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(ORGANIZATION_AUDIT_EMAIL_MAX_LENGTH),
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  ),
  Schema.brand("OrganizationAuditEmail")
);
const decodeOrganizationAuditEmailOption = Schema.decodeUnknownOption(
  OrganizationAuditEmail
);
const OrganizationMemberIdOrEmail = Schema.Union([
  OrganizationAuditEmail,
  OrganizationMemberId,
]);
const OrganizationAuditMemberSnapshotSchema = Schema.Struct({
  id: Schema.optional(OrganizationMemberId),
  organizationId: Schema.optional(OrganizationId),
  role: Schema.optional(OrganizationRole),
  userId: Schema.optional(UserId),
});
type OrganizationAuditMemberSnapshot = Schema.Schema.Type<
  typeof OrganizationAuditMemberSnapshotSchema
>;
const OrganizationGenericAuditRequestBodySchema = Schema.Struct({});
const OrganizationInviteMemberAuditRequestBodySchema = Schema.Struct({
  email: Schema.optional(OrganizationAuditEmail),
  organizationId: Schema.optional(Schema.NullOr(OrganizationId)),
  resend: Schema.optional(Schema.Boolean),
  role: Schema.optional(OrganizationRole),
});
const OrganizationSetActiveAuditRequestBodySchema = Schema.Struct({
  organizationId: Schema.optional(Schema.NullOr(OrganizationId)),
});
const OrganizationUpdateMemberRoleAuditRequestBodySchema = Schema.Struct({
  memberId: Schema.optional(OrganizationMemberId),
  organizationId: Schema.optional(OrganizationId),
  role: Schema.optional(OrganizationRole),
});
const OrganizationRemoveMemberAuditRequestBodySchema = Schema.Struct({
  memberIdOrEmail: Schema.optional(OrganizationMemberIdOrEmail),
  organizationId: Schema.optional(OrganizationId),
});
type OrganizationAuditRequestBody =
  | Schema.Schema.Type<typeof OrganizationGenericAuditRequestBodySchema>
  | Schema.Schema.Type<typeof OrganizationInviteMemberAuditRequestBodySchema>
  | Schema.Schema.Type<typeof OrganizationSetActiveAuditRequestBodySchema>
  | Schema.Schema.Type<
      typeof OrganizationUpdateMemberRoleAuditRequestBodySchema
    >
  | Schema.Schema.Type<typeof OrganizationRemoveMemberAuditRequestBodySchema>;
const OrganizationInvitationAuditResponseBodySchema = Schema.Struct({
  email: Schema.optional(OrganizationAuditEmail),
  organizationId: Schema.optional(Schema.NullOr(OrganizationId)),
  role: Schema.optional(OrganizationRole),
});
const OrganizationActiveAuditResponseBodySchema = Schema.Struct({
  id: Schema.optional(Schema.NullOr(OrganizationId)),
  organizationId: Schema.optional(Schema.NullOr(OrganizationId)),
});
const OrganizationMemberAuditResponseBodySchema = Schema.Union([
  OrganizationAuditMemberSnapshotSchema,
  Schema.Struct({
    member: OrganizationAuditMemberSnapshotSchema,
  }),
]);
const OrganizationInvitationAuditContextRowSchema = Schema.Struct({
  email: OrganizationAuditEmail,
  organizationId: OrganizationId,
  role: OrganizationRole,
});
const OrganizationMemberAuditContextRowSchema = Schema.Struct({
  id: OrganizationMemberId,
  organizationId: OrganizationId,
  role: OrganizationRole,
  userId: UserId,
});
const decodeOrganizationInvitationAuditContextRow = Schema.decodeUnknownSync(
  OrganizationInvitationAuditContextRowSchema
);
const decodeOrganizationMemberAuditContextRow = Schema.decodeUnknownSync(
  OrganizationMemberAuditContextRowSchema
);
type OrganizationInvitationAuditContextRow = Schema.Schema.Type<
  typeof OrganizationInvitationAuditContextRowSchema
>;
type OrganizationMemberAuditContextRow = Schema.Schema.Type<
  typeof OrganizationMemberAuditContextRowSchema
>;
const AuthSecurityAuditEventTypeSchema = Schema.Literals(
  AUTH_SECURITY_AUDIT_EVENT_TYPES
);
const AuthSecurityAuditEventTelemetrySchema = Schema.Struct({
  eventType: AuthSecurityAuditEventTypeSchema,
});
const AuthSecurityAuditNullableStringSchema = Schema.NullOr(Schema.String);
const AuthSecurityAuditOrganizationSourceSchema = Schema.Literals([
  "better_auth_organization_endpoint",
  "better_auth_organization_plugin",
]);
const AuthSecurityAuditTokenKindSchema = Schema.Literals([
  "access_token",
  "refresh_token",
]);
const AuthSecurityAuditTokenTypeHintSchema = Schema.NullOr(
  Schema.String.pipe(Schema.check(Schema.isMaxLength(64)))
);
const AuthSecurityAuditScopesSchema = OAuthSecurityAuditScopesSchema;
const AuthSecurityAuditCommonWriteFields = {
  actorUserId: Schema.NullOr(UserId),
  oauthClientId: Schema.NullOr(OAuthClientId),
  organizationId: Schema.NullOr(OrganizationId),
  scopes: AuthSecurityAuditScopesSchema,
  sessionId: Schema.NullOr(SessionId),
  sourceIp: AuthSecurityAuditNullableStringSchema,
  userAgent: AuthSecurityAuditNullableStringSchema,
} as const;
const OAuthClientRegistrationSucceededAuditMetadataSchema = Schema.Struct({
  dynamicRegistration: Schema.Literal(true),
  oauthError: Schema.Null,
  outcome: Schema.Literal("succeeded"),
});
const OAuthClientRegistrationRejectedAuditMetadataSchema = Schema.Struct({
  dynamicRegistration: Schema.Literal(true),
  oauthError: AuthSecurityAuditNullableStringSchema,
  outcome: Schema.Literal("rejected"),
  requestedUnknownScope: Schema.Boolean,
});
const OAuthConsentAuditMetadataSchema = Schema.Struct({
  accepted: Schema.Boolean,
  containsAdminScope: Schema.Boolean,
  containsWriteScope: Schema.Boolean,
});
const OAuthTokenRefreshedAuditMetadataSchema = Schema.Struct({
  grantType: Schema.Literal("refresh_token"),
  matchedStoredToken: Schema.Boolean,
  tokenKind: AuthSecurityAuditTokenKindSchema,
});
const OAuthTokenRevokedAuditMetadataSchema = Schema.Struct({
  matchedStoredToken: Schema.Boolean,
  tokenKind: Schema.NullOr(AuthSecurityAuditTokenKindSchema),
  tokenTypeHint: AuthSecurityAuditTokenTypeHintSchema,
});
const OrganizationAuditSucceededOutcomeSchema = Schema.Literal(
  "succeeded"
).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("succeeded")));
const OrganizationAuditMetadataSourceSchema =
  AuthSecurityAuditOrganizationSourceSchema.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed("better_auth_organization_plugin" as const)
    )
  );
const OrganizationAuditNullableRoleSchema = Schema.NullOr(OrganizationRole);
const OrganizationInvitationAuditMetadataSchema = Schema.Struct({
  invitationEmailMasked: AuthSecurityAuditNullableStringSchema,
  outcome: OrganizationAuditSucceededOutcomeSchema,
  role: OrganizationAuditNullableRoleSchema,
  source: OrganizationAuditMetadataSourceSchema,
  targetUserId: Schema.NullOr(UserId),
});
const OrganizationInvitationAcceptedAuditMetadataSchema = Schema.Struct({
  invitationEmailMasked: AuthSecurityAuditNullableStringSchema,
  memberId: AuthSecurityAuditNullableStringSchema,
  outcome: OrganizationAuditSucceededOutcomeSchema,
  role: OrganizationAuditNullableRoleSchema,
  source: OrganizationAuditMetadataSourceSchema,
  targetUserId: Schema.NullOr(UserId),
});
const OrganizationActiveChangedAuditMetadataSchema = Schema.Struct({
  activeOrganizationId: Schema.NullOr(OrganizationId),
  outcome: OrganizationAuditSucceededOutcomeSchema,
  previousOrganizationId: Schema.NullOr(OrganizationId),
  source: OrganizationAuditMetadataSourceSchema,
});
const OrganizationCreatedAuditMetadataSchema = Schema.Struct({
  memberId: OrganizationMemberId,
  outcome: OrganizationAuditSucceededOutcomeSchema,
  role: OrganizationRole,
  source: OrganizationAuditMetadataSourceSchema,
  targetUserId: UserId,
});
const OrganizationMemberRoleUpdatedAuditMetadataSchema = Schema.Struct({
  memberId: AuthSecurityAuditNullableStringSchema,
  outcome: OrganizationAuditSucceededOutcomeSchema,
  previousRole: OrganizationAuditNullableRoleSchema,
  role: OrganizationAuditNullableRoleSchema,
  source: OrganizationAuditMetadataSourceSchema,
  targetUserId: Schema.NullOr(UserId),
});
const OrganizationMemberRemovedAuditMetadataSchema = Schema.Struct({
  memberId: AuthSecurityAuditNullableStringSchema,
  outcome: OrganizationAuditSucceededOutcomeSchema,
  role: OrganizationAuditNullableRoleSchema,
  source: OrganizationAuditMetadataSourceSchema,
  targetUserId: Schema.NullOr(UserId),
});
const OrganizationUpdatedAuditMetadataSchema = Schema.Struct({
  outcome: OrganizationAuditSucceededOutcomeSchema,
  source: OrganizationAuditMetadataSourceSchema,
  updatedFields: Schema.Array(Schema.String),
});
export const AuthSecurityAuditEventWriteSchema = Schema.Union([
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("oauth_client_registration_succeeded"),
    metadata: OAuthClientRegistrationSucceededAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("oauth_client_registration_rejected"),
    metadata: OAuthClientRegistrationRejectedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literals([
      "oauth_consent_granted",
      "oauth_consent_denied",
    ]),
    metadata: OAuthConsentAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("oauth_token_refreshed"),
    metadata: OAuthTokenRefreshedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("oauth_token_revoked"),
    metadata: OAuthTokenRevokedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_created"),
    metadata: OrganizationCreatedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_updated"),
    metadata: OrganizationUpdatedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literals([
      "organization_invitation_created",
      "organization_invitation_canceled",
      "organization_invitation_resent",
    ]),
    metadata: OrganizationInvitationAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_invitation_accepted"),
    metadata: OrganizationInvitationAcceptedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_active_changed"),
    metadata: OrganizationActiveChangedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_member_role_updated"),
    metadata: OrganizationMemberRoleUpdatedAuditMetadataSchema,
  }),
  Schema.Struct({
    ...AuthSecurityAuditCommonWriteFields,
    eventType: Schema.Literal("organization_member_removed"),
    metadata: OrganizationMemberRemovedAuditMetadataSchema,
  }),
]);
export type AuthSecurityAuditEventWrite = Schema.Schema.Type<
  typeof AuthSecurityAuditEventWriteSchema
>;
const OrganizationSecurityAuditNoOAuthScopesSchema = Schema.Tuple([]);
function makeOrganizationSecurityAuditCommonInputFields(defaults: {
  readonly sessionId: SessionId | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}) {
  return {
    actorUserId: Schema.NullOr(UserId),
    oauthClientId: Schema.Null.pipe(
      Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
    ),
    organizationId: Schema.NullOr(OrganizationId),
    scopes: OrganizationSecurityAuditNoOAuthScopesSchema.pipe(
      Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
    ),
    sessionId: Schema.NullOr(SessionId).pipe(
      Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.sessionId))
    ),
    sourceIp: AuthSecurityAuditNullableStringSchema.pipe(
      Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.sourceIp))
    ),
    userAgent: AuthSecurityAuditNullableStringSchema.pipe(
      Schema.withDecodingDefaultTypeKey(Effect.succeed(defaults.userAgent))
    ),
  } as const;
}
function makeOrganizationSecurityAuditEventInputSchema(defaults: {
  readonly sessionId: SessionId | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}) {
  const commonFields = makeOrganizationSecurityAuditCommonInputFields(defaults);

  return Schema.Union([
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_created"),
      metadata: OrganizationCreatedAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_updated"),
      metadata: OrganizationUpdatedAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literals([
        "organization_invitation_created",
        "organization_invitation_canceled",
        "organization_invitation_resent",
      ]),
      metadata: OrganizationInvitationAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_invitation_accepted"),
      metadata: OrganizationInvitationAcceptedAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_active_changed"),
      metadata: OrganizationActiveChangedAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_member_role_updated"),
      metadata: OrganizationMemberRoleUpdatedAuditMetadataSchema,
    }),
    Schema.Struct({
      ...commonFields,
      eventType: Schema.Literal("organization_member_removed"),
      metadata: OrganizationMemberRemovedAuditMetadataSchema,
    }),
  ]);
}
interface OrganizationSecurityAuditRequestContext {
  readonly session: AuthenticationSessionResult | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}

const organizationSecurityAuditRequestContext =
  new AsyncLocalStorage<OrganizationSecurityAuditRequestContext>();

export async function recordOrganizationSecurityAuditEvent(
  options: AuthSecurityAuditEventWriterOptions,
  input: unknown
) {
  const requestContext = organizationSecurityAuditRequestContext.getStore();
  const decodeOrganizationSecurityAuditEventInput = Schema.decodeUnknownSync(
    makeOrganizationSecurityAuditEventInputSchema({
      sessionId: requestContext?.session?.session.id ?? null,
      sourceIp: requestContext?.sourceIp ?? null,
      userAgent: requestContext?.userAgent ?? null,
    })
  );

  try {
    await writeAuthSecurityAuditEvent(
      options,
      decodeOrganizationSecurityAuditEventInput(input)
    );
  } catch (error) {
    await reportAuthSecurityAuditWriteFailure(
      resolveAuthSecurityAuditEventInputTypeForTelemetry(input),
      error,
      options.runtimeContext ?? Context.empty()
    );
  }
}

export function makeOrganizationInvitationAuditMetadata(input: {
  readonly email?: string | null | undefined;
  readonly role?: string | null | undefined;
  readonly targetUserId?: string | null | undefined;
}) {
  return {
    invitationEmailMasked: input.email
      ? maskInvitationEmail(input.email)
      : null,
    role: input.role ?? null,
    targetUserId: input.targetUserId ?? null,
  };
}

export function makeOrganizationMemberAuditMetadata(input: {
  readonly memberId?: string | null | undefined;
  readonly previousRole?: string | null | undefined;
  readonly role?: string | null | undefined;
  readonly targetUserId?: string | null | undefined;
}) {
  return {
    memberId: input.memberId ?? null,
    previousRole: input.previousRole ?? null,
    role: input.role ?? null,
    targetUserId: input.targetUserId ?? null,
  };
}

export function hashOAuthStoredToken(token: string, _type: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function withOAuthClientManagementEndpointGuard(
  handler: (request: Request) => Promise<Response>,
  basePath: string
) {
  return (request: Request) => {
    const { endpointPath } = makeAuthBoundaryRequestEnvelope(request, basePath);

    if (!OAUTH_CLIENT_MANAGEMENT_ENDPOINT_PATHS.has(endpointPath)) {
      return handler(request);
    }

    return Promise.resolve(
      Response.json(
        {
          code: OAUTH_CLIENT_MANAGEMENT_DISABLED_ERROR_CODE,
          message: "OAuth management is handled by Ceird workflows.",
        },
        {
          status: 403,
        }
      )
    );
  };
}

export function withOAuthRefreshTokenConsentGuard(
  handler: (request: Request) => Promise<Response>,
  options: {
    readonly basePath: string;
    readonly database: NodePgDatabase;
    readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
  }
) {
  return async (request: Request) => {
    const { endpointPath, method } = makeAuthBoundaryRequestEnvelope(
      request,
      options.basePath
    );

    if (method !== "POST" || endpointPath !== OAUTH_TOKEN_ENDPOINT_PATH) {
      return await handler(request);
    }

    const body = await readOAuthRefreshTokenConsentGuardRequestBody(request);

    if (body.status === "uninspectable") {
      return makeOAuthTokenErrorResponse({
        error: "invalid_request",
        errorDescription: "OAuth token request could not be inspected.",
        status: 400,
      });
    }

    if (body.value.grant_type !== "refresh_token") {
      return await handler(request);
    }

    const refreshToken = body.value.refresh_token;

    if (!refreshToken) {
      return await handler(request);
    }

    try {
      const hasActiveConsent = await refreshTokenHasActiveOAuthConsent(
        options.database,
        refreshToken
      );

      if (hasActiveConsent === false) {
        return makeOAuthTokenErrorResponse({
          error: "invalid_grant",
          errorDescription: "Refresh token consent is no longer active.",
          status: 400,
        });
      }
    } catch (error) {
      await reportOAuthRefreshTokenConsentGuardFailure(
        error,
        options.runtimeContext ?? Context.empty()
      );

      return makeOAuthTokenErrorResponse({
        error: "server_error",
        errorDescription: "Refresh token consent could not be verified.",
        status: 503,
      });
    }

    return await handler(request);
  };
}

type OAuthRefreshTokenConsentGuardRequestBody =
  | {
      readonly status: "inspectable";
      readonly value: OAuthAuditRequestBody;
    }
  | {
      readonly status: "uninspectable";
    };

async function readOAuthRefreshTokenConsentGuardRequestBody(
  request: Request
): Promise<OAuthRefreshTokenConsentGuardRequestBody> {
  const body = await readAuthBoundaryJsonOrFormRequestBody(
    request,
    OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES,
    OAuthAuditRequestBodySchema,
    {
      allowEmptyUnsupportedContentType: false,
      rejectDuplicateFormFields: ["grant_type", "refresh_token"],
    }
  );

  if (body.status === "unavailable") {
    return { status: "uninspectable" };
  }

  return { status: "inspectable", value: body.body ?? {} };
}

const OAuthRefreshTokenConsentGuardRowSchema = Schema.Struct({
  consentScopes: Schema.NullOr(OAuthSecurityAuditScopesSchema),
  refreshTokenScopes: OAuthSecurityAuditScopesSchema,
});
type OAuthRefreshTokenConsentGuardRow = Schema.Schema.Type<
  typeof OAuthRefreshTokenConsentGuardRowSchema
>;
const decodeOAuthRefreshTokenConsentGuardRow = Schema.decodeUnknownSync(
  OAuthRefreshTokenConsentGuardRowSchema
);

async function refreshTokenHasActiveOAuthConsent(
  database: NodePgDatabase,
  refreshToken: string
): Promise<boolean | null> {
  const storedToken = await hashOAuthStoredToken(refreshToken, "refresh_token");
  const rows = await database
    .select({
      consentScopes: oauthConsentTable.scopes,
      refreshTokenScopes: oauthRefreshTokenTable.scopes,
    })
    .from(oauthRefreshTokenTable)
    .leftJoin(
      oauthConsentTable,
      and(
        eq(oauthConsentTable.userId, oauthRefreshTokenTable.userId),
        eq(oauthConsentTable.clientId, oauthRefreshTokenTable.clientId),
        sql`${oauthConsentTable.referenceId} is not distinct from ${oauthRefreshTokenTable.referenceId}`
      )
    )
    .where(eq(oauthRefreshTokenTable.token, storedToken))
    .limit(1);
  const [rawRow] = rows;

  if (rawRow === undefined) {
    return null;
  }

  let row: OAuthRefreshTokenConsentGuardRow;
  try {
    row = decodeOAuthRefreshTokenConsentGuardRow(rawRow);
  } catch {
    throw new Error("OAuth refresh token consent row schema decode failed.");
  }

  const { consentScopes } = row;

  return (
    consentScopes !== null &&
    row.refreshTokenScopes.every((scope) => consentScopes.includes(scope))
  );
}

function makeOAuthTokenErrorResponse(options: {
  readonly error: "invalid_grant" | "invalid_request" | "server_error";
  readonly errorDescription: string;
  readonly status: 400 | 503;
}) {
  return Response.json(
    {
      error: options.error,
      error_description: options.errorDescription,
    },
    {
      status: options.status,
    }
  );
}

interface AuthSecurityAuditEventWriterOptions {
  readonly database: NodePgDatabase;
  readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
}

interface OAuthSecurityAuditEventRecorderOptions extends AuthSecurityAuditEventWriterOptions {
  readonly authConfig: Pick<AuthenticationConfig, "advanced" | "basePath">;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
}

interface OrganizationSecurityAuditEventRecorderOptions extends AuthSecurityAuditEventWriterOptions {
  readonly authConfig: Pick<AuthenticationConfig, "advanced" | "basePath">;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
}

interface OAuthSecurityAuditRequestSnapshot {
  readonly body: OAuthAuditRequestBody | null;
  readonly endpointPath: string;
  readonly sourceIp: string | null;
  readonly tokenContext?: OAuthSecurityAuditTokenContext | null | undefined;
  readonly userAgent: string | null;
}
const OAuthSecurityAuditTokenContextSchema = Schema.Struct({
  clientId: OAuthClientId,
  organizationId: Schema.NullOr(OrganizationId),
  scopes: OAuthSecurityAuditScopesSchema,
  sessionId: Schema.NullOr(SessionId),
  tokenKind: AuthSecurityAuditTokenKindSchema,
  userId: Schema.NullOr(UserId),
});
type OAuthSecurityAuditTokenContext = Schema.Schema.Type<
  typeof OAuthSecurityAuditTokenContextSchema
>;
const OAuthSecurityAuditTokenContextRowSchema = Schema.Struct({
  clientId: OAuthClientId,
  referenceId: Schema.NullOr(OrganizationId),
  scopes: OAuthSecurityAuditScopesSchema,
  sessionId: Schema.NullOr(SessionId),
  userId: Schema.NullOr(UserId),
});
const decodeOAuthSecurityAuditTokenContextRow = Schema.decodeUnknownSync(
  OAuthSecurityAuditTokenContextRowSchema
);
const decodeOAuthSecurityAuditTokenContext = Schema.decodeUnknownSync(
  OAuthSecurityAuditTokenContextSchema
);

function makeOAuthSecurityAuditTokenContext(
  row: unknown,
  tokenKind: "access_token" | "refresh_token"
) {
  let decodedRow: Schema.Schema.Type<
    typeof OAuthSecurityAuditTokenContextRowSchema
  >;

  try {
    decodedRow = decodeOAuthSecurityAuditTokenContextRow(row);
  } catch {
    throw new Error("OAuth token audit context row schema decode failed.");
  }

  return decodeOAuthSecurityAuditTokenContext({
    clientId: decodedRow.clientId,
    organizationId: decodedRow.referenceId,
    scopes: decodedRow.scopes,
    sessionId: decodedRow.sessionId,
    tokenKind,
    userId: decodedRow.userId,
  });
}

function resolveAuthenticationSessionAuditContext(
  session: AuthenticationSessionResult | null
) {
  if (session === null) {
    return {
      activeOrganizationId: null,
      actorUserId: null,
      sessionId: null,
    };
  }

  return {
    activeOrganizationId: session.session.activeOrganizationId,
    actorUserId: session.user.id,
    sessionId: session.session.id,
  };
}

function resolveOAuthTokenAuditContext(
  snapshot: OAuthSecurityAuditRequestSnapshot,
  fallbackScopes: readonly OAuthSecurityAuditScope[]
) {
  const tokenContext = snapshot.tokenContext ?? null;

  return {
    actorUserId: tokenContext?.userId ?? null,
    oauthClientId: tokenContext?.clientId ?? snapshot.body?.client_id ?? null,
    organizationId: tokenContext?.organizationId ?? null,
    scopes: tokenContext?.scopes ?? fallbackScopes,
    sessionId: tokenContext?.sessionId ?? null,
  };
}

export function withOAuthSecurityAuditEventRecorder(
  handler: (request: Request) => Promise<Response>,
  options: OAuthSecurityAuditEventRecorderOptions
) {
  return async (request: Request) => {
    const snapshot = await makeOAuthSecurityAuditRequestSnapshot(
      request,
      options
    );

    if (snapshot === null) {
      return handler(request);
    }

    const response = await handler(request);

    await recordOAuthSecurityAuditEventForResponse({
      options,
      request,
      response,
      snapshot,
    });

    return response;
  };
}

interface OrganizationSecurityAuditRequestSnapshot {
  readonly body: OrganizationAuditRequestBody | null;
  readonly endpointPath: string;
  readonly invitationBefore: OrganizationInvitationAuditContextRow | null;
  readonly memberBefore?: OrganizationMemberAuditContextRow | null | undefined;
  readonly session: AuthenticationSessionResult | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}

export function withOrganizationSecurityAuditEventRecorder(
  handler: (request: Request) => Promise<Response>,
  options: OrganizationSecurityAuditEventRecorderOptions
) {
  return async (request: Request) => {
    const snapshot = await makeOrganizationSecurityAuditRequestSnapshot(
      request,
      options
    );

    if (snapshot === null) {
      return handler(request);
    }

    return organizationSecurityAuditRequestContext.run(
      {
        session: snapshot.session,
        sourceIp: snapshot.sourceIp,
        userAgent: snapshot.userAgent,
      },
      async () => {
        const response = await handler(request);

        await recordOrganizationSecurityAuditEventForResponse({
          options,
          response,
          snapshot,
        });

        return response;
      }
    );
  };
}

async function makeOrganizationSecurityAuditRequestSnapshot(
  request: Request,
  options: OrganizationSecurityAuditEventRecorderOptions
): Promise<OrganizationSecurityAuditRequestSnapshot | null> {
  const { endpointPath, method } = makeAuthBoundaryRequestEnvelope(
    request,
    options.authConfig.basePath
  );

  if (
    method !== "POST" ||
    !ORGANIZATION_SECURITY_AUDIT_ENDPOINT_PATHS.has(endpointPath)
  ) {
    return null;
  }

  const body = await readOrganizationSecurityAuditRequestBody(
    request,
    endpointPath
  );
  const session = await resolveOrganizationSecurityAuditSession(
    request,
    options
  );

  return {
    body,
    endpointPath,
    invitationBefore: await resolveOrganizationInvitationResendAuditContext({
      body,
      database: options.database,
      endpointPath,
      runtimeContext: options.runtimeContext ?? Context.empty(),
      session,
    }),
    memberBefore: await resolveOrganizationMemberAuditContext({
      body,
      database: options.database,
      runtimeContext: options.runtimeContext ?? Context.empty(),
    }),
    session,
    sourceIp: getIp(request, {
      advanced: options.authConfig.advanced,
    }),
    userAgent: request.headers.get("user-agent"),
  };
}

async function resolveOrganizationInvitationResendAuditContext(options: {
  readonly body: OrganizationAuditRequestBody | null;
  readonly database: NodePgDatabase;
  readonly endpointPath: string;
  readonly runtimeContext: AuthEffectRuntimeContext;
  readonly session: AuthenticationSessionResult | null;
}) {
  try {
    if (
      options.endpointPath !== ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH ||
      !organizationAuditBodyHasResend(options.body) ||
      options.session === null
    ) {
      return null;
    }

    const email = organizationAuditBodyEmail(options.body);
    const organizationId =
      organizationAuditBodyOrganizationId(options.body) ??
      options.session.session.activeOrganizationId ??
      null;

    if (email === null || organizationId === null) {
      return null;
    }

    return await findOrganizationInvitationAuditContext(options.database, {
      email,
      organizationId,
    });
  } catch (error) {
    await reportAuthSecurityAuditOrganizationContextFailure(
      ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH,
      error,
      options.runtimeContext
    );
    return null;
  }
}

async function findOrganizationInvitationAuditContext(
  database: NodePgDatabase,
  options: {
    readonly email: Schema.Schema.Type<typeof OrganizationAuditEmail>;
    readonly organizationId: Schema.Schema.Type<typeof OrganizationId>;
  }
) {
  const [row] = await database
    .select({
      email: invitationTable.email,
      organizationId: invitationTable.organizationId,
      role: invitationTable.role,
    })
    .from(invitationTable)
    .where(
      and(
        eq(invitationTable.email, options.email),
        eq(invitationTable.organizationId, options.organizationId),
        eq(invitationTable.status, "pending"),
        gt(invitationTable.expiresAt, new Date())
      )
    )
    .limit(1);

  return row === undefined
    ? null
    : decodeOrganizationInvitationAuditContextRow(row);
}

async function resolveOrganizationMemberAuditContext(options: {
  readonly body: OrganizationAuditRequestBody | null;
  readonly database: NodePgDatabase;
  readonly runtimeContext: AuthEffectRuntimeContext;
}) {
  const lookup = resolveOrganizationMemberAuditLookup(options.body);

  if (lookup === null) {
    return null;
  }

  try {
    return lookup.kind === "memberId"
      ? await findOrganizationMemberAuditContextById(
          options.database,
          lookup.memberId
        )
      : await findOrganizationMemberAuditContextByEmail(options.database, {
          email: lookup.email,
          organizationId: lookup.organizationId,
        });
  } catch (error) {
    await reportAuthSecurityAuditOrganizationContextFailure(
      "organization_member",
      error,
      options.runtimeContext
    );
    return null;
  }
}

async function findOrganizationMemberAuditContextById(
  database: NodePgDatabase,
  memberId: Schema.Schema.Type<typeof OrganizationMemberId>
) {
  const [row] = await database
    .select({
      id: memberTable.id,
      organizationId: memberTable.organizationId,
      role: memberTable.role,
      userId: memberTable.userId,
    })
    .from(memberTable)
    .where(eq(memberTable.id, memberId))
    .limit(1);

  return row === undefined
    ? null
    : decodeOrganizationMemberAuditContextRow(row);
}

async function findOrganizationMemberAuditContextByEmail(
  database: NodePgDatabase,
  options: {
    readonly email: Schema.Schema.Type<typeof OrganizationAuditEmail>;
    readonly organizationId: Schema.Schema.Type<typeof OrganizationId>;
  }
) {
  const [row] = await database
    .select({
      id: memberTable.id,
      organizationId: memberTable.organizationId,
      role: memberTable.role,
      userId: memberTable.userId,
    })
    .from(memberTable)
    .innerJoin(userTable, eq(memberTable.userId, userTable.id))
    .where(
      and(
        eq(memberTable.organizationId, options.organizationId),
        eq(userTable.email, options.email)
      )
    )
    .limit(1);

  return row === undefined
    ? null
    : decodeOrganizationMemberAuditContextRow(row);
}

async function resolveOrganizationSecurityAuditSession(
  request: Request,
  options: OrganizationSecurityAuditEventRecorderOptions
) {
  if (!options.resolveSession) {
    return null;
  }

  try {
    return await options.resolveSession(request);
  } catch (error) {
    await reportAuthSecurityAuditSessionResolutionFailure(
      error,
      options.runtimeContext ?? Context.empty()
    );
    return null;
  }
}

async function recordOrganizationSecurityAuditEventForResponse(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  if (options.response.status < 200 || options.response.status >= 300) {
    return;
  }

  switch (options.snapshot.endpointPath) {
    case ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH: {
      await recordOrganizationInvitationResentSecurityAuditEvent(options);
      break;
    }
    case ORGANIZATION_SET_ACTIVE_ENDPOINT_PATH: {
      await recordOrganizationActiveChangedSecurityAuditEvent(options);
      break;
    }
    case ORGANIZATION_UPDATE_MEMBER_ROLE_ENDPOINT_PATH: {
      await recordOrganizationMemberRoleUpdatedSecurityAuditEvent(options);
      break;
    }
    case ORGANIZATION_REMOVE_MEMBER_ENDPOINT_PATH: {
      await recordOrganizationMemberRemovedSecurityAuditEvent(options);
      break;
    }
    default: {
      break;
    }
  }
}

async function recordOrganizationInvitationResentSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  if (!organizationAuditBodyHasResend(options.snapshot.body)) {
    return;
  }

  if (options.snapshot.invitationBefore === null) {
    return;
  }

  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OrganizationInvitationAuditResponseBodySchema
  );

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id ?? null,
    eventType: "organization_invitation_resent",
    metadata: {
      ...makeOrganizationInvitationAuditMetadata({
        email: responseBody?.email ?? options.snapshot.invitationBefore.email,
        role: responseBody?.role ?? options.snapshot.invitationBefore.role,
      }),
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      responseBody?.organizationId ??
      options.snapshot.invitationBefore.organizationId ??
      options.snapshot.session?.session.activeOrganizationId ??
      null,
    sessionId: options.snapshot.session?.session.id ?? null,
    sourceIp: options.snapshot.sourceIp ?? null,
    userAgent: options.snapshot.userAgent ?? null,
  });
}

async function recordOrganizationActiveChangedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OrganizationActiveAuditResponseBodySchema
  );
  const previousOrganizationId =
    options.snapshot.session?.session.activeOrganizationId ?? null;
  const activeOrganizationId =
    responseBody?.id ??
    resolveRequestedActiveOrganizationId(
      options.snapshot.body,
      previousOrganizationId
    );

  if (activeOrganizationId === previousOrganizationId) {
    return;
  }

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id ?? null,
    eventType: "organization_active_changed",
    metadata: {
      activeOrganizationId,
      previousOrganizationId,
      source: "better_auth_organization_endpoint",
    },
    organizationId: activeOrganizationId ?? previousOrganizationId,
    sessionId: options.snapshot.session?.session.id ?? null,
    sourceIp: options.snapshot.sourceIp ?? null,
    userAgent: options.snapshot.userAgent ?? null,
  });
}

function resolveRequestedActiveOrganizationId(
  body: OrganizationAuditRequestBody | null,
  previousOrganizationId: string | null
) {
  if (body !== null && Object.hasOwn(body, "organizationId")) {
    return organizationAuditBodyOrganizationId(body);
  }

  return previousOrganizationId;
}

function organizationAuditBodyHasResend(
  body: OrganizationAuditRequestBody | null
) {
  return body !== null && "resend" in body && body.resend === true;
}

function organizationAuditBodyEmail(body: OrganizationAuditRequestBody | null) {
  return body !== null && "email" in body ? (body.email ?? null) : null;
}

function organizationAuditBodyOrganizationId(
  body: OrganizationAuditRequestBody | null
) {
  return body !== null && "organizationId" in body
    ? (body.organizationId ?? null)
    : null;
}

function organizationAuditBodyMemberId(
  body: OrganizationAuditRequestBody | null
) {
  return body !== null && "memberId" in body ? (body.memberId ?? null) : null;
}

function organizationAuditBodyMemberIdOrEmail(
  body: OrganizationAuditRequestBody | null
) {
  return body !== null && "memberIdOrEmail" in body
    ? (body.memberIdOrEmail ?? null)
    : null;
}

function resolveOrganizationMemberAuditLookup(
  body: OrganizationAuditRequestBody | null
):
  | {
      readonly kind: "memberId";
      readonly memberId: Schema.Schema.Type<typeof OrganizationMemberId>;
    }
  | {
      readonly email: Schema.Schema.Type<typeof OrganizationAuditEmail>;
      readonly kind: "email";
      readonly organizationId: Schema.Schema.Type<typeof OrganizationId>;
    }
  | null {
  const memberId = organizationAuditBodyMemberId(body);

  if (memberId !== null) {
    return { kind: "memberId", memberId };
  }

  const memberIdOrEmail = organizationAuditBodyMemberIdOrEmail(body);

  if (memberIdOrEmail === null) {
    return null;
  }

  const email = Option.getOrNull(
    decodeOrganizationAuditEmailOption(memberIdOrEmail)
  );

  if (email === null) {
    const decodedMemberId = Option.getOrNull(
      decodeOrganizationMemberIdOption(memberIdOrEmail)
    );

    return decodedMemberId === null
      ? null
      : { kind: "memberId", memberId: decodedMemberId };
  }

  const organizationId = organizationAuditBodyOrganizationId(body);

  return organizationId === null
    ? null
    : { email, kind: "email", organizationId };
}

function resolveOrganizationMemberAuditResponseBody(
  responseBody: Schema.Schema.Type<
    typeof OrganizationMemberAuditResponseBodySchema
  > | null
): OrganizationAuditMemberSnapshot | null {
  if (responseBody === null) {
    return null;
  }

  return "member" in responseBody ? responseBody.member : responseBody;
}

async function recordOrganizationMemberRoleUpdatedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OrganizationMemberAuditResponseBodySchema
  );
  const member = resolveOrganizationMemberAuditResponseBody(responseBody);
  const memberId =
    member?.id ?? organizationAuditBodyMemberId(options.snapshot.body);
  const sessionAuditContext = resolveAuthenticationSessionAuditContext(
    options.snapshot.session
  );
  const organizationId =
    member?.organizationId ??
    options.snapshot.memberBefore?.organizationId ??
    sessionAuditContext.activeOrganizationId;

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: sessionAuditContext.actorUserId,
    eventType: "organization_member_role_updated",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId,
        previousRole: options.snapshot.memberBefore?.role,
        role: member?.role,
        targetUserId: member?.userId ?? options.snapshot.memberBefore?.userId,
      }),
      source: "better_auth_organization_endpoint",
    },
    organizationId: organizationId ?? null,
    sessionId: sessionAuditContext.sessionId,
    sourceIp: options.snapshot.sourceIp ?? null,
    userAgent: options.snapshot.userAgent ?? null,
  });
}

async function recordOrganizationMemberRemovedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OrganizationMemberAuditResponseBodySchema
  );
  const member =
    resolveOrganizationMemberAuditResponseBody(responseBody) ??
    options.snapshot.memberBefore ??
    null;
  const sessionAuditContext = resolveAuthenticationSessionAuditContext(
    options.snapshot.session
  );

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: sessionAuditContext.actorUserId,
    eventType: "organization_member_removed",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId: member?.id ?? options.snapshot.memberBefore?.id,
        role: member?.role ?? options.snapshot.memberBefore?.role,
        targetUserId: member?.userId ?? options.snapshot.memberBefore?.userId,
      }),
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      member?.organizationId ??
      options.snapshot.memberBefore?.organizationId ??
      sessionAuditContext.activeOrganizationId ??
      null,
    sessionId: sessionAuditContext.sessionId,
    sourceIp: options.snapshot.sourceIp ?? null,
    userAgent: options.snapshot.userAgent ?? null,
  });
}

async function makeOAuthSecurityAuditRequestSnapshot(
  request: Request,
  options: OAuthSecurityAuditEventRecorderOptions
): Promise<OAuthSecurityAuditRequestSnapshot | null> {
  const { endpointPath, method } = makeAuthBoundaryRequestEnvelope(
    request,
    options.authConfig.basePath
  );

  if (
    method !== "POST" ||
    !OAUTH_SECURITY_AUDIT_ENDPOINT_PATHS.has(endpointPath)
  ) {
    return null;
  }

  const body = await readOAuthSecurityAuditRequestBody(request);

  return {
    body,
    endpointPath,
    tokenContext: await resolveOAuthSecurityAuditTokenContext({
      body,
      database: options.database,
      endpointPath,
      runtimeContext: options.runtimeContext ?? Context.empty(),
    }),
    sourceIp: getIp(request, {
      advanced: options.authConfig.advanced,
    }),
    userAgent: request.headers.get("user-agent"),
  };
}

async function readOAuthSecurityAuditRequestBody(request: Request) {
  const body = await readAuthBoundaryJsonOrFormRequestBody(
    request,
    OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES,
    OAuthAuditRequestBodySchema
  );

  return body.status === "available" ? body.body : null;
}

async function readOrganizationSecurityAuditRequestBody(
  request: Request,
  endpointPath: string
) {
  const body = await readAuthBoundaryJsonOrFormRequestBody(
    request,
    OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES,
    resolveOrganizationSecurityAuditRequestBodySchema(endpointPath)
  );

  return body.status === "available" ? body.body : null;
}

function resolveOrganizationSecurityAuditRequestBodySchema(
  endpointPath: string
) {
  switch (endpointPath) {
    case ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH: {
      return OrganizationInviteMemberAuditRequestBodySchema;
    }
    case ORGANIZATION_SET_ACTIVE_ENDPOINT_PATH: {
      return OrganizationSetActiveAuditRequestBodySchema;
    }
    case ORGANIZATION_UPDATE_MEMBER_ROLE_ENDPOINT_PATH: {
      return OrganizationUpdateMemberRoleAuditRequestBodySchema;
    }
    case ORGANIZATION_REMOVE_MEMBER_ENDPOINT_PATH: {
      return OrganizationRemoveMemberAuditRequestBodySchema;
    }
    default: {
      return OrganizationGenericAuditRequestBodySchema;
    }
  }
}

async function resolveOAuthSecurityAuditTokenContext(options: {
  readonly body: OAuthAuditRequestBody | null;
  readonly database: NodePgDatabase;
  readonly endpointPath: string;
  readonly runtimeContext: AuthEffectRuntimeContext;
}): Promise<OAuthSecurityAuditTokenContext | null> {
  try {
    if (
      options.endpointPath === OAUTH_TOKEN_ENDPOINT_PATH &&
      options.body?.grant_type === "refresh_token"
    ) {
      const refreshToken = options.body.refresh_token;
      return refreshToken
        ? await findOAuthRefreshTokenAuditContext(
            options.database,
            refreshToken
          )
        : null;
    }

    if (options.endpointPath !== OAUTH_REVOKE_ENDPOINT_PATH) {
      return null;
    }

    const token = options.body?.token;
    if (!token) {
      return null;
    }

    const tokenTypeHint = options.body.token_type_hint;

    if (tokenTypeHint === "access_token") {
      return await findOAuthAccessTokenAuditContext(options.database, token);
    }

    if (tokenTypeHint === "refresh_token") {
      return await findOAuthRefreshTokenAuditContext(options.database, token);
    }

    return (
      (await findOAuthRefreshTokenAuditContext(options.database, token)) ??
      (await findOAuthAccessTokenAuditContext(options.database, token))
    );
  } catch (error) {
    await reportAuthSecurityAuditTokenContextFailure(
      options.endpointPath,
      error,
      options.runtimeContext
    );
    return null;
  }
}

async function findOAuthRefreshTokenAuditContext(
  database: NodePgDatabase,
  token: string
): Promise<OAuthSecurityAuditTokenContext | null> {
  const storedToken = await hashOAuthStoredToken(token, "refresh_token");
  const [row] = await database
    .select({
      clientId: oauthRefreshTokenTable.clientId,
      referenceId: oauthRefreshTokenTable.referenceId,
      scopes: oauthRefreshTokenTable.scopes,
      sessionId: oauthRefreshTokenTable.sessionId,
      userId: oauthRefreshTokenTable.userId,
    })
    .from(oauthRefreshTokenTable)
    .where(eq(oauthRefreshTokenTable.token, storedToken))
    .limit(1);

  return row ? makeOAuthSecurityAuditTokenContext(row, "refresh_token") : null;
}

async function findOAuthAccessTokenAuditContext(
  database: NodePgDatabase,
  token: string
): Promise<OAuthSecurityAuditTokenContext | null> {
  const storedToken = await hashOAuthStoredToken(token, "access_token");
  const [row] = await database
    .select({
      clientId: oauthAccessTokenTable.clientId,
      referenceId: oauthAccessTokenTable.referenceId,
      scopes: oauthAccessTokenTable.scopes,
      sessionId: oauthAccessTokenTable.sessionId,
      userId: oauthAccessTokenTable.userId,
    })
    .from(oauthAccessTokenTable)
    .where(eq(oauthAccessTokenTable.token, storedToken))
    .limit(1);

  return row ? makeOAuthSecurityAuditTokenContext(row, "access_token") : null;
}

async function recordOAuthSecurityAuditEventForResponse(options: {
  readonly options: OAuthSecurityAuditEventRecorderOptions;
  readonly request: Request;
  readonly response: Response;
  readonly snapshot: OAuthSecurityAuditRequestSnapshot;
}) {
  switch (options.snapshot.endpointPath) {
    case OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH: {
      await recordOAuthClientRegistrationSecurityAuditEvent(options);
      break;
    }
    case OAUTH_CONSENT_ENDPOINT_PATH: {
      await recordOAuthConsentSecurityAuditEvent(options);
      break;
    }
    case OAUTH_TOKEN_ENDPOINT_PATH: {
      await recordOAuthTokenSecurityAuditEvent(options);
      break;
    }
    case OAUTH_REVOKE_ENDPOINT_PATH: {
      await recordOAuthRevocationSecurityAuditEvent(options);
      break;
    }
    default: {
      break;
    }
  }
}

async function recordOAuthClientRegistrationSecurityAuditEvent(options: {
  readonly options: OAuthSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OAuthSecurityAuditRequestSnapshot;
}) {
  if (options.response.status < 200 || options.response.status >= 500) {
    return;
  }

  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OAuthAuditResponseBodySchema
  );
  const succeeded =
    options.response.status >= 200 && options.response.status < 300;
  const scopeSummary = resolveOAuthAuditScopeSummary(
    responseBody?.scope,
    options.snapshot.body?.scope
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: responseBody?.user_id ?? null,
    eventType: succeeded
      ? "oauth_client_registration_succeeded"
      : "oauth_client_registration_rejected",
    metadata: {
      dynamicRegistration: true,
      oauthError: succeeded ? null : (responseBody?.error ?? null),
      outcome: succeeded ? "succeeded" : "rejected",
      ...(succeeded
        ? {}
        : { requestedUnknownScope: scopeSummary.requestedUnknownScope }),
    },
    oauthClientId: responseBody?.client_id ?? null,
    organizationId: null,
    scopes: scopeSummary.scopes,
    sessionId: null,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function recordOAuthConsentSecurityAuditEvent(options: {
  readonly options: OAuthSecurityAuditEventRecorderOptions;
  readonly request: Request;
  readonly response: Response;
  readonly snapshot: OAuthSecurityAuditRequestSnapshot;
}) {
  const accepted = options.snapshot.body?.accept;

  if (
    options.response.status < 200 ||
    options.response.status >= 400 ||
    accepted === undefined ||
    options.snapshot.body === null
  ) {
    return;
  }

  const oauthQuery = readOAuthAuditQuery(options.snapshot.body);
  const scopes = resolveOAuthAuditScopes(
    options.snapshot.body.scope,
    oauthQuery?.scope
  );
  const session = await resolveOAuthSecurityAuditSession(
    options.request,
    options.options
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: session?.user?.id ?? null,
    eventType: accepted ? "oauth_consent_granted" : "oauth_consent_denied",
    metadata: {
      accepted,
      containsAdminScope: scopes.some((scope) => scope === "ceird:admin"),
      containsWriteScope: scopes.some((scope) => scope === "ceird:write"),
    },
    oauthClientId: oauthQuery?.client_id ?? null,
    organizationId: session?.session?.activeOrganizationId ?? null,
    scopes,
    sessionId: session?.session?.id ?? null,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function recordOAuthTokenSecurityAuditEvent(options: {
  readonly options: OAuthSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OAuthSecurityAuditRequestSnapshot;
}) {
  if (
    options.response.status < 200 ||
    options.response.status >= 300 ||
    options.snapshot.body?.grant_type !== "refresh_token"
  ) {
    return;
  }

  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response,
    OAuthAuditResponseBodySchema
  );
  const tokenAuditContext = resolveOAuthTokenAuditContext(
    options.snapshot,
    resolveOAuthAuditScopes(responseBody?.scope, options.snapshot.body?.scope)
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: tokenAuditContext.actorUserId,
    eventType: "oauth_token_refreshed",
    metadata: {
      grantType: "refresh_token",
      matchedStoredToken:
        options.snapshot.tokenContext !== undefined &&
        options.snapshot.tokenContext !== null,
      tokenKind: options.snapshot.tokenContext?.tokenKind ?? "refresh_token",
    },
    oauthClientId: tokenAuditContext.oauthClientId,
    organizationId: tokenAuditContext.organizationId,
    scopes: tokenAuditContext.scopes,
    sessionId: tokenAuditContext.sessionId,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function recordOAuthRevocationSecurityAuditEvent(options: {
  readonly options: OAuthSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OAuthSecurityAuditRequestSnapshot;
}) {
  if (options.response.status < 200 || options.response.status >= 300) {
    return;
  }

  const tokenAuditContext = resolveOAuthTokenAuditContext(options.snapshot, []);

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: tokenAuditContext.actorUserId,
    eventType: "oauth_token_revoked",
    metadata: {
      matchedStoredToken:
        options.snapshot.tokenContext !== undefined &&
        options.snapshot.tokenContext !== null,
      tokenKind: options.snapshot.tokenContext?.tokenKind ?? null,
      tokenTypeHint: options.snapshot.body?.token_type_hint ?? null,
    },
    oauthClientId: tokenAuditContext.oauthClientId,
    organizationId: tokenAuditContext.organizationId,
    scopes: tokenAuditContext.scopes,
    sessionId: tokenAuditContext.sessionId,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function readOAuthSecurityAuditResponseBody<
  S extends Schema.Decoder<unknown>,
>(response: Response, schema: S): Promise<S["Type"] | null> {
  try {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return null;
    }

    const body = await response.clone().json();
    return Option.getOrNull(Schema.decodeUnknownOption(schema)(body));
  } catch {
    return null;
  }
}

function readOAuthAuditQuery(body: OAuthAuditRequestBody | null) {
  const oauthQuery = body?.oauth_query;

  if (!oauthQuery) {
    return null;
  }

  const searchParams = new URLSearchParams(oauthQuery);

  return Option.getOrNull(
    Schema.decodeUnknownOption(OAuthAuditQuerySchema)({
      client_id: searchParams.get("client_id") ?? undefined,
      scope: searchParams.get("scope") ?? undefined,
    })
  );
}

async function resolveOAuthSecurityAuditSession(
  request: Request,
  options: OAuthSecurityAuditEventRecorderOptions
) {
  if (!options.resolveSession) {
    return null;
  }

  try {
    return await options.resolveSession(request);
  } catch (error) {
    await reportAuthSecurityAuditSessionResolutionFailure(
      error,
      options.runtimeContext ?? Context.empty()
    );
    return null;
  }
}

function resolveOAuthAuditScopes(
  ...scopeValues: readonly (string | null | undefined)[]
) {
  return resolveOAuthAuditScopeSummary(...scopeValues).scopes;
}

function resolveOAuthAuditScopeSummary(
  ...scopeValues: readonly (string | null | undefined)[]
) {
  for (const scopeValue of scopeValues) {
    const scopeSummary = parseOAuthAuditScopeSummary(scopeValue);

    if (scopeSummary.scopes.length > 0 || scopeSummary.requestedUnknownScope) {
      return scopeSummary;
    }
  }

  return { requestedUnknownScope: false, scopes: [] };
}

function parseOAuthAuditScopeSummary(scopeValue: string | null | undefined): {
  readonly requestedUnknownScope: boolean;
  readonly scopes: readonly OAuthSecurityAuditScope[];
} {
  if (!scopeValue) {
    return { requestedUnknownScope: false, scopes: [] };
  }

  if (scopeValue.length > OAUTH_CLIENT_REGISTRATION_MAX_SCOPE_LENGTH) {
    return { requestedUnknownScope: true, scopes: [] };
  }

  let requestedUnknownScope = false;
  const scopes: OAuthSecurityAuditScope[] = [];
  const seenScopes = new Set<OAuthSecurityAuditScope>();

  for (const scope of scopeValue.split(/\s+/).map((value) => value.trim())) {
    if (scope.length === 0) {
      continue;
    }

    if (scope.length > OAUTH_SECURITY_AUDIT_MAX_SCOPE_LENGTH) {
      requestedUnknownScope = true;
      continue;
    }

    const decodedScope = Option.getOrNull(
      decodeOAuthSecurityAuditScopeOption(scope)
    );

    if (decodedScope === null) {
      requestedUnknownScope = true;
      continue;
    }

    if (!seenScopes.has(decodedScope)) {
      seenScopes.add(decodedScope);
      scopes.push(decodedScope);
    }
  }

  return {
    requestedUnknownScope,
    scopes: scopes.slice(0, OAUTH_SECURITY_AUDIT_MAX_SCOPES),
  };
}

export async function writeAuthSecurityAuditEvent(
  options: AuthSecurityAuditEventWriterOptions,
  input: unknown
) {
  const eventType = resolveAuthSecurityAuditEventInputTypeForTelemetry(input);

  try {
    const decodedInput = Schema.decodeUnknownSync(
      AuthSecurityAuditEventWriteSchema
    )(input);
    await options.database.insert(authSecurityAuditEventTable).values({
      actorUserId: decodedInput.actorUserId,
      eventType: decodedInput.eventType,
      metadata: decodedInput.metadata,
      oauthClientId: decodedInput.oauthClientId,
      organizationId: decodedInput.organizationId,
      scopes:
        decodedInput.scopes === null || decodedInput.scopes.length === 0
          ? null
          : [...decodedInput.scopes],
      sessionId: decodedInput.sessionId,
      sourceIp: decodedInput.sourceIp,
      userAgent: decodedInput.userAgent,
    });
  } catch (error) {
    await reportAuthSecurityAuditWriteFailure(
      eventType,
      error,
      options.runtimeContext ?? Context.empty()
    );
  }
}

function resolveAuthSecurityAuditEventInputTypeForTelemetry(
  input: unknown
): AuthSecurityAuditEventType | "unknown" {
  const decodedInput = Option.getOrNull(
    Schema.decodeUnknownOption(AuthSecurityAuditEventTelemetrySchema)(input)
  );

  return decodedInput?.eventType ?? "unknown";
}

async function reportAuthSecurityAuditWriteFailure(
  eventType: AuthSecurityAuditEventType | "unknown",
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth security audit event write failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "alert_on_audit_write_failure",
        authAbuseSignal: "auth_security_audit_write_failure",
        authAbuseSignalSeverity: "high",
        authSecurityAuditEventType: eventType,
        authSecurityAuditFailureCause:
          error instanceof Error
            ? sanitizeAuthFailureLogValue(error.message)
            : sanitizeAuthFailureLogValue(String(error)),
      })
    )
  );
}

async function reportAuthSecurityAuditSessionResolutionFailure(
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth security audit session resolution failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_audit_session_failure",
        authAbuseSignal: "auth_security_audit_session_resolution_failure",
        authAbuseSignalSeverity: "dashboard",
        authSecurityAuditFailureCause:
          error instanceof Error
            ? sanitizeAuthFailureLogValue(error.message)
            : sanitizeAuthFailureLogValue(String(error)),
      })
    )
  );
}

async function reportAuthSecurityAuditTokenContextFailure(
  endpointPath: string,
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth security audit token context lookup failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_audit_context_failure",
        authAbuseSignal: "auth_security_audit_token_context_failure",
        authAbuseSignalSeverity: "dashboard",
        authSecurityAuditEndpointPath: endpointPath,
        authSecurityAuditFailureCause:
          error instanceof Error
            ? sanitizeAuthFailureLogValue(error.message)
            : sanitizeAuthFailureLogValue(String(error)),
      })
    )
  );
}

async function reportOAuthRefreshTokenConsentGuardFailure(
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("OAuth refresh token consent guard failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "alert_on_sustained_consent_guard_failure",
        authAbuseSignal: "oauth_refresh_token_consent_guard_failure",
        authAbuseSignalSeverity: "high",
        authSecurityAuditEndpointPath: OAUTH_TOKEN_ENDPOINT_PATH,
        authSecurityAuditFailureCause:
          error instanceof Error
            ? sanitizeAuthFailureLogValue(error.message)
            : sanitizeAuthFailureLogValue(String(error)),
      })
    )
  );
}

async function reportAuthSecurityAuditOrganizationContextFailure(
  endpointPath: string,
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning(
      "Auth security audit organization context lookup failed"
    ).pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_audit_context_failure",
        authAbuseSignal: "auth_security_audit_organization_context_failure",
        authAbuseSignalSeverity: "dashboard",
        authSecurityAuditEndpointPath: endpointPath,
        authSecurityAuditFailureCause:
          error instanceof Error
            ? sanitizeAuthFailureLogValue(error.message)
            : sanitizeAuthFailureLogValue(String(error)),
      })
    )
  );
}

export function withOAuthClientRegistrationPolicyGuard(
  handler: (request: Request) => Promise<Response>,
  options: {
    readonly allowLoopbackRedirects: boolean;
    readonly allowedScopes: readonly OAuthClientRegistrationAllowedScope[];
    readonly basePath: string;
    readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
  }
) {
  return async (request: Request) => {
    const { endpointPath, method } = makeAuthBoundaryRequestEnvelope(
      request,
      options.basePath
    );

    if (
      method !== "POST" ||
      endpointPath !== OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH
    ) {
      return handler(request);
    }

    const body = await readAuthBoundaryJsonRequestBody(
      request,
      OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH,
      AuthBoundaryRecordSchema
    );

    if (body === null) {
      return handler(request);
    }

    const input = decodeOAuthClientRegistrationPolicyInput(body);
    if (input.status === "rejected") {
      await reportOAuthClientRegistrationRejected(
        input.rejection.reason,
        input.rejection.severity,
        options.runtimeContext ?? Context.empty()
      );

      return makeOAuthClientRegistrationPolicyErrorResponse(input.rejection);
    }

    const rejection = validateOAuthClientRegistrationRequest(input.value, {
      allowLoopbackRedirects: options.allowLoopbackRedirects,
      allowedScopes: decodeOAuthClientRegistrationAllowedScopes(
        options.allowedScopes
      ),
    });
    if (rejection === null) {
      return handler(
        makePublicOAuthClientRegistrationRequest(request, input.value.body)
      );
    }

    await reportOAuthClientRegistrationRejected(
      rejection.reason,
      rejection.severity,
      options.runtimeContext ?? Context.empty()
    );

    return makeOAuthClientRegistrationPolicyErrorResponse(rejection);
  };
}

type OAuthClientRegistrationPolicyInputDecodeResult =
  | {
      readonly status: "decoded";
      readonly value: OAuthClientRegistrationPolicyInput;
    }
  | {
      readonly rejection: OAuthClientRegistrationPolicyRejection;
      readonly status: "rejected";
    };

function decodeOAuthClientRegistrationPolicyInput(
  body: AuthBoundaryRecord
): OAuthClientRegistrationPolicyInputDecodeResult {
  const unknownField = Object.keys(body).find(
    (field) => !OAUTH_CLIENT_REGISTRATION_ALLOWED_FIELDS.has(field)
  );

  if (unknownField) {
    return {
      rejection: makeOAuthClientRegistrationPolicyRejection({
        error: "invalid_client_metadata",
        description: "Unsupported dynamic client registration metadata.",
        reason: "unsupported_metadata_field",
        severity: "dashboard",
      }),
      status: "rejected",
    };
  }

  const decodedBody = Option.getOrNull(
    decodeOAuthClientRegistrationRequestBody(body)
  );

  if (decodedBody === null) {
    return {
      rejection: classifyOAuthClientRegistrationBodyShapeRejection(body),
      status: "rejected",
    };
  }

  return {
    status: "decoded",
    value: Schema.decodeUnknownSync(OAuthClientRegistrationPolicyInputSchema)({
      body: decodedBody,
      clientName: decodedBody.client_name,
      clientUri: decodedBody.client_uri,
      contacts: decodedBody.contacts,
      grantTypes: decodedBody.grant_types,
      logoUri: decodedBody.logo_uri,
      policyUri: decodedBody.policy_uri,
      postLogoutRedirectUris: decodedBody.post_logout_redirect_uris,
      redirectUris: decodedBody.redirect_uris,
      responseTypes: decodedBody.response_types,
      scope: decodedBody.scope,
      skipConsentRequested: decodedBody.skip_consent !== undefined,
      softwareId: decodedBody.software_id,
      softwareStatement: decodedBody.software_statement,
      softwareVersion: decodedBody.software_version,
      subjectType: decodedBody.subject_type,
      tokenEndpointAuthMethod: decodedBody.token_endpoint_auth_method,
      tosUri: decodedBody.tos_uri,
      type: decodedBody.type,
    }),
  };
}

function classifyOAuthClientRegistrationBodyShapeRejection(
  body: AuthBoundaryRecord
) {
  const invalidArrayField = [
    "contacts",
    "grant_types",
    "post_logout_redirect_uris",
    "redirect_uris",
    "response_types",
  ].find(
    (field) =>
      field in body &&
      !(
        Array.isArray(body[field]) &&
        body[field].every((value) => typeof value === "string")
      )
  );

  if (invalidArrayField) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection(
      invalidArrayField
    );
  }

  const invalidStringField = [
    "client_name",
    "client_uri",
    "logo_uri",
    "policy_uri",
    "scope",
    "software_id",
    "software_statement",
    "software_version",
    "subject_type",
    "token_endpoint_auth_method",
    "tos_uri",
    "type",
  ].find((field) => field in body && typeof body[field] !== "string");

  if (invalidStringField) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: `${invalidStringField} must be a string.`,
      reason: `${invalidStringField}_invalid_shape`,
      severity: "dashboard",
    });
  }

  return makeOAuthClientRegistrationPolicyRejection({
    error: "invalid_client_metadata",
    description: "Dynamic client registration metadata is malformed.",
    reason: "metadata_invalid_shape",
    severity: "dashboard",
  });
}

function validateOAuthClientRegistrationRequest(
  input: OAuthClientRegistrationPolicyInput,
  options: {
    readonly allowLoopbackRedirects: boolean;
    readonly allowedScopes: readonly OAuthClientRegistrationAllowedScope[];
  }
): OAuthClientRegistrationPolicyRejection | null {
  const publicClientRejection =
    validateOAuthClientRegistrationPublicClientMetadata(input);

  if (publicClientRejection) {
    return publicClientRejection;
  }

  const scopeRejection = validateOAuthClientRegistrationScope(
    input.scope,
    options.allowedScopes
  );

  if (scopeRejection) {
    return scopeRejection;
  }

  const grantTypesRejection = validateOAuthClientRegistrationGrantTypes(
    input.grantTypes
  );

  if (grantTypesRejection) {
    return grantTypesRejection;
  }

  const responseTypesRejection = validateOAuthClientRegistrationStringArray({
    allowedValues: OAUTH_CLIENT_REGISTRATION_ALLOWED_RESPONSE_TYPES,
    description:
      "Dynamic client registration cannot request unsupported response types.",
    field: "response_types",
    maxCount: OAUTH_CLIENT_REGISTRATION_ALLOWED_RESPONSE_TYPES.size,
    reason: "unsupported_response_type_requested",
    severity: "high",
    value: input.responseTypes,
  });

  if (responseTypesRejection) {
    return responseTypesRejection;
  }

  if (input.skipConsentRequested) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "Dynamic client registration cannot skip consent.",
      reason: "skip_consent_requested",
      severity: "high",
    });
  }

  const redirectRejection = validateOAuthClientRegistrationUriList({
    allowLoopbackRedirects: options.allowLoopbackRedirects,
    field: "redirect_uris",
    maxCount: OAUTH_CLIENT_REGISTRATION_MAX_REDIRECT_URIS,
    value: input.redirectUris,
  });

  if (redirectRejection) {
    return redirectRejection;
  }

  const logoutRedirectRejection = validateOAuthClientRegistrationUriList({
    allowLoopbackRedirects: options.allowLoopbackRedirects,
    field: "post_logout_redirect_uris",
    maxCount: OAUTH_CLIENT_REGISTRATION_MAX_REDIRECT_URIS,
    value: input.postLogoutRedirectUris,
  });

  if (logoutRedirectRejection) {
    return logoutRedirectRejection;
  }

  return (
    validateOAuthClientRegistrationStringField(
      input.clientName,
      OAUTH_CLIENT_REGISTRATION_MAX_CLIENT_NAME_LENGTH,
      "client_name_too_long"
    ) ??
    validateOAuthClientRegistrationUrlField(
      input.clientUri,
      options.allowLoopbackRedirects,
      "client_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      input.logoUri,
      options.allowLoopbackRedirects,
      "logo_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      input.tosUri,
      options.allowLoopbackRedirects,
      "tos_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      input.policyUri,
      options.allowLoopbackRedirects,
      "policy_uri"
    ) ??
    validateOAuthClientRegistrationStringField(
      input.softwareId,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_ID_LENGTH,
      "software_id_too_long"
    ) ??
    validateOAuthClientRegistrationStringField(
      input.softwareVersion,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_VERSION_LENGTH,
      "software_version_too_long"
    ) ??
    validateOAuthClientRegistrationStringField(
      input.softwareStatement,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_STATEMENT_LENGTH,
      "software_statement_too_long"
    ) ??
    validateOAuthClientRegistrationContacts(input.contacts)
  );
}

function makePublicOAuthClientRegistrationRequest(
  request: Request,
  body: OAuthClientRegistrationRequestBody
) {
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(request, {
    body: JSON.stringify({
      ...body,
      token_endpoint_auth_method: "none",
    }),
    headers,
    method: request.method,
  });
}

function validateOAuthClientRegistrationPublicClientMetadata(
  input: OAuthClientRegistrationPolicyInput
) {
  if (
    input.tokenEndpointAuthMethod !== undefined &&
    input.tokenEndpointAuthMethod !== "none"
  ) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Dynamic client registration can only create public clients.",
      reason: "confidential_client_requested",
      severity: "high",
    });
  }

  if (input.type === "web") {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Dynamic client registration can only create public clients.",
      reason: "confidential_client_requested",
      severity: "high",
    });
  }

  if (
    input.type !== undefined &&
    input.type !== "native" &&
    input.type !== "user-agent-based"
  ) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Public dynamic client registration type must be native or user-agent-based.",
      reason: "unsupported_client_type_requested",
      severity: "dashboard",
    });
  }

  return null;
}

interface OAuthClientRegistrationPolicyRejection {
  readonly error:
    | "invalid_client_metadata"
    | "invalid_redirect_uri"
    | "invalid_scope";
  readonly description: string;
  readonly reason: string;
  readonly severity: "dashboard" | "high";
}

function makeOAuthClientRegistrationPolicyRejection(
  rejection: OAuthClientRegistrationPolicyRejection
) {
  return rejection;
}

function validateOAuthClientRegistrationScope(
  scope: string | undefined,
  allowedScopes: readonly OAuthClientRegistrationAllowedScope[]
): OAuthClientRegistrationPolicyRejection | null {
  if (scope === undefined) {
    return null;
  }

  if (scope.length > OAUTH_CLIENT_REGISTRATION_MAX_SCOPE_LENGTH) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "Dynamic client registration scope metadata is too long.",
      reason: "scope_too_long",
      severity: "dashboard",
    });
  }

  const scopeTokens = scope
    .split(/\s+/)
    .map((nextScope) => nextScope.trim())
    .filter((nextScope) => nextScope.length > 0);

  if (scopeTokens.length > allowedScopes.length) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_scope",
      description:
        "Dynamic client registration requested too many distinct scopes.",
      reason: "scope_too_many",
      severity: "dashboard",
    });
  }

  if (new Set(scopeTokens).size !== scopeTokens.length) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_scope",
      description: "Dynamic client registration cannot repeat scopes.",
      reason: "duplicate_scope_requested",
      severity: "dashboard",
    });
  }

  const restrictedScope = scopeTokens.find((nextScope) => {
    const decodedScope = Option.getOrNull(
      decodeOAuthClientRegistrationAllowedScopeOption(nextScope)
    );

    return decodedScope === null || !allowedScopes.includes(decodedScope);
  });

  if (restrictedScope) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_scope",
      description: "Dynamic client registration requested a restricted scope.",
      reason: "restricted_scope_requested",
      severity: "high",
    });
  }

  return null;
}

function validateOAuthClientRegistrationGrantTypes(
  value: readonly string[] | undefined
) {
  if (value?.includes("client_credentials") === true) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Dynamic client registration cannot request client_credentials grants.",
      reason: "client_credentials_requested",
      severity: "high",
    });
  }

  return validateOAuthClientRegistrationStringArray({
    allowedValues: OAUTH_CLIENT_REGISTRATION_ALLOWED_GRANT_TYPES,
    description:
      "Dynamic client registration cannot request unsupported grant types.",
    field: "grant_types",
    maxCount: OAUTH_CLIENT_REGISTRATION_ALLOWED_GRANT_TYPES.size,
    reason: "unsupported_grant_type_requested",
    severity: "high",
    value,
  });
}

function validateOAuthClientRegistrationStringArray(options: {
  readonly allowedValues: ReadonlySet<string>;
  readonly description: string;
  readonly field: string;
  readonly maxCount: number;
  readonly reason: string;
  readonly severity: "dashboard" | "high";
  readonly value: readonly string[] | undefined;
}) {
  if (options.value === undefined) {
    return null;
  }

  if (options.value.length > options.maxCount) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: `${options.field} contains too many entries.`,
      reason: `${options.field}_too_many`,
      severity: "dashboard",
    });
  }

  const unsupportedValue = options.value.find(
    (value) => !options.allowedValues.has(value)
  );

  if (unsupportedValue) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: options.description,
      reason: options.reason,
      severity: options.severity,
    });
  }

  return null;
}

function validateOAuthClientRegistrationUriList(options: {
  readonly allowLoopbackRedirects: boolean;
  readonly field: string;
  readonly maxCount: number;
  readonly value: readonly string[] | undefined;
}) {
  if (options.value === undefined) {
    return null;
  }

  if (options.value.length > options.maxCount) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: `${options.field} contains too many entries.`,
      reason: `${options.field}_too_many`,
      severity: "dashboard",
    });
  }

  for (const value of options.value) {
    const rejection = validateOAuthClientRegistrationUrl(
      value,
      options.allowLoopbackRedirects,
      options.field
    );

    if (rejection) {
      return rejection;
    }
  }

  return null;
}

function makeOAuthClientRegistrationInvalidArrayShapeRejection(field: string) {
  return makeOAuthClientRegistrationPolicyRejection({
    error: "invalid_client_metadata",
    description: `${field} must be an array of strings.`,
    reason: `${field}_invalid_shape`,
    severity: "dashboard",
  });
}

function validateOAuthClientRegistrationUrlField(
  value: unknown,
  allowLoopbackRedirects: boolean,
  field: string
) {
  if (typeof value !== "string") {
    return null;
  }

  return validateOAuthClientRegistrationUrl(
    value,
    allowLoopbackRedirects,
    field
  );
}

function validateOAuthClientRegistrationUrl(
  value: string,
  allowLoopbackRedirects: boolean,
  field: string
) {
  if (value.length > OAUTH_CLIENT_REGISTRATION_MAX_URL_LENGTH) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: `${field} is too long.`,
      reason: `${field}_too_long`,
      severity: "dashboard",
    });
  }

  if (value.includes("*")) {
    return makeOAuthClientRegistrationUrlPolicyRejection({
      description: `${field} cannot contain wildcards.`,
      field,
      reason: `${field}_wildcard`,
      severity: "high",
    });
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return makeOAuthClientRegistrationUrlPolicyRejection({
      description: `${field} must be an absolute URL.`,
      field,
      reason: `${field}_invalid_url`,
      severity: "dashboard",
    });
  }

  if (url.hash.length > 0) {
    return makeOAuthClientRegistrationUrlPolicyRejection({
      description: `${field} cannot include a fragment.`,
      field,
      reason: `${field}_fragment`,
      severity: "dashboard",
    });
  }

  const isLoopback = isOAuthClientRegistrationLoopbackHostname(url.hostname);

  if (isLoopback) {
    if (!allowLoopbackRedirects) {
      return makeOAuthClientRegistrationUrlPolicyRejection({
        description: `${field} cannot use loopback hosts outside local development.`,
        field,
        reason: `${field}_loopback_not_allowed`,
        severity: "high",
      });
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return null;
    }
  }

  if (url.protocol !== "https:") {
    return makeOAuthClientRegistrationUrlPolicyRejection({
      description: `${field} must use HTTPS outside local development.`,
      field,
      reason: `${field}_not_https`,
      severity: "high",
    });
  }

  return null;
}

function makeOAuthClientRegistrationUrlPolicyRejection(options: {
  readonly description: string;
  readonly field: string;
  readonly reason: string;
  readonly severity: "dashboard" | "high";
}) {
  return makeOAuthClientRegistrationPolicyRejection({
    error: OAUTH_CLIENT_REGISTRATION_REDIRECT_URI_FIELDS.has(options.field)
      ? "invalid_redirect_uri"
      : "invalid_client_metadata",
    description: options.description,
    reason: options.reason,
    severity: options.severity,
  });
}

function isOAuthClientRegistrationLoopbackHostname(hostname: string) {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[(?<hostname>.*)\]$/, "$<hostname>");

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "::1" ||
    normalizedHostname.endsWith(".localhost") ||
    isOAuthClientRegistrationIPv4LoopbackHostname(normalizedHostname) ||
    isOAuthClientRegistrationIPv4MappedIPv6LoopbackHostname(normalizedHostname)
  );
}

function isOAuthClientRegistrationIPv4LoopbackHostname(hostname: string) {
  const parts = hostname.split(".");

  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const octet = Number(part);
      return Number.isInteger(octet) && octet >= 0 && octet <= 255;
    })
  );
}

function isOAuthClientRegistrationIPv4MappedIPv6LoopbackHostname(
  hostname: string
) {
  const dottedIPv4Prefix = "::ffff:";

  if (hostname.startsWith(dottedIPv4Prefix)) {
    const mappedIPv4 = hostname.slice(dottedIPv4Prefix.length);

    if (isOAuthClientRegistrationIPv4LoopbackHostname(mappedIPv4)) {
      return true;
    }
  }

  const hexMappedIPv4Match =
    /^::ffff:(?<high>[0-9a-f]{1,4}):(?<low>[0-9a-f]{1,4})$/.exec(hostname);

  if (!hexMappedIPv4Match?.groups) {
    return false;
  }

  const { high: highSegment, low: lowSegment } = hexMappedIPv4Match.groups;

  if (highSegment === undefined || lowSegment === undefined) {
    return false;
  }

  const high = Number.parseInt(highSegment, 16);
  const low = Number.parseInt(lowSegment, 16);

  return (
    Number.isInteger(high) &&
    Number.isInteger(low) &&
    high >= 0 &&
    high <= 65_535 &&
    low >= 0 &&
    low <= 65_535 &&
    Math.floor(high / 256) === 127
  );
}

function validateOAuthClientRegistrationStringField(
  value: string | undefined,
  maxLength: number,
  reason: string
) {
  if (value === undefined || value.length <= maxLength) {
    return null;
  }

  return makeOAuthClientRegistrationPolicyRejection({
    error: "invalid_client_metadata",
    description: "Dynamic client registration metadata is too long.",
    reason,
    severity: "dashboard",
  });
}

function validateOAuthClientRegistrationContacts(
  value: readonly string[] | undefined
) {
  if (value === undefined) {
    return null;
  }

  if (value.length > OAUTH_CLIENT_REGISTRATION_MAX_CONTACTS) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "Dynamic client registration has too many contacts.",
      reason: "contacts_too_many",
      severity: "dashboard",
    });
  }

  for (const contact of value) {
    if (contact.length > 320) {
      return makeOAuthClientRegistrationPolicyRejection({
        error: "invalid_client_metadata",
        description:
          "Dynamic client registration contact metadata is too long.",
        reason: "contact_too_long",
        severity: "dashboard",
      });
    }
  }

  return null;
}

async function reportOAuthClientRegistrationRejected(
  reason: string,
  severity: "dashboard" | "high",
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("OAuth dynamic client registration rejected").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy:
          severity === "high"
            ? "alert_on_suspicious_oauth_registration"
            : "dashboard_until_sustained_oauth_registration_rejection",
        authAbuseSignal: "oauth_dynamic_client_registration_rejected",
        authAbuseSignalSeverity: severity,
        authOAuthClientRegistrationFailure: reason,
      })
    )
  );
}

function makeOAuthClientRegistrationPolicyErrorResponse(
  rejection: OAuthClientRegistrationPolicyRejection
) {
  return Response.json(
    {
      error: rejection.error,
      error_description: rejection.description,
    },
    {
      status: 400,
    }
  );
}
