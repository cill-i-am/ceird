import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { OrganizationId } from "@ceird/identity-core";
import { getIp } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Option, Schema } from "effect";

import {
  OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES,
  AuthBoundaryRecordSchema,
  decodeAuthBoundaryOption,
  decodeAuthBoundaryRecordOrNull,
  makeAuthBoundaryRequestEnvelope,
  maskInvitationEmail,
  readAuthBoundaryJsonOrFormRequestBody,
  readAuthBoundaryJsonRequestBody,
  readAuthBoundaryRecordField,
  readAuthBoundaryStringField,
  sanitizeAuthFailureLogValue,
} from "./auth-boundary-utils.js";
import type {
  AuthBoundaryRecord,
  AuthEffectRuntimeContext,
  AuthenticationSessionResult,
} from "./auth-boundary-utils.js";
import type { AuthenticationConfig } from "./config.js";
import {
  authSecurityAuditEvent as authSecurityAuditEventTable,
  invitation as invitationTable,
  member as memberTable,
  oauthAccessToken as oauthAccessTokenTable,
  oauthConsent as oauthConsentTable,
  oauthRefreshToken as oauthRefreshTokenTable,
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
const OAuthClientRegistrationPolicyInputSchema = Schema.Struct({
  body: AuthBoundaryRecordSchema,
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
  tosUri: Schema.optional(Schema.String),
  tokenEndpointAuthMethod: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
type OAuthClientRegistrationPolicyInput = Schema.Schema.Type<
  typeof OAuthClientRegistrationPolicyInputSchema
>;
const decodeOAuthClientRegistrationStringArray = Schema.decodeUnknownOption(
  OAuthClientRegistrationStringArraySchema
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

interface OrganizationSecurityAuditRequestContext {
  readonly session: AuthenticationSessionResult | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}

const organizationSecurityAuditRequestContext =
  new AsyncLocalStorage<OrganizationSecurityAuditRequestContext>();

export async function recordOrganizationSecurityAuditEvent(
  options: AuthSecurityAuditEventWriterOptions,
  input: {
    readonly actorUserId?: string | null | undefined;
    readonly eventType: AuthSecurityAuditEventType;
    readonly metadata?: AuthBoundaryRecord | undefined;
    readonly organizationId?: string | null | undefined;
    readonly sessionId?: string | null | undefined;
    readonly sourceIp?: string | null | undefined;
    readonly userAgent?: string | null | undefined;
  }
) {
  const requestContext = organizationSecurityAuditRequestContext.getStore();

  await writeAuthSecurityAuditEvent(options, {
    ...input,
    metadata: {
      outcome: "succeeded",
      source: "better_auth_organization_plugin",
      ...input.metadata,
    },
    sessionId: input.sessionId ?? requestContext?.session?.session.id,
    sourceIp: input.sourceIp ?? requestContext?.sourceIp,
    userAgent: input.userAgent ?? requestContext?.userAgent,
  });
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

    if (
      readAuthBoundaryStringField(body.value, "grant_type") !== "refresh_token"
    ) {
      return await handler(request);
    }

    const refreshToken = readAuthBoundaryStringField(
      body.value,
      "refresh_token"
    );

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
      readonly value: AuthBoundaryRecord;
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

interface OAuthRefreshTokenConsentGuardRow {
  readonly consentScopes: readonly string[] | null;
  readonly refreshTokenScopes: readonly string[];
}

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
  const [row] = rows as readonly OAuthRefreshTokenConsentGuardRow[];

  if (row === undefined) {
    return null;
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
  readonly body: AuthBoundaryRecord | null;
  readonly endpointPath: string;
  readonly sourceIp: string | null;
  readonly tokenContext?: OAuthSecurityAuditTokenContext | null | undefined;
  readonly userAgent: string | null;
}
interface OAuthSecurityAuditTokenContext {
  readonly clientId: string;
  readonly organizationId?: string | null | undefined;
  readonly scopes: readonly string[];
  readonly sessionId?: string | null | undefined;
  readonly tokenKind: "access_token" | "refresh_token";
  readonly userId?: string | null | undefined;
}

interface AuthSecurityAuditEventInput {
  readonly actorUserId?: string | null | undefined;
  readonly eventType: AuthSecurityAuditEventType;
  readonly metadata?: AuthBoundaryRecord | undefined;
  readonly oauthClientId?: string | null | undefined;
  readonly organizationId?: string | null | undefined;
  readonly scopes?: readonly string[] | undefined;
  readonly sessionId?: string | null | undefined;
  readonly sourceIp?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
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
  readonly body: AuthBoundaryRecord | null;
  readonly endpointPath: string;
  readonly invitationBefore: {
    readonly email: string;
    readonly organizationId: string;
    readonly role: string;
  } | null;
  readonly memberBefore?:
    | {
        readonly id: string;
        readonly organizationId: string;
        readonly role: string;
        readonly userId: string;
      }
    | null
    | undefined;
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

  const body = await readOAuthSecurityAuditRequestBody(request);
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
  readonly body: AuthBoundaryRecord | null;
  readonly database: NodePgDatabase;
  readonly endpointPath: string;
  readonly runtimeContext: AuthEffectRuntimeContext;
  readonly session: AuthenticationSessionResult | null;
}) {
  try {
    if (
      options.endpointPath !== ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH ||
      options.body?.resend !== true ||
      options.session === null
    ) {
      return null;
    }

    const email =
      readAuthBoundaryStringField(options.body, "email")?.toLowerCase() ?? null;
    const organizationId =
      readAuthBoundaryStringField(options.body, "organizationId") ??
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
    readonly email: string;
    readonly organizationId: string;
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

  return row ?? null;
}

async function resolveOrganizationMemberAuditContext(options: {
  readonly body: AuthBoundaryRecord | null;
  readonly database: NodePgDatabase;
  readonly runtimeContext: AuthEffectRuntimeContext;
}) {
  const memberId =
    readAuthBoundaryStringField(options.body, "memberId") ??
    readAuthBoundaryStringField(options.body, "memberIdOrEmail");

  if (!memberId) {
    return null;
  }

  try {
    return await findOrganizationMemberAuditContext(options.database, memberId);
  } catch (error) {
    await reportAuthSecurityAuditOrganizationContextFailure(
      "organization_member",
      error,
      options.runtimeContext
    );
    return null;
  }
}

async function findOrganizationMemberAuditContext(
  database: NodePgDatabase,
  memberId: string
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

  return row ?? null;
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
  if (options.snapshot.body?.resend !== true) {
    return;
  }

  if (options.snapshot.invitationBefore === null) {
    return;
  }

  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_invitation_resent",
    metadata: {
      ...makeOrganizationInvitationAuditMetadata({
        email:
          readAuthBoundaryStringField(responseBody, "email") ??
          options.snapshot.invitationBefore.email,
        role:
          readAuthBoundaryStringField(responseBody, "role") ??
          options.snapshot.invitationBefore.role,
      }),
      outcome: "succeeded",
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      readAuthBoundaryStringField(responseBody, "organizationId") ??
      options.snapshot.invitationBefore.organizationId ??
      options.snapshot.session?.session.activeOrganizationId,
    sessionId: options.snapshot.session?.session.id,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function recordOrganizationActiveChangedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );
  const previousOrganizationId =
    options.snapshot.session?.session.activeOrganizationId ?? null;
  const activeOrganizationId =
    readAuthBoundaryStringField(responseBody, "id") ??
    resolveRequestedActiveOrganizationId(
      options.snapshot.body,
      previousOrganizationId
    );

  if (activeOrganizationId === previousOrganizationId) {
    return;
  }

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_active_changed",
    metadata: {
      activeOrganizationId,
      outcome: "succeeded",
      previousOrganizationId,
      source: "better_auth_organization_endpoint",
    },
    organizationId: activeOrganizationId ?? previousOrganizationId,
    sessionId: options.snapshot.session?.session.id,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

function resolveRequestedActiveOrganizationId(
  body: AuthBoundaryRecord | null,
  previousOrganizationId: string | null
) {
  const requestedOrganizationValue = body?.organizationId;

  if (requestedOrganizationValue === null) {
    return null;
  }

  const requestedOrganizationId = readAuthBoundaryStringField(
    body,
    "organizationId"
  );

  return requestedOrganizationId ?? previousOrganizationId;
}

async function recordOrganizationMemberRoleUpdatedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );
  const member =
    readAuthBoundaryRecordField(responseBody, "member") ?? responseBody;
  const memberId =
    readAuthBoundaryStringField(member, "id") ??
    readAuthBoundaryStringField(options.snapshot.body, "memberId");
  const organizationId =
    readAuthBoundaryStringField(member, "organizationId") ??
    options.snapshot.memberBefore?.organizationId ??
    options.snapshot.session?.session.activeOrganizationId;

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_member_role_updated",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId,
        previousRole: options.snapshot.memberBefore?.role,
        role: readAuthBoundaryStringField(member, "role"),
        targetUserId:
          readAuthBoundaryStringField(member, "userId") ??
          options.snapshot.memberBefore?.userId,
      }),
      outcome: "succeeded",
      source: "better_auth_organization_endpoint",
    },
    organizationId,
    sessionId: options.snapshot.session?.session.id,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function recordOrganizationMemberRemovedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );
  const member =
    readAuthBoundaryRecordField(responseBody, "member") ??
    decodeAuthBoundaryRecordOrNull(options.snapshot.memberBefore) ??
    null;

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_member_removed",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId:
          readAuthBoundaryStringField(member, "id") ??
          options.snapshot.memberBefore?.id,
        role:
          readAuthBoundaryStringField(member, "role") ??
          options.snapshot.memberBefore?.role,
        targetUserId:
          readAuthBoundaryStringField(member, "userId") ??
          options.snapshot.memberBefore?.userId,
      }),
      outcome: "succeeded",
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      readAuthBoundaryStringField(member, "organizationId") ??
      options.snapshot.memberBefore?.organizationId ??
      options.snapshot.session?.session.activeOrganizationId,
    sessionId: options.snapshot.session?.session.id,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
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
    OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES
  );

  return body.status === "available" ? body.body : null;
}

