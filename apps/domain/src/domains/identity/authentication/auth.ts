/* eslint-disable max-classes-per-file, typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import {
  decodeInvitationId,
  decodeCreateOrganizationInput,
  decodeOrganizationId,
  decodeOrganizationRole,
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
import { APIError } from "better-auth/api";
import type { Role } from "better-auth/plugins/access";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import {
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { and, eq, gt } from "drizzle-orm";
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
import { loadAuthenticationConfig, matchesTrustedOrigin } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  authSchema,
  invitation as invitationTable,
  member as memberTable,
  organization as organizationTable,
  rateLimit as rateLimitTable,
  session as sessionTable,
} from "./schema.js";

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
const ADMINISTRATIVE_ORGANIZATION_ENDPOINT_PATHS = [
  "/organization/get-full-organization",
  "/organization/list-invitations",
  "/organization/list-members",
] as const;
const ORGANIZATION_UPDATE_INPUT_FIELDS = new Set(["name"]);
const SESSION_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "__Host-better-auth.session_token",
  "better-auth-session_token",
] as const;

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
    readonly updatedAt: Date | string;
  } & Record<string, unknown>;
}
interface AuthenticationPluginOption {
  readonly id: string;
  readonly options?: unknown;
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

export function createAuthentication(options: {
  readonly appOrigin: string;
  readonly backgroundTaskHandler: (task: Promise<unknown>) => void;
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase;
  readonly reportPasswordResetEmailFailure: (error: unknown) => void;
  readonly reportEmailChangeConfirmationFailure?: (error: unknown) => void;
  readonly reportOrganizationInvitationEmailFailure?: (error: unknown) => void;
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
    rateLimit: {
      ...authConfig.rateLimit,
      customStorage: makeObservedDatabaseRateLimitStorage(database),
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
        clientRegistrationAllowedScopes: [...oauthScopes],
        clientRegistrationDefaultScopes: [
          ...oauthClientRegistrationDefaultScopes,
        ],
        consentPage,
        disableJwtPlugin: false,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage,
        scopes: [...oauthScopes],
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        validAudiences: [authConfig.baseURL, mcpResourceUrl],
      }),
      organization({
        cancelPendingInvitationsOnReInvite: true,
        invitationExpiresIn: ORGANIZATION_INVITATION_EXPIRATION_SECONDS,
        roles: BETTER_AUTH_ORGANIZATION_ROLES,
        organizationHooks: {
          beforeCreateOrganization: ({ organization: nextOrganization }) => {
            let input;

            try {
              input = decodeCreateOrganizationInput(nextOrganization);
            } catch {
              throwInvalidOrganizationInput(
                "Organization name must be at least 2 characters long and the slug must use lowercase letters, numbers, and hyphens only."
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
          beforeCreateInvitation: ({ invitation: nextInvitation }) =>
            Promise.resolve({
              data: {
                ...nextInvitation,
                role: decodeWritableOrganizationRole(nextInvitation.role),
              },
            }),
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

  auth.handler = withAuthenticationAuthorizationGuards(auth.handler, database);

  return auth as CeirdAuthentication;
}

function makeObservedDatabaseRateLimitStorage(
  database: NodePgDatabase
): ObservedRateLimitStorage {
  return {
    get: (key) =>
      measureAuthenticationPhase("auth.rateLimitReadMs", async () => {
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
          await Effect.runPromise(
            Effect.logWarning("Auth rate-limit storage write failed").pipe(
              Effect.annotateLogs({
                authRateLimitFailure: "write_failed",
                authRateLimitFailureCause: serializeUnknownCause(error),
              })
            )
          );
        }
      }),
  };
}

function makeAuthenticationBackgroundTaskHandler() {
  return (task: Promise<unknown>) => {
    // Package-local Node runtime only. The Cloudflare Worker runtime provides a
    // waitUntil-backed handler and schedules durable work through Queues.
    queueMicrotask(() => {
      void task;
    });
  };
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
          ? error.cause
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : String(error),
      tag: "_tag" in error && typeof error._tag === "string" ? error._tag : "",
    };
  }

  return {
    message: String(error),
  };
}

function serializeUnknownCause(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

function withAuthenticationAuthorizationGuards(
  handler: (request: Request) => Promise<Response>,
  database: NodePgDatabase
) {
  return async (request: Request) => {
    if (isAdministrativeOrganizationEndpointRequest(request)) {
      const access = await resolveAdministrativeOrganizationEndpointAccess(
        database,
        request
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
    }

    return handler(request);
  };
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
  request: Request
): Promise<"administrative" | "nonAdministrative" | "unknown"> {
  const sessionToken = extractBetterAuthSessionToken(
    request.headers.get("cookie")
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

  const userId = decodeIdentityBoundaryValue(session.userId, decodeUserId);

  if (userId === null) {
    return "nonAdministrative";
  }

  const organizationId = await resolveAdministrativeOrganizationTargetId(
    database,
    request,
    session.activeOrganizationId
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
    const [organizationRow] = await database
      .select({
        id: organizationTable.id,
      })
      .from(organizationTable)
      .where(eq(organizationTable.slug, organizationSlug))
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

function extractBetterAuthSessionToken(cookieHeader: string | null) {
  if (cookieHeader === null) {
    return;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();

    if (!isBetterAuthSessionCookieName(name)) {
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

function isBetterAuthSessionCookieName(name: string) {
  return (
    SESSION_COOKIE_NAMES.includes(
      name as (typeof SESSION_COOKIE_NAMES)[number]
    ) ||
    name.endsWith("better-auth.session_token") ||
    name.endsWith("better-auth-session_token")
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

      const session = await auth.api.getSession({
        headers: request.headers,
      });

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
      token: result.session.token,
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
      updatedAt: serializeAuthenticationDate(result.user.updatedAt),
    },
  };
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

      return createAuthentication({
        appOrigin: authEmailConfig.appOrigin,
        backgroundTaskHandler,
        config,
        database: authDb,
        reportEmailChangeConfirmationFailure,
        reportOrganizationInvitationEmailFailure,
        reportPasswordResetEmailFailure,
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
