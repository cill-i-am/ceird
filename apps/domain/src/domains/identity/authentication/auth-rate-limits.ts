/* eslint-disable max-classes-per-file */
import { createHash, createHmac } from "node:crypto";

import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import type { UserId } from "@ceird/identity-core";
import { getIp } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect } from "effect";

import {
  AUTH_RATE_LIMIT_MAX_REQUEST_BODY_BYTES,
  AuthRateLimitRequestBodyUnavailableError,
  decodeIdentityBoundaryValue,
  isRecord,
  readLimitedRequestText,
  readRequestContentLength,
  readStringField,
  resolveActiveAuthenticationSecret,
  resolveAuthenticationEndpointPath,
  serializeUnknownCause,
} from "./auth-boundary-utils.js";
import type {
  AuthEffectRuntimeContext,
  AuthenticationRateLimitRequestBodyReadFailureReason,
  AuthenticationSessionResult,
} from "./auth-boundary-utils.js";
import { measureAuthenticationPhase } from "./auth-observability.js";
import type { AuthenticationConfig } from "./config.js";
import { rateLimit as rateLimitTable } from "./schema.js";

const OAUTH_CLIENT_REGISTRATION_ENDPOINT_PATH = "/oauth2/register";
const TWO_FACTOR_SEND_OTP_ENDPOINT_PATH = "/two-factor/send-otp";
const TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH =
  "/two-factor/verify-backup-code";
const TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH = "/two-factor/verify-otp";
const TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH = "/two-factor/verify-totp";
const ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH = "/organization/invite-member";
const AUTH_DELIVERY_EMAIL_MAX_LENGTH = 320;
const ORGANIZATION_INVITATION_ACTOR_RATE_LIMIT_RULE = {
  window: 60 * 60,
  max: 30,
} as const satisfies AuthenticationRateLimitRule;
const ORGANIZATION_INVITATION_ORGANIZATION_RATE_LIMIT_RULE = {
  window: 60 * 60 * 24,
  max: 200,
} as const satisfies AuthenticationRateLimitRule;
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
const AUTH_RATE_LIMIT_UNAVAILABLE_ERROR_CODE = "AUTH_RATE_LIMIT_UNAVAILABLE";
const AUTH_RATE_LIMIT_REQUEST_INVALID_ERROR_CODE =
  "AUTH_RATE_LIMIT_REQUEST_INVALID";
const AUTH_ORGANIZATION_CONTEXT_MISMATCH_ERROR_CODE =
  "AUTH_ORGANIZATION_CONTEXT_MISMATCH";
const AUTH_RATE_LIMIT_UNAVAILABLE_RETRY_AFTER_SECONDS = 30;

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
interface AuthenticationAbuseRateLimitGuardOptions {
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
}

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

export class AuthOrganizationRateLimitContextMismatchError extends Error {
  constructor() {
    super("Organization invitation target must match the active organization.");
    this.name = "AuthOrganizationRateLimitContextMismatchError";
  }
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
