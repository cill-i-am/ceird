/* eslint-disable max-classes-per-file, typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import {
  decodeInvitationId,
  decodeCreateOrganizationInput,
  decodeInvitableOrganizationRole,
  decodeOrganizationId,
  decodeOrganizationRole,
  decodePublicInvitationPreview,
  decodeSessionId,
  decodeUpdateOrganizationInput,
  decodeUserId,
  InvitableOrganizationRole,
  OrganizationEmailAddress,
  OrganizationId,
  OrganizationMemberId,
  OrganizationNameSchema,
  UserId,
} from "@ceird/identity-core";
import type {
  InvitationId,
  OrganizationRole,
  PublicInvitationPreview,
} from "@ceird/identity-core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
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
import { Context, Effect, Layer, Option, Schema } from "effect";
import { HttpEffect, HttpRouter } from "effect/unstable/http";

import { AppDatabase } from "../../../platform/database/database.js";
import { makeBetterAuthBoundaryPolicyHandler } from "./auth-boundary-policy-adapter.js";
import {
  AuthenticationSessionResultSchema,
  AuthBoundaryRecordSchema,
  decodeAuthBoundaryOption,
  makeRequestLocalAuthenticationSessionResolver,
  maskInvitationEmail,
  sanitizeAuthFailureLogValue,
} from "./auth-boundary-utils.js";
import type {
  AuthEffectRuntimeContext,
  AuthenticationSessionResult,
} from "./auth-boundary-utils.js";
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
import {
  hashOAuthStoredToken,
  makeOrganizationInvitationAuditMetadata,
  recordOrganizationSecurityAuditEvent,
} from "./auth-oauth-policy.js";
import { measureAuthenticationPhase } from "./auth-observability.js";
import {
  makePasswordCompromiseCheckFailureReporter,
  makePasswordCompromiseCheckPlugin,
} from "./auth-password-compromise.js";
import { makeObservedDatabaseRateLimitStorage } from "./auth-rate-limits.js";
import { loadAuthenticationConfig, matchesTrustedOrigin } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  authSchema,
  invitation as invitationTable,
  member as memberTable,
  organization as organizationTable,
} from "./schema.js";

export { matchesTrustedOrigin } from "./config.js";
export { makeBetterAuthBoundaryPolicyHandler } from "./auth-boundary-policy-adapter.js";
export {
  AuthRateLimitRequestBodyUnavailableError,
  makeRequestLocalAuthenticationSessionResolver,
  maskInvitationEmail,
  resolveActiveAuthenticationSecret,
} from "./auth-boundary-utils.js";
export {
  extractBetterAuthSessionToken,
  withAuthenticationAuthorizationGuards,
} from "./auth-authorization-guards.js";
export {
  makeObservedDatabaseRateLimitStorage,
  withAuthenticationAbuseRateLimitGuard,
  withAuthenticationRateLimitFailureResponse,
} from "./auth-rate-limits.js";
export {
  hashOAuthStoredToken,
  withOAuthClientManagementEndpointGuard,
  withOAuthClientRegistrationPolicyGuard,
  withOAuthRefreshTokenConsentGuard,
  withOAuthSecurityAuditEventRecorder,
  withOrganizationSecurityAuditEventRecorder,
} from "./auth-oauth-policy.js";

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
const OAUTH_ACTIVE_ORGANIZATION_REQUIRED_ERROR_CODE =
  "OAUTH_ACTIVE_ORGANIZATION_REQUIRED";
const OAUTH_ACCESS_TOKEN_ORGANIZATION_ID_CLAIM = "ceird_org_id";
const OAuthConsentSessionOrganizationSchema = Schema.Struct({
  activeOrganizationId: Schema.optional(Schema.NullOr(OrganizationId)),
});
const ORGANIZATION_LIMIT_PER_USER = 10;
const ORGANIZATION_MEMBERSHIP_LIMIT = 200;
const ORGANIZATION_PENDING_INVITATION_LIMIT = 100;
const ORGANIZATION_UPDATE_INPUT_FIELDS = new Set(["name"]);
const EMAIL_NOT_VERIFIED_ERROR_CODE = "EMAIL_NOT_VERIFIED";
const ORGANIZATION_LIMIT_REACHED_ERROR_CODE =
  "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS";

type AuthEmailFailureReporter = (error: unknown) => void;
type AuthEmailPromiseSender<Input> = (input: Input) => Promise<void>;
type BetterAuthOptions = Parameters<typeof betterAuth>[0];
interface AuthenticationPluginOption {
  readonly id: string;
  readonly options?: unknown;
}

const PublicInvitationPreviewRowSchema = Schema.Struct({
  email: OrganizationEmailAddress,
  organizationName: OrganizationNameSchema,
  role: InvitableOrganizationRole,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const NativeAcceptInvitationUserSchema = Schema.Struct({
  id: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const NativeAcceptInvitationMemberSchema = Schema.Struct({
  id: OrganizationMemberId,
  userId: UserId,
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const NativeAcceptInvitationInvitationSchema = Schema.Struct({
  email: OrganizationEmailAddress,
  organizationId: OrganizationId,
  role: InvitableOrganizationRole,
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const NativeAcceptInvitationBeforeHookPayloadSchema = Schema.Struct({
  user: NativeAcceptInvitationUserSchema,
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const NativeAcceptInvitationAfterHookPayloadSchema = Schema.Struct({
  invitation: NativeAcceptInvitationInvitationSchema,
  member: NativeAcceptInvitationMemberSchema,
  user: NativeAcceptInvitationUserSchema,
}).annotate({
  parseOptions: { onExcessProperty: "ignore" },
});
const decodePublicInvitationPreviewRow = Schema.decodeUnknownSync(
  PublicInvitationPreviewRowSchema
);
const decodeNativeAcceptInvitationBeforeHookPayload = Schema.decodeUnknownSync(
  NativeAcceptInvitationBeforeHookPayloadSchema
);
const decodeNativeAcceptInvitationAfterHookPayload = Schema.decodeUnknownSync(
  NativeAcceptInvitationAfterHookPayloadSchema
);

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

  const decodedPreview = decodePublicInvitationPreviewRow(preview);

  return decodePublicInvitationPreview({
    email: maskInvitationEmail(decodedPreview.email),
    organizationName: decodedPreview.organizationName,
    role: decodedPreview.role,
  });
}

export async function assertUserCanAcceptOrganizationInvitation(options: {
  readonly database: NodePgDatabase;
  readonly userId: UserId;
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

function throwInvalidOrganizationInvitationHookPayload(): never {
  throw APIError.from("BAD_REQUEST", {
    code: "INVALID_ORGANIZATION_INVITATION_PAYLOAD",
    message: "Organization invitation hook payload was invalid.",
  });
}

export function decodeAcceptInvitationBeforeHookPayload(input: unknown) {
  try {
    return decodeNativeAcceptInvitationBeforeHookPayload(input);
  } catch {
    throwInvalidOrganizationInvitationHookPayload();
  }
}

export function decodeAcceptInvitationAfterHookPayload(input: unknown) {
  try {
    return decodeNativeAcceptInvitationAfterHookPayload(input);
  } catch {
    throwInvalidOrganizationInvitationHookPayload();
  }
}

function decodeWritableOrganizationRole(input: unknown) {
  try {
    return decodeOrganizationRole(input);
  } catch {
    throwInvalidOrganizationRole();
  }
}

function decodeWritableOrganizationInvitationRole(input: unknown) {
  try {
    return decodeInvitableOrganizationRole(input);
  } catch {
    throwInvalidOrganizationRole();
  }
}

function oauthRequestIncludesCeirdScopes(scopes: readonly string[]): boolean {
  return scopes.some((scope) => scope.startsWith("ceird:"));
}

function resolveOAuthConsentActiveOrganizationId(session: unknown) {
  const decodedSession = Option.getOrNull(
    Schema.decodeUnknownOption(OAuthConsentSessionOrganizationSchema)(session)
  );

  return decodedSession?.activeOrganizationId ?? null;
}

function resolveOAuthConsentReferenceId(
  session: unknown,
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

  const organizationId = Option.getOrNull(
    decodeAuthBoundaryOption(OrganizationId, input.referenceId)
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

function assertOrganizationUpdateOnlyChangesName(organizationUpdate: unknown) {
  const decodedOrganizationUpdate = Option.getOrNull(
    Schema.decodeUnknownOption(AuthBoundaryRecordSchema)(organizationUpdate)
  );

  if (decodedOrganizationUpdate === null) {
    throwInvalidOrganizationInput("Invalid organization update.");
  }

  const unsupportedField = Object.keys(decodedOrganizationUpdate).find(
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
                metadata: {
                  memberId: member.id,
                  role: member.role,
                  targetUserId: user.id,
                },
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
                role: decodeWritableOrganizationInvitationRole(
                  nextInvitation.role
                ),
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
          beforeAcceptInvitation: async (payload) => {
            const decodedPayload =
              decodeAcceptInvitationBeforeHookPayload(payload);

            await assertUserCanAcceptOrganizationInvitation({
              database,
              userId: decodedPayload.user.id,
            });
          },
          afterAcceptInvitation: async (payload) => {
            const {
              invitation: acceptedInvitation,
              member,
              user,
            } = decodeAcceptInvitationAfterHookPayload(payload);

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
              role: decodeInvitableOrganizationRole(
                organizationInvitation.role
              ),
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

  auth.handler = makeBetterAuthBoundaryPolicyHandler(auth.handler, {
    authConfig,
    database,
    oauthClientRegistrationAllowLoopbackRedirects,
    oauthClientRegistrationAllowedScopes,
    resolveSession,
    runtimeContext: options.runtimeContext,
  });

  return auth as CeirdAuthentication;
}

function normalizeAuthenticationSessionResult(
  result: unknown
): AuthenticationSessionResult | null {
  if (result === null) {
    return null;
  }

  return Schema.decodeUnknownSync(AuthenticationSessionResultSchema)(result);
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
      activeOrganizationId: result.session.activeOrganizationId,
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
      image: result.user.image,
      name: result.user.name,
      twoFactorEnabled: result.user.twoFactorEnabled,
      updatedAt: serializeAuthenticationDate(result.user.updatedAt),
    },
  };
}

function serializeAuthenticationDate(value: Date) {
  return value.toISOString();
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
