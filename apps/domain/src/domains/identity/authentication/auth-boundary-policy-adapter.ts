import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { withAuthenticationAuthorizationGuards } from "./auth-authorization-guards.js";
import { resolveActiveAuthenticationSecret } from "./auth-boundary-utils.js";
import type {
  AuthEffectRuntimeContext,
  AuthenticationSessionResult,
} from "./auth-boundary-utils.js";
import {
  withOAuthClientManagementEndpointGuard,
  withOAuthClientRegistrationPolicyGuard,
  withOAuthRefreshTokenConsentGuard,
  withOAuthSecurityAuditEventRecorder,
  withOrganizationSecurityAuditEventRecorder,
} from "./auth-oauth-policy.js";
import {
  withAuthenticationAbuseRateLimitGuard,
  withAuthenticationRateLimitFailureResponse,
} from "./auth-rate-limits.js";
import type {
  AuthenticationConfig,
  CeirdOAuthClientRegistrationAllowedScope,
} from "./config.js";

type BetterAuthBoundaryPolicyHandler = (request: Request) => Promise<Response>;

export interface BetterAuthBoundaryPolicyAdapterOptions {
  readonly authConfig: Pick<
    AuthenticationConfig,
    "advanced" | "basePath" | "rateLimit" | "secret" | "secrets"
  >;
  readonly database: NodePgDatabase;
  readonly oauthClientRegistrationAllowLoopbackRedirects: boolean;
  readonly oauthClientRegistrationAllowedScopes: readonly CeirdOAuthClientRegistrationAllowedScope[];
  readonly resolveSession: (
    request: Request
  ) => Promise<AuthenticationSessionResult | null>;
  readonly runtimeContext?: AuthEffectRuntimeContext | undefined;
}

export function makeBetterAuthBoundaryPolicyHandler(
  betterAuthHandler: BetterAuthBoundaryPolicyHandler,
  options: BetterAuthBoundaryPolicyAdapterOptions
): BetterAuthBoundaryPolicyHandler {
  const registrationPolicyHandler = withOAuthClientRegistrationPolicyGuard(
    betterAuthHandler,
    {
      allowLoopbackRedirects:
        options.oauthClientRegistrationAllowLoopbackRedirects,
      allowedScopes: options.oauthClientRegistrationAllowedScopes,
      basePath: options.authConfig.basePath,
      runtimeContext: options.runtimeContext,
    }
  );
  const refreshTokenPolicyHandler = withOAuthRefreshTokenConsentGuard(
    registrationPolicyHandler,
    {
      basePath: options.authConfig.basePath,
      database: options.database,
      runtimeContext: options.runtimeContext,
    }
  );
  const clientManagementPolicyHandler = withOAuthClientManagementEndpointGuard(
    refreshTokenPolicyHandler,
    options.authConfig.basePath
  );
  const organizationAuditPolicyHandler =
    withOrganizationSecurityAuditEventRecorder(clientManagementPolicyHandler, {
      authConfig: options.authConfig,
      database: options.database,
      resolveSession: options.resolveSession,
      runtimeContext: options.runtimeContext,
    });
  const oauthAuditPolicyHandler = withOAuthSecurityAuditEventRecorder(
    organizationAuditPolicyHandler,
    {
      authConfig: options.authConfig,
      database: options.database,
      resolveSession: options.resolveSession,
      runtimeContext: options.runtimeContext,
    }
  );
  const abuseRateLimitPolicyHandler = withAuthenticationAbuseRateLimitGuard(
    oauthAuditPolicyHandler,
    options.database,
    options.authConfig,
    options.runtimeContext,
    {
      resolveSession: options.resolveSession,
    }
  );
  const authorizationPolicyHandler = withAuthenticationAuthorizationGuards(
    abuseRateLimitPolicyHandler,
    options.database,
    {
      cookiePrefix: options.authConfig.advanced?.cookiePrefix,
      resolveSession: options.resolveSession,
      secret: resolveActiveAuthenticationSecret(options.authConfig),
    }
  );

  return withAuthenticationRateLimitFailureResponse(authorizationPolicyHandler);
}
