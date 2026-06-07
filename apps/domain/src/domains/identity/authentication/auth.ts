/* eslint-disable max-classes-per-file, typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import {
  decodeInvitationId,
  decodeCreateOrganizationInput,
  decodeOrganizationId,
  decodeOrganizationRole,
  decodeOrganizationSlug,
  decodePublicInvitationPreview,
  decodeSessionId,
  decodeUpdateOrganizationInput,
  decodeUserId,
  isAdministrativeOrganizationRole,
} from "@ceird/identity-core";
import type {
  InvitationId,
  OrganizationId,
  OrganizationRole,
  PublicInvitationPreview,
  UserId,
} from "@ceird/identity-core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getIp } from "better-auth/api";
import { captcha } from "better-auth/plugins";
import type { Role } from "better-auth/plugins/access";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";
import { HttpEffect, HttpRouter } from "effect/unstable/http";

import { AppDatabase } from "../../../platform/database/database.js";
import { loadAuthEmailConfig } from "./auth-email-config.js";
import {
  AuthenticationEmailScheduler,
  AuthenticationEmailSchedulerLive,
} from "./auth-email-scheduler.js";
import type {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";
import { measureAuthenticationPhase } from "./auth-observability.js";
import {
  makePasswordCompromiseCheckFailureReporter,
  makePasswordCompromiseCheckPlugin,
} from "./auth-password-compromise.js";
import { loadAuthenticationConfig, matchesTrustedOrigin } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  authSecurityAuditEvent as authSecurityAuditEventTable,
  authSchema,
  invitation as invitationTable,
  member as memberTable,
  oauthAccessToken as oauthAccessTokenTable,
  oauthRefreshToken as oauthRefreshTokenTable,
  organization as organizationTable,
  rateLimit as rateLimitTable,
  session as sessionTable,
  user as userTable,
} from "./schema.js";
import type { AuthSecurityAuditEventType } from "./schema.js";

export { matchesTrustedOrigin } from "./config.js";

const ORGANIZATION_INVITATION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7;
const INVALID_ORGANIZATION_ROLE_MESSAGE =
  "Organization role must be one of owner, admin, member, or external.";
const BETTER_AUTH_ORGANIZATION_ROLES: Record<OrganizationRole, Role> = {
  admin: adminAc,
  external: memberAc,
  member: memberAc,
  owner: ownerAc,
};
const PUBLIC_INVITATION_PREVIEW_PATH_PATTERN =
  /^\/api\/public\/invitations\/([^/]+)\/preview$/;
const OAUTH_CONSENT_ENDPOINT_PATH = "/oauth2/consent";
const OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH = "/oauth2/register";
const OAUTH_TOKEN_ENDPOINT_PATH = "/oauth2/token";
const OAUTH_REVOKE_ENDPOINT_PATH = "/oauth2/revoke";
const TWO_FACTOR_ENABLE_ENDPOINT_PATH = "/two-factor/enable";
const TWO_FACTOR_SEND_OTP_ENDPOINT_PATH = "/two-factor/send-otp";
const TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH =
  "/two-factor/verify-backup-code";
const TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH = "/two-factor/verify-otp";
const TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH = "/two-factor/verify-totp";
const OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES = 16 * 1024;
const AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES =
  OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES;
const OAUTH_ACTIVE_ORGANIZATION_REQUIRED_ERROR_CODE =
  "OAUTH_ACTIVE_ORGANIZATION_REQUIRED";
const OAUTH_ACCESS_TOKEN_ORGANIZATION_ID_CLAIM = "ceird_org_id";
const OAUTH_CLIENT_MANAGEMENT_DISABLED_ERROR_CODE =
  "OAUTH_CLIENT_MANAGEMENT_DISABLED";
const OAUTH_CLIENT_MANAGEMENT_ENDPOINT_PATHS = new Set([
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/delete-client",
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
const ORGANIZATION_LIMIT_PER_USER = 10;
const ORGANIZATION_MEMBERSHIP_LIMIT = 200;
const ORGANIZATION_PENDING_INVITATION_LIMIT = 100;
const AUTH_DELIVERY_EMAIL_MAX_LENGTH = 320;
const ORGANIZATION_INVITATION_ACTOR_RATE_LIMIT_RULE = {
  window: 60 * 60,
  max: 30,
} as const satisfies AuthenticationRateLimitRule;
const ORGANIZATION_INVITATION_ORGANIZATION_RATE_LIMIT_RULE = {
  window: 60 * 60 * 24,
  max: 200,
} as const satisfies AuthenticationRateLimitRule;
const ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS = [
  "/organization/get-full-organization",
  "/organization/list-invitations",
  "/organization/list-members",
] as const;
const ORGANIZATION_UPDATE_INPUT_FIELDS = new Set(["name"]);
const DEFAULT_BETTER_AUTH_COOKIE_PREFIX = "better-auth";
const EMAIL_NOT_VERIFIED_ERROR_CODE = "EMAIL_NOT_VERIFIED";
const ORGANIZATION_LIMIT_REACHED_ERROR_CODE =
  "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS";
const AUTH_RATE_LIMIT_UNAVAILABLE_ERROR_CODE = "AUTH_RATE_LIMIT_UNAVAILABLE";
const AUTH_RATE_LIMIT_REQUEST_INVALID_ERROR_CODE =
  "AUTH_RATE_LIMIT_REQUEST_INVALID";
const AUTH_ORGANIZATION_CONTEXT_MISMATCH_ERROR_CODE =
  "AUTH_ORGANIZATION_CONTEXT_MISMATCH";
const TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE_ERROR_CODE =
  "TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE";
const TWO_FACTOR_TRUSTED_DEVICE_ENDPOINT_PATHS = [
  TWO_FACTOR_SEND_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH,
] as const;
const RATE_LIMIT_FAIL_CLOSED_ENDPOINT_PATHS = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
  "/send-verification-email",
  OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH,
  ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH,
  TWO_FACTOR_SEND_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH,
]);
const RATE_LIMIT_FAIL_OPEN_ENDPOINT_PATHS = new Set([
  "/change-email",
  "/change-password",
]);
const RATE_LIMIT_ATOMIC_RESERVATION_ENDPOINT_PATHS = new Set([
  ...RATE_LIMIT_FAIL_CLOSED_ENDPOINT_PATHS,
  ...RATE_LIMIT_FAIL_OPEN_ENDPOINT_PATHS,
]);
const AUTH_ABUSE_RATE_LIMIT_KEY_PREFIX = "ceird-auth-abuse";
const AUTH_RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;
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

type AuthEmailFailureReporter = (error: unknown) => void;
type AuthEmailPromiseSender<Input> = (input: Input) => Promise<void>;
type AuthEffectRuntimeContext = Context.Context<never>;
type BetterAuthOptions = Parameters<typeof betterAuth>[0];
interface ObservedRateLimit {
  readonly count: number;
  readonly key: string;
  readonly lastRequest: number;
}
interface ObservedRateLimitStorage {
  readonly get: (key: string) => Promise<ObservedRateLimit | null | undefined>;
  readonly set: (
    key: string,
    value: ObservedRateLimit,
    update?: boolean | undefined
  ) => Promise<void>;
}
interface AuthenticationRateLimitRule {
  readonly window: number;
  readonly max: number;
}
interface AuthenticationRateLimitReservation {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}
type AuthenticationRateLimitKeyKind =
  | "actor"
  | "destination_email"
  | "organization"
  | "path_ip"
  | "recipient_email"
  | "target_email"
  | "user";
type AuthenticationScopedRateLimitKeyScope =
  | "actor"
  | "destination-email"
  | "organization"
  | "recipient-email"
  | "target-email"
  | "user";
interface AuthenticationRateLimitReservationRequest {
  readonly key: string;
  readonly keyKind: AuthenticationRateLimitKeyKind;
  readonly rule: AuthenticationRateLimitRule;
}
type AuthenticationRateLimitRequestBodyReadFailureReason =
  | "body_too_large"
  | "invalid_body"
  | "read_failed"
  | "unsupported_content_type";
type AuthenticationRateLimitRequestBody =
  | {
      readonly body: Record<string, unknown> | null;
      readonly status: "available";
    }
  | {
      readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;
      readonly status: "unavailable";
    };
type AuthenticationAbuseRateLimitSessionResolution =
  | {
      readonly status: "resolved";
      readonly session: AuthenticationSessionResult;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly error: unknown;
      readonly status: "resolutionFailed";
    };
interface AuthenticationSessionResult {
  readonly session: {
    readonly createdAt: Date | string;
    readonly expiresAt: Date | string;
    readonly id: string;
    readonly ipAddress?: string | null | undefined;
    readonly token: string;
    readonly updatedAt: Date | string;
    readonly activeOrganizationId?: string | null | undefined;
    readonly userAgent?: string | null | undefined;
    readonly userId: string;
  } & Record<string, unknown>;
  readonly user: {
    readonly createdAt: Date | string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly image?: string | null | undefined;
    readonly name: string;
    readonly twoFactorEnabled: boolean;
    readonly updatedAt: Date | string;
  } & Record<string, unknown>;
}
interface RawAuthenticationSessionResult {
  readonly session: AuthenticationSessionResult["session"];
  readonly user: {
    readonly createdAt: Date | string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly image?: string | null | undefined;
    readonly name: string;
    readonly twoFactorEnabled?: boolean | null | undefined;
    readonly updatedAt: Date | string;
  } & Record<string, unknown>;
}
interface AuthenticationPluginOption {
  readonly id: string;
  readonly options?: unknown;
}
interface AuthenticationAuthorizationGuardOptions {
  readonly cookiePrefix?: string | undefined;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
  readonly secret?: string | undefined;
}
interface AuthenticationAbuseRateLimitGuardOptions {
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
}
interface VerifiedEmailEndpointRequirement {
  readonly message: string;
}
interface OrganizationSecurityAuditRequestContext {
  readonly session: AuthenticationSessionResult | null;
  readonly sourceIp: string | null;
  readonly userAgent: string | null;
}

const organizationSecurityAuditRequestContext =
  new AsyncLocalStorage<OrganizationSecurityAuditRequestContext>();

export class AuthRateLimitStorageReadError extends Error {
  readonly cause: unknown;
  readonly endpointPath: string | null;

  constructor(options: {
    readonly cause: unknown;
    readonly endpointPath: string | null;
  }) {
    super("Authentication rate-limit storage could not be read.");
    this.name = "AuthRateLimitStorageReadError";
    this.cause = options.cause;
    this.endpointPath = options.endpointPath;
  }
}

export class AuthRateLimitRequestBodyUnavailableError extends Error {
  readonly endpointPath: string;
  readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;

  constructor(options: {
    readonly endpointPath: string;
    readonly reason: AuthenticationRateLimitRequestBodyReadFailureReason;
  }) {
    super("Authentication rate-limit request body could not be read.");
    this.name = "AuthRateLimitRequestBodyUnavailableError";
    this.endpointPath = options.endpointPath;
    this.reason = options.reason;
  }
}

export class AuthOrganizationRateLimitContextMismatchError extends Error {
  constructor() {
    super("Organization invitation target must match the active organization.");
    this.name = "AuthOrganizationRateLimitContextMismatchError";
  }
}

export interface CeirdAuthentication {
  api: {
    readonly getSession: (options: {
      readonly headers: Headers;
    }) => Promise<AuthenticationSessionResult | null>;
    readonly [endpoint: string]: unknown;
  };
  handler: (request: Request) => Promise<Response>;
  options: BetterAuthOptions & {
    readonly plugins: readonly AuthenticationPluginOption[];
    readonly user?: AuthenticationConfig["user"];
  };
}

export function maskInvitationEmail(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return "***";
  }

  const [domainLabel, ...domainSuffix] = domainPart.split(".");
  const maskedDomainLabel = domainLabel ? `${domainLabel[0]}***` : "***";

  return `${localPart[0]}***@${maskedDomainLabel}${domainSuffix.length > 0 ? `.${domainSuffix.join(".")}` : ""}`;
}

export async function findPublicInvitationPreview(options: {
  readonly database: NodePgDatabase;
  readonly invitationId: InvitationId;
  readonly now?: Date;
}): Promise<PublicInvitationPreview | null> {
  const rows = await options.database
    .select({
      email: invitationTable.email,
      organizationName: organizationTable.name,
      role: invitationTable.role,
    })
    .from(invitationTable)
    .innerJoin(
      organizationTable,
      eq(invitationTable.organizationId, organizationTable.id)
    )
    .where(
      and(
        eq(invitationTable.id, options.invitationId),
        eq(invitationTable.status, "pending"),
        gt(invitationTable.expiresAt, options.now ?? new Date())
      )
    )
    .limit(1);

  const [preview] = rows;

  if (!preview) {
    return null;
  }

  return decodePublicInvitationPreview({
    email: maskInvitationEmail(preview.email),
    organizationName: preview.organizationName,
    role: preview.role,
  });
}

export async function assertUserCanAcceptOrganizationInvitation(options: {
  readonly database: NodePgDatabase;
  readonly userId: string;
}) {
  const [membershipCount] = await options.database
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(memberTable)
    .where(eq(memberTable.userId, options.userId))
    .limit(1);

  if ((membershipCount?.count ?? 0) >= ORGANIZATION_LIMIT_PER_USER) {
    throwOrganizationLimitReached();
  }
}

async function recordOrganizationSecurityAuditEvent(
  options: AuthSecurityAuditEventWriterOptions,
  input: {
    readonly actorUserId?: string | null | undefined;
    readonly eventType: AuthSecurityAuditEventType;
    readonly metadata?: Record<string, unknown> | undefined;
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

function makeOrganizationInvitationAuditMetadata(input: {
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

function makeOrganizationMemberAuditMetadata(input: {
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

function matchPublicInvitationPreviewPath(pathname: string) {
  const match = PUBLIC_INVITATION_PREVIEW_PATH_PATTERN.exec(pathname);
  return match?.[1];
}

function makePublicInvitationPreviewHandler(database: NodePgDatabase) {
  return async (request: Request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 404 });
    }

    const invitationId = matchPublicInvitationPreviewPath(
      new URL(request.url).pathname
    );

    if (!invitationId) {
      return new Response(null, { status: 404 });
    }

    const decodedInvitationId = decodePublicInvitationPathId(invitationId);

    if (decodedInvitationId === undefined) {
      return new Response(null, { status: 404 });
    }

    const preview = await findPublicInvitationPreview({
      database,
      invitationId: decodedInvitationId,
    });

    return Response.json(preview);
  };
}

function decodePublicInvitationPathId(
  invitationId: string
): InvitationId | undefined {
  try {
    return decodeInvitationId(decodeURIComponent(invitationId));
  } catch {
    return undefined;
  }
}

function throwInvalidOrganizationInput(message: string): never {
  throw APIError.from("BAD_REQUEST", {
    code: "INVALID_ORGANIZATION_INPUT",
    message,
  });
}

function throwInvalidOrganizationRole(): never {
  throw APIError.from("BAD_REQUEST", {
    code: "INVALID_ORGANIZATION_ROLE",
    message: INVALID_ORGANIZATION_ROLE_MESSAGE,
  });
}

function throwEmailNotVerified(message: string): never {
  throw APIError.from("FORBIDDEN", {
    code: EMAIL_NOT_VERIFIED_ERROR_CODE,
    message,
  });
}

function throwOrganizationLimitReached(): never {
  throw APIError.from("FORBIDDEN", {
    code: ORGANIZATION_LIMIT_REACHED_ERROR_CODE,
    message: "You have reached the maximum number of organizations.",
  });
}

function decodeWritableOrganizationRole(input: unknown) {
  try {
    return decodeOrganizationRole(input);
  } catch {
    throwInvalidOrganizationRole();
  }
}

function decodeIdentityBoundaryValue<A>(
  input: unknown,
  decode: (input: unknown) => A
): A | null {
  try {
    return decode(input);
  } catch {
    return null;
  }
}

function oauthRequestIncludesCeirdScopes(scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope.startsWith("ceird:"));
}

function resolveOAuthConsentActiveOrganizationId(
  session: Readonly<Record<string, unknown>>
) {
  return decodeIdentityBoundaryValue(
    session["activeOrganizationId"],
    decodeOrganizationId
  );
}

function resolveOAuthConsentReferenceId(
  session: Readonly<Record<string, unknown>>,
  scopes: readonly string[]
) {
  if (!oauthRequestIncludesCeirdScopes(scopes)) {
    return;
  }

  const activeOrganizationId = resolveOAuthConsentActiveOrganizationId(session);

  if (activeOrganizationId === null) {
    throw APIError.from("BAD_REQUEST", {
      code: OAUTH_ACTIVE_ORGANIZATION_REQUIRED_ERROR_CODE,
      message:
        "Choose a workspace before approving this Ceird authorization request.",
    });
  }

  return activeOrganizationId;
}

function resolveOAuthAccessTokenCustomClaims(input: {
  readonly referenceId?: string | undefined;
  readonly scopes: readonly string[];
}) {
  if (!oauthRequestIncludesCeirdScopes(input.scopes)) {
    return {};
  }

  const organizationId = decodeIdentityBoundaryValue(
    input.referenceId,
    decodeOrganizationId
  );

  if (organizationId === null) {
    throw APIError.from("BAD_REQUEST", {
      code: OAUTH_ACTIVE_ORGANIZATION_REQUIRED_ERROR_CODE,
      message: "Ceird authorization is missing its workspace binding.",
    });
  }

  return {
    [OAUTH_ACCESS_TOKEN_ORGANIZATION_ID_CLAIM]: organizationId,
  };
}

function assertOrganizationUpdateOnlyChangesName(
  organizationUpdate: Record<string, unknown>
) {
  const unsupportedField = Object.keys(organizationUpdate).find(
    (field) => !ORGANIZATION_UPDATE_INPUT_FIELDS.has(field)
  );

  if (unsupportedField) {
    throwInvalidOrganizationInput("Only organization name can be updated.");
  }
}

function makePasswordResetDeliveryKey(input: {
  readonly token: string;
  readonly userId: UserId;
}) {
  const digest = createHash("sha256")
    .update(`password-reset:${input.userId}:${input.token}`)
    .digest("hex");

  return `password-reset/${digest}`;
}

function makeEmailVerificationDeliveryKey(input: {
  readonly token: string;
  readonly userId: UserId;
}) {
  const digest = createHash("sha256")
    .update(`email-verification:${input.userId}:${input.token}`)
    .digest("hex");

  return `email-verification/${digest}`;
}

function makeEmailChangeConfirmationDeliveryKey(input: {
  readonly token: string;
  readonly userId: UserId;
}) {
  const digest = createHash("sha256")
    .update(`email-change-confirmation:${input.userId}:${input.token}`)
    .digest("hex");

  return `email-change-confirmation/${digest}`;
}

export function hashOAuthStoredToken(token: string, _type: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createAuthentication(options: {
  readonly appOrigin: string;
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly reportEmailChangeConfirmationFailure?: (error: unknown) => void;
  readonly reportOrganizationInvitationEmailFailure?: (error: unknown) => void;
  readonly reportPasswordCompromiseCheckFailure?: (error: unknown) => void;
  readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Promise<void>;
  readonly reportVerificationEmailFailure: (error: unknown) => void;
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
}): CeirdAuthentication {
  const {
    config,
    database,
    sendOrganizationInvitationEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
  } = options;
  const {
    databaseUrl: _databaseUrl,
    captcha: captchaConfig,
    oauthClientRegistrationAllowedScopes,
    oauthClientRegistrationAllowLoopbackRedirects,
    mcpResourceUrl,
    oauthClientRegistrationDefaultScopes,
    oauthConsentPath,
    oauthIssuerUrl,
    oauthScopes,
    ...authConfig
  } = config;
  const loginPage = new URL("/login", options.appOrigin).toString();
  const consentPage = new URL(oauthConsentPath, options.appOrigin).toString();

  const auth = betterAuth({
    ...authConfig,
    advanced: {
      ...authConfig.advanced,
      backgroundTasks: {
        handler: options.backgroundTaskHandler,
      },
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    disabledPaths: ["/token"],
    logger: {
      disabled: true,
    },
    rateLimit: {
      ...authConfig.rateLimit,
      customStorage: makeObservedDatabaseRateLimitStorage(
        database,
        options.runtimeContext
      ),
    },
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: {
          issuer: oauthIssuerUrl,
        },
      }),
      oauthProvider({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        advertisedMetadata: {
          scopes_supported: [...oauthScopes],
        },
        clientRegistrationAllowedScopes: [
          ...oauthClientRegistrationAllowedScopes,
        ],
        clientRegistrationDefaultScopes: [
          ...oauthClientRegistrationDefaultScopes,
        ],
        consentPage,
        customAccessTokenClaims({ referenceId, scopes }) {
          return resolveOAuthAccessTokenCustomClaims({
            referenceId,
            scopes,
          });
        },
        disableJwtPlugin: false,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage,
        postLogin: {
          consentReferenceId({ session, scopes }) {
            return resolveOAuthConsentReferenceId(session, scopes);
          },
          page: consentPage,
          shouldRedirect({ session, scopes }) {
            return (
              oauthRequestIncludesCeirdScopes(scopes) &&
              resolveOAuthConsentActiveOrganizationId(session) === null
            );
          },
        },
        scopes: [...oauthScopes],
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        storeTokens: {
          hash: hashOAuthStoredToken,
        },
        validAudiences: [authConfig.baseURL, mcpResourceUrl],
      }),
      makePasswordCompromiseCheckPlugin({
        ...authConfig.passwordCompromiseCheck,
        reportProviderFailure: options.reportPasswordCompromiseCheckFailure,
      }),
      ...(captchaConfig.enabled
        ? [
            captcha({
              provider: captchaConfig.provider,
              secretKey: captchaConfig.secretKey,
              endpoints: [...captchaConfig.protectedEndpoints],
              ...(captchaConfig.siteVerifyURLOverride === undefined
                ? {}
                : {
                    siteVerifyURLOverride: captchaConfig.siteVerifyURLOverride,
                  }),
            }),
          ]
        : []),
      twoFactor({
        backupCodeOptions: {
          amount: 10,
          length: 10,
          storeBackupCodes: "encrypted",
        },
        issuer: authConfig.appName,
        totpOptions: {
          digits: 6,
          period: 30,
        },
        twoFactorCookieMaxAge: 600,
      }),
      organization({
        allowUserToCreateOrganization: (user) => user.emailVerified === true,
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: ORGANIZATION_INVITATION_EXPIRATION_SECONDS,
        invitationLimit: ORGANIZATION_PENDING_INVITATION_LIMIT,
        membershipLimit: ORGANIZATION_MEMBERSHIP_LIMIT,
        organizationLimit: ORGANIZATION_LIMIT_PER_USER,
        roles: BETTER_AUTH_ORGANIZATION_ROLES,
        organizationHooks: {
          beforeCreateOrganization: ({ organization: nextOrganization }) => {
            let input;

            try {
              input = decodeCreateOrganizationInput(nextOrganization);
            } catch {
              throwInvalidOrganizationInput(
                "Organization name must be at least 2 characters long and the slug must use lowercase letters, numbers, and hyphens only, without reserved system labels."
              );
            }

            return Promise.resolve({
              data: {
                ...nextOrganization,
                name: input.name,
                slug: input.slug,
              },
            });
          },
          afterCreateOrganization: async ({
            organization: nextOrganization,
            member,
            user,
          }) => {
            await recordOrganizationSecurityAuditEvent(
              {
                database,
                runtimeContext: options.runtimeContext,
              },
              {
                actorUserId: user.id,
                eventType: "organization_created",
                metadata: makeOrganizationMemberAuditMetadata({
                  memberId: member.id,
                  role: member.role,
                  targetUserId: user.id,
                }),
                organizationId: nextOrganization.id,
              }
            );
          },
          beforeUpdateOrganization: ({ organization: nextOrganization }) => {
            let input;

            assertOrganizationUpdateOnlyChangesName(nextOrganization);

            try {
              input = decodeUpdateOrganizationInput(nextOrganization);
            } catch {
              throwInvalidOrganizationInput(
                "Organization name must be at least 2 characters long."
              );
            }

            return Promise.resolve({
              data: {
                name: input.name,
              },
            });
          },
          afterUpdateOrganization: async ({
            organization: updatedOrganization,
            user,
          }) => {
            await recordOrganizationSecurityAuditEvent(
              {
                database,
                runtimeContext: options.runtimeContext,
              },
              {
                actorUserId: user.id,
                eventType: "organization_updated",
                metadata: {
                  updatedFields: updatedOrganization
                    ? Object.keys(updatedOrganization).filter(
                        (field) => field !== "id"
                      )
                    : [],
                },
                organizationId: updatedOrganization?.id ?? null,
              }
            );
          },
          beforeAddMember: ({ member: nextMember }) =>
            Promise.resolve({
              data: {
                ...nextMember,
                role: decodeWritableOrganizationRole(nextMember.role),
              },
            }),
          beforeUpdateMemberRole: ({ newRole }) =>
            Promise.resolve({
              data: {
                role: decodeWritableOrganizationRole(newRole),
              },
            }),
          beforeCreateInvitation: ({ invitation: nextInvitation, inviter }) => {
            if (inviter.emailVerified !== true) {
              throwEmailNotVerified(
                "Verify your email before inviting organization members."
              );
            }

            return Promise.resolve({
              data: {
                ...nextInvitation,
                role: decodeWritableOrganizationRole(nextInvitation.role),
              },
            });
          },
          afterCreateInvitation: async ({
            invitation: nextInvitation,
            inviter,
          }) => {
            await recordOrganizationSecurityAuditEvent(
              {
                database,
                runtimeContext: options.runtimeContext,
              },
              {
                actorUserId: inviter.id,
                eventType: "organization_invitation_created",
                metadata: makeOrganizationInvitationAuditMetadata({
                  email: nextInvitation.email,
                  role: nextInvitation.role,
                }),
                organizationId: nextInvitation.organizationId,
              }
            );
          },
          beforeAcceptInvitation: async ({ user }) => {
            await assertUserCanAcceptOrganizationInvitation({
              database,
              userId: user.id,
            });
          },
          afterAcceptInvitation: async ({
            invitation: acceptedInvitation,
            member,
            user,
          }) => {
            await recordOrganizationSecurityAuditEvent(
              {
                database,
                runtimeContext: options.runtimeContext,
              },
              {
                actorUserId: user.id,
                eventType: "organization_invitation_accepted",
                metadata: {
                  ...makeOrganizationInvitationAuditMetadata({
                    email: acceptedInvitation.email,
                    role: acceptedInvitation.role,
                    targetUserId: member.userId,
                  }),
                  memberId: member.id,
                },
                organizationId: acceptedInvitation.organizationId,
              }
            );
          },
          afterCancelInvitation: async ({
            cancelledBy,
            invitation: canceledInvitation,
          }) => {
            await recordOrganizationSecurityAuditEvent(
              {
                database,
                runtimeContext: options.runtimeContext,
              },
              {
                actorUserId: cancelledBy.id,
                eventType: "organization_invitation_canceled",
                metadata: makeOrganizationInvitationAuditMetadata({
                  email: canceledInvitation.email,
                  role: canceledInvitation.role,
                }),
                organizationId: canceledInvitation.organizationId,
              }
            );
          },
        },
        sendInvitationEmail: async (organizationInvitation) => {
          const invitationId = decodeInvitationId(organizationInvitation.id);

          await deliverAuthEmail({
            reportFailure:
              options.reportOrganizationInvitationEmailFailure ??
              options.reportVerificationEmailFailure,
            send: sendOrganizationInvitationEmail,
            input: {
              deliveryKey: `organization-invitation/${invitationId}`,
              invitationUrl: new URL(
                `/accept-invitation/${invitationId}`,
                options.appOrigin
              ).toString(),
              inviterEmail: organizationInvitation.inviter.user.email,
              organizationName: organizationInvitation.organization.name,
              recipientEmail: organizationInvitation.email,
              recipientName: organizationInvitation.email,
              role: decodeOrganizationRole(organizationInvitation.role),
            } as const satisfies OrganizationInvitationEmailInput,
          });
        },
      }),
    ],
    emailAndPassword: {
      ...authConfig.emailAndPassword,
      sendResetPassword: async ({ token, user, url }) => {
        const userId = decodeUserId(user.id);

        await deliverAuthEmail({
          reportFailure: options.reportPasswordResetEmailFailure,
          send: sendPasswordResetEmail,
          input: {
            deliveryKey: makePasswordResetDeliveryKey({
              token,
              userId,
            }),
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            resetUrl: url,
          } as const satisfies PasswordResetEmailInput,
        });
      },
    },
    emailVerification: {
      ...authConfig.emailVerification,
      sendVerificationEmail: async ({ user, token, url }) => {
        const userId = decodeUserId(user.id);

        await deliverAuthEmail({
          reportFailure: options.reportVerificationEmailFailure,
          send: sendVerificationEmail,
          input: {
            deliveryKey: makeEmailVerificationDeliveryKey({
              token,
              userId,
            }),
            recipientEmail: user.email,
            recipientName: user.name ?? user.email,
            verificationUrl: url,
          } as const satisfies EmailVerificationEmailInput,
        });
      },
    },
    user: {
      ...authConfig.user,
      changeEmail: {
        ...authConfig.user.changeEmail,
        sendChangeEmailConfirmation: async ({ user, token, url }) => {
          const userId = decodeUserId(user.id);

          await deliverAuthEmail({
            reportFailure:
              options.reportEmailChangeConfirmationFailure ??
              options.reportVerificationEmailFailure,
            send: sendVerificationEmail,
            input: {
              deliveryKey: makeEmailChangeConfirmationDeliveryKey({
                token,
                userId,
              }),
              recipientEmail: user.email,
              recipientName: user.name ?? user.email,
              verificationUrl: url,
            } as const satisfies EmailVerificationEmailInput,
          });
        },
      },
    },
  });
  const resolveSession = makeRequestLocalAuthenticationSessionResolver(
    async (request) =>
      normalizeAuthenticationSessionResult(
        await auth.api.getSession({
          headers: request.headers,
        })
      )
  );

  auth.handler = withAuthenticationRateLimitFailureResponse(
    withAuthenticationAuthorizationGuards(
      withAuthenticationAbuseRateLimitGuard(
        withOAuthSecurityAuditEventRecorder(
          withOrganizationSecurityAuditEventRecorder(
            withOAuthClientManagementEndpointGuard(
              withOAuthClientRegistrationPolicyGuard(auth.handler, {
                allowLoopbackRedirects:
                  oauthClientRegistrationAllowLoopbackRedirects,
                allowedScopes: oauthClientRegistrationAllowedScopes,
                basePath: authConfig.basePath,
                runtimeContext: options.runtimeContext,
              }),
              authConfig.basePath
            ),
            {
              authConfig,
              database,
              resolveSession,
              runtimeContext: options.runtimeContext,
            }
          ),
          {
            authConfig,
            database,
            resolveSession,
            runtimeContext: options.runtimeContext,
          }
        ),
        database,
        authConfig,
        options.runtimeContext,
        {
          resolveSession,
        }
      ),
      database,
      {
        cookiePrefix: authConfig.advanced?.cookiePrefix,
        resolveSession,
        secret: resolveActiveAuthenticationSecret(authConfig),
      }
    )
  );

  return auth as CeirdAuthentication;
}

function normalizeAuthenticationSessionResult(
  result: RawAuthenticationSessionResult | null
): AuthenticationSessionResult | null {
  if (result === null) {
    return null;
  }

  return {
    ...result,
    user: {
      ...result.user,
      twoFactorEnabled: readAuthenticationSessionUserTwoFactorEnabled(
        result.user
      ),
    },
  };
}

export function resolveActiveAuthenticationSecret(
  authConfig: Pick<AuthenticationConfig, "secret" | "secrets">
) {
  return authConfig.secrets?.[0]?.value ?? authConfig.secret;
}

export function makeRequestLocalAuthenticationSessionResolver(
  resolveSession: (
    request: Request
  ) => Promise<AuthenticationSessionResult | null>
) {
  const sessionByRequest = new WeakMap<
    Request,
    Promise<AuthenticationSessionResult | null>
  >();

  return (request: Request) => {
    const cachedSession = sessionByRequest.get(request);

    if (cachedSession) {
      return cachedSession;
    }

    const nextSession = resolveSession(request);
    sessionByRequest.set(request, nextSession);

    return nextSession;
  };
}

export function withAuthenticationAbuseRateLimitGuard(
  handler: (request: Request) => Promise<Response>,
  database: NodePgDatabase,
  authConfig: Pick<
    AuthenticationConfig,
    "advanced" | "basePath" | "rateLimit" | "secret" | "secrets"
  >,
  runtimeContext: AuthEffectRuntimeContext = Context.empty(),
  guardOptions: AuthenticationAbuseRateLimitGuardOptions = {}
) {
  return async (request: Request) => {
    const response = await reserveAuthenticationAbuseRateLimit({
      authConfig,
      database,
      guardOptions,
      request,
      runtimeContext,
    });

    return response ?? handler(request);
  };
}

async function reserveAuthenticationAbuseRateLimit(options: {
  readonly authConfig: Pick<
    AuthenticationConfig,
    "advanced" | "basePath" | "rateLimit" | "secret" | "secrets"
  >;
  readonly database: NodePgDatabase;
  readonly guardOptions: AuthenticationAbuseRateLimitGuardOptions;
  readonly request: Request;
  readonly runtimeContext: AuthEffectRuntimeContext;
}) {
  if (
    options.request.method !== "POST" ||
    options.authConfig.rateLimit.enabled !== true
  ) {
    return null;
  }

  const endpointPath = resolveAuthenticationEndpointPath(
    options.request,
    options.authConfig.basePath
  );

  if (
    endpointPath === null ||
    !RATE_LIMIT_ATOMIC_RESERVATION_ENDPOINT_PATHS.has(endpointPath)
  ) {
    return null;
  }

  const rateLimitRule = resolveAuthenticationRateLimitRule(
    options.authConfig,
    endpointPath
  );

  if (rateLimitRule === null) {
    return null;
  }

  const ipAddress = getIp(options.request, {
    advanced: options.authConfig.advanced,
  });

  if (ipAddress === null) {
    await reportAuthenticationAbuseRateLimitMissingClientIp(
      endpointPath,
      shouldFailOpenForRateLimitEndpointPath(endpointPath)
        ? "fail_open"
        : "fail_closed",
      options.runtimeContext
    );

    if (shouldFailOpenForRateLimitEndpointPath(endpointPath)) {
      return null;
    }

    throw new AuthRateLimitStorageReadError({
      cause: new Error("Authentication rate-limit client IP is unavailable."),
      endpointPath,
    });
  }

  const reservationRequests =
    await makeAuthenticationAbuseRateLimitReservationRequests({
      authConfig: options.authConfig,
      endpointPath,
      ipAddress,
      request: options.request,
      resolveSession: options.guardOptions.resolveSession,
      rule: rateLimitRule,
    });

  for (const reservationRequest of reservationRequests) {
    try {
      const reservation = await reserveAuthenticationRateLimit({
        database: options.database,
        key: reservationRequest.key,
        rule: reservationRequest.rule,
      });

      if (reservation.allowed) {
        continue;
      }

      await reportAuthenticationAbuseRateLimitExceeded({
        endpointPath,
        key: reservationRequest.key,
        keyKind: reservationRequest.keyKind,
        rule: reservationRequest.rule,
        runtimeContext: options.runtimeContext,
      });

      return makeAuthenticationRateLimitExceededResponse(
        reservation.retryAfterSeconds
      );
    } catch (error) {
      const failureMode = shouldFailOpenForRateLimitEndpointPath(endpointPath)
        ? "fail_open"
        : "fail_closed";

      await reportRateLimitStorageReservationFailure({
        error,
        failureMode,
        key: reservationRequest.key,
        keyKind: reservationRequest.keyKind,
        runtimeContext: options.runtimeContext,
      });

      if (failureMode === "fail_open") {
        return null;
      }

      throw new AuthRateLimitStorageReadError({
        cause: error,
        endpointPath,
      });
    }
  }

  return null;
}

function resolveAuthenticationEndpointPath(request: Request, basePath: string) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (basePath === "/" || basePath === "") {
    return pathname;
  }

  if (pathname === basePath) {
    return "/";
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
  }

  return pathname;
}

function resolveAuthenticationRateLimitRule(
  authConfig: Pick<AuthenticationConfig, "rateLimit">,
  endpointPath: string
): AuthenticationRateLimitRule | null {
  switch (endpointPath) {
    case "/sign-in/email": {
      return authConfig.rateLimit.customRules["/sign-in/email"];
    }
    case "/sign-up/email": {
      return authConfig.rateLimit.customRules["/sign-up/email"];
    }
    case "/request-password-reset": {
      return authConfig.rateLimit.customRules["/request-password-reset"];
    }
    case "/send-verification-email": {
      return authConfig.rateLimit.customRules["/send-verification-email"];
    }
    case "/change-email": {
      return authConfig.rateLimit.customRules["/change-email"];
    }
    case "/change-password": {
      return authConfig.rateLimit.customRules["/change-password"];
    }
    case TWO_FACTOR_SEND_OTP_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        TWO_FACTOR_SEND_OTP_ENDPOINT_PATH
      ];
    }
    case TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH
      ];
    }
    case TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH
      ];
    }
    case TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH
      ];
    }
    case ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH
      ];
    }
    case OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH: {
      return authConfig.rateLimit.customRules[
        OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH
      ];
    }
    default: {
      return null;
    }
  }
}

function makeAuthenticationAbuseRateLimitKey(
  ipAddress: string,
  endpointPath: string
) {
  return `${AUTH_ABUSE_RATE_LIMIT_KEY_PREFIX}:${ipAddress}|${endpointPath}`;
}

function makeAuthenticationScopedAbuseRateLimitKey(
  scope: AuthenticationScopedRateLimitKeyScope,
  value: string,
  endpointPath: string
) {
  return `${AUTH_ABUSE_RATE_LIMIT_KEY_PREFIX}:${scope}:${value}|${endpointPath}`;
}

function makeAuthenticationHashedScopedAbuseRateLimitKey(
  authConfig: Pick<AuthenticationConfig, "secret" | "secrets">,
  scope: Extract<
    AuthenticationScopedRateLimitKeyScope,
    "destination-email" | "recipient-email" | "target-email"
  >,
  value: string,
  endpointPath: string
) {
  const digest = createHmac(
    "sha256",
    resolveActiveAuthenticationSecret(authConfig)
  )
    .update(`${scope}:${value}`)
    .digest("hex");

  return makeAuthenticationScopedAbuseRateLimitKey(scope, digest, endpointPath);
}

async function makeAuthenticationAbuseRateLimitReservationRequests(options: {
  readonly authConfig: Pick<AuthenticationConfig, "secret" | "secrets">;
  readonly endpointPath: string;
  readonly ipAddress: string;
  readonly request: Request;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
  readonly rule: AuthenticationRateLimitRule;
}): Promise<AuthenticationRateLimitReservationRequest[]> {
  const reservationRequests: AuthenticationRateLimitReservationRequest[] = [
    {
      key: makeAuthenticationAbuseRateLimitKey(
        options.ipAddress,
        options.endpointPath
      ),
      keyKind: "path_ip",
      rule: options.rule,
    },
  ];

  const sessionResolution =
    await resolveAuthenticationRateLimitSessionForEndpoint({
      endpointPath: options.endpointPath,
      request: options.request,
      resolveSession: options.resolveSession,
    });
  const requestBody = shouldReadBodyForRateLimitEndpoint(
    options.endpointPath,
    sessionResolution
  )
    ? await readAuthenticationRateLimitRequestBody(options.request)
    : ({
        body: null,
        status: "available",
      } satisfies AuthenticationRateLimitRequestBody);

  reservationRequests.push(
    ...makeAuthenticationDeliveryRateLimitReservationRequests({
      authConfig: options.authConfig,
      endpointPath: options.endpointPath,
      requestBody,
      rule: options.rule,
      sessionResolution,
    })
  );

  if (
    options.endpointPath !== ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH ||
    options.resolveSession === undefined
  ) {
    return reservationRequests;
  }

  if (sessionResolution.status === "unauthenticated") {
    return reservationRequests;
  }

  if (sessionResolution.status === "resolutionFailed") {
    throw new AuthRateLimitStorageReadError({
      cause: sessionResolution.error,
      endpointPath: options.endpointPath,
    });
  }

  const actorUserId = decodeIdentityBoundaryValue(
    sessionResolution.session.user.id,
    decodeUserId
  );

  if (actorUserId !== null) {
    reservationRequests.push({
      key: makeAuthenticationScopedAbuseRateLimitKey(
        "actor",
        actorUserId,
        options.endpointPath
      ),
      keyKind: "actor",
      rule: ORGANIZATION_INVITATION_ACTOR_RATE_LIMIT_RULE,
    });
  }

  const organizationId = resolveOrganizationInviteMemberRateLimitOrganizationId(
    {
      requestBody: requireAuthenticationRateLimitRequestBody({
        endpointPath: options.endpointPath,
        requestBody,
      }),
      session: sessionResolution.session,
    }
  );

  if (organizationId !== null) {
    reservationRequests.push({
      key: makeAuthenticationScopedAbuseRateLimitKey(
        "organization",
        organizationId,
        options.endpointPath
      ),
      keyKind: "organization",
      rule: ORGANIZATION_INVITATION_ORGANIZATION_RATE_LIMIT_RULE,
    });
  }

  return reservationRequests;
}

function resolveAuthenticationRateLimitSessionForEndpoint(options: {
  readonly endpointPath: string;
  readonly request: Request;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
}): Promise<AuthenticationAbuseRateLimitSessionResolution> {
  if (
    options.resolveSession === undefined ||
    !shouldResolveSessionForRateLimitEndpoint(options.endpointPath)
  ) {
    return Promise.resolve({ status: "unauthenticated" });
  }

  return resolveAuthenticationAbuseRateLimitSession(
    options.request,
    options.resolveSession
  );
}

function shouldResolveSessionForRateLimitEndpoint(endpointPath: string) {
  return (
    endpointPath === "/send-verification-email" ||
    endpointPath === "/change-email" ||
    endpointPath === ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH
  );
}

function shouldReadBodyForRateLimitEndpoint(
  endpointPath: string,
  sessionResolution: AuthenticationAbuseRateLimitSessionResolution
) {
  switch (endpointPath) {
    case "/request-password-reset": {
      return true;
    }
    case "/send-verification-email": {
      return sessionResolution.status !== "resolved";
    }
    case "/change-email":
    case ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH: {
      return sessionResolution.status === "resolved";
    }
    default: {
      return false;
    }
  }
}

function makeAuthenticationDeliveryRateLimitReservationRequests(options: {
  readonly authConfig: Pick<AuthenticationConfig, "secret" | "secrets">;
  readonly endpointPath: string;
  readonly requestBody: AuthenticationRateLimitRequestBody;
  readonly rule: AuthenticationRateLimitRule;
  readonly sessionResolution: AuthenticationAbuseRateLimitSessionResolution;
}): AuthenticationRateLimitReservationRequest[] {
  switch (options.endpointPath) {
    case "/request-password-reset": {
      const email = readNormalizedAuthDeliveryEmailField(
        requireAuthenticationRateLimitRequestBody(options),
        "email"
      );

      return email === null
        ? []
        : [
            makeAuthenticationEmailRateLimitReservationRequest({
              authConfig: options.authConfig,
              email,
              endpointPath: options.endpointPath,
              keyKind: "target_email",
              rule: options.rule,
              scope: "target-email",
            }),
          ];
    }
    case "/send-verification-email": {
      const email =
        options.sessionResolution.status === "resolved"
          ? normalizeAuthDeliveryEmail(
              options.sessionResolution.session.user.email
            )
          : readNormalizedAuthDeliveryEmailField(
              requireAuthenticationRateLimitRequestBody(options),
              "email"
            );
      const reservationRequests =
        email === null
          ? []
          : [
              makeAuthenticationEmailRateLimitReservationRequest({
                authConfig: options.authConfig,
                email,
                endpointPath: options.endpointPath,
                keyKind: "target_email",
                rule: options.rule,
                scope: "target-email",
              }),
            ];

      if (options.sessionResolution.status === "resolved") {
        const userId = decodeIdentityBoundaryValue(
          options.sessionResolution.session.user.id,
          decodeUserId
        );

        if (userId !== null) {
          reservationRequests.push(
            makeAuthenticationUserRateLimitReservationRequest({
              endpointPath: options.endpointPath,
              rule: options.rule,
              userId,
            })
          );
        }
      }

      return reservationRequests;
    }
    case "/change-email": {
      if (options.sessionResolution.status !== "resolved") {
        return [];
      }

      const destinationEmail = readNormalizedAuthDeliveryEmailField(
        requireAuthenticationRateLimitRequestBody(options),
        "newEmail"
      );
      const reservationRequests =
        destinationEmail === null
          ? []
          : [
              makeAuthenticationEmailRateLimitReservationRequest({
                authConfig: options.authConfig,
                email: destinationEmail,
                endpointPath: options.endpointPath,
                keyKind: "destination_email",
                rule: options.rule,
                scope: "destination-email",
              }),
            ];

      const userId = decodeIdentityBoundaryValue(
        options.sessionResolution.session.user.id,
        decodeUserId
      );

      if (userId !== null) {
        reservationRequests.push(
          makeAuthenticationUserRateLimitReservationRequest({
            endpointPath: options.endpointPath,
            rule: options.rule,
            userId,
          })
        );
      }

      return reservationRequests;
    }
    case ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH: {
      if (options.sessionResolution.status !== "resolved") {
        return [];
      }

      const recipientEmail = readNormalizedAuthDeliveryEmailField(
        requireAuthenticationRateLimitRequestBody(options),
        "email"
      );

      return recipientEmail === null
        ? []
        : [
            makeAuthenticationEmailRateLimitReservationRequest({
              authConfig: options.authConfig,
              email: recipientEmail,
              endpointPath: options.endpointPath,
              keyKind: "recipient_email",
              rule: ORGANIZATION_INVITATION_ACTOR_RATE_LIMIT_RULE,
              scope: "recipient-email",
            }),
          ];
    }
    default: {
      return [];
    }
  }
}

function requireAuthenticationRateLimitRequestBody(options: {
  readonly endpointPath: string;
  readonly requestBody: AuthenticationRateLimitRequestBody;
}) {
  if (options.requestBody.status === "available") {
    return options.requestBody.body;
  }

  throw new AuthRateLimitRequestBodyUnavailableError({
    endpointPath: options.endpointPath,
    reason: options.requestBody.reason,
  });
}

function makeAuthenticationEmailRateLimitReservationRequest(options: {
  readonly authConfig: Pick<AuthenticationConfig, "secret" | "secrets">;
  readonly email: string;
  readonly endpointPath: string;
  readonly keyKind: Extract<
    AuthenticationRateLimitKeyKind,
    "destination_email" | "recipient_email" | "target_email"
  >;
  readonly rule: AuthenticationRateLimitRule;
  readonly scope: Extract<
    AuthenticationScopedRateLimitKeyScope,
    "destination-email" | "recipient-email" | "target-email"
  >;
}): AuthenticationRateLimitReservationRequest {
  return {
    key: makeAuthenticationHashedScopedAbuseRateLimitKey(
      options.authConfig,
      options.scope,
      options.email,
      options.endpointPath
    ),
    keyKind: options.keyKind,
    rule: options.rule,
  };
}

function makeAuthenticationUserRateLimitReservationRequest(options: {
  readonly endpointPath: string;
  readonly rule: AuthenticationRateLimitRule;
  readonly userId: UserId;
}): AuthenticationRateLimitReservationRequest {
  return {
    key: makeAuthenticationScopedAbuseRateLimitKey(
      "user",
      options.userId,
      options.endpointPath
    ),
    keyKind: "user",
    rule: options.rule,
  };
}

async function readAuthenticationRateLimitRequestBody(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = readRequestContentLength(request);

    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    ) {
      return {
        reason: "body_too_large",
        status: "unavailable",
      } satisfies AuthenticationRateLimitRequestBody;
    }

    if (
      !contentType.includes("application/json") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return request.body === null || contentLength === 0
        ? ({
            body: null,
            status: "available",
          } satisfies AuthenticationRateLimitRequestBody)
        : ({
            reason: "unsupported_content_type",
            status: "unavailable",
          } satisfies AuthenticationRateLimitRequestBody);
    }

    const bodyText = await readLimitedRequestText(
      request,
      AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    );

    if (bodyText === null) {
      return {
        reason: "body_too_large",
        status: "unavailable",
      } satisfies AuthenticationRateLimitRequestBody;
    }

    if (bodyText.length === 0) {
      return {
        body: null,
        status: "available",
      } satisfies AuthenticationRateLimitRequestBody;
    }

    if (contentType.includes("application/json")) {
      const body = JSON.parse(bodyText);

      return isRecord(body)
        ? ({
            body,
            status: "available",
          } satisfies AuthenticationRateLimitRequestBody)
        : ({
            reason: "invalid_body",
            status: "unavailable",
          } satisfies AuthenticationRateLimitRequestBody);
    }

    return {
      body: Object.fromEntries(new URLSearchParams(bodyText).entries()),
      status: "available",
    } satisfies AuthenticationRateLimitRequestBody;
  } catch {
    return {
      reason: "read_failed",
      status: "unavailable",
    } satisfies AuthenticationRateLimitRequestBody;
  }
}

function readNormalizedAuthDeliveryEmailField(
  body: Record<string, unknown> | null,
  field: string
) {
  return normalizeAuthDeliveryEmail(readStringField(body, field));
}

function normalizeAuthDeliveryEmail(value: string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedEmail = value.trim().toLowerCase();

  return normalizedEmail.length > 0 &&
    normalizedEmail.length <= AUTH_DELIVERY_EMAIL_MAX_LENGTH
    ? normalizedEmail
    : null;
}

async function resolveAuthenticationAbuseRateLimitSession(
  request: Request,
  resolveSession: (
    request: Request
  ) => Promise<AuthenticationSessionResult | null>
): Promise<AuthenticationAbuseRateLimitSessionResolution> {
  try {
    const session = await resolveSession(request);

    return session === null
      ? { status: "unauthenticated" }
      : {
          session,
          status: "resolved",
        };
  } catch (error) {
    return {
      error,
      status: "resolutionFailed",
    };
  }
}

function resolveOrganizationInviteMemberRateLimitOrganizationId(options: {
  readonly requestBody: Record<string, unknown> | null;
  readonly session: AuthenticationSessionResult;
}) {
  const activeOrganizationId = decodeIdentityBoundaryValue(
    options.session.session.activeOrganizationId,
    decodeOrganizationId
  );
  const requestedOrganizationId = decodeIdentityBoundaryValue(
    readStringField(options.requestBody, "organizationId"),
    decodeOrganizationId
  );

  if (
    activeOrganizationId !== null &&
    requestedOrganizationId !== null &&
    requestedOrganizationId !== activeOrganizationId
  ) {
    throw new AuthOrganizationRateLimitContextMismatchError();
  }

  return requestedOrganizationId ?? activeOrganizationId;
}

async function reserveAuthenticationRateLimit(options: {
  readonly database: NodePgDatabase;
  readonly key: string;
  readonly rule: AuthenticationRateLimitRule;
}): Promise<AuthenticationRateLimitReservation> {
  const now = Date.now();
  const resetBefore = now - options.rule.window * 1000;
  const [reservation] = await options.database
    .insert(rateLimitTable)
    .values({
      count: 1,
      key: options.key,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      set: {
        count: sql<number>`case when ${rateLimitTable.lastRequest} <= ${resetBefore} then 1 else ${rateLimitTable.count} + 1 end`,
        lastRequest: now,
      },
      target: rateLimitTable.key,
    })
    .returning({
      count: rateLimitTable.count,
    });

  if (!reservation) {
    throw new Error("Auth rate-limit reservation did not return a row.");
  }

  return {
    allowed: reservation.count <= options.rule.max,
    retryAfterSeconds: options.rule.window,
  };
}

function makeAuthenticationRateLimitExceededResponse(
  retryAfterSeconds: number
) {
  return Response.json(
    {
      message: "Too many requests. Please try again later.",
    },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-Retry-After": String(retryAfterSeconds),
      },
      status: 429,
      statusText: "Too Many Requests",
    }
  );
}

export function withOAuthClientManagementEndpointGuard(
  handler: (request: Request) => Promise<Response>,
  basePath: string
) {
  return (request: Request) => {
    const endpointPath = resolveAuthenticationEndpointPath(request, basePath);

    if (!OAUTH_CLIENT_MANAGEMENT_ENDPOINT_PATHS.has(endpointPath)) {
      return handler(request);
    }

    return Promise.resolve(
      Response.json(
        {
          code: OAUTH_CLIENT_MANAGEMENT_DISABLED_ERROR_CODE,
          message: "OAuth client management requires manual approval.",
        },
        {
          status: 403,
        }
      )
    );
  };
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
  readonly body: Record<string, unknown> | null;
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
  readonly metadata?: Record<string, unknown> | undefined;
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
  readonly body: Record<string, unknown> | null;
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
  const endpointPath = resolveAuthenticationEndpointPath(
    request,
    options.authConfig.basePath
  );

  if (
    request.method !== "POST" ||
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
  readonly body: Record<string, unknown> | null;
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

    const email = readStringField(options.body, "email")?.toLowerCase() ?? null;
    const organizationId =
      readStringField(options.body, "organizationId") ??
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
  readonly body: Record<string, unknown> | null;
  readonly database: NodePgDatabase;
  readonly runtimeContext: AuthEffectRuntimeContext;
}) {
  const memberId =
    readStringField(options.body, "memberId") ??
    readStringField(options.body, "memberIdOrEmail");

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
          readStringField(responseBody, "email") ??
          options.snapshot.invitationBefore.email,
        role:
          readStringField(responseBody, "role") ??
          options.snapshot.invitationBefore.role,
      }),
      outcome: "succeeded",
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      readStringField(responseBody, "organizationId") ??
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
    readStringField(responseBody, "id") ??
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
  body: Record<string, unknown> | null,
  previousOrganizationId: string | null
) {
  const requestedOrganizationId = body?.organizationId;

  if (requestedOrganizationId === null) {
    return null;
  }

  return typeof requestedOrganizationId === "string"
    ? requestedOrganizationId
    : previousOrganizationId;
}

async function recordOrganizationMemberRoleUpdatedSecurityAuditEvent(options: {
  readonly options: OrganizationSecurityAuditEventRecorderOptions;
  readonly response: Response;
  readonly snapshot: OrganizationSecurityAuditRequestSnapshot;
}) {
  const responseBody = await readOAuthSecurityAuditResponseBody(
    options.response
  );
  const member = isRecord(responseBody?.member)
    ? responseBody.member
    : responseBody;
  const memberId =
    readStringField(member, "id") ??
    readStringField(options.snapshot.body, "memberId");
  const organizationId =
    readStringField(member, "organizationId") ??
    options.snapshot.memberBefore?.organizationId ??
    options.snapshot.session?.session.activeOrganizationId;

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_member_role_updated",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId,
        previousRole: options.snapshot.memberBefore?.role,
        role: readStringField(member, "role"),
        targetUserId:
          readStringField(member, "userId") ??
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
  const member = isRecord(responseBody?.member)
    ? responseBody.member
    : (options.snapshot.memberBefore ?? null);

  await recordOrganizationSecurityAuditEvent(options.options, {
    actorUserId: options.snapshot.session?.user.id,
    eventType: "organization_member_removed",
    metadata: {
      ...makeOrganizationMemberAuditMetadata({
        memberId:
          readStringField(member, "id") ?? options.snapshot.memberBefore?.id,
        role:
          readStringField(member, "role") ??
          options.snapshot.memberBefore?.role,
        targetUserId:
          readStringField(member, "userId") ??
          options.snapshot.memberBefore?.userId,
      }),
      outcome: "succeeded",
      source: "better_auth_organization_endpoint",
    },
    organizationId:
      readStringField(member, "organizationId") ??
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
  const endpointPath = resolveAuthenticationEndpointPath(
    request,
    options.authConfig.basePath
  );

  if (
    request.method !== "POST" ||
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
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = readRequestContentLength(request);

    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES
    ) {
      return null;
    }

    if (
      !contentType.includes("application/json") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return null;
    }

    const bodyText = await readLimitedRequestText(
      request,
      OAUTH_SECURITY_AUDIT_MAX_REQUEST_BODY_BYTES
    );

    if (bodyText === null || bodyText.length === 0) {
      return null;
    }

    if (contentType.includes("application/json")) {
      const body = JSON.parse(bodyText);
      return isRecord(body) ? body : null;
    }

    return Object.fromEntries(new URLSearchParams(bodyText).entries());
  } catch {
    return null;
  }
}

async function readLimitedRequestText(request: Request, maxBodyBytes: number) {
  const reader = request.clone().body?.getReader();

  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let bodyText = "";

  while (true) {
    const readResult = await reader.read();

    if (readResult.done) {
      return bodyText + decoder.decode();
    }

    byteCount += readResult.value.byteLength;

    if (byteCount > maxBodyBytes) {
      void cancelRequestReader(reader);
      return null;
    }

    bodyText += decoder.decode(readResult.value, { stream: true });
  }
}

async function cancelRequestReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  try {
    await reader.cancel();
  } catch {
    // Best-effort cancellation only; callers already stop processing the body.
  }
}

function readRequestContentLength(request: Request) {
  const contentLength = request.headers.get("content-length");

  return contentLength === null ? null : Number(contentLength);
}

async function readBoundedJsonRecordRequestBody(
  request: Request,
  endpointPath: string
) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = readRequestContentLength(request);

    if (
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    ) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "body_too_large",
      });
    }

    if (!contentType.includes("application/json")) {
      if (request.body === null || contentLength === 0) {
        return null;
      }

      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "unsupported_content_type",
      });
    }

    const bodyText = await readLimitedRequestText(
      request,
      AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES
    );

    if (bodyText === null) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "body_too_large",
      });
    }

    if (bodyText.length === 0) {
      return null;
    }

    const body = JSON.parse(bodyText);

    if (!isRecord(body)) {
      throw new AuthRateLimitRequestBodyUnavailableError({
        endpointPath,
        reason: "invalid_body",
      });
    }

    return body;
  } catch (error) {
    if (error instanceof AuthRateLimitRequestBodyUnavailableError) {
      throw error;
    }

    throw new AuthRateLimitRequestBodyUnavailableError({
      endpointPath,
      reason: "read_failed",
    });
  }
}

async function resolveOAuthSecurityAuditTokenContext(options: {
  readonly body: Record<string, unknown> | null;
  readonly database: NodePgDatabase;
  readonly endpointPath: string;
  readonly runtimeContext: AuthEffectRuntimeContext;
}): Promise<OAuthSecurityAuditTokenContext | null> {
  try {
    if (
      options.endpointPath === OAUTH_TOKEN_ENDPOINT_PATH &&
      readStringField(options.body, "grant_type") === "refresh_token"
    ) {
      const refreshToken = readStringField(options.body, "refresh_token");
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

    const token = readStringField(options.body, "token");
    if (!token) {
      return null;
    }

    const tokenTypeHint = readStringField(options.body, "token_type_hint");

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
        organizationId: decodeIdentityBoundaryValue(
          row.referenceId,
          decodeOrganizationId
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
        organizationId: decodeIdentityBoundaryValue(
          row.referenceId,
          decodeOrganizationId
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
    readStringField(responseBody, "scope"),
    readStringField(options.snapshot.body, "scope")
  );

  await writeAuthSecurityAuditEvent(options.options, {
    actorUserId: readStringField(responseBody, "user_id"),
    eventType: succeeded
      ? "oauth_client_registration_succeeded"
      : "oauth_client_registration_rejected",
    metadata: {
      dynamicRegistration: true,
      oauthError: succeeded ? null : readStringField(responseBody, "error"),
      outcome: succeeded ? "succeeded" : "rejected",
    },
    oauthClientId: readStringField(responseBody, "client_id"),
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
    readStringField(options.snapshot.body, "scope"),
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
    readStringField(options.snapshot.body, "grant_type") !== "refresh_token"
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
      readStringField(options.snapshot.body, "client_id"),
    organizationId: options.snapshot.tokenContext?.organizationId,
    scopes:
      options.snapshot.tokenContext?.scopes ??
      resolveOAuthAuditScopes(
        readStringField(responseBody, "scope"),
        readStringField(options.snapshot.body, "scope")
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
        readStringField(options.snapshot.body, "token_type_hint") ?? null,
    },
    oauthClientId:
      options.snapshot.tokenContext?.clientId ??
      readStringField(options.snapshot.body, "client_id"),
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
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function readOAuthQuerySearchParams(body: Record<string, unknown> | null) {
  const oauthQuery = readStringField(body, "oauth_query");
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

function readStringField(value: Record<string, unknown> | null, field: string) {
  const fieldValue = value?.[field];
  return typeof fieldValue === "string" && fieldValue.length > 0
    ? fieldValue
    : null;
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
    if (
      request.method !== "POST" ||
      resolveAuthenticationEndpointPath(request, options.basePath) !==
        OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH
    ) {
      return handler(request);
    }

    const body = await readBoundedJsonRecordRequestBody(
      request,
      OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH
    );

    if (body === null) {
      return handler(request);
    }

    const rejection = validateOAuthClientRegistrationRequest(body, options);

    if (rejection === null) {
      return handler(makePublicOAuthClientRegistrationRequest(request, body));
    }

    await reportOAuthClientRegistrationRejected(
      rejection.reason,
      rejection.severity,
      options.runtimeContext ?? Context.empty()
    );

    return makeOAuthClientRegistrationPolicyErrorResponse(rejection);
  };
}

function validateOAuthClientRegistrationRequest(
  body: Record<string, unknown>,
  options: {
    readonly allowLoopbackRedirects: boolean;
    readonly allowedScopes: readonly string[];
  }
): OAuthClientRegistrationPolicyRejection | null {
  const unknownField = Object.keys(body).find(
    (field) => !OAUTH_CLIENT_REGISTRATION_ALLOWED_FIELDS.has(field)
  );

  if (unknownField) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "Unsupported dynamic client registration metadata.",
      reason: "unsupported_metadata_field",
      severity: "dashboard",
    });
  }

  const publicClientRejection =
    validateOAuthClientRegistrationPublicClientMetadata(body);

  if (publicClientRejection) {
    return publicClientRejection;
  }

  const scopeRejection = validateOAuthClientRegistrationScope(
    body.scope,
    options.allowedScopes
  );

  if (scopeRejection) {
    return scopeRejection;
  }

  const grantTypesRejection = validateOAuthClientRegistrationGrantTypes(
    body.grant_types
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
    value: body.response_types,
  });

  if (responseTypesRejection) {
    return responseTypesRejection;
  }

  if ("skip_consent" in body) {
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
    value: body.redirect_uris,
  });

  if (redirectRejection) {
    return redirectRejection;
  }

  const logoutRedirectRejection = validateOAuthClientRegistrationUriList({
    allowLoopbackRedirects: options.allowLoopbackRedirects,
    field: "post_logout_redirect_uris",
    maxCount: OAUTH_CLIENT_REGISTRATION_MAX_REDIRECT_URIS,
    value: body.post_logout_redirect_uris,
  });

  if (logoutRedirectRejection) {
    return logoutRedirectRejection;
  }

  return (
    validateOAuthClientRegistrationStringField(
      body.client_name,
      OAUTH_CLIENT_REGISTRATION_MAX_CLIENT_NAME_LENGTH,
      "client_name_too_long"
    ) ??
    validateOAuthClientRegistrationUrlField(
      body.client_uri,
      options.allowLoopbackRedirects,
      "client_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      body.logo_uri,
      options.allowLoopbackRedirects,
      "logo_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      body.tos_uri,
      options.allowLoopbackRedirects,
      "tos_uri"
    ) ??
    validateOAuthClientRegistrationUrlField(
      body.policy_uri,
      options.allowLoopbackRedirects,
      "policy_uri"
    ) ??
    validateOAuthClientRegistrationStringField(
      body.software_id,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_ID_LENGTH,
      "software_id_too_long"
    ) ??
    validateOAuthClientRegistrationStringField(
      body.software_version,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_VERSION_LENGTH,
      "software_version_too_long"
    ) ??
    validateOAuthClientRegistrationStringField(
      body.software_statement,
      OAUTH_CLIENT_REGISTRATION_MAX_SOFTWARE_STATEMENT_LENGTH,
      "software_statement_too_long"
    ) ??
    validateOAuthClientRegistrationContacts(body.contacts)
  );
}

function makePublicOAuthClientRegistrationRequest(
  request: Request,
  body: Record<string, unknown>
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
  body: Record<string, unknown>
) {
  if (
    body.token_endpoint_auth_method !== undefined &&
    typeof body.token_endpoint_auth_method !== "string"
  ) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "token_endpoint_auth_method must be a string.",
      reason: "token_endpoint_auth_method_invalid_shape",
      severity: "dashboard",
    });
  }

  if (
    typeof body.token_endpoint_auth_method === "string" &&
    body.token_endpoint_auth_method !== "none"
  ) {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Dynamic client registration can only create public clients.",
      reason: "confidential_client_requested",
      severity: "high",
    });
  }

  if (body.type !== undefined && typeof body.type !== "string") {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description: "type must be a string.",
      reason: "type_invalid_shape",
      severity: "dashboard",
    });
  }

  if (body.type === "web") {
    return makeOAuthClientRegistrationPolicyRejection({
      error: "invalid_client_metadata",
      description:
        "Dynamic client registration can only create public clients.",
      reason: "confidential_client_requested",
      severity: "high",
    });
  }

  if (
    typeof body.type === "string" &&
    body.type !== "native" &&
    body.type !== "user-agent-based"
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
  scope: unknown,
  allowedScopes: readonly string[]
): OAuthClientRegistrationPolicyRejection | null {
  if (typeof scope !== "string") {
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

function validateOAuthClientRegistrationGrantTypes(value: unknown) {
  if (Array.isArray(value) && value.includes("client_credentials")) {
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
  readonly value: unknown;
}) {
  if (options.value === undefined) {
    return null;
  }

  if (!Array.isArray(options.value)) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection(options.field);
  }

  if (options.value.some((value) => typeof value !== "string")) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection(options.field);
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
  readonly value: unknown;
}) {
  if (options.value === undefined) {
    return null;
  }

  if (!Array.isArray(options.value)) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection(options.field);
  }

  if (options.value.some((value) => typeof value !== "string")) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection(options.field);
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

  const high = Number.parseInt(hexMappedIPv4Match.groups.high, 16);
  const low = Number.parseInt(hexMappedIPv4Match.groups.low, 16);

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
  value: unknown,
  maxLength: number,
  reason: string
) {
  if (typeof value !== "string" || value.length <= maxLength) {
    return null;
  }

  return makeOAuthClientRegistrationPolicyRejection({
    error: "invalid_client_metadata",
    description: "Dynamic client registration metadata is too long.",
    reason,
    severity: "dashboard",
  });
}

function validateOAuthClientRegistrationContacts(value: unknown) {
  if (value !== undefined && !Array.isArray(value)) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection("contacts");
  }

  if (!Array.isArray(value)) {
    return null;
  }

  if (value.some((contact) => typeof contact !== "string")) {
    return makeOAuthClientRegistrationInvalidArrayShapeRejection("contacts");
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
    if (typeof contact === "string" && contact.length > 320) {
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

export function makeObservedDatabaseRateLimitStorage(
  database: NodePgDatabase,
  runtimeContext: AuthEffectRuntimeContext = Context.empty()
): ObservedRateLimitStorage {
  return {
    get: (key) =>
      measureAuthenticationPhase("auth.rateLimitReadMs", async () => {
        try {
          const [row] = await database
            .select({
              count: rateLimitTable.count,
              key: rateLimitTable.key,
              lastRequest: rateLimitTable.lastRequest,
            })
            .from(rateLimitTable)
            .where(eq(rateLimitTable.key, key))
            .limit(1);

          return row ?? null;
        } catch (error) {
          await reportRateLimitStorageReadFailure(
            key,
            error,
            "fail_open",
            runtimeContext
          );
          return null;
        }
      }),
    set: (key, value, update) =>
      measureAuthenticationPhase("auth.rateLimitWriteMs", async () => {
        const nextValue = {
          count: value.count,
          key: value.key,
          lastRequest: value.lastRequest,
        } satisfies ObservedRateLimit;

        try {
          if (update) {
            await database
              .update(rateLimitTable)
              .set({
                count: nextValue.count,
                lastRequest: nextValue.lastRequest,
              })
              .where(eq(rateLimitTable.key, key));
            return;
          }

          await database
            .insert(rateLimitTable)
            .values(nextValue)
            .onConflictDoUpdate({
              set: {
                count: nextValue.count,
                lastRequest: nextValue.lastRequest,
              },
              target: rateLimitTable.key,
            });
        } catch (error) {
          await reportRateLimitStorageWriteFailure(error, runtimeContext);
        }
      }),
  };
}

async function reportRateLimitStorageReadFailure(
  key: string,
  error: unknown,
  failureMode:
    | "fail_closed"
    | "fail_open" = shouldFailOpenForRateLimitStorageRead(key)
    ? "fail_open"
    : "fail_closed",
  runtimeContext: AuthEffectRuntimeContext = Context.empty()
) {
  const endpointPath = extractRateLimitEndpointPath(key);

  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth rate-limit storage read failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_storage_failure",
        authAbuseSignal: "rate_limit_storage_read_failure",
        authAbuseSignalSeverity: "dashboard",
        authRateLimitEndpointPath: endpointPath ?? "unknown",
        authRateLimitFailure: "read_failed",
        authRateLimitFailureCause: serializeUnknownCause(error),
        authRateLimitFailureMode: failureMode,
      })
    )
  );
}

async function reportRateLimitStorageWriteFailure(
  error: unknown,
  runtimeContext: AuthEffectRuntimeContext
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth rate-limit storage write failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_storage_failure",
        authAbuseSignal: "rate_limit_storage_write_failure",
        authAbuseSignalSeverity: "dashboard",
        authRateLimitFailure: "write_failed",
        authRateLimitFailureCause: serializeUnknownCause(error),
      })
    )
  );
}

async function reportAuthenticationAbuseRateLimitMissingClientIp(
  endpointPath: string,
  failureMode: "fail_closed" | "fail_open",
  runtimeContext: AuthEffectRuntimeContext = Context.empty()
) {
  await Effect.runPromiseWith(runtimeContext)(
    Effect.logWarning("Auth abuse rate-limit client IP unavailable").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy:
          failureMode === "fail_closed"
            ? "alert_on_sustained_client_ip_failure"
            : "dashboard_until_sustained_client_ip_failure",
        authAbuseSignal: "rate_limit_client_ip_unavailable",
        authAbuseSignalSeverity:
          failureMode === "fail_closed" ? "high" : "dashboard",
        authRateLimitEndpointPath: endpointPath,
        authRateLimitFailure: "client_ip_unavailable",
        authRateLimitFailureMode: failureMode,
      })
    )
  );
}

async function reportRateLimitStorageReservationFailure(options: {
  readonly error: unknown;
  readonly failureMode: "fail_closed" | "fail_open";
  readonly key: string;
  readonly keyKind: AuthenticationRateLimitKeyKind;
  readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
}) {
  await Effect.runPromiseWith(options.runtimeContext ?? Context.empty())(
    Effect.logWarning("Auth abuse rate-limit reservation failed").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy:
          options.failureMode === "fail_closed"
            ? "alert_on_sustained_storage_failure"
            : "dashboard_until_sustained_storage_failure",
        authAbuseSignal: "rate_limit_reservation_failure",
        authAbuseSignalSeverity:
          options.failureMode === "fail_closed" ? "high" : "dashboard",
        authRateLimitEndpointPath:
          extractRateLimitEndpointPath(options.key) ?? "unknown",
        authRateLimitFailure: "reservation_failed",
        authRateLimitFailureCause: serializeUnknownCause(options.error),
        authRateLimitFailureMode: options.failureMode,
        authRateLimitKeyKind: options.keyKind,
      })
    )
  );
}

async function reportAuthenticationAbuseRateLimitExceeded(options: {
  readonly endpointPath: string;
  readonly key: string;
  readonly keyKind: AuthenticationRateLimitKeyKind;
  readonly rule: AuthenticationRateLimitRule;
  readonly runtimeContext: AuthEffectRuntimeContext;
}) {
  await Effect.runPromiseWith(options.runtimeContext)(
    Effect.logInfo("Auth abuse rate limit exceeded").pipe(
      Effect.annotateLogs({
        authAbuseAlertPolicy: "dashboard_until_sustained_spike",
        authAbuseSignal: "rate_limit_hit",
        authAbuseSignalSeverity: "dashboard",
        authRateLimitEndpointPath: options.endpointPath,
        authRateLimitKeyFingerprint: createHash("sha256")
          .update(options.key)
          .digest("hex"),
        authRateLimitKeyKind: options.keyKind,
        authRateLimitMax: options.rule.max,
        authRateLimitWindowSeconds: options.rule.window,
      })
    )
  );
}

function shouldFailOpenForRateLimitStorageRead(key: string) {
  const endpointPath = extractRateLimitEndpointPath(key);

  if (endpointPath === null) {
    return true;
  }

  return shouldFailOpenForRateLimitEndpointPath(endpointPath);
}

function shouldFailOpenForRateLimitEndpointPath(endpointPath: string) {
  if (RATE_LIMIT_FAIL_OPEN_ENDPOINT_PATHS.has(endpointPath)) {
    return true;
  }

  return !RATE_LIMIT_FAIL_CLOSED_ENDPOINT_PATHS.has(endpointPath);
}

function extractRateLimitEndpointPath(key: string) {
  const separatorIndex = key.indexOf("|");

  if (separatorIndex === -1 || separatorIndex === key.length - 1) {
    return null;
  }

  return key.slice(separatorIndex + 1);
}

export function withAuthenticationRateLimitFailureResponse(
  handler: (request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof AuthRateLimitStorageReadError) {
        return Response.json(
          {
            code: AUTH_RATE_LIMIT_UNAVAILABLE_ERROR_CODE,
            message: "Authentication protection is temporarily unavailable.",
          },
          {
            headers: {
              "Retry-After": String(
                AUTH_RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS
              ),
            },
            status: 503,
          }
        );
      }

      if (error instanceof AuthRateLimitRequestBodyUnavailableError) {
        const status = error.reason === "body_too_large" ? 413 : 400;

        return Response.json(
          {
            code: AUTH_RATE_LIMIT_REQUEST_INVALID_ERROR_CODE,
            message:
              status === 413
                ? "Authentication request is too large."
                : "Authentication request is invalid.",
          },
          {
            status,
          }
        );
      }

      if (error instanceof AuthOrganizationRateLimitContextMismatchError) {
        return Response.json(
          {
            code: AUTH_ORGANIZATION_CONTEXT_MISMATCH_ERROR_CODE,
            message:
              "Organization invitations must target the active organization.",
          },
          {
            status: 400,
          }
        );
      }

      throw error;
    }
  };
}

function makeAuthenticationBackgroundTaskHandler() {
  return (task: Promise<unknown>) => {
    // Package-local Node runtime only. The Cloudflare Worker runtime provides a
    // waitUntil-backed handler and schedules durable work through Queues.
    void ignoreAuthenticationBackgroundTaskRejection(task);
  };
}

async function ignoreAuthenticationBackgroundTaskRejection(
  task: Promise<unknown>
) {
  try {
    await task;
  } catch {
    // The default package-local handler has no durable reporting channel.
  }
}

export class AuthenticationBackgroundTaskHandler extends Context.Service<
  AuthenticationBackgroundTaskHandler,
  (task: Promise<unknown>) => void
>()(
  "@ceird/domains/identity/authentication/AuthenticationBackgroundTaskHandler"
) {}

export const AuthenticationBackgroundTaskHandlerLive = Layer.succeed(
  AuthenticationBackgroundTaskHandler,
  makeAuthenticationBackgroundTaskHandler()
);

async function deliverAuthEmail<Input>(options: {
  readonly input: Input;
  readonly reportFailure: AuthEmailFailureReporter;
  readonly send: AuthEmailPromiseSender<Input>;
}) {
  try {
    await options.send(options.input);
  } catch (error) {
    try {
      options.reportFailure(error);
    } catch {
      // Observability must never replace the delivery failure Better Auth sees.
    }
    throw error;
  }
}

export function makeEmailFailureReporter(
  label: string,
  runtimeContext: AuthEffectRuntimeContext = Context.empty()
) {
  return (error: unknown) => {
    const serializedError = serializeBackgroundTaskError(error);

    Effect.runForkWith(runtimeContext)(
      Effect.logError("Authentication background email delivery failed").pipe(
        Effect.annotateLogs({
          authAbuseAlertPolicy: "alert_on_email_failure_threshold",
          authAbuseSignal: "auth_email_delivery_failure",
          authAbuseSignalSeverity: "high",
          authEmailFailureLabel: label,
          ...(serializedError.cause
            ? { authEmailFailureCause: serializedError.cause }
            : {}),
          authEmailFailureMessage: serializedError.message,
          ...(serializedError.tag
            ? { authEmailFailureTag: serializedError.tag }
            : {}),
        })
      )
    );
  };
}

function serializeBackgroundTaskError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    return {
      cause:
        "cause" in error && typeof error.cause === "string"
          ? sanitizeAuthFailureLogValue(error.cause)
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? sanitizeAuthFailureLogValue(error.message)
          : sanitizeAuthFailureLogValue(String(error)),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    message: sanitizeAuthFailureLogValue(String(error)),
  };
}

function sanitizeAuthFailureLogValue(value: string) {
  return value
    .replaceAll(/ceird-auth-abuse:[^\s,]+/g, "[redacted-rate-limit-key]")
    .replaceAll(
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
      "[redacted-ip]"
    )
    .replaceAll(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .replaceAll(/https?:\/\/[^\s]+/g, "[redacted-url]")
    .replaceAll(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]");
}

function serializeUnknownCause(error: unknown) {
  return sanitizeAuthFailureLogValue(
    error instanceof Error ? error.message : String(error)
  );
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = new Set([
    ...current
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    value,
  ]);
  headers.set("Vary", [...values].join(", "));
}

export function withAuthenticationAuthorizationGuards(
  handler: (request: Request) => Promise<Response>,
  database: NodePgDatabase,
  options?: string | AuthenticationAuthorizationGuardOptions
) {
  const guardOptions =
    normalizeAuthenticationAuthorizationGuardOptions(options);

  return async (request: Request) => {
    if (await requestsUnsupportedTwoFactorTrustedDevice(request)) {
      return Response.json(
        {
          code: TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE_ERROR_CODE,
          message: "Trusted devices are not available yet.",
        },
        { status: 400 }
      );
    }

    const verifiedEmailRequirement =
      await resolveVerifiedEmailEndpointRequirement(request);

    if (verifiedEmailRequirement !== null) {
      const access = await resolveVerifiedEmailEndpointAccess(
        database,
        request,
        guardOptions
      );

      if (access === "unverified") {
        return Response.json(
          {
            code: EMAIL_NOT_VERIFIED_ERROR_CODE,
            message: verifiedEmailRequirement.message,
          },
          { status: 403 }
        );
      }

      if (access === "resolutionFailed") {
        return makeSessionResolutionFailureResponse();
      }
    }

    if (isAdministrativeOrganizationEndpointRequest(request)) {
      const access = await resolveAdministrativeOrganizationEndpointAccess(
        database,
        request,
        guardOptions
      );

      if (access === "nonAdministrative") {
        return Response.json(
          {
            code: "FORBIDDEN",
            message:
              "Only organization owners and admins can access organization administration.",
          },
          { status: 403 }
        );
      }

      if (access === "resolutionFailed") {
        return makeSessionResolutionFailureResponse();
      }
    }

    return handler(request);
  };
}

function makeSessionResolutionFailureResponse() {
  return Response.json(
    {
      code: "AUTH_SESSION_UNAVAILABLE",
      message: "We couldn't verify your session. Please try again.",
    },
    { status: 503 }
  );
}

function normalizeAuthenticationAuthorizationGuardOptions(
  options: string | AuthenticationAuthorizationGuardOptions | undefined
): AuthenticationAuthorizationGuardOptions {
  return typeof options === "string"
    ? { cookiePrefix: options }
    : (options ?? {});
}

async function resolveVerifiedEmailEndpointRequirement(
  request: Request
): Promise<VerifiedEmailEndpointRequirement | null> {
  if (isOrganizationCreateEndpointRequest(request)) {
    return {
      message: "Verify your email before creating an organization.",
    };
  }

  if (isOrganizationInviteMemberEndpointRequest(request)) {
    return {
      message: "Verify your email before inviting organization members.",
    };
  }

  if (isTwoFactorEnableEndpointRequest(request)) {
    return {
      message: "Verify your email before setting up two-factor authentication.",
    };
  }

  if (
    isOAuthConsentEndpointRequest(request) &&
    (await isAcceptedOAuthConsentRequest(request))
  ) {
    return {
      message: "Verify your email before approving Ceird access.",
    };
  }

  return null;
}

function isOrganizationCreateEndpointRequest(request: Request) {
  return isPostAuthEndpointRequest(request, ORGANIZATION_CREATE_ENDPOINT_PATH);
}

function isOrganizationInviteMemberEndpointRequest(request: Request) {
  return isPostAuthEndpointRequest(
    request,
    ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH
  );
}

function isTwoFactorEnableEndpointRequest(request: Request) {
  return isPostAuthEndpointRequest(request, TWO_FACTOR_ENABLE_ENDPOINT_PATH);
}

async function requestsUnsupportedTwoFactorTrustedDevice(request: Request) {
  const endpointPath = TWO_FACTOR_TRUSTED_DEVICE_ENDPOINT_PATHS.find((path) =>
    isPostAuthEndpointRequest(request, path)
  );

  if (endpointPath === undefined) {
    return false;
  }

  try {
    const body = await readBoundedJsonRecordRequestBody(request, endpointPath);

    return body?.trustDevice === true;
  } catch {
    return true;
  }
}

function isOAuthConsentEndpointRequest(request: Request) {
  return isPostAuthEndpointRequest(request, OAUTH_CONSENT_ENDPOINT_PATH);
}

function isPostAuthEndpointRequest(request: Request, endpointPath: string) {
  const { pathname } = new URL(request.url);

  return (
    request.method === "POST" &&
    (pathname === endpointPath || pathname.endsWith(endpointPath))
  );
}

async function isAcceptedOAuthConsentRequest(request: Request) {
  const body = await readBoundedJsonRecordRequestBody(
    request,
    OAUTH_CONSENT_ENDPOINT_PATH
  );

  if (body === null) {
    return false;
  }

  if (body.accept !== true) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function resolveVerifiedEmailEndpointAccess(
  database: NodePgDatabase,
  request: Request,
  options: AuthenticationAuthorizationGuardOptions
): Promise<"verified" | "unverified" | "unknown" | "resolutionFailed"> {
  if (options.resolveSession) {
    try {
      const session = await options.resolveSession(request);

      if (session === null) {
        return "unknown";
      }

      return session.user.emailVerified === true ? "verified" : "unverified";
    } catch {
      return "resolutionFailed";
    }
  }

  const sessionToken = extractBetterAuthSessionToken(
    request.headers.get("cookie"),
    { cookiePrefix: options.cookiePrefix }
  );

  if (sessionToken === undefined) {
    return "unknown";
  }

  const [session] = await database
    .select({
      userId: sessionTable.userId,
    })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.token, sessionToken),
        gt(sessionTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (session === undefined) {
    return "unknown";
  }

  const userId = decodeIdentityBoundaryValue(session.userId, decodeUserId);

  if (userId === null) {
    return "unverified";
  }

  const [user] = await database
    .select({
      emailVerified: userTable.emailVerified,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return user?.emailVerified === true ? "verified" : "unverified";
}

function isAdministrativeOrganizationEndpointRequest(request: Request) {
  const { pathname } = new URL(request.url);

  return (
    request.method === "GET" &&
    ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS.some(
      (endpointPath) =>
        pathname === endpointPath || pathname.endsWith(endpointPath)
    )
  );
}

async function resolveAdministrativeOrganizationEndpointAccess(
  database: NodePgDatabase,
  request: Request,
  options: AuthenticationAuthorizationGuardOptions
): Promise<
  "administrative" | "nonAdministrative" | "unknown" | "resolutionFailed"
> {
  if (options.resolveSession) {
    try {
      const session = await options.resolveSession(request);

      if (session === null) {
        return "unknown";
      }

      return await resolveAdministrativeOrganizationSessionAccess(
        database,
        request,
        {
          activeOrganizationId: session.session.activeOrganizationId ?? null,
          userId: session.session.userId,
        }
      );
    } catch {
      return "resolutionFailed";
    }
  }

  const sessionToken = extractBetterAuthSessionToken(
    request.headers.get("cookie"),
    { cookiePrefix: options.cookiePrefix }
  );

  if (sessionToken === undefined) {
    return "unknown";
  }

  const [session] = await database
    .select({
      activeOrganizationId: sessionTable.activeOrganizationId,
      userId: sessionTable.userId,
    })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.token, sessionToken),
        gt(sessionTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (session === undefined) {
    return "unknown";
  }

  return await resolveAdministrativeOrganizationSessionAccess(
    database,
    request,
    session
  );
}

async function resolveAdministrativeOrganizationSessionAccess(
  database: NodePgDatabase,
  request: Request,
  session: {
    readonly activeOrganizationId?: string | null | undefined;
    readonly userId: string;
  }
): Promise<"administrative" | "nonAdministrative" | "unknown"> {
  const userId = decodeIdentityBoundaryValue(session.userId, decodeUserId);

  if (userId === null) {
    return "nonAdministrative";
  }

  const organizationId = await resolveAdministrativeOrganizationTargetId(
    database,
    request,
    session.activeOrganizationId ?? null
  );

  if (organizationId === null) {
    return "nonAdministrative";
  }

  const [member] = await database
    .select({
      role: memberTable.role,
    })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.organizationId, organizationId),
        eq(memberTable.userId, userId)
      )
    )
    .limit(1);

  if (member === undefined) {
    return "unknown";
  }

  return isAdministrativeOrganizationRole(decodeOrganizationRole(member.role))
    ? "administrative"
    : "nonAdministrative";
}

async function resolveAdministrativeOrganizationTargetId(
  database: NodePgDatabase,
  request: Request,
  activeOrganizationId: string | null
): Promise<OrganizationId | null> {
  const { searchParams } = new URL(request.url);
  const organizationSlug = searchParams.get("organizationSlug");

  if (organizationSlug !== null) {
    const decodedOrganizationSlug = decodeIdentityBoundaryValue(
      organizationSlug,
      decodeOrganizationSlug
    );

    if (decodedOrganizationSlug === null) {
      return null;
    }

    const [organizationRow] = await database
      .select({
        id: organizationTable.id,
      })
      .from(organizationTable)
      .where(eq(organizationTable.slug, decodedOrganizationSlug))
      .limit(1);

    return organizationRow === undefined
      ? null
      : decodeIdentityBoundaryValue(organizationRow.id, decodeOrganizationId);
  }

  const organizationId =
    searchParams.get("organizationId") ?? activeOrganizationId;

  return organizationId === null
    ? null
    : decodeIdentityBoundaryValue(organizationId, decodeOrganizationId);
}

export function extractBetterAuthSessionToken(
  cookieHeader: string | null,
  options: { readonly cookiePrefix?: string | undefined } = {}
) {
  if (cookieHeader === null) {
    return;
  }

  const sessionCookieNames = makeBetterAuthSessionCookieNames(
    options.cookiePrefix
  );

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (!sessionCookieNames.has(name)) {
      continue;
    }

    const rawValue = decodeCookieValue(cookie.slice(separatorIndex + 1).trim());
    const [token] = rawValue.split(".", 1);

    if (token && token.length > 0) {
      return token;
    }

    return;
  }
}

function makeBetterAuthSessionCookieNames(cookiePrefix?: string) {
  const prefix =
    cookiePrefix && cookiePrefix.length > 0
      ? cookiePrefix
      : DEFAULT_BETTER_AUTH_COOKIE_PREFIX;
  const bareCookieNames = [
    `${prefix}.session_token`,
    `${prefix}-session_token`,
  ];

  return new Set(
    bareCookieNames.flatMap((cookieName) => [
      cookieName,
      `__Secure-${cookieName}`,
      `__Host-${cookieName}`,
    ])
  );
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isAuthenticationSessionRequest(request: Request) {
  return (
    request.method === "GET" &&
    new URL(request.url).pathname === "/api/auth/get-session"
  );
}

export function makeAuthenticationWebHandler(auth: CeirdAuthentication) {
  return (request: Request) =>
    measureAuthenticationPhase("auth.betterAuthMs", async () => {
      if (!isAuthenticationSessionRequest(request)) {
        return auth.handler(request);
      }

      const session = normalizeAuthenticationSessionResult(
        await auth.api.getSession({
          headers: request.headers,
        })
      );

      return Response.json(serializeAuthenticationSessionResult(session));
    });
}

function serializeAuthenticationSessionResult(
  result: AuthenticationSessionResult | null
) {
  if (result === null) {
    return null;
  }

  return {
    session: {
      activeOrganizationId:
        result.session.activeOrganizationId === null ||
        result.session.activeOrganizationId === undefined
          ? null
          : decodeOrganizationId(result.session.activeOrganizationId),
      createdAt: serializeAuthenticationDate(result.session.createdAt),
      expiresAt: serializeAuthenticationDate(result.session.expiresAt),
      id: decodeSessionId(result.session.id),
      updatedAt: serializeAuthenticationDate(result.session.updatedAt),
      userId: decodeUserId(result.session.userId),
    },
    user: {
      createdAt: serializeAuthenticationDate(result.user.createdAt),
      email: result.user.email,
      emailVerified: result.user.emailVerified,
      id: decodeUserId(result.user.id),
      image: result.user.image ?? null,
      name: result.user.name,
      twoFactorEnabled: readAuthenticationSessionUserTwoFactorEnabled(
        result.user
      ),
      updatedAt: serializeAuthenticationDate(result.user.updatedAt),
    },
  };
}

function readAuthenticationSessionUserTwoFactorEnabled(user: {
  readonly twoFactorEnabled?: unknown;
}) {
  if (typeof user.twoFactorEnabled !== "boolean") {
    throw new TypeError(
      "Authenticated Better Auth sessions must include twoFactorEnabled."
    );
  }

  return user.twoFactorEnabled;
}

function serializeAuthenticationDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function withAuthenticationCors(
  handler: (request: Request) => Promise<Response>,
  trustedOrigins: readonly string[]
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const isTrustedOrigin =
      typeof origin === "string" &&
      matchesTrustedOrigin(origin, trustedOrigins);

    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin) {
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            request.headers.get("access-control-request-headers") ??
            "content-type",
          "Access-Control-Allow-Methods":
            request.headers.get("access-control-request-method") ??
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Max-Age": "600",
        },
      });

      appendVaryHeader(response.headers, "Origin");
      appendVaryHeader(response.headers, "Access-Control-Request-Headers");

      return response;
    }

    const response = await handler(request);

    if (!isTrustedOrigin) {
      return response;
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
    corsResponse.headers.set("Access-Control-Allow-Origin", origin);
    appendVaryHeader(corsResponse.headers, "Origin");

    return corsResponse;
  };
}

export class Authentication extends Context.Service<Authentication>()(
  "@ceird/domains/identity/authentication/Authentication",
  {
    make: Effect.gen(function* AuthenticationLive() {
      const authEmailConfig = yield* loadAuthEmailConfig;
      const config = yield* loadAuthenticationConfig;
      const { authDb } = yield* AppDatabase;
      const authEmailScheduler = yield* AuthenticationEmailScheduler;
      const backgroundTaskHandler = yield* AuthenticationBackgroundTaskHandler;
      const runtimeContext = yield* Effect.context<never>();
      const runAuthEmailEffect = Effect.runPromiseWith(runtimeContext);
      const reportPasswordResetEmailFailure = makeEmailFailureReporter(
        "Password reset email delivery failed",
        runtimeContext
      );
      const reportVerificationEmailFailure = makeEmailFailureReporter(
        "Verification email delivery failed",
        runtimeContext
      );
      const reportEmailChangeConfirmationFailure = makeEmailFailureReporter(
        "Email change confirmation delivery failed",
        runtimeContext
      );
      const reportOrganizationInvitationEmailFailure = makeEmailFailureReporter(
        "Organization invitation email delivery failed",
        runtimeContext
      );
      const reportPasswordCompromiseCheckFailure =
        makePasswordCompromiseCheckFailureReporter(
          runtimeContext,
          backgroundTaskHandler
        );

      return createAuthentication({
        appOrigin: authEmailConfig.appOrigin,
        backgroundTaskHandler,
        config,
        database: authDb,
        reportEmailChangeConfirmationFailure,
        reportOrganizationInvitationEmailFailure,
        reportPasswordCompromiseCheckFailure,
        reportPasswordResetEmailFailure,
        runtimeContext,
        sendOrganizationInvitationEmail: (input) =>
          runAuthEmailEffect(
            authEmailScheduler.sendOrganizationInvitationEmail(input)
          ),
        reportVerificationEmailFailure,
        sendPasswordResetEmail: (input) =>
          runAuthEmailEffect(authEmailScheduler.sendPasswordResetEmail(input)),
        sendVerificationEmail: (input) =>
          runAuthEmailEffect(authEmailScheduler.sendVerificationEmail(input)),
      });
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    Authentication,
    Authentication.make
  );
  static readonly Default = Authentication.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        AuthenticationEmailSchedulerLive,
        AuthenticationBackgroundTaskHandlerLive
      )
    )
  );
}

export const AuthenticationHttpLive = HttpRouter.use((router) =>
  Effect.gen(function* mountAuthenticationHttp() {
    const auth = yield* Authentication;
    const { authDb } = yield* AppDatabase;
    const config = yield* loadAuthenticationConfig;

    // Better Auth expects to receive its configured basePath, so route the
    // wildcard path directly instead of using a prefix-stripping router.
    yield* router.add(
      "*",
      "/api/auth/*",
      HttpEffect.fromWebHandler(
        withAuthenticationCors(
          makeAuthenticationWebHandler(auth),
          config.trustedOrigins
        )
      )
    );

    yield* router.add(
      "*",
      "/api/public/*",
      HttpEffect.fromWebHandler(
        withAuthenticationCors(
          makePublicInvitationPreviewHandler(authDb),
          config.trustedOrigins
        )
      )
    );
  })
);

export const makeAuthenticationLive = (
  emailSchedulerLive: typeof AuthenticationEmailSchedulerLive = AuthenticationEmailSchedulerLive,
  backgroundTaskHandlerLive: Layer.Layer<AuthenticationBackgroundTaskHandler> = AuthenticationBackgroundTaskHandlerLive
) =>
  Authentication.DefaultWithoutDependencies.pipe(
    Layer.provide(emailSchedulerLive),
    Layer.provide(backgroundTaskHandlerLive)
  );

export const AuthenticationLive = makeAuthenticationLive();