async function resolveOAuthSecurityAuditTokenContext(options: {
  readonly body: AuthBoundaryRecord | null;
  readonly database: NodePgDatabase;
  readonly endpointPath: string;
  readonly runtimeContext: AuthEffectRuntimeContext;
}): Promise<OAuthSecurityAuditTokenContext | null> {
  try {
    if (
      options.endpointPath === OAUTH_TOKEN_ENDPOINT_PATH &&
      readAuthBoundaryStringField(options.body, "grant_type") ===
        "refresh_token"
    ) {
      const refreshToken = readAuthBoundaryStringField(
        options.body,
        "refresh_token"
      );
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

    const token = readAuthBoundaryStringField(options.body, "token");
    if (!token) {
      return null;
    }

    const tokenTypeHint = readAuthBoundaryStringField(
      options.body,
      "token_type_hint"
    );

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

  return row
    ? {
        clientId: row.clientId,
        organizationId: Option.getOrNull(
          decodeAuthBoundaryOption(OrganizationId, row.referenceId)
        ),
        scopes: sanitizeOAuthSecurityAuditScopes(row.scopes),
        sessionId: row.sessionId,
        tokenKind: "refresh_token",
        userId: row.userId,
      }
    : null;
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

  return row
    ? {
        clientId: row.clientId,
        organizationId: Option.getOrNull(
          decodeAuthBoundaryOption(OrganizationId, row.referenceId)
        ),
        scopes: sanitizeOAuthSecurityAuditScopes(row.scopes),
        sessionId: row.sessionId,
        tokenKind: "access_token",
        userId: row.userId,
      }
    : null;
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
    options.response
  );
  const succeeded =
    options.response.status >= 200 && options.response.status < 300;
  const scopes = resolveOAuthAuditScopes(
    readAuthBoundaryStringField(responseBody, "scope"),
    readAuthBoundaryStringField(options.snapshot.body, "scope")
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: readAuthBoundaryStringField(responseBody, "user_id"),
    eventType: succeeded
      ? "oauth_client_registration_succeeded"
      : "oauth_client_registration_rejected",
    metadata: {
      dynamicRegistration: true,
      oauthError: succeeded
        ? null
        : readAuthBoundaryStringField(responseBody, "error"),
      outcome: succeeded ? "succeeded" : "rejected",
    },
    oauthClientId: readAuthBoundaryStringField(responseBody, "client_id"),
    scopes,
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
  if (
    options.response.status < 200 ||
    options.response.status >= 400 ||
    typeof options.snapshot.body?.accept !== "boolean"
  ) {
    return;
  }

  const accepted = options.snapshot.body.accept;
  const oauthQuery = readOAuthQuerySearchParams(options.snapshot.body);
  const scopes = resolveOAuthAuditScopes(
    readAuthBoundaryStringField(options.snapshot.body, "scope"),
    oauthQuery?.get("scope")
  );
  const session = await resolveOAuthSecurityAuditSession(
    options.request,
    options.options
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: session?.user?.id,
    eventType: accepted ? "oauth_consent_granted" : "oauth_consent_denied",
    metadata: {
      accepted,
      containsAdminScope: scopes.includes("ceird:admin"),
      containsWriteScope: scopes.includes("ceird:write"),
    },
    oauthClientId: oauthQuery?.get("client_id"),
    organizationId: session?.session?.activeOrganizationId,
    scopes,
    sessionId: session?.session?.id,
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
    readAuthBoundaryStringField(options.snapshot.body, "grant_type") !==
      "refresh_token"
  ) {
    return;
  }

  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.tokenContext?.userId,
    eventType: "oauth_token_refreshed",
    metadata: {
      grantType: "refresh_token",
      matchedStoredToken:
        options.snapshot.tokenContext !== undefined &&
        options.snapshot.tokenContext !== null,
      tokenKind: options.snapshot.tokenContext?.tokenKind ?? "refresh_token",
    },
    oauthClientId:
      options.snapshot.tokenContext?.clientId ??
      readAuthBoundaryStringField(options.snapshot.body, "client_id"),
    organizationId: options.snapshot.tokenContext?.organizationId,
    scopes:
      options.snapshot.tokenContext?.scopes ??
      resolveOAuthAuditScopes(
        readAuthBoundaryStringField(responseBody, "scope"),
        readAuthBoundaryStringField(options.snapshot.body, "scope")
      ),
    sessionId: options.snapshot.tokenContext?.sessionId,
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

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.tokenContext?.userId,
    eventType: "oauth_token_revoked",
    metadata: {
      matchedStoredToken:
        options.snapshot.tokenContext !== undefined &&
        options.snapshot.tokenContext !== null,
      tokenKind: options.snapshot.tokenContext?.tokenKind ?? null,
      tokenTypeHint:
        readAuthBoundaryStringField(options.snapshot.body, "token_type_hint") ??
        null,
    },
    oauthClientId:
      options.snapshot.tokenContext?.clientId ??
      readAuthBoundaryStringField(options.snapshot.body, "client_id"),
    organizationId: options.snapshot.tokenContext?.organizationId,
    scopes: options.snapshot.tokenContext?.scopes,
    sessionId: options.snapshot.tokenContext?.sessionId,
    sourceIp: options.snapshot.sourceIp,
    userAgent: options.snapshot.userAgent,
  });
}

