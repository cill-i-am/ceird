import {
  decodeOrganizationRole,
  isAdministrativeOrganizationRole,
  OrganizationId,
  OrganizationRole,
  OrganizationSlugSchema,
  UserId,
} from "@ceird/identity-core";
import { and, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Option, Schema } from "effect";

import {
  DEFAULT_BETTER_AUTH_COOKIE_PREFIX,
  decodeAuthBoundaryOption,
  readAuthBoundaryJsonRequestBody,
} from "./auth-boundary-utils.js";
import type { AuthenticationSessionResult } from "./auth-boundary-utils.js";
import {
  member as memberTable,
  organization as organizationTable,
  session as sessionTable,
  user as userTable,
} from "./schema.js";

const OAUTH_CONSENT_ENDPOINT_PATH = "/oauth2/consent";
const TWO_FACTOR_ENABLE_ENDPOINT_PATH = "/two-factor/enable";
const TWO_FACTOR_SEND_OTP_ENDPOINT_PATH = "/two-factor/send-otp";
const TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH =
  "/two-factor/verify-backup-code";
const TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH = "/two-factor/verify-otp";
const TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH = "/two-factor/verify-totp";
const ORGANIZATION_CREATE_ENDPOINT_PATH = "/organization/create";
const ORGANIZATION_INVITE_MEMBER_ENDPOINT_PATH = "/organization/invite-member";
const ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS = [
  "/organization/get-full-organization",
  "/organization/list-invitations",
  "/organization/list-members",
] as const;
const EMAIL_NOT_VERIFIED_ERROR_CODE = "EMAIL_NOT_VERIFIED";
const TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE_ERROR_CODE =
  "TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE";
const TWO_FACTOR_TRUSTED_DEVICE_ENDPOINT_PATHS = [
  TWO_FACTOR_SEND_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_BACKUP_CODE_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_OTP_ENDPOINT_PATH,
  TWO_FACTOR_VERIFY_TOTP_ENDPOINT_PATH,
] as const;
const TwoFactorTrustedDeviceRequestBodySchema = Schema.Struct({
  trustDevice: Schema.optional(Schema.Boolean),
});
const OAuthConsentAuthorizationRequestBodySchema = Schema.Struct({
  accept: Schema.optional(Schema.Unknown),
});
const VerifiedEmailGuardSessionRowSchema = Schema.Struct({
  userId: UserId,
});
const VerifiedEmailGuardUserRowSchema = Schema.Struct({
  emailVerified: Schema.Boolean,
});
const AdministrativeOrganizationGuardSessionRowSchema = Schema.Struct({
  activeOrganizationId: Schema.NullOr(OrganizationId),
  userId: UserId,
});
const AdministrativeOrganizationGuardMemberRowSchema = Schema.Struct({
  role: OrganizationRole,
});
const AdministrativeOrganizationGuardOrganizationRowSchema = Schema.Struct({
  id: OrganizationId,
});
const decodeVerifiedEmailGuardSessionRowOption = Schema.decodeUnknownOption(
  VerifiedEmailGuardSessionRowSchema
);
const decodeVerifiedEmailGuardUserRowOption = Schema.decodeUnknownOption(
  VerifiedEmailGuardUserRowSchema
);
const decodeAdministrativeOrganizationGuardSessionRowOption =
  Schema.decodeUnknownOption(AdministrativeOrganizationGuardSessionRowSchema);
const decodeAdministrativeOrganizationGuardMemberRowOption =
  Schema.decodeUnknownOption(AdministrativeOrganizationGuardMemberRowSchema);
const decodeAdministrativeOrganizationGuardOrganizationRowOption =
  Schema.decodeUnknownOption(
    AdministrativeOrganizationGuardOrganizationRowSchema
  );

interface AuthenticationAuthorizationGuardOptions {
  readonly cookiePrefix?: string | undefined;
  readonly resolveSession?:
    | ((request: Request) => Promise<AuthenticationSessionResult | null>)
    | undefined;
  readonly secret?: string | undefined;
}
interface VerifiedEmailEndpointRequirement {
  readonly message: string;
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
    const body = await readAuthBoundaryJsonRequestBody(
      request,
      endpointPath,
      TwoFactorTrustedDeviceRequestBodySchema
    );

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
  const body = await readAuthBoundaryJsonRequestBody(
    request,
    OAUTH_CONSENT_ENDPOINT_PATH,
    OAuthConsentAuthorizationRequestBodySchema
  );

  if (body === null) {
    return false;
  }

  if (body.accept !== true) {
    return false;
  }

  return true;
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

  const [sessionRow] = await database
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

  if (sessionRow === undefined) {
    return "unknown";
  }

  const session = Option.getOrNull(
    decodeVerifiedEmailGuardSessionRowOption(sessionRow)
  );

  if (session === null) {
    return "unverified";
  }

  const [userRow] = await database
    .select({
      emailVerified: userTable.emailVerified,
    })
    .from(userTable)
    .where(eq(userTable.id, session.userId))
    .limit(1);

  if (userRow === undefined) {
    return "unverified";
  }

  const user = Option.getOrNull(decodeVerifiedEmailGuardUserRowOption(userRow));

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

  const [sessionRow] = await database
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

  if (sessionRow === undefined) {
    return "unknown";
  }

  const session = Option.getOrNull(
    decodeAdministrativeOrganizationGuardSessionRowOption(sessionRow)
  );

  if (session === null) {
    return "nonAdministrative";
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
  const userId = Option.getOrNull(
    decodeAuthBoundaryOption(UserId, session.userId)
  );

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

  const [memberRow] = await database
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

  if (memberRow === undefined) {
    return "unknown";
  }

  const member = Option.getOrNull(
    decodeAdministrativeOrganizationGuardMemberRowOption(memberRow)
  );

  if (member === null) {
    return "nonAdministrative";
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
    const decodedOrganizationSlug = Option.getOrNull(
      decodeAuthBoundaryOption(OrganizationSlugSchema, organizationSlug)
    );

    if (decodedOrganizationSlug === null) {
      return null;
    }

    const [rawOrganizationRow] = await database
      .select({
        id: organizationTable.id,
      })
      .from(organizationTable)
      .where(eq(organizationTable.slug, decodedOrganizationSlug))
      .limit(1);

    if (rawOrganizationRow === undefined) {
      return null;
    }

    const organizationRow = Option.getOrNull(
      decodeAdministrativeOrganizationGuardOrganizationRowOption(
        rawOrganizationRow
      )
    );

    return organizationRow?.id ?? null;
  }

  const organizationId =
    searchParams.get("organizationId") ?? activeOrganizationId;

  return organizationId === null
    ? null
    : Option.getOrNull(
        decodeAuthBoundaryOption(OrganizationId, organizationId)
      );
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