async function readOAuthSecurityAuditResponseBody(response: Response) {
  try {
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return null;
    }

    const body = await response.clone().json();
    return decodeAuthBoundaryRecordOrNull(body);
  } catch {
    return null;
  }
}

function readOAuthQuerySearchParams(body: AuthBoundaryRecord | null) {
  const oauthQuery = readAuthBoundaryStringField(body, "oauth_query");
  return oauthQuery ? new URLSearchParams(oauthQuery) : null;
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
  for (const scopeValue of scopeValues) {
    const scopes = parseOAuthAuditScopes(scopeValue);

    if (scopes.length > 0) {
      return scopes;
    }
  }

  return [];
}

function parseOAuthAuditScopes(scopeValue: string | null | undefined) {
  if (
    !scopeValue ||
    scopeValue.length > OAUTH_CLIENT_REGISTRATION_MAX_SCOPE_LENGTH
  ) {
    return [];
  }

  return [
    ...new Set(
      scopeValue
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(
          (scope) =>
            scope.length > 0 &&
            scope.length <= OAUTH_SECURITY_AUDIT_MAX_SCOPE_LENGTH
        )
    ),
  ].slice(0, OAUTH_SECURITY_AUDIT_MAX_SCOPES);
}

function sanitizeOAuthSecurityAuditScopes(scopes: readonly string[] | null) {
  if (scopes === null) {
    return [];
  }

  return [...new Set(scopes)]
    .filter(
      (scope) =>
        scope.length > 0 &&
        scope.length <= OAUTH_SECURITY_AUDIT_MAX_SCOPE_LENGTH
    )
    .slice(0, OAUTH_SECURITY_AUDIT_MAX_SCOPES);
}

async function writeAuthSecurityAuditEvent(
  options: AuthSecurityAuditEventWriterOptions,
  input: AuthSecurityAuditEventInput
) {
  try {
    await options.database.insert(authSecurityAuditEventTable).values({
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
      oauthClientId: input.oauthClientId ?? null,
      organizationId: input.organizationId ?? null,
      scopes:
        input.scopes && input.scopes.length > 0 ? [...input.scopes] : null,
      sessionId: input.sessionId ?? null,
      sourceIp: input.sourceIp ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (error) {
    await reportAuthSecurityAuditWriteFailure(
      input.eventType,
      error,
      options.runtimeContext ?? Context.empty()
    );
  }
}

async function reportAuthSecurityAuditWriteFailure(
  eventType: AuthSecurityAuditEventType,
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
    readonly allowedScopes: readonly string[];
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
      OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH
    );

    if (body === null) {
      return handler(request);
    }

    const input = decodeOAuthClientRegistrationPolicyInput(body);
    const rejection =
      input.status === "rejected"
        ? input.rejection
        : validateOAuthClientRegistrationRequest(input.value, options);

    if (rejection === null) {
      return handler(
        makePublicOAuthClientRegistrationRequest(
          request,
          input.status === "decoded" ? input.value.body : body
        )
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

  const redirectUris = decodeOAuthClientRegistrationStringArrayField(
    body,
    "redirect_uris"
  );
  if (redirectUris.status === "rejected") {
    return redirectUris;
  }

  const postLogoutRedirectUris = decodeOAuthClientRegistrationStringArrayField(
    body,
    "post_logout_redirect_uris"
  );
  if (postLogoutRedirectUris.status === "rejected") {
    return postLogoutRedirectUris;
  }

  const grantTypes = decodeOAuthClientRegistrationStringArrayField(
    body,
    "grant_types"
  );
  if (grantTypes.status === "rejected") {
    return grantTypes;
  }

  const responseTypes = decodeOAuthClientRegistrationStringArrayField(
    body,
    "response_types"
  );
  if (responseTypes.status === "rejected") {
    return responseTypes;
  }

  const contacts = decodeOAuthClientRegistrationStringArrayField(
    body,
    "contacts"
  );
  if (contacts.status === "rejected") {
    return contacts;
  }

  const tokenEndpointAuthMethod = decodeOAuthClientRegistrationStringField({
    body,
    description: "token_endpoint_auth_method must be a string.",
    field: "token_endpoint_auth_method",
    reason: "token_endpoint_auth_method_invalid_shape",
  });
  if (tokenEndpointAuthMethod.status === "rejected") {
    return tokenEndpointAuthMethod;
  }

  const type = decodeOAuthClientRegistrationStringField({
    body,
    description: "type must be a string.",
    field: "type",
    reason: "type_invalid_shape",
  });
  if (type.status === "rejected") {
    return type;
  }

  return {
    status: "decoded",
    value: Schema.decodeUnknownSync(OAuthClientRegistrationPolicyInputSchema)({
      body,
      clientName: readOAuthClientRegistrationStringField(body, "client_name"),
      clientUri: readOAuthClientRegistrationStringField(body, "client_uri"),
      contacts: contacts.value,
      grantTypes: grantTypes.value,
      logoUri: readOAuthClientRegistrationStringField(body, "logo_uri"),
      policyUri: readOAuthClientRegistrationStringField(body, "policy_uri"),
      postLogoutRedirectUris: postLogoutRedirectUris.value,
      redirectUris: redirectUris.value,
      responseTypes: responseTypes.value,
      scope: readOAuthClientRegistrationStringField(body, "scope"),
      skipConsentRequested: "skip_consent" in body,
      softwareId: readOAuthClientRegistrationStringField(body, "software_id"),
      softwareStatement: readOAuthClientRegistrationStringField(
        body,
        "software_statement"
      ),
      softwareVersion: readOAuthClientRegistrationStringField(
        body,
        "software_version"
      ),
      tokenEndpointAuthMethod: tokenEndpointAuthMethod.value,
      tosUri: readOAuthClientRegistrationStringField(body, "tos_uri"),
      type: type.value,
    }),
  };
}

type OAuthClientRegistrationFieldDecodeResult<T> =
  | {
      readonly status: "decoded";
      readonly value: T | undefined;
    }
  | {
      readonly rejection: OAuthClientRegistrationPolicyRejection;
      readonly status: "rejected";
    };

function decodeOAuthClientRegistrationStringArrayField(
  body: AuthBoundaryRecord,
  field: string
): OAuthClientRegistrationFieldDecodeResult<readonly string[]> {
  const value = body[field];

  if (value === undefined) {
    return {
      status: "decoded",
      value: undefined,
    };
  }

  return Option.match(decodeOAuthClientRegistrationStringArray(value), {
    onNone: () => ({
      rejection: makeOAuthClientRegistrationInvalidArrayShapeRejection(field),
      status: "rejected",
    }),
    onSome: (decodedValue) => ({
      status: "decoded",
      value: decodedValue,
    }),
  });
}

function decodeOAuthClientRegistrationStringField(options: {
  readonly body: AuthBoundaryRecord;
  readonly description: string;
  readonly field: string;
  readonly reason: string;
}): OAuthClientRegistrationFieldDecodeResult<string> {
  const value = options.body[options.field];

  if (value === undefined) {
    return {
      status: "decoded",
      value: undefined,
    };
  }

  if (typeof value !== "string") {
    return {
      rejection: makeOAuthClientRegistrationPolicyRejection({
        error: "invalid_client_metadata",
        description: options.description,
        reason: options.reason,
        severity: "dashboard",
      }),
      status: "rejected",
    };
  }

  return {
    status: "decoded",
    value,
  };
}

function readOAuthClientRegistrationStringField(
  body: AuthBoundaryRecord,
  field: string
) {
  const value = body[field];
  return typeof value === "string" ? value : undefined;
}

function validateOAuthClientRegistrationRequest(
  input: OAuthClientRegistrationPolicyInput,
  options: {
    readonly allowLoopbackRedirects: boolean;
    readonly allowedScopes: readonly string[];
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
  body: AuthBoundaryRecord
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
  allowedScopes: readonly string[]
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

  const allowedScopeSet = new Set(allowedScopes);
  const restrictedScope = scopeTokens.find(
    (nextScope) => !allowedScopeSet.has(nextScope)
  );

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
