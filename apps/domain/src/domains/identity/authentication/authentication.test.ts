import { readFile } from "node:fs/promises";
import path from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  ConfigProvider,
  Effect,
  Layer,
  Logger,
  References,
  Schema,
} from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { Pool } from "pg";

import { readMigrationSql } from "../../../platform/database/test-database.js";
import {
  AuthenticationSessionResultSchema,
  readAuthBoundaryJsonOrFormRequestBody,
} from "./auth-boundary-utils.js";
import type { AuthenticationSessionResult } from "./auth-boundary-utils.js";
import { writeAuthSecurityAuditEvent } from "./auth-oauth-policy.js";
import {
  makeAuthenticationRequestObservation,
  runWithAuthenticationRequestObservation,
} from "./auth-observability.js";
import {
  assertPasswordNotCompromised,
  hashPasswordForPwnedPasswordRange,
  makePasswordCompromiseCheckFailureReporter,
  PASSWORD_COMPROMISED_ERROR_CODE,
} from "./auth-password-compromise.js";
import {
  assertUserCanAcceptOrganizationInvitation,
  createAuthentication,
  extractBetterAuthSessionToken,
  hashOAuthStoredToken,
  makeEmailFailureReporter,
  makeAuthenticationWebHandler,
  makeObservedDatabaseRateLimitStorage,
  makeRequestLocalAuthenticationSessionResolver,
  maskInvitationEmail,
  matchesTrustedOrigin,
  resolveActiveAuthenticationSecret,
  withAuthenticationAbuseRateLimitGuard,
  withAuthenticationAuthorizationGuards,
  withAuthenticationCors,
  withAuthenticationRateLimitFailureResponse,
  withOrganizationSecurityAuditEventRecorder,
  withOAuthClientManagementEndpointGuard,
  withOAuthClientRegistrationPolicyGuard,
  withOAuthRefreshTokenConsentGuard,
  withOAuthSecurityAuditEventRecorder,
} from "./auth.js";
import type { CeirdAuthentication } from "./auth.js";
import {
  AUTH_CAPTCHA_PROTECTED_ENDPOINTS,
  AUTH_CAPTCHA_PROVIDER,
  CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES,
  CEIRD_OAUTH_SCOPES,
  DEFAULT_AUTH_DATABASE_URL,
  loadAuthenticationConfig,
  makeAuthenticationConfig,
  makeAuthenticationTrustedOrigins,
  resolveCrossSubDomainCookieDomain,
} from "./config.js";
import * as schemaModule from "./schema.js";
import {
  authSchema,
  account,
  authSecurityAuditEvent,
  invitation,
  jwks,
  member,
  organization,
  rateLimit,
  session,
  user,
  verification,
} from "./schema.js";

describe("makeAuthenticationConfig()", () => {
  it("defines the Ceird OAuth scopes exposed to MCP clients", () => {
    expect(CEIRD_OAUTH_SCOPES).toStrictEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "ceird:read",
      "ceird:write",
      "ceird:admin",
    ]);
  }, 10_000);

  it("builds the minimal Better Auth configuration for email/password auth", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config).toMatchObject({
      basePath: "/api/auth",
      baseURL: "http://127.0.0.1:3001",
      trustedOrigins: expect.arrayContaining([
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
      ]),
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      advanced: {
        ipAddress: {
          ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
        },
        trustedProxyHeaders: true,
      },
      rateLimit: {
        enabled: true,
        storage: "database",
        customRules: {
          "/sign-in/email": {
            window: 60,
            max: 5,
          },
          "/sign-up/email": {
            window: 60,
            max: 3,
          },
          "/request-password-reset": {
            window: 60,
            max: 3,
          },
          "/send-verification-email": {
            window: 60,
            max: 3,
          },
          "/change-email": {
            window: 60,
            max: 3,
          },
          "/change-password": {
            window: 60,
            max: 5,
          },
          "/organization/invite-member": {
            window: 3600,
            max: 30,
          },
        },
      },
      emailAndPassword: {
        enabled: true,
        maxPasswordLength: 256,
        minPasswordLength: 12,
        revokeSessionsOnPasswordReset: true,
      },
      emailVerification: {
        autoSignInAfterVerification: false,
        expiresIn: 3600,
        sendOnSignIn: false,
        sendOnSignUp: true,
      },
      user: {
        additionalFields: {
          twoFactorEnabled: {
            defaultValue: false,
            input: false,
            required: false,
            type: "boolean",
          },
        },
        changeEmail: {
          enabled: true,
        },
      },
      passwordCompromiseCheck: {
        enabled: false,
        failOpen: true,
      },
      captcha: {
        enabled: false,
        provider: AUTH_CAPTCHA_PROVIDER,
        protectedEndpoints: AUTH_CAPTCHA_PROTECTED_ENDPOINTS,
      },
      mcpResourceUrl: "http://127.0.0.1:3001/mcp",
      oauthIssuerUrl: "http://127.0.0.1:3001",
      oauthConsentPath: "/oauth/consent",
      oauthScopes: CEIRD_OAUTH_SCOPES,
      oauthClientRegistrationAllowedScopes:
        CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES,
      oauthClientRegistrationDefaultScopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "ceird:read",
      ],
    });

    expect(config).not.toHaveProperty("socialProviders");
  }, 10_000);

  it("allows the MCP resource URL and OAuth issuer to be configured explicitly", async () => {
    await withEnvironment(
      {
        MCP_RESOURCE_URL: "https://mcp.ceird.example/mcp",
        OAUTH_ISSUER_URL: "https://auth.ceird.example/api/auth",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.mcpResourceUrl).toBe("https://mcp.ceird.example/mcp");
        expect(config.oauthIssuerUrl).toBe(
          "https://auth.ceird.example/api/auth"
        );
      }
    );
  }, 10_000);

  it("loads ordered Better Auth rotation secrets with the legacy fallback secret", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "legacy-secret-value-0123456789abcdef",
        BETTER_AUTH_SECRETS:
          "3:current-secret-value-0123456789abcdef,2:previous-secret-value-0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.secret).toBe("legacy-secret-value-0123456789abcdef");
        expect(config.secrets).toStrictEqual([
          {
            version: 3,
            value: "current-secret-value-0123456789abcdef",
          },
          {
            version: 2,
            value: "previous-secret-value-0123456789abcdef",
          },
        ]);
      }
    );
  }, 10_000);

  it("sorts Better Auth rotation secrets with the highest version current", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "legacy-secret-value-0123456789abcdef",
        BETTER_AUTH_SECRETS:
          "1:old-secret-value-0123456789abcdef,3:current-secret-value-0123456789abcdef,2:previous-secret-value-0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.secrets).toStrictEqual([
          {
            version: 3,
            value: "current-secret-value-0123456789abcdef",
          },
          {
            version: 2,
            value: "previous-secret-value-0123456789abcdef",
          },
          {
            version: 1,
            value: "old-secret-value-0123456789abcdef",
          },
        ]);
      }
    );
  }, 10_000);

  it("sorts programmatic Better Auth rotation secrets before resolving the active secret", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "legacy-secret-value-0123456789abcdef",
      secrets: [
        {
          version: 1,
          value: "old-secret-value-0123456789abcdef",
        },
        {
          version: 3,
          value: "current-secret-value-0123456789abcdef",
        },
        {
          version: 2,
          value: "previous-secret-value-0123456789abcdef",
        },
      ],
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.secrets).toStrictEqual([
      {
        version: 3,
        value: "current-secret-value-0123456789abcdef",
      },
      {
        version: 2,
        value: "previous-secret-value-0123456789abcdef",
      },
      {
        version: 1,
        value: "old-secret-value-0123456789abcdef",
      },
    ]);
    expect(resolveActiveAuthenticationSecret(config)).toBe(
      "current-secret-value-0123456789abcdef"
    );
  }, 10_000);

  it("sets the explicit Better Auth password length policy", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.emailAndPassword).toMatchObject({
          maxPasswordLength: 256,
          minPasswordLength: 12,
        });
      }
    );
  }, 10_000);

  it("enables password compromise checks by default in production config", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
        NODE_ENV: "production",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.passwordCompromiseCheck).toStrictEqual({
          enabled: true,
          failOpen: true,
        });
      }
    );
  }, 10_000);

  it("enables password compromise checks by default for deployed HTTPS config when NODE_ENV is unset", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.passwordCompromiseCheck).toStrictEqual({
          enabled: true,
          failOpen: true,
        });
      }
    );
  }, 10_000);

  it("keeps password compromise checks disabled by default in local Alchemy dev", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        CEIRD_LOCAL_DEV: "true",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
        NODE_ENV: "production",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.passwordCompromiseCheck).toStrictEqual({
          enabled: false,
          failOpen: true,
        });
      }
    );
  }, 10_000);

  it("keeps password compromise checks disabled by default for loopback auth config", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL:
          "http://api.codex-portless.ceird.localhost:1355/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.passwordCompromiseCheck).toStrictEqual({
          enabled: false,
          failOpen: true,
        });
      }
    );
  }, 10_000);

  it("allows password compromise checks to be disabled explicitly", async () => {
    await withEnvironment(
      {
        AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "false",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
        NODE_ENV: "production",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.passwordCompromiseCheck.enabled).toBeFalsy();
      }
    );
  }, 10_000);

  it("loads loopback password compromise range API overrides for deterministic verification", async () => {
    const rangeRequests: {
      readonly addPadding: string | null;
      readonly method: string | undefined;
      readonly url: string | undefined;
      readonly userAgent: string | null;
    }[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input, init) => {
        const headers = new Headers(init?.headers);
        let requestUrl: string;
        if (input instanceof URL) {
          requestUrl = input.toString();
        } else if (input instanceof Request) {
          requestUrl = input.url;
        } else {
          requestUrl = String(input);
        }
        rangeRequests.push({
          addPadding: headers.get("add-padding"),
          method: init?.method,
          url: requestUrl,
          userAgent: headers.get("user-agent"),
        });

        return Promise.resolve(
          new Response("PASSWORD-RANGE-BODY\r\n", {
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
            status: 200,
          })
        );
      });

    try {
      await withEnvironment(
        {
          AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "true",
          AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE:
            "http://127.0.0.1:49152/range",
          BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
          BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
        },
        async (provider) => {
          const config = await loadAuthenticationConfigForTest(provider);

          await expect(
            config.passwordCompromiseCheck.fetchPasswordRange?.("ABCDE")
          ).resolves.toBe("PASSWORD-RANGE-BODY\r\n");
        }
      );
    } finally {
      fetchSpy.mockRestore();
    }

    expect(rangeRequests).toStrictEqual([
      {
        addPadding: "true",
        method: undefined,
        url: "http://127.0.0.1:49152/range/ABCDE",
        userAgent: "Ceird Password Checker",
      },
    ]);
  }, 10_000);

  it("rejects non-local password compromise range API overrides", async () => {
    await withEnvironment(
      {
        AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "true",
        AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE:
          "https://hibp-proxy.example/range",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE/
        );
      }
    );
  }, 10_000);

  it("rejects deceptive 127-prefixed password compromise range API overrides", async () => {
    await withEnvironment(
      {
        AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED: "true",
        AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE:
          "https://127.evil.example/range",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE/
        );
      }
    );
  }, 10_000);

  it("rejects loopback OAuth dynamic client registration redirects for deployed HTTPS config when NODE_ENV is unset", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(
          config.oauthClientRegistrationAllowLoopbackRedirects
        ).toBeFalsy();
      }
    );
  }, 10_000);

  it("loads enabled Turnstile captcha config from environment", async () => {
    await withEnvironment(
      {
        AUTH_CAPTCHA_ENABLED: "true",
        AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE:
          "http://127.0.0.1:8787/siteverify",
        AUTH_CAPTCHA_TURNSTILE_SECRET_KEY: " turnstile-secret-key ",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.captcha).toStrictEqual({
          enabled: true,
          provider: AUTH_CAPTCHA_PROVIDER,
          protectedEndpoints: AUTH_CAPTCHA_PROTECTED_ENDPOINTS,
          secretKey: "turnstile-secret-key",
          siteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
        });
      }
    );
  }, 10_000);

  it("rejects non-local Turnstile site verify URL overrides", async () => {
    await withEnvironment(
      {
        AUTH_CAPTCHA_ENABLED: "true",
        AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE:
          "https://turnstile.test/siteverify",
        AUTH_CAPTCHA_TURNSTILE_SECRET_KEY: "turnstile-secret-key",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE/
        );
      }
    );
  }, 10_000);

  it("rejects deceptive 127-prefixed Turnstile site verify URL overrides", async () => {
    await withEnvironment(
      {
        AUTH_CAPTCHA_ENABLED: "true",
        AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE:
          "https://127.evil.example/siteverify",
        AUTH_CAPTCHA_TURNSTILE_SECRET_KEY: "turnstile-secret-key",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE/
        );
      }
    );
  }, 10_000);

  it("rejects enabled Turnstile captcha without a secret", async () => {
    await withEnvironment(
      {
        AUTH_CAPTCHA_ENABLED: "true",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /AUTH_CAPTCHA_TURNSTILE_SECRET_KEY/
        );
      }
    );
  }, 10_000);

  it("rejects malformed Better Auth rotation secrets before startup", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "legacy-secret-value-0123456789abcdef",
        BETTER_AUTH_SECRETS: "current-secret-value-0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        await expect(loadAuthenticationConfigForTest(provider)).rejects.toThrow(
          /BETTER_AUTH_SECRETS/
        );
      }
    );
  }, 10_000);

  it("normalizes the OAuth issuer to match Better Auth discovery metadata", async () => {
    await withEnvironment(
      {
        OAUTH_ISSUER_URL:
          "http://auth.ceird.example/api/auth/?debug=1#fragment",
        BETTER_AUTH_BASE_URL: "https://api.ceird.example/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.oauthIssuerUrl).toBe(
          "https://auth.ceird.example/api/auth"
        );
      }
    );
  }, 10_000);

  it("keeps legacy HTTP Portless OAuth issuer URLs on HTTP", async () => {
    await withEnvironment(
      {
        OAUTH_ISSUER_URL:
          "http://api.codex-portless.ceird.localhost:1355/api/auth",
        BETTER_AUTH_BASE_URL:
          "http://api.codex-portless.ceird.localhost:1355/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.oauthIssuerUrl).toBe(
          "http://api.codex-portless.ceird.localhost:1355/api/auth"
        );
      }
    );
  }, 10_000);

  it("defaults the MCP resource URL to the API origin when configured", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "https://app.ceird.example",
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.mcpResourceUrl).toBe("https://api.ceird.example/mcp");
  }, 10_000);

  it("applies dedicated public auth delivery rate limits", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.rateLimit.customRules).toMatchObject({
      "/request-password-reset": {
        window: 60,
        max: 3,
      },
      "/send-verification-email": {
        window: 60,
        max: 3,
      },
      "/oauth2/register": {
        window: 60,
        max: 5,
      },
    });
  }, 10_000);

  it("allows local automation to disable auth rate limiting explicitly", async () => {
    await withEnvironment(
      {
        AUTH_RATE_LIMIT_ENABLED: "false",
        BETTER_AUTH_BASE_URL: "http://127.0.0.1:3001",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        // eslint-disable-next-line vitest/prefer-to-be-falsy
        expect(config.rateLimit.enabled).toBe(false);
      }
    );
  }, 10_000);

  it("applies dedicated sensitive account settings rate limits", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.rateLimit.customRules).toMatchObject({
      "/change-email": {
        window: 60,
        max: 3,
      },
      "/change-password": {
        window: 60,
        max: 5,
      },
    });
  }, 10_000);

  it("applies dedicated two-factor authentication rate limits", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.rateLimit.customRules).toMatchObject({
      "/two-factor/send-otp": {
        window: 60,
        max: 3,
      },
      "/two-factor/verify-backup-code": {
        window: 60,
        max: 5,
      },
      "/two-factor/verify-otp": {
        window: 60,
        max: 5,
      },
      "/two-factor/verify-totp": {
        window: 60,
        max: 5,
      },
    });
  }, 10_000);

  it("applies a first-order route limit to organization invitations", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(
      config.rateLimit.customRules["/organization/invite-member"]
    ).toStrictEqual({
      window: 3600,
      max: 30,
    });
  }, 10_000);

  it("enables Better Auth's verified email change flow", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.user.changeEmail).toStrictEqual({
      enabled: true,
    });
  }, 10_000);

  it("does not trust removed sandbox app aliases by default", () => {
    expect(makeAuthenticationTrustedOrigins({})).not.toStrictEqual(
      expect.arrayContaining([
        "https://*.app.ceird.localhost:1355",
        "https://app.ceird.localhost:1355",
      ])
    );
  }, 10_000);

  it("does not share auth cookies across removed ceird.localhost aliases", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "https://linear-ui-refresh.app.ceird.localhost:1355",
      baseUrl: "https://linear-ui-refresh.api.ceird.localhost:1355",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.advanced?.crossSubDomainCookies).toBeUndefined();
    if (config.advanced?.trustedProxyHeaders !== true) {
      throw new Error("Expected trusted proxy headers to be enabled.");
    }
  }, 10_000);

  it("keeps auth cookies host-scoped for plain localhost development", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "http://127.0.0.1:4173",
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.advanced).toStrictEqual({
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
      trustedProxyHeaders: true,
    });
  }, 10_000);

  it("adds the explicit app origin to the trusted origin allowlist", () => {
    expect(
      makeAuthenticationTrustedOrigins({
        appOrigin: "http://127.0.0.1:4304",
      })
    ).toContain("http://127.0.0.1:4304");
  }, 10_000);

  it("adds configured tenant trusted origins to the trusted origin allowlist", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "https://app.pr-123.ceird.app",
      baseUrl: "https://api.pr-123.ceird.app/api/auth",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      trustedOrigins: ["https://*--pr-123.ceird.app"],
    });

    expect(config.trustedOrigins).toContain("https://*--pr-123.ceird.app");
    expect(
      matchesTrustedOrigin(
        "https://acme-field-ops--pr-123.ceird.app",
        config.trustedOrigins
      )
    ).toBeTruthy();
    expect(
      matchesTrustedOrigin(
        "https://nested.acme-field-ops--pr-123.ceird.app",
        config.trustedOrigins
      )
    ).toBeFalsy();
  }, 10_000);

  it("validates configured trusted origins as http or https origin patterns", () => {
    expect(
      makeAuthenticationTrustedOrigins({
        trustedOrigins: [
          "https://*--pr-123.ceird.app",
          "https://*.ceird.app",
          "http://localhost:3000",
        ],
      })
    ).toStrictEqual(
      expect.arrayContaining([
        "https://*--pr-123.ceird.app",
        "https://*.ceird.app",
        "http://localhost:3000",
      ])
    );
    expect(() =>
      makeAuthenticationTrustedOrigins({
        trustedOrigins: ["ftp://*--pr-123.ceird.app"],
      })
    ).toThrow(/a string matching the RegExp/);
    expect(() =>
      makeAuthenticationTrustedOrigins({
        trustedOrigins: ["https://tenant.ceird.app/path"],
      })
    ).toThrow(/a string matching the RegExp/);
  }, 10_000);

  it("reflects configured cookie prefixes in the Better Auth advanced config", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      cookiePrefix: "ceird-pr-123",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.advanced?.cookiePrefix).toBe("ceird-pr-123");
  }, 10_000);

  it("uses explicit cookie domains to share cookies across system and tenant hosts", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "https://app.pr-123.ceird.app",
      baseUrl: "https://api.pr-123.ceird.app/api/auth",
      cookieDomain: "ceird.app",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.advanced?.crossSubDomainCookies).toStrictEqual({
      enabled: true,
      domain: "ceird.app",
    });
  }, 10_000);

  it("requires BETTER_AUTH_BASE_URL when loading auth config", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const result = loadAuthenticationConfigForTest(provider);

        await expect(result).rejects.toThrow(/BETTER_AUTH_BASE_URL/);
      }
    );
  }, 10_000);

  it("loads configured tenant trusted origins and cookie settings", async () => {
    await withEnvironment(
      {
        AUTH_APP_ORIGIN: "https://app.pr-123.ceird.app",
        AUTH_COOKIE_DOMAIN: "ceird.app",
        AUTH_COOKIE_PREFIX: "ceird-pr-123",
        AUTH_TRUSTED_ORIGINS:
          " https://*--pr-123.ceird.app, ,https://app.ceird.app ",
        BETTER_AUTH_BASE_URL: "https://api.pr-123.ceird.app/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.trustedOrigins).toStrictEqual(
          expect.arrayContaining([
            "https://app.pr-123.ceird.app",
            "https://*--pr-123.ceird.app",
            "https://app.ceird.app",
          ])
        );
        expect(config.advanced?.cookiePrefix).toBe("ceird-pr-123");
        expect(config.advanced?.crossSubDomainCookies).toStrictEqual({
          enabled: true,
          domain: "ceird.app",
        });
      }
    );
  }, 10_000);

  it("rejects invalid configured cookie domains", async () => {
    await withEnvironment(
      {
        AUTH_COOKIE_DOMAIN: "https://ceird.app/path",
        BETTER_AUTH_BASE_URL: "https://api.pr-123.ceird.app/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const result = loadAuthenticationConfigForTest(provider);

        await expect(result).rejects.toThrow(/AUTH_COOKIE_DOMAIN/);
      }
    );
  }, 10_000);

  it("loads the explicit Better Auth base URL from config", async () => {
    await withEnvironment(
      {
        AUTH_APP_ORIGIN: "http://127.0.0.1:4304",
        BETTER_AUTH_BASE_URL: "https://api.ceird.localhost:1355",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.baseURL).toBe("https://api.ceird.localhost:1355");
        expect(config.trustedOrigins).not.toContain(
          "https://app.ceird.localhost:1355"
        );
        expect(config.trustedOrigins).toContain("http://127.0.0.1:4304");
      }
    );
  }, 10_000);

  it("does not derive shared cookie domains from localhost aliases", () => {
    expect(
      resolveCrossSubDomainCookieDomain({
        appOrigin: "https://linear-ui-refresh.app.ceird.localhost:1355",
        baseUrl: "https://linear-ui-refresh.api.ceird.localhost:1355",
      })
    ).toBeUndefined();

    expect(
      resolveCrossSubDomainCookieDomain({
        appOrigin: "http://127.0.0.1:4173",
        baseUrl: "http://127.0.0.1:3001",
      })
    ).toBeUndefined();
  }, 10_000);

  it("shares auth cookies across canonical app and API domains", () => {
    const config = makeAuthenticationConfig({
      appOrigin: "https://app.ceird.app",
      baseUrl: "https://api.ceird.app/api/auth",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(config.advanced?.crossSubDomainCookies).toStrictEqual({
      enabled: true,
      domain: "ceird.app",
    });
    expect(
      resolveCrossSubDomainCookieDomain({
        appOrigin: "https://app.ceird.example.com",
        baseUrl: "https://api.ceird.example.com/api/auth",
      })
    ).toBe("ceird.example.com");
  }, 10_000);

  it("shares auth cookies inside one nested stage domain", () => {
    expect(
      resolveCrossSubDomainCookieDomain({
        appOrigin: "https://app.main.ceird.app",
        baseUrl: "https://api.main.ceird.app/api/auth",
      })
    ).toBe("main.ceird.app");
  }, 10_000);

  it("does not share auth cookies across legacy stage-prefixed app and API domains", () => {
    expect(
      resolveCrossSubDomainCookieDomain({
        appOrigin: "https://app-main.ceird.app",
        baseUrl: "https://api-main.ceird.app/api/auth",
      })
    ).toBeUndefined();
  }, 10_000);
});

describe("auth schema", () => {
  it("defines the core Better Auth tables for the authentication slice", () => {
    expect(getTableName(user)).toBe("user");
    expect(getTableName(session)).toBe("session");
    expect(getTableName(account)).toBe("account");
    expect(getTableName(verification)).toBe("verification");
    expect(getTableName(rateLimit)).toBe("rate_limit");
    expect(getTableName(jwks)).toBe("jwks");

    expect(authSchema).toMatchObject({
      user,
      session,
      account,
      verification,
      rateLimit,
      jwks,
    });
  }, 10_000);

  it("exports the organization tables and active organization session field", () => {
    expect(getTableName(organization)).toBe("organization");
    expect(getTableName(member)).toBe("member");
    expect(getTableName(invitation)).toBe("invitation");
    expect(schemaModule.organization).toBeDefined();
    expect(schemaModule.member).toBeDefined();
    expect(schemaModule.invitation).toBeDefined();
    expect(
      (session as unknown as Record<string, unknown>).activeOrganizationId
    ).toBeDefined();
    expect(authSchema).toMatchObject({
      organization: schemaModule.organization,
      member: schemaModule.member,
      invitation: schemaModule.invitation,
      session,
    });
  }, 10_000);

  it("exports the Better Auth two-factor tables and user flag", () => {
    expect(schemaModule.twoFactor).toBeDefined();
    expect(getTableName(schemaModule.twoFactor)).toBe("two_factor");

    const userColumns = getTableColumns(user) as Record<
      string,
      {
        readonly hasDefault: boolean;
        readonly name: string;
        readonly notNull: boolean;
      }
    >;
    const twoFactorColumns = getTableColumns(schemaModule.twoFactor) as Record<
      string,
      { readonly name: string; readonly notNull: boolean }
    >;

    expect(userColumns.twoFactorEnabled).toMatchObject({
      hasDefault: true,
      name: "two_factor_enabled",
      notNull: true,
    });
    expect(twoFactorColumns.secret).toMatchObject({
      name: "secret",
      notNull: true,
    });
    expect(twoFactorColumns.backupCodes).toMatchObject({
      name: "backup_codes",
      notNull: true,
    });
    expect(twoFactorColumns.userId).toMatchObject({
      name: "user_id",
      notNull: true,
    });
    expect(twoFactorColumns.verified).toMatchObject({
      name: "verified",
      notNull: true,
    });
    expect(authSchema).toMatchObject({
      twoFactor: schemaModule.twoFactor,
      user,
    });
  }, 10_000);

  it("exposes the OAuth Provider tables for MCP authorization", () => {
    expect(schemaModule.oauthClient).toBeDefined();
    expect(schemaModule.oauthRefreshToken).toBeDefined();
    expect(schemaModule.oauthAccessToken).toBeDefined();
    expect(schemaModule.oauthConsent).toBeDefined();
    expect(schemaModule.authSecurityAuditEvent).toBeDefined();

    expect(getTableName(schemaModule.oauthClient)).toBe("oauth_client");
    expect(getTableName(schemaModule.oauthRefreshToken)).toBe(
      "oauth_refresh_token"
    );
    expect(getTableName(schemaModule.oauthAccessToken)).toBe(
      "oauth_access_token"
    );
    expect(getTableName(schemaModule.oauthConsent)).toBe("oauth_consent");
    expect(getTableName(schemaModule.authSecurityAuditEvent)).toBe(
      "auth_security_audit_event"
    );

    expect(authSchema).toMatchObject({
      oauthClient: schemaModule.oauthClient,
      oauthRefreshToken: schemaModule.oauthRefreshToken,
      oauthAccessToken: schemaModule.oauthAccessToken,
      oauthConsent: schemaModule.oauthConsent,
      authSecurityAuditEvent,
    });
  }, 10_000);

  it("stores a database-level slug format check in the organization migration", async () => {
    const migrationSql = await readMigrationSql("0003_organizations.sql");
    const slugLengthMigrationSql = await readMigrationSql(
      "20260526215020_organization_slug_length"
    );
    const slugReservedMigrationSql = await readMigrationSql(
      "20260527030012_organization_slug_reserved"
    );
    const syncReviewMigrationSql = await readMigrationSql(
      "20260531000100_sync_review_indexes"
    );

    expect(migrationSql).toContain("organization_slug_format_chk");
    expect(migrationSql).toContain("~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
    expect(slugLengthMigrationSql).toContain("organization_slug_format_chk");
    expect(slugLengthMigrationSql).toContain("organization_slug_backfill");
    expect(slugLengthMigrationSql).toContain(
      'char_length("organization"."slug") <= 40'
    );
    expect(slugReservedMigrationSql).toContain("organization_slug_format_chk");
    expect(slugReservedMigrationSql).toContain(
      `"slug" = "slug" || '-' || substr(md5("id"), 1, 12)`
    );
    expect(slugReservedMigrationSql).toContain(
      `"slug" not in ('app', 'api', 'agent', 'mcp')`
    );
    expect(syncReviewMigrationSql).toContain(
      `"slug" = "slug" || '-' || substr(md5("id"), 1, 12)`
    );
    expect(syncReviewMigrationSql).toContain(
      `"slug" not in ('app', 'api', 'agent', 'mcp', 'sync')`
    );
  }, 10_000);

  it("creates the auth security audit event table in the migration", async () => {
    const migrationSql = await readMigrationSql(
      "20260607021000_auth_security_audit_event"
    );

    expect(migrationSql).toContain(`CREATE TABLE "auth_security_audit_event"`);
    expect(migrationSql).toContain(
      `"created_at" timestamp with time zone DEFAULT now() NOT NULL`
    );
    expect(migrationSql).toContain(
      `"event_type" in ('oauth_client_registration_succeeded', 'oauth_client_registration_rejected', 'oauth_consent_granted', 'oauth_consent_denied', 'oauth_token_refreshed', 'oauth_token_revoked')`
    );
    expect(migrationSql).toContain(
      `CREATE INDEX "auth_security_audit_event_type_created_at_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE INDEX "auth_security_audit_event_oauth_client_created_at_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE INDEX "auth_security_audit_event_session_created_at_idx"`
    );
    expect(migrationSql).not.toContain(
      "auth_security_audit_event_actor_user_id_user_id_fk"
    );
    expect(migrationSql).not.toContain(
      "auth_security_audit_event_organization_id_organization_id_fk"
    );
    expect(migrationSql).not.toContain(
      "auth_security_audit_event_session_id_session_id_fk"
    );
  }, 10_000);

  it("extends the auth security audit event constraint for organization events", async () => {
    const migrationSql = await readMigrationSql(
      "20260607033000_organization_security_audit_events"
    );

    expect(migrationSql).toContain(
      `DROP CONSTRAINT "auth_security_audit_event_type_chk"`
    );
    for (const eventType of [
      "organization_created",
      "organization_updated",
      "organization_active_changed",
      "organization_invitation_created",
      "organization_invitation_resent",
      "organization_invitation_canceled",
      "organization_invitation_accepted",
      "organization_member_role_updated",
      "organization_member_removed",
    ]) {
      expect(migrationSql).toContain(`'${eventType}'`);
    }
  }, 10_000);

  it("extends the auth security audit event constraint for OAuth consent revocations", async () => {
    const migrationSql = await readMigrationSql(
      "oauth_consent_revoked_audit_event"
    );
    const alchemyMigrationSql = await readFile(
      path.resolve(
        process.cwd(),
        "drizzle-alchemy",
        "20260609100000_oauth_consent_revoked_audit_event",
        "migration.sql"
      ),
      "utf8"
    );

    expect(migrationSql).toContain(
      `DROP CONSTRAINT "auth_security_audit_event_type_chk"`
    );
    expect(migrationSql).toContain(`'oauth_consent_revoked'`);
    expect(migrationSql).toContain(
      `CREATE INDEX "oauth_consent_user_client_reference_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE INDEX "oauth_refresh_token_user_client_reference_active_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE INDEX "oauth_access_token_user_client_reference_expires_idx"`
    );
    expect(migrationSql).toContain(`row_number() OVER`);
    expect(migrationSql).toContain(
      `CREATE UNIQUE INDEX "oauth_consent_user_client_account_unique_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE UNIQUE INDEX "oauth_consent_user_client_reference_unique_idx"`
    );
    expect(migrationSql).toContain(
      `CREATE TRIGGER "oauth_refresh_token_active_consent_chk"`
    );
    expect(migrationSql).toContain(
      `CREATE TRIGGER "oauth_access_token_active_consent_chk"`
    );
    expect(alchemyMigrationSql).toBe(migrationSql);
  }, 10_000);

  it("stores Better Auth two-factor schema changes in a reversible migration", async () => {
    const migrationSql = await readMigrationSql("better_auth_two_factor");

    expect(migrationSql).toContain(
      'ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL'
    );
    expect(migrationSql).toContain('CREATE TABLE "two_factor"');
    expect(migrationSql).toContain('"secret" text NOT NULL');
    expect(migrationSql).toContain('"backup_codes" text NOT NULL');
    expect(migrationSql).toContain('"user_id" text NOT NULL');
    expect(migrationSql).toContain('"verified" boolean DEFAULT true NOT NULL');
    expect(migrationSql).toContain(
      'ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE'
    );
  }, 10_000);

  it("preserves the /api/auth prefix when mounting auth routes", async () => {
    await Effect.gen(function* verifyAuthenticationPrefixPreserved() {
      const routes = Layer.mergeAll(
        HttpRouter.add(
          "GET",
          "/api/auth/get-session",
          HttpServerRequest.HttpServerRequest.pipe(
            Effect.map((request) => HttpServerResponse.text(request.url))
          )
        ),
        HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"))
      );

      const app = yield* HttpRouter.toHttpEffect(routes);
      const handler = HttpEffect.toWebHandler(app);

      const authPathResponse = yield* Effect.promise(() =>
        handler(new Request("http://127.0.0.1/api/auth/get-session"))
      );
      const healthResponse = yield* Effect.promise(() =>
        handler(new Request("http://127.0.0.1/health"))
      );
      const duplicatePathResponse = yield* Effect.promise(() =>
        handler(new Request("http://127.0.0.1/api/auth/api/auth/get-session"))
      );

      expect(yield* Effect.promise(() => authPathResponse.text())).toBe(
        "/api/auth/get-session"
      );
      expect(yield* Effect.promise(() => healthResponse.text())).toBe("ok");
      expect(duplicatePathResponse.status).toBe(404);
    }).pipe(Effect.scoped, (effect) =>
      Effect.runPromise(effect as Effect.Effect<void, unknown, never>)
    );
  }, 10_000);
});

describe("createAuthentication()", () => {
  it("masks invitation emails for the public preview route", () => {
    expect(maskInvitationEmail("member@example.com")).toBe("m***@e***.com");
    expect(maskInvitationEmail("a@b.co")).toBe("a***@b***.co");
    expect(maskInvitationEmail("invalid-email")).toBe("***");
  }, 10_000);

  it("serves mounted session lookups through the typed auth API", async () => {
    const sessionCookie = "better-auth.session_token=session-1.signature";
    let delegatedUrl: string | undefined;
    let sessionHeaders: Headers | undefined;

    const sessionPayload = {
      session: {
        activeOrganizationId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: new Date("2026-01-08T00:00:00.000Z"),
        id: "session-1",
        ipAddress: "127.0.0.1",
        token: "session-token-1",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        userId: "user-1",
      },
      user: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        email: "owner@example.com",
        emailVerified: false,
        id: "user-1",
        image: null,
        name: "Owner Example",
        twoFactorEnabled: false,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    };
    const auth = {
      api: {
        getSession: (options: { readonly headers: Headers }) => {
          sessionHeaders = options.headers;
          return Promise.resolve(sessionPayload);
        },
      },
      handler: (request: Request) => {
        delegatedUrl = request.url;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      options: {
        plugins: [],
      },
    } as unknown as CeirdAuthentication;
    const handler = makeAuthenticationWebHandler(auth);

    const sessionResponse = await handler(
      new Request("https://api.ceird.example/api/auth/get-session", {
        headers: {
          cookie: sessionCookie,
        },
      })
    );
    const sessionBody = await sessionResponse.json();

    expect(sessionResponse.status).toBe(200);
    expect(sessionBody).toStrictEqual({
      session: {
        activeOrganizationId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-08T00:00:00.000Z",
        id: "session-1",
        updatedAt: "2026-01-01T00:00:00.000Z",
        userId: "user-1",
      },
      user: {
        createdAt: "2026-01-01T00:00:00.000Z",
        email: "owner@example.com",
        emailVerified: false,
        id: "user-1",
        image: null,
        name: "Owner Example",
        twoFactorEnabled: false,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(sessionHeaders?.get("cookie")).toBe(sessionCookie);
    expect(delegatedUrl).toBeUndefined();

    const delegatedResponse = await handler(
      new Request("https://api.ceird.example/api/auth/sign-up/email", {
        method: "POST",
      })
    );
    const delegatedBody = await delegatedResponse.json();

    expect(delegatedResponse.status).toBe(200);
    expect(delegatedBody).toStrictEqual({ delegated: true });
    expect(delegatedUrl).toBe(
      "https://api.ceird.example/api/auth/sign-up/email"
    );
  }, 10_000);

  it("extracts configured Better Auth session cookies for authorization guards", () => {
    expect(
      extractBetterAuthSessionToken(
        "other=value; __Secure-ceird-pr-123.session_token=session-1.signature",
        { cookiePrefix: "ceird-pr-123" }
      )
    ).toBe("session-1");
    expect(
      extractBetterAuthSessionToken(
        "__Secure-better-auth.session_token=session-1.signature",
        { cookiePrefix: "ceird-pr-123" }
      )
    ).toBeUndefined();
    expect(
      extractBetterAuthSessionToken(
        "better-auth.session_token=session-2.signature"
      )
    ).toBe("session-2");
  }, 10_000);

  it("records Better Auth handler timing in the active request observation", async () => {
    const auth = {
      api: {
        getSession: () => Promise.resolve(null),
      },
      handler: () => Promise.resolve(Response.json({ delegated: true })),
      options: {
        plugins: [],
      },
    } as unknown as CeirdAuthentication;
    const handler = makeAuthenticationWebHandler(auth);
    const observation = makeAuthenticationRequestObservation();

    await runWithAuthenticationRequestObservation(observation, () =>
      handler(
        new Request("https://api.ceird.example/api/auth/sign-up/email", {
          method: "POST",
        })
      )
    );

    expect(observation.timings).toMatchObject({
      "auth.betterAuthMs": expect.any(Number),
    });
  }, 10_000);

  it("normalizes Better Auth session boundary dates and absent optional fields through schema", () => {
    const decoded = Schema.decodeUnknownSync(AuthenticationSessionResultSchema)(
      {
        session: {
          createdAt: "2026-06-19T08:00:00.000Z",
          expiresAt: "2026-06-20T08:00:00.000Z",
          id: "session_123",
          token: "session-token",
          updatedAt: new Date("2026-06-19T08:10:00.000Z"),
          userId: "user_123",
        },
        user: {
          createdAt: "2026-06-19T08:00:00.000Z",
          email: "owner@example.com",
          emailVerified: true,
          id: "user_123",
          name: "Owner",
          twoFactorEnabled: false,
          updatedAt: "2026-06-19T08:10:00.000Z",
        },
      }
    );

    expect(decoded.session.activeOrganizationId).toBeNull();
    expect(decoded.session.createdAt).toBeInstanceOf(Date);
    expect(decoded.session.createdAt.toISOString()).toBe(
      "2026-06-19T08:00:00.000Z"
    );
    expect(decoded.session.ipAddress).toBeNull();
    expect(decoded.session.userAgent).toBeNull();
    expect(decoded.user.image).toBeNull();
    expect(decoded.user.twoFactorEnabled).toBeFalsy();
    expect(decoded.user.updatedAt).toBeInstanceOf(Date);
  }, 10_000);

  it.each(["createdAt", "expiresAt", "updatedAt"] as const)(
    "rejects invalid Better Auth session %s date strings at the session schema boundary",
    (field) => {
      expect(() =>
        Schema.decodeUnknownSync(AuthenticationSessionResultSchema)({
          session: {
            activeOrganizationId: null,
            createdAt: "2026-06-19T08:00:00.000Z",
            expiresAt: "2026-06-20T08:00:00.000Z",
            id: "session_123",
            ipAddress: null,
            token: "session-token",
            updatedAt: "2026-06-19T08:10:00.000Z",
            userAgent: null,
            userId: "user_123",
            [field]: "2026-99-99T99:99:99.999Z",
          },
          user: {
            createdAt: "2026-06-19T08:00:00.000Z",
            email: "owner@example.com",
            emailVerified: true,
            id: "user_123",
            image: null,
            name: "Owner",
            twoFactorEnabled: false,
            updatedAt: "2026-06-19T08:10:00.000Z",
          },
        })
      ).toThrow(/Expected a valid date/);
    },
    10_000
  );

  it.each([
    ["missing", undefined],
    ["null", null],
    ["non-boolean", "false"],
  ])(
    "rejects %s Better Auth two-factor session flags at the session schema boundary",
    (_caseName, twoFactorEnabled) => {
      const sessionUserInput = {
        createdAt: "2026-06-19T08:00:00.000Z",
        email: "owner@example.com",
        emailVerified: true,
        id: "user_123",
        image: null,
        name: "Owner",
        updatedAt: "2026-06-19T08:10:00.000Z",
      };
      let decodeError: unknown;

      try {
        Schema.decodeUnknownSync(AuthenticationSessionResultSchema)({
          session: {
            activeOrganizationId: null,
            createdAt: "2026-06-19T08:00:00.000Z",
            expiresAt: "2026-06-20T08:00:00.000Z",
            id: "session_123",
            ipAddress: null,
            token: "session-token",
            updatedAt: "2026-06-19T08:10:00.000Z",
            userAgent: null,
            userId: "user_123",
          },
          user:
            twoFactorEnabled === undefined
              ? sessionUserInput
              : {
                  ...sessionUserInput,
                  twoFactorEnabled,
                },
        });
      } catch (error) {
        decodeError = error;
      }

      expect(decodeError).toBeDefined();
    },
    10_000
  );

  it("configures an observable database-backed auth rate-limit store", () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      expect(auth.options.rateLimit).toMatchObject({
        storage: "database",
        customStorage: {
          get: expect.any(Function),
          set: expect.any(Function),
        },
      });
    } finally {
      void cleanup();
    }
  }, 10_000);

  it("applies dynamic client registration policy and audit capture through the composed auth handler", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { auth, cleanup } = createAuthenticationForPluginInspection(
      {},
      {
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/oauth2/register", {
          body: JSON.stringify({
            redirect_uris: ["https://client.example/oauth/callback"],
            scope: "openid ceird:admin",
          }),
          headers: {
            "content-type": "application/json",
            "user-agent": "Ceird MCP Test",
            "x-forwarded-for": "203.0.113.52",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        error: "invalid_scope",
        error_description:
          "Dynamic client registration requested a restricted scope.",
      });
      expect(response.status).toBe(400);
      expect(auditEvents).toStrictEqual([
        expect.objectContaining({
          eventType: "oauth_client_registration_rejected",
          metadata: {
            dynamicRegistration: true,
            oauthError: "invalid_scope",
            outcome: "rejected",
            requestedUnknownScope: false,
          },
          scopes: ["openid", "ceird:admin"],
          sourceIp: "203.0.113.52",
          userAgent: "Ceird MCP Test",
        }),
      ]);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("fails closed on uninspectable OAuth token requests through the composed auth handler", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/oauth2/token", {
          body: "",
          headers: {
            "content-type": "text/plain",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        error: "invalid_request",
        error_description: "OAuth token request could not be inspected.",
      });
      expect(response.status).toBe(400);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("disables Better Auth's internal logger so upstream routes cannot print raw auth inputs", () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      expect(
        (
          auth.options as typeof auth.options & {
            readonly logger?: { readonly disabled?: boolean };
          }
        ).logger
      ).toStrictEqual({
        disabled: true,
      });
    } finally {
      void cleanup();
    }
  }, 10_000);

  it("does not install the captcha plugin until Turnstile captcha is enabled", () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      expect(
        auth.options.plugins.some((plugin) => plugin.id === "captcha")
      ).toBeFalsy();
    } finally {
      void cleanup();
    }
  }, 10_000);

  it("configures Turnstile captcha for selected public delivery endpoints", () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      captchaEnabled: true,
      captchaSiteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
      captchaTurnstileSecretKey: "turnstile-secret-key",
    });

    try {
      const captchaPlugin = getCaptchaPluginOptions(auth);

      expect(captchaPlugin?.options).toMatchObject({
        provider: AUTH_CAPTCHA_PROVIDER,
        secretKey: "turnstile-secret-key",
        siteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
        endpoints: [...AUTH_CAPTCHA_PROTECTED_ENDPOINTS],
      });
      expect(captchaPlugin?.options?.endpoints).not.toContain("/sign-in/email");
    } finally {
      void cleanup();
    }
  }, 10_000);

  it.each([
    [
      "/sign-up/email",
      {
        email: "person@example.com",
        name: "Person Example",
        password: "correct horse battery staple",
      },
    ],
    [
      "/request-password-reset",
      {
        email: "person@example.com",
      },
    ],
    [
      "/send-verification-email",
      {
        email: "person@example.com",
      },
    ],
  ])(
    "rejects mounted auth request %s when captcha is enabled and no token is provided",
    async (endpointPath, body) => {
      const { auth, cleanup } = createAuthenticationForPluginInspection({
        captchaEnabled: true,
        captchaSiteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
        captchaTurnstileSecretKey: "turnstile-secret-key",
      });

      try {
        const response = await makeAuthenticationWebHandler(auth)(
          new Request(`https://api.ceird.example/api/auth${endpointPath}`, {
            body: JSON.stringify(body),
            headers: {
              "content-type": "application/json",
            },
            method: "POST",
          })
        );
        const responseBody = await response.json();

        expect(response.status).toBe(400);
        expect(responseBody).toStrictEqual({
          code: "MISSING_RESPONSE",
          message: "Missing CAPTCHA response",
        });
      } finally {
        await cleanup();
      }
    }
  );

  it("rejects mounted auth requests when the Turnstile verifier denies the token", async () => {
    const siteVerifyRequests: {
      readonly body: unknown;
      readonly method: string | undefined;
      readonly url: string;
    }[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        let requestUrl: string;
        if (input instanceof URL) {
          requestUrl = input.toString();
        } else if (input instanceof Request) {
          requestUrl = input.url;
        } else {
          requestUrl = String(input);
        }
        const requestBody =
          init?.body === undefined || init.body === null
            ? undefined
            : JSON.parse(await new Response(init.body).text());
        siteVerifyRequests.push({
          body: requestBody,
          method: init?.method,
          url: requestUrl,
        });

        return Response.json({ success: false });
      });
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      captchaEnabled: true,
      captchaSiteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
      captchaTurnstileSecretKey: "turnstile-secret-key",
    });

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/sign-up/email", {
          body: JSON.stringify({
            email: "person@example.com",
            name: "Person Example",
            password: "correct horse battery staple",
          }),
          headers: {
            "content-type": "application/json",
            "x-captcha-response": "invalid-captcha-token",
            "x-forwarded-for": "203.0.113.42",
          },
          method: "POST",
        })
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toStrictEqual({
        code: "VERIFICATION_FAILED",
        message: "Captcha verification failed",
      });
      expect(siteVerifyRequests).toStrictEqual([
        {
          body: {
            remoteip: "203.0.113.42",
            response: "invalid-captcha-token",
            secret: "turnstile-secret-key",
          },
          method: "POST",
          url: "http://127.0.0.1:8787/siteverify",
        },
      ]);
    } finally {
      fetchSpy.mockRestore();
      await cleanup();
    }
  });

  it("does not challenge mounted sign-in requests when captcha is enabled", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      captchaEnabled: true,
      captchaSiteVerifyURLOverride: "http://127.0.0.1:8787/siteverify",
      captchaTurnstileSecretKey: "turnstile-secret-key",
    });

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/sign-in/email", {
          body: JSON.stringify({}),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        })
      );
      const responseBody = await response.json().catch(() => null);

      expect(JSON.stringify(responseBody)).not.toContain("MISSING_RESPONSE");
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("fails open when Better Auth response-accounting rate-limit reads fail", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyRateLimitReadFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitFlakyReadDatabase([
          null,
          new Error("database unavailable after response"),
        ]),
        runtimeContext
      );

      const firstRead = yield* Effect.promise(() =>
        storage.get("127.0.0.1|/request-password-reset")
      );
      expect(firstRead).toBeNull();
      const secondRead = yield* Effect.promise(() =>
        storage.get("127.0.0.1|/request-password-reset")
      );
      expect(secondRead).toBeNull();
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_storage_read_failure");
    expect(logText).toContain("dashboard_until_sustained_storage_failure");
    expect(logText).toContain("dashboard");
    expect(logText).toContain("/request-password-reset");
    expect(logText).toContain("fail_open");
  }, 10_000);

  it("fails open when observed rate-limit rows fail schema decoding", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyRateLimitRowDecodeFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitFlakyReadDatabase([
          {
            count: -1,
            key: "",
            lastRequest: -1,
          },
        ]),
        runtimeContext
      );

      const readResult = yield* Effect.promise(() =>
        storage.get("127.0.0.1|/request-password-reset")
      );

      expect(readResult).toBeNull();
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_storage_read_failure");
    expect(logText).toContain("fail_open");
  }, 10_000);

  it("fails open before reading observed rate-limit storage when Better Auth passes a malformed key", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyRateLimitKeyDecodeFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitReadFailureDatabase(new Error("raw key reached storage")),
        runtimeContext
      );

      const readResult = yield* Effect.promise(() => storage.get(""));

      expect(readResult).toBeNull();
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_storage_read_failure");
    expect(logText).toContain("fail_open");
    expect(logText).not.toContain("raw key reached storage");
  }, 10_000);

  it.each([
    "/sign-in/email",
    "/sign-up/email",
    "/request-password-reset",
    "/send-verification-email",
    "/oauth2/register",
    "/organization/invite-member",
    "/two-factor/send-otp",
    "/two-factor/verify-backup-code",
    "/two-factor/verify-otp",
    "/two-factor/verify-totp",
  ])(
    "returns a stable unavailable response when %s abuse rate-limit reservation fails",
    async (endpointPath) => {
      let delegated = false;
      const config = makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const handler = withAuthenticationRateLimitFailureResponse(
        withAuthenticationAbuseRateLimitGuard(
          () => {
            delegated = true;
            return Promise.resolve(Response.json({ delegated: true }));
          },
          makeRateLimitReservationFailureDatabase(
            new Error("database unavailable")
          ),
          config
        )
      );

      const response = await handler(
        new Request(`http://127.0.0.1:3000/api/auth${endpointPath}`, {
          body: JSON.stringify({}),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "127.0.0.1",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        code: "AUTH_RATE_LIMIT_UNAVAILABLE",
        message: "Authentication protection is temporarily unavailable.",
      });
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(response.status).toBe(503);
      expect(delegated).toBeFalsy();
    }
  );

  it("fails closed when a rate-limit reservation row fails schema decoding", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyMalformedReservationRowFailsClosed() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withAuthenticationRateLimitFailureResponse(
          withAuthenticationAbuseRateLimitGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            makeRateLimitReservationDatabase({ count: -1 }),
            config,
            runtimeContext
          )
        );

        return yield* Effect.promise(() =>
          handler(
            new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
              body: JSON.stringify({}),
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": "127.0.0.1",
              },
              method: "POST",
            })
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
      message: "Authentication protection is temporarily unavailable.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    expect(JSON.stringify(logs)).toContain("rate_limit_reservation_failure");
  }, 10_000);

  it("rejects OAuth dynamic client registration bursts before Better Auth handles the request", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationDatabase({ count: 6 }),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/callback"],
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("rejects two-factor verification bursts before Better Auth handles the request", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase([{ count: 6 }], reservationKeys),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/two-factor/verify-totp", {
        body: JSON.stringify({
          code: "012345",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/two-factor/verify-totp",
    ]);
  }, 10_000);

  it("reserves password reset delivery limits by IP and normalized target email before Better Auth handles the request", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }],
        reservationKeys
      ),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body: JSON.stringify({
          email: " Person+Reset@Example.COM ",
          redirectTo: "http://127.0.0.1:4173/reset-password",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/request-password-reset",
      expect.stringMatching(
        /^ceird-auth-abuse:target-email:[a-f0-9]{64}\|\/request-password-reset$/
      ),
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("Person+Reset");
    expect(JSON.stringify(reservationKeys)).not.toContain("example.com");
  }, 10_000);

  it("reserves password reset delivery limits from URL-encoded form bodies", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }],
        reservationKeys
      ),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body: new URLSearchParams({
          email: " Person+Form@Example.COM ",
          redirectTo: "http://127.0.0.1:4173/reset-password",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/request-password-reset",
      expect.stringMatching(
        /^ceird-auth-abuse:target-email:[a-f0-9]{64}\|\/request-password-reset$/
      ),
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("Person+Form");
    expect(JSON.stringify(reservationKeys)).not.toContain("example.com");
  }, 10_000);

  it("rejects password reset bursts by target email without delegating to Better Auth", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 4 }],
        reservationKeys
      ),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body: JSON.stringify({
          email: "person@example.com",
          redirectTo: "http://127.0.0.1:4173/reset-password",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/request-password-reset",
      expect.stringMatching(
        /^ceird-auth-abuse:target-email:[a-f0-9]{64}\|\/request-password-reset$/
      ),
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("person@example.com");
  }, 10_000);

  it("rejects oversized password reset bodies before skipping target-email delivery limits", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const body = JSON.stringify({
      email: "person@example.com",
      padding: "x".repeat(17 * 1024),
      redirectTo: "http://127.0.0.1:4173/reset-password",
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }, { count: 1 }],
          reservationKeys
        ),
        config
      )
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body,
        headers: {
          "content-length": String(body.length),
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is too large.",
    });
    expect(response.status).toBe(413);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([]);
  }, 10_000);

  it("classifies invalid JSON and schema body failures as invalid_body", async () => {
    const bodySchema = Schema.Struct({
      email: Schema.String,
    });

    await expect(
      readAuthBoundaryJsonOrFormRequestBody(
        new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
          body: '{"email":',
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
        1024,
        bodySchema
      )
    ).resolves.toStrictEqual({
      reason: "invalid_body",
      status: "unavailable",
    });
    await expect(
      readAuthBoundaryJsonOrFormRequestBody(
        new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
          body: JSON.stringify({
            email: ["person@example.com"],
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }),
        1024,
        bodySchema
      )
    ).resolves.toStrictEqual({
      reason: "invalid_body",
      status: "unavailable",
    });
  }, 10_000);

  it("rejects malformed rate-limit endpoint bodies before reservation or delegation", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }, { count: 1 }],
          reservationKeys
        ),
        config
      )
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body: JSON.stringify({
          email: ["person@example.com"],
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is invalid.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([]);
  }, 10_000);

  it("rejects malformed normalized email rate-limit subjects at the schema boundary", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }, { count: 1 }],
          reservationKeys
        ),
        config
      )
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
        body: JSON.stringify({
          email: " ".repeat(4),
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is invalid.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([]);
  }, 10_000);

  it.each([
    {
      body: "email=first%40example.com&email=second%40example.com",
      endpointPath: "/request-password-reset",
      withSession: false,
    },
    {
      body: "newEmail=first%40example.com&newEmail=second%40example.com",
      endpointPath: "/change-email",
      withSession: true,
    },
    {
      body: "email=first%40example.com&email=second%40example.com&organizationId=org_123",
      endpointPath: "/organization/invite-member",
      withSession: true,
    },
    {
      body: "email=member%40example.com&organizationId=org_123&organizationId=org_456",
      endpointPath: "/organization/invite-member",
      withSession: true,
    },
  ])(
    "rejects duplicate form rate-limit subject fields for $endpointPath",
    async ({ body, endpointPath, withSession }) => {
      let delegated = false;
      const reservationKeys: string[] = [];
      const config = makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const handler = withAuthenticationRateLimitFailureResponse(
        withAuthenticationAbuseRateLimitGuard(
          () => {
            delegated = true;
            return Promise.resolve(Response.json({ delegated: true }));
          },
          makeRateLimitReservationSequenceDatabase(
            [{ count: 1 }, { count: 1 }, { count: 1 }],
            reservationKeys
          ),
          config,
          undefined,
          withSession
            ? {
                resolveSession: () =>
                  Promise.resolve(
                    makeAuthenticationSessionResult({
                      activeOrganizationId: "org_123",
                    })
                  ),
              }
            : undefined
        )
      );

      const response = await handler(
        new Request(`http://127.0.0.1:3000/api/auth${endpointPath}`, {
          body,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": "127.0.0.1",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
        message: "Authentication request is invalid.",
      });
      expect(response.status).toBe(400);
      expect(delegated).toBeFalsy();
      expect(reservationKeys).toStrictEqual([]);
    },
    10_000
  );

  it("reserves verification resend limits by email and authenticated user when a session is present", async () => {
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => Promise.resolve(Response.json({ delegated: true })),
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }, { count: 1 }],
        reservationKeys
      ),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(makeAuthenticationSessionResult()),
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/send-verification-email", {
        body: JSON.stringify({
          email: "victim@example.com",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/send-verification-email",
      expect.stringMatching(
        /^ceird-auth-abuse:target-email:[a-f0-9]{64}\|\/send-verification-email$/
      ),
      "ceird-auth-abuse:user:user_123|/send-verification-email",
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("victim@example.com");
    expect(JSON.stringify(reservationKeys)).not.toContain("owner@example.com");
  }, 10_000);

  it("reserves change-email delivery limits by destination email and authenticated user", async () => {
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => Promise.resolve(Response.json({ delegated: true })),
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }, { count: 1 }],
        reservationKeys
      ),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(makeAuthenticationSessionResult()),
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/change-email", {
        body: JSON.stringify({
          newEmail: " Next.Owner@Example.com ",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/change-email",
      expect.stringMatching(
        /^ceird-auth-abuse:destination-email:[a-f0-9]{64}\|\/change-email$/
      ),
      "ceird-auth-abuse:user:user_123|/change-email",
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("Next.Owner");
    expect(JSON.stringify(reservationKeys)).not.toContain("example.com");
  }, 10_000);

  it.each([
    [
      "/change-email",
      {
        newEmail: "next.owner@example.com",
      },
    ],
    [
      "/organization/invite-member",
      {
        email: "member@example.com",
        organizationId: "org_123",
        role: "member",
      },
    ],
  ])(
    "does not reserve authenticated-only delivery email counters for unauthenticated %s requests",
    async (endpointPath, body) => {
      const reservationKeys: string[] = [];
      const config = makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const handler = withAuthenticationAbuseRateLimitGuard(
        () => Promise.resolve(Response.json({ delegated: true })),
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }, { count: 1 }, { count: 1 }],
          reservationKeys
        ),
        config,
        undefined,
        {
          resolveSession: () => Promise.resolve(null),
        }
      );

      const response = await handler(
        new Request(`http://127.0.0.1:3000/api/auth${endpointPath}`, {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "127.0.0.1",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        delegated: true,
      });
      expect(response.status).toBe(200);
      expect(reservationKeys).toStrictEqual([
        `ceird-auth-abuse:127.0.0.1|${endpointPath}`,
      ]);
      expect(JSON.stringify(reservationKeys)).not.toContain("example.com");
    }
  );

  it("reserves invitation limits by IP, recipient, actor, and organization before Better Auth handles the request", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }, { count: 30 }, { count: 200 }],
        reservationKeys
      ),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/organization/invite-member",
      expect.stringMatching(
        /^ceird-auth-abuse:recipient-email:[a-f0-9]{64}\|\/organization\/invite-member$/
      ),
      "ceird-auth-abuse:actor:user_123|/organization/invite-member",
      "ceird-auth-abuse:organization:org_123|/organization/invite-member",
    ]);
    expect(JSON.stringify(reservationKeys)).not.toContain("member@example.com");
  }, 10_000);

  it("uses the active organization for scoped invitation limits when the invite body omits an organization id", async () => {
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => Promise.resolve(Response.json({ delegated: true })),
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }, { count: 1 }, { count: 1 }],
        reservationKeys
      ),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_active",
            })
          ),
      }
    );

    await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    expect(reservationKeys).toContain(
      "ceird-auth-abuse:organization:org_active|/organization/invite-member"
    );
  }, 10_000);

  it("rejects organization invitations that do not target the active organization before reserving limits", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }, { count: 1 }, { count: 1 }, { count: 1 }],
          reservationKeys
        ),
        config,
        undefined,
        {
          resolveSession: () =>
            Promise.resolve(
              makeAuthenticationSessionResult({
                activeOrganizationId: "org_active",
              })
            ),
        }
      )
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_victim",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_ORGANIZATION_CONTEXT_MISMATCH",
      message: "Organization invitations must target the active organization.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([]);
  }, 10_000);

  it("rejects organization invitation bursts when the actor-hour limit is exceeded", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase(
        [{ count: 1 }, { count: 1 }, { count: 31 }, { count: 1 }],
        reservationKeys
      ),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([
      "ceird-auth-abuse:127.0.0.1|/organization/invite-member",
      expect.stringMatching(
        /^ceird-auth-abuse:recipient-email:[a-f0-9]{64}\|\/organization\/invite-member$/
      ),
      "ceird-auth-abuse:actor:user_123|/organization/invite-member",
    ]);
  }, 10_000);

  it("rejects organization invitation bursts when the organization-day limit is exceeded", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationSequenceDatabase([
        { count: 1 },
        { count: 1 },
        { count: 1 },
        { count: 201 },
      ]),
      config,
      undefined,
      {
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("86400");
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("shares invite-member session resolution across auth guards and scoped rate limits", async () => {
    let delegated = false;
    let sessionResolutionCount = 0;
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const resolveSession = makeRequestLocalAuthenticationSessionResolver(() => {
      sessionResolutionCount += 1;
      return Promise.resolve(
        makeAuthenticationSessionResult({
          activeOrganizationId: "org_123",
        })
      );
    });
    const handler = withAuthenticationAuthorizationGuards(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase([
          { count: 1 },
          { count: 1 },
          { count: 1 },
          { count: 1 },
        ]),
        config,
        undefined,
        {
          resolveSession,
        }
      ),
      makeThrowingGuardDatabase(),
      {
        resolveSession,
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
    expect(sessionResolutionCount).toBe(1);
  }, 10_000);

  it("fails closed before invitation side effects when invite-member session resolution fails", async () => {
    let delegated = false;
    const reservationKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const resolveSession = makeRequestLocalAuthenticationSessionResolver(() =>
      Promise.reject(new Error("session unavailable"))
    );
    const handler = withAuthenticationAuthorizationGuards(
      withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationSequenceDatabase(
          [{ count: 1 }],
          reservationKeys
        ),
        config,
        undefined,
        {
          resolveSession,
        }
      ),
      makeThrowingGuardDatabase(),
      {
        resolveSession,
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/organization/invite-member", {
        body: JSON.stringify({
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_SESSION_UNAVAILABLE",
      message: "We couldn't verify your session. Please try again.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    expect(reservationKeys).toStrictEqual([]);
  }, 10_000);

  it.each([
    "/oauth2/create-client",
    "/oauth2/update-client",
    "/oauth2/delete-client",
    "/oauth2/client/rotate-secret",
    "/oauth2/get-consent",
    "/oauth2/get-consents",
    "/oauth2/update-consent",
    "/oauth2/delete-consent",
    "/admin/oauth2/create-client",
    "/admin/oauth2/update-client",
  ])("blocks native OAuth management endpoint %s", async (endpointPath) => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthClientManagementEndpointGuard(() => {
      delegated = true;
      return Promise.resolve(Response.json({ delegated: true }));
    }, config.basePath);

    const response = await handler(
      new Request(`https://api.ceird.example/api/auth${endpointPath}`, {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:admin",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "OAUTH_CLIENT_MANAGEMENT_DISABLED",
      message: "OAuth management is handled by Ceird workflows.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  });

  it("allows read-only OAuth dynamic client registration metadata through the policy guard", async () => {
    let delegatedBody: unknown;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthClientRegistrationPolicyGuard(
      async (request) => {
        delegatedBody = await request.json();
        return Response.json({ delegated: true });
      },
      {
        allowLoopbackRedirects:
          config.oauthClientRegistrationAllowLoopbackRedirects,
        allowedScopes: config.oauthClientRegistrationAllowedScopes,
        basePath: config.basePath,
      }
    );

    const body = {
      client_name: "Ceird MCP Client",
      client_uri: "https://client.example",
      contacts: ["security@client.example"],
      grant_types: ["authorization_code", "refresh_token"],
      logo_uri: "https://client.example/logo.png",
      policy_uri: "https://client.example/privacy",
      post_logout_redirect_uris: ["https://client.example/logout"],
      redirect_uris: ["https://client.example/oauth/callback"],
      response_types: ["code"],
      scope: "openid profile email offline_access ceird:read",
      software_id: "ceird-mcp-client",
      software_statement: "signed-client-metadata-placeholder",
      software_version: "1.2.3",
      subject_type: "public",
      token_endpoint_auth_method: "none",
      tos_uri: "https://client.example/terms",
      type: "native",
    };
    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegatedBody).toStrictEqual({
      ...body,
      token_endpoint_auth_method: "none",
    });
  }, 10_000);

  it.each([
    [
      "scope array",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        scope: ["ceird:admin"],
      },
      "scope_invalid_shape",
    ],
    [
      "client URI array",
      {
        client_uri: [],
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "client_uri_invalid_shape",
    ],
    [
      "malformed client name",
      {
        client_name: 123,
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "client_name_invalid_shape",
    ],
    [
      "malformed software id",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        software_id: 123,
      },
      "software_id_invalid_shape",
    ],
    [
      "malformed software version",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        software_version: [],
      },
      "software_version_invalid_shape",
    ],
    [
      "malformed software statement",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        software_statement: {},
      },
      "software_statement_invalid_shape",
    ],
    [
      "malformed subject type",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        subject_type: [],
      },
      "subject_type_invalid_shape",
    ],
  ])(
    "rejects OAuth dynamic client registration wrong-type scalar metadata for %s before delegation",
    async (_caseName, body, expectedTelemetryReason) => {
      let delegated = false;
      const { logger, logs } = captureLogs();
      const config = makeAuthenticationConfig({
        baseUrl: "https://api.ceird.example/api/auth",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const response = await Effect.gen(
        function* verifyRegistrationRejection() {
          const runtimeContext = yield* Effect.context<never>();
          const handler = withOAuthClientRegistrationPolicyGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            {
              allowLoopbackRedirects:
                config.oauthClientRegistrationAllowLoopbackRedirects,
              allowedScopes: config.oauthClientRegistrationAllowedScopes,
              basePath: config.basePath,
              runtimeContext,
            }
          );

          return yield* Effect.promise(() =>
            handler(
              new Request(
                "https://api.ceird.example/api/auth/oauth2/register",
                {
                  body: JSON.stringify(body),
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "POST",
                }
              )
            )
          );
        }
      ).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Trace"),
        Effect.runPromise
      );

      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_client_metadata",
      });
      expect(response.status).toBe(400);
      expect(delegated).toBeFalsy();
      const logText = JSON.stringify(logs);

      expect(logText).toContain("oauth_dynamic_client_registration_rejected");
      expect(logText).toContain(expectedTelemetryReason);
    }
  );

  it("rejects oversized OAuth dynamic client registration bodies before Better Auth handles the request", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withOAuthClientRegistrationPolicyGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        {
          allowLoopbackRedirects:
            config.oauthClientRegistrationAllowLoopbackRedirects,
          allowedScopes: config.oauthClientRegistrationAllowedScopes,
          basePath: config.basePath,
        }
      )
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          software_statement: "x".repeat(17 * 1024),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is too large.",
    });
    expect(response.status).toBe(413);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("rejects streamed OAuth dynamic client registration bodies without JSON content type before Better Auth handles the request", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationRateLimitFailureResponse(
      withOAuthClientRegistrationPolicyGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        {
          allowLoopbackRedirects:
            config.oauthClientRegistrationAllowLoopbackRedirects,
          allowedScopes: config.oauthClientRegistrationAllowedScopes,
          basePath: config.basePath,
        }
      )
    );

    const response = await handler(
      makeStreamingPostRequest(
        "https://api.ceird.example/api/auth/oauth2/register",
        JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
        })
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is invalid.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it.each([
    [
      "write scope",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        scope: "openid ceird:write",
      },
      "invalid_scope",
      "restricted_scope_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "admin scope",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        scope: "openid ceird:admin",
      },
      "invalid_scope",
      "restricted_scope_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "client credentials",
      {
        grant_types: ["client_credentials"],
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "client_credentials_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "confidential token endpoint auth method",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        token_endpoint_auth_method: "client_secret_basic",
      },
      "invalid_client_metadata",
      "confidential_client_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "confidential web client type",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        type: "web",
      },
      "invalid_client_metadata",
      "confidential_client_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "unsupported grant type",
      {
        grant_types: ["password"],
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "unsupported_grant_type_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "scalar grant types",
      {
        grant_types: "authorization_code",
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "grant_types_invalid_shape",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "malformed grant type entry",
      {
        grant_types: ["authorization_code", 123],
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "grant_types_invalid_shape",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "unsupported response type",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        response_types: ["token"],
      },
      "invalid_client_metadata",
      "unsupported_response_type_requested",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "malformed redirect entry",
      {
        redirect_uris: [123],
      },
      "invalid_client_metadata",
      "redirect_uris_invalid_shape",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "wildcard redirect",
      {
        redirect_uris: ["https://*.example/oauth/callback"],
      },
      "invalid_redirect_uri",
      "redirect_uris_wildcard",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "malformed redirect",
      {
        redirect_uris: ["client.example/oauth/callback"],
      },
      "invalid_redirect_uri",
      "redirect_uris_invalid_url",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "production loopback redirect",
      {
        redirect_uris: ["http://127.0.0.1:8123/callback"],
      },
      "invalid_redirect_uri",
      "redirect_uris_loopback_not_allowed",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "production IPv4-mapped IPv6 loopback redirect",
      {
        redirect_uris: ["https://[::ffff:127.0.0.1]/callback"],
      },
      "invalid_redirect_uri",
      "redirect_uris_loopback_not_allowed",
      "high",
      "alert_on_suspicious_oauth_registration",
    ],
    [
      "malformed client URI",
      {
        client_uri: "client.example/home",
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "client_uri_invalid_url",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "oversized client name",
      {
        client_name: "a".repeat(121),
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "client_name_too_long",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "oversized scope metadata",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        scope: "openid ".repeat(200),
      },
      "invalid_client_metadata",
      "scope_too_long",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "duplicate scope metadata",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        scope: "openid openid",
      },
      "invalid_scope",
      "duplicate_scope_requested",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "malformed contact entry",
      {
        contacts: [{}],
        redirect_uris: ["https://client.example/oauth/callback"],
      },
      "invalid_client_metadata",
      "contacts_invalid_shape",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
    [
      "unknown metadata field",
      {
        redirect_uris: ["https://client.example/oauth/callback"],
        sector_identifier_uri: "https://client.example/sector.json",
      },
      "invalid_client_metadata",
      "unsupported_metadata_field",
      "dashboard",
      "dashboard_until_sustained_oauth_registration_rejection",
    ],
  ])(
    "rejects OAuth dynamic client registration with %s",
    async (
      _caseName,
      body,
      expectedError,
      expectedTelemetryReason,
      expectedTelemetrySeverity,
      expectedTelemetryPolicy
    ) => {
      let delegated = false;
      const { logger, logs } = captureLogs();
      const config = makeAuthenticationConfig({
        baseUrl: "https://api.ceird.example/api/auth",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const response = await Effect.gen(
        function* verifyRegistrationRejection() {
          const runtimeContext = yield* Effect.context<never>();
          const handler = withOAuthClientRegistrationPolicyGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            {
              allowLoopbackRedirects:
                config.oauthClientRegistrationAllowLoopbackRedirects,
              allowedScopes: config.oauthClientRegistrationAllowedScopes,
              basePath: config.basePath,
              runtimeContext,
            }
          );

          return yield* Effect.promise(() =>
            handler(
              new Request(
                "https://api.ceird.example/api/auth/oauth2/register",
                {
                  body: JSON.stringify(body),
                  headers: {
                    "content-type": "application/json",
                  },
                  method: "POST",
                }
              )
            )
          );
        }
      ).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Trace"),
        Effect.runPromise
      );

      await expect(response.json()).resolves.toMatchObject({
        error: expectedError,
      });
      expect(response.status).toBe(400);
      expect(delegated).toBeFalsy();
      const logText = JSON.stringify(logs);

      expect(logText).toContain("oauth_dynamic_client_registration_rejected");
      expect(logText).toContain(expectedTelemetryReason);
      expect(logText).toContain(expectedTelemetrySeverity);
      expect(logText).toContain(expectedTelemetryPolicy);
    }
  );

  it("allows OAuth dynamic client registration loopback redirects in local config", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthClientRegistrationPolicyGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        allowLoopbackRedirects:
          config.oauthClientRegistrationAllowLoopbackRedirects,
        allowedScopes: config.oauthClientRegistrationAllowedScopes,
        basePath: config.basePath,
      }
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:8123/callback"],
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
  }, 10_000);

  it("blocks refresh-token grants when the saved OAuth consent is gone", async () => {
    const storedRefreshToken = await hashOAuthStoredToken(
      "raw-refresh-token",
      "refresh_token"
    );
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({
          rows: [
            {
              consentScopes: null,
              refreshTokenScopes: ["ceird:read", "offline_access"],
              token: storedRefreshToken,
            },
          ],
        }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: new URLSearchParams({
          client_id: "client_external_mcp",
          grant_type: "refresh_token",
          refresh_token: "raw-refresh-token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "invalid_grant",
      error_description: "Refresh token consent is no longer active.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("blocks refresh-token grants when live consent no longer covers the refresh-token scopes", async () => {
    const storedRefreshToken = await hashOAuthStoredToken(
      "raw-refresh-token",
      "refresh_token"
    );
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({
          rows: [
            {
              consentScopes: ["ceird:read"],
              refreshTokenScopes: ["ceird:read", "offline_access"],
              token: storedRefreshToken,
            },
          ],
        }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "raw-refresh-token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "invalid_grant",
      error_description: "Refresh token consent is no longer active.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it.each([
    [
      "consent scopes",
      {
        consentScopes: ["ceird:read", "ceird:superadmin"],
        refreshTokenScopes: ["ceird:read"],
      },
    ],
    [
      "refresh-token scopes",
      {
        consentScopes: ["ceird:read"],
        refreshTokenScopes: ["ceird:read", "ceird:superadmin"],
      },
    ],
  ])(
    "fails closed with a verification error when refresh-token consent rows contain malformed %s",
    async (_caseName, scopes) => {
      const storedRefreshToken = await hashOAuthStoredToken(
        "raw-refresh-token",
        "refresh_token"
      );
      let delegated = false;
      const config = makeAuthenticationConfig({
        baseUrl: "https://api.ceird.example/api/auth",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const handler = withOAuthRefreshTokenConsentGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        {
          basePath: config.basePath,
          database: makeOAuthRefreshTokenConsentGuardDatabase({
            rows: [
              {
                ...scopes,
                token: storedRefreshToken,
              },
            ],
          }),
        }
      );

      const response = await handler(
        new Request("https://api.ceird.example/api/auth/oauth2/token", {
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: "raw-refresh-token",
          }),
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        error: "server_error",
        error_description: "Refresh token consent could not be verified.",
      });
      expect(response.status).toBe(503);
      expect(delegated).toBeFalsy();
    },
    10_000
  );

  it("fails closed when refresh-token request bodies are too large to inspect", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({ rows: [] }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: new URLSearchParams({
          grant_type: "refresh_token",
          padding: "x".repeat(16 * 1024),
          refresh_token: "raw-refresh-token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "invalid_request",
      error_description: "OAuth token request could not be inspected.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("fails closed when token request JSON cannot be inspected", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({ rows: [] }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: '{"grant_type":',
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "invalid_request",
      error_description: "OAuth token request could not be inspected.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("fails closed when token requests use an unsupported content type", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({ rows: [] }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: "",
        headers: {
          "content-type": "text/plain",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "invalid_request",
      error_description: "OAuth token request could not be inspected.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("allows refresh-token grants when the saved OAuth consent is still active", async () => {
    const storedRefreshToken = await hashOAuthStoredToken(
      "raw-refresh-token",
      "refresh_token"
    );
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthRefreshTokenConsentGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      {
        basePath: config.basePath,
        database: makeOAuthRefreshTokenConsentGuardDatabase({
          rows: [
            {
              consentScopes: ["ceird:read", "offline_access"],
              refreshTokenScopes: ["ceird:read", "offline_access"],
              token: storedRefreshToken,
            },
          ],
        }),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: JSON.stringify({
          client_id: "client_external_mcp",
          grant_type: "refresh_token",
          refresh_token: "raw-refresh-token",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
  }, 10_000);

  it("fails closed and logs when refresh-token consent lookup fails", async () => {
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(function* verifyRefreshConsentGuard() {
      const runtimeContext = yield* Effect.context<never>();
      const handler = withOAuthRefreshTokenConsentGuard(
        () => Promise.resolve(Response.json({ delegated: true })),
        {
          basePath: config.basePath,
          database: makeOAuthRefreshTokenConsentGuardDatabase({
            selectFailure: new Error(
              "lookup failed for rawtokenrawtokenrawtokenrawtoken1234"
            ),
          }),
          runtimeContext,
        }
      );

      return yield* Effect.promise(() =>
        handler(
          new Request("https://api.ceird.example/api/auth/oauth2/token", {
            body: new URLSearchParams({
              client_id: "client_external_mcp",
              grant_type: "refresh_token",
              refresh_token: "raw-refresh-token",
            }),
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
            method: "POST",
          })
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "server_error",
      error_description: "Refresh token consent could not be verified.",
    });
    expect(response.status).toBe(503);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain(
      "oauth_refresh_token_consent_guard_failure"
    );
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("records OAuth dynamic client registration audit events without client secrets", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            client_id: "client_readonly",
            client_secret: "registered-client-secret",
            scope: "openid ceird:read",
            user_id: "user_123",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:read",
        }),
        headers: {
          "content-type": "application/json",
          "user-agent": "Ceird MCP Test",
          "x-forwarded-for": "203.0.113.50",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: "user_123",
        eventType: "oauth_client_registration_succeeded",
        oauthClientId: "client_readonly",
        scopes: ["openid", "ceird:read"],
        sourceIp: "203.0.113.50",
        userAgent: "Ceird MCP Test",
      }),
    ]);
    expect(JSON.stringify(auditEvents[0])).not.toContain(
      "registered-client-secret"
    );
  }, 10_000);

  it("records rejected OAuth dynamic client registration audit events", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json(
            {
              error: "invalid_scope",
              error_description:
                "Dynamic client registration requested a restricted scope.",
            },
            {
              status: 400,
            }
          )
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:admin",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.52",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "oauth_client_registration_rejected",
        metadata: {
          dynamicRegistration: true,
          oauthError: "invalid_scope",
          outcome: "rejected",
          requestedUnknownScope: false,
        },
        scopes: ["openid", "ceird:admin"],
        sourceIp: "203.0.113.52",
      }),
    ]);
  }, 10_000);

  it("records rejected OAuth dynamic client registration unknown-scope evidence without raw unknown scope persistence", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json(
            {
              error: "invalid_scope",
              error_description:
                "Dynamic client registration requested a restricted scope.",
            },
            {
              status: 400,
            }
          )
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:superadmin",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.52",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(400);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "oauth_client_registration_rejected",
        metadata: {
          dynamicRegistration: true,
          oauthError: "invalid_scope",
          outcome: "rejected",
          requestedUnknownScope: true,
        },
        scopes: ["openid"],
        sourceIp: "203.0.113.52",
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("ceird:superadmin");
  }, 10_000);

  it("drops malformed OAuth registration response IDs before audit construction", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json(
            {
              client_id: "",
              scope: "openid ceird:read",
              user_id: "",
            },
            { status: 201 }
          )
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/register", {
        body: JSON.stringify({
          redirect_uris: ["https://client.example/oauth/callback"],
          scope: "openid ceird:read",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(201);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: null,
        eventType: "oauth_client_registration_succeeded",
        oauthClientId: null,
        scopes: ["openid", "ceird:read"],
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("client_id");
    expect(JSON.stringify(auditEvents)).not.toContain("user_id");
  }, 10_000);

  it("records admin-scope OAuth consent grants with actor and organization context", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            redirect_uri:
              "https://client.example/callback?code=raw-code&state=state",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        resolveSession: () =>
          Promise.resolve(
            makeOAuthAuditSessionResult({
              activeOrganizationId: "org_123",
              sessionId: "session_123",
              userId: "user_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
          oauth_query:
            "client_id=client_admin&scope=openid%20ceird%3Aadmin&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.51",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: "user_123",
        eventType: "oauth_consent_granted",
        metadata: {
          accepted: true,
          containsAdminScope: true,
          containsWriteScope: false,
        },
        oauthClientId: "client_admin",
        organizationId: "org_123",
        scopes: ["openid", "ceird:admin"],
        sessionId: "session_123",
      }),
    ]);
    expect(JSON.stringify(auditEvents[0])).not.toContain("raw-code");
    expect(JSON.stringify(auditEvents[0])).not.toContain(
      "https://client.example/callback"
    );
  }, 10_000);

  it("records OAuth consent denials when Better Auth returns a redirect response", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.redirect(
            "https://client.example/callback?error=access_denied&state=state",
            302
          )
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        resolveSession: () =>
          Promise.resolve(
            makeOAuthAuditSessionResult({
              activeOrganizationId: "org_123",
              sessionId: "session_123",
              userId: "user_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: false,
          oauth_query:
            "client_id=client_denied&scope=openid%20ceird%3Awrite&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback",
        }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.51",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(302);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: "user_123",
        eventType: "oauth_consent_denied",
        metadata: {
          accepted: false,
          containsAdminScope: false,
          containsWriteScope: true,
        },
        oauthClientId: "client_denied",
        organizationId: "org_123",
        scopes: ["openid", "ceird:write"],
        sessionId: "session_123",
      }),
    ]);
    expect(JSON.stringify(auditEvents[0])).not.toContain("access_denied");
    expect(JSON.stringify(auditEvents[0])).not.toContain(
      "https://client.example/callback"
    );
  }, 10_000);

  it("fails open for malformed OAuth consent audit request bodies", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            redirect_uri:
              "https://client.example/callback?code=raw-code&state=state",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        resolveSession: () =>
          Promise.resolve(
            makeOAuthAuditSessionResult({
              activeOrganizationId: "org_123",
              sessionId: "session_123",
              userId: "user_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: "true",
          oauth_query: ["client_id=client_admin"],
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([]);
  }, 10_000);

  it("logs stable telemetry when OAuth audit session resolution fails", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyAuditSessionResolutionTelemetry() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withOAuthSecurityAuditEventRecorder(
          () =>
            Promise.resolve(
              Response.json({
                redirect_uri:
                  "https://client.example/callback?code=raw-code&state=state",
              })
            ),
          {
            authConfig: config,
            database: makeAuthSecurityAuditEventDatabase(auditEvents),
            resolveSession: () =>
              Promise.reject(
                new Error(
                  "session lookup failed for owner@example.com https://app.example/raw rawtokenrawtokenrawtokenrawtoken1234"
                )
              ),
            runtimeContext,
          }
        );

        return yield* Effect.promise(() =>
          handler(
            new Request("https://api.ceird.example/api/auth/oauth2/consent", {
              body: JSON.stringify({
                accept: true,
                oauth_query:
                  "client_id=client_admin&scope=openid%20ceird%3Aadmin&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback",
              }),
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": "203.0.113.51",
              },
              method: "POST",
            })
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: null,
        eventType: "oauth_consent_granted",
        metadata: {
          accepted: true,
          containsAdminScope: true,
          containsWriteScope: false,
        },
        oauthClientId: "client_admin",
        organizationId: null,
        scopes: ["openid", "ceird:admin"],
        sessionId: null,
      }),
    ]);
    const serializedLogs = JSON.stringify(logs);

    expect(serializedLogs).toContain(
      "auth_security_audit_session_resolution_failure"
    );
    expect(serializedLogs).toContain(
      "dashboard_until_sustained_audit_session_failure"
    );
    expect(serializedLogs).not.toContain("owner@example.com");
    expect(serializedLogs).not.toContain("https://app.example/raw");
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("records OAuth token refresh and revocation audit events without raw tokens", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const storedRefreshToken = await hashOAuthStoredToken(
      "raw-refresh-token",
      "refresh_token"
    );
    const storedRevokedToken = await hashOAuthStoredToken(
      "raw-revoked-token",
      "refresh_token"
    );
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      (request) => {
        const { pathname } = new URL(request.url);

        if (pathname.endsWith("/oauth2/revoke")) {
          return Promise.resolve(Response.json({}));
        }

        return Promise.resolve(
          Response.json({
            access_token: "raw-access-token",
            refresh_token: "new-raw-refresh-token",
            scope: "openid ceird:read",
            token_type: "Bearer",
          })
        );
      },
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents, {
          tokenRows: [
            {
              activeOrganizationId: "org_mutable_session",
              clientId: "client_from_refresh_row",
              referenceId: "org_from_refresh_reference",
              scopes: ["openid", "ceird:read"],
              sessionId: "session_from_refresh_row",
              token: storedRefreshToken,
              userId: "user_from_refresh_row",
            },
            {
              activeOrganizationId: "org_mutable_session",
              clientId: "client_from_revoked_row",
              referenceId: "org_from_revoked_reference",
              scopes: ["openid", "ceird:write"],
              sessionId: "session_from_revoked_row",
              token: storedRevokedToken,
              userId: "user_from_revoked_row",
            },
          ],
        }),
      }
    );

    const refreshResponse = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/token", {
        body: new URLSearchParams({
          client_id: "client_readonly",
          client_secret: "client-secret",
          grant_type: "refresh_token",
          refresh_token: "raw-refresh-token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );
    const revokeResponse = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/revoke", {
        body: new URLSearchParams({
          client_id: "client_readonly",
          client_secret: "client-secret",
          token: "raw-revoked-token",
          token_type_hint: "refresh_token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    expect(refreshResponse.status).toBe(200);
    expect(revokeResponse.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        actorUserId: "user_from_refresh_row",
        eventType: "oauth_token_refreshed",
        metadata: {
          grantType: "refresh_token",
          matchedStoredToken: true,
          tokenKind: "refresh_token",
        },
        oauthClientId: "client_from_refresh_row",
        organizationId: "org_from_refresh_reference",
        scopes: ["openid", "ceird:read"],
        sessionId: "session_from_refresh_row",
      }),
      expect.objectContaining({
        actorUserId: "user_from_revoked_row",
        eventType: "oauth_token_revoked",
        metadata: {
          matchedStoredToken: true,
          tokenKind: "refresh_token",
          tokenTypeHint: "refresh_token",
        },
        oauthClientId: "client_from_revoked_row",
        organizationId: "org_from_revoked_reference",
        scopes: ["openid", "ceird:write"],
        sessionId: "session_from_revoked_row",
      }),
    ]);
    const serializedAuditEvents = JSON.stringify(auditEvents);

    expect(serializedAuditEvents).not.toContain("client-secret");
    expect(serializedAuditEvents).not.toContain("raw-access-token");
    expect(serializedAuditEvents).not.toContain("new-raw-refresh-token");
    expect(serializedAuditEvents).not.toContain("raw-refresh-token");
    expect(serializedAuditEvents).not.toContain("raw-revoked-token");
  }, 10_000);

  it.each([
    [
      "finite scope",
      {
        activeOrganizationId: "org_mutable_session",
        clientId: "client_from_bad_scope_row",
        referenceId: "org_from_bad_scope_row",
        scopes: ["openid", "ceird:superadmin"],
        sessionId: "session_from_bad_scope_row",
        userId: "user_from_bad_scope_row",
      },
      ["client_from_bad_scope_row", "ceird:superadmin"],
    ],
    [
      "branded ID",
      {
        activeOrganizationId: "org_mutable_session",
        clientId: "client_from_bad_id_row",
        referenceId: "org_from_bad_id_row",
        scopes: ["openid"],
        sessionId: "",
        userId: "user_from_bad_id_row",
      },
      ["client_from_bad_id_row", "org_from_bad_id_row", "user_from_bad_id_row"],
    ],
  ])(
    "fails open and logs sanitized telemetry when OAuth token audit context rows fail %s schema decode",
    async (_caseName, row, forbiddenFragments) => {
      const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
      const { logger, logs } = captureLogs();
      const storedRefreshToken = await hashOAuthStoredToken(
        "raw-refresh-token",
        "refresh_token"
      );
      const config = makeAuthenticationConfig({
        baseUrl: "https://api.ceird.example/api/auth",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });

      const response = await Effect.gen(
        function* verifyTokenContextDecodeFailure() {
          const runtimeContext = yield* Effect.context<never>();
          const handler = withOAuthSecurityAuditEventRecorder(
            () =>
              Promise.resolve(
                Response.json({
                  access_token: "raw-access-token",
                  refresh_token: "new-raw-refresh-token",
                  scope: "openid ceird:read",
                  token_type: "Bearer",
                })
              ),
            {
              authConfig: config,
              database: makeAuthSecurityAuditEventDatabase(auditEvents, {
                tokenRows: [
                  {
                    ...row,
                    token: storedRefreshToken,
                  },
                ],
              }),
              runtimeContext,
            }
          );

          return yield* Effect.promise(() =>
            handler(
              new Request("https://api.ceird.example/api/auth/oauth2/token", {
                body: new URLSearchParams({
                  client_id: "client_readonly",
                  client_secret: "client-secret",
                  grant_type: "refresh_token",
                  refresh_token: "raw-refresh-token",
                }),
                headers: {
                  "content-type": "application/x-www-form-urlencoded",
                },
                method: "POST",
              })
            )
          );
        }
      ).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Trace"),
        Effect.runPromise
      );

      expect(response.status).toBe(200);
      expect(auditEvents).toStrictEqual([
        expect.objectContaining({
          actorUserId: null,
          eventType: "oauth_token_refreshed",
          metadata: {
            grantType: "refresh_token",
            matchedStoredToken: false,
            tokenKind: "refresh_token",
          },
          oauthClientId: "client_readonly",
          organizationId: null,
          scopes: ["openid", "ceird:read"],
          sessionId: null,
        }),
      ]);
      const serializedAuditEvents = JSON.stringify(auditEvents);
      const serializedLogs = JSON.stringify(logs);

      expect(serializedLogs).toContain(
        "auth_security_audit_token_context_failure"
      );
      expect(serializedLogs).not.toContain("client-secret");
      expect(serializedLogs).not.toContain("raw-refresh-token");

      for (const fragment of forbiddenFragments) {
        expect(serializedAuditEvents).not.toContain(fragment);
        expect(serializedLogs).not.toContain(fragment);
      }
    },
    10_000
  );

  it("drops malformed OAuth request client IDs before audit fallback construction", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOAuthSecurityAuditEventRecorder(
      () => Promise.resolve(Response.json({})),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/revoke", {
        body: new URLSearchParams({
          client_id: "",
          token: "raw-revoked-token",
          token_type_hint: "refresh_token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "oauth_token_revoked",
        metadata: {
          matchedStoredToken: false,
          tokenKind: null,
          tokenTypeHint: null,
        },
        oauthClientId: null,
        organizationId: null,
        scopes: null,
        sessionId: null,
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("raw-revoked-token");
  }, 10_000);

  it("fails open and logs telemetry when auth security audit writes fail", async () => {
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(function* verifyAuditWriteFailOpen() {
      const runtimeContext = yield* Effect.context<never>();
      const handler = withOAuthSecurityAuditEventRecorder(
        () =>
          Promise.resolve(
            Response.json(
              {
                client_id: "client_public",
                scope: "openid ceird:read",
              },
              {
                status: 201,
              }
            )
          ),
        {
          authConfig: config,
          database: makeFailingAuthSecurityAuditEventDatabase(
            new Error(
              "insert failed for member@example.com https://app.example/accept-invitation/inv_123 rawtokenrawtokenrawtokenrawtoken1234"
            )
          ),
          runtimeContext,
        }
      );

      return yield* Effect.promise(() =>
        handler(
          new Request("https://api.ceird.example/api/auth/oauth2/register", {
            body: JSON.stringify({
              redirect_uris: ["https://client.example/oauth/callback"],
              scope: "openid ceird:read",
            }),
            headers: {
              "content-type": "application/json",
            },
            method: "POST",
          })
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      client_id: "client_public",
      scope: "openid ceird:read",
    });
    expect(response.status).toBe(201);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain("auth_security_audit_write_failure");
    expect(serializedLogs).toContain("[redacted-email]");
    expect(serializedLogs).toContain("[redacted-url]");
    expect(serializedLogs).toContain("[redacted-token]");
    expect(serializedLogs).not.toContain("member@example.com");
    expect(serializedLogs).not.toContain("https://app.example");
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("fails open and does not insert raw rows when auth security audit write schema decoding fails", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const invalidAuditIdsAndScopes = {
      actorUserId: "",
      eventType: "oauth_token_refreshed",
      metadata: {},
      oauthClientId: "",
      organizationId: "",
      scopes: ["openid", 123],
      sessionId: "",
      sourceIp: "203.0.113.10",
      userAgent: "Ceird Test",
    };
    const invalidAuditScopeWrite = {
      actorUserId: "user_123",
      eventType: "oauth_token_refreshed",
      metadata: {
        grantType: "refresh_token",
        matchedStoredToken: true,
        tokenKind: "refresh_token",
      },
      oauthClientId: "client_123",
      organizationId: "org_123",
      scopes: ["openid", "ceird:superadmin"],
      sessionId: "session_123",
      sourceIp: "203.0.113.10",
      userAgent: "Ceird Test",
    };
    const malformedMetadataAuditWrite = {
      actorUserId: "user_123",
      eventType: "oauth_token_refreshed",
      metadata: [
        "member@example.com https://app.example/raw rawtokenrawtokenrawtokenrawtoken1234",
      ],
      oauthClientId: "client_123",
      organizationId: "org_123",
      scopes: ["openid", "ceird:read"],
      sessionId: "session_123",
      sourceIp: "203.0.113.10",
      userAgent: "Ceird Test",
    };

    await Effect.gen(function* verifyAuditWriteSchemaFailOpen() {
      const runtimeContext = yield* Effect.context<never>();
      const database = makeAuthSecurityAuditEventDatabase(auditEvents);

      yield* Effect.promise(() =>
        writeAuthSecurityAuditEvent(
          { database, runtimeContext },
          invalidAuditIdsAndScopes
        )
      );
      yield* Effect.promise(() =>
        writeAuthSecurityAuditEvent(
          { database, runtimeContext },
          invalidAuditScopeWrite
        )
      );
      return yield* Effect.promise(() =>
        writeAuthSecurityAuditEvent(
          { database, runtimeContext },
          malformedMetadataAuditWrite
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(auditEvents).toStrictEqual([]);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain("auth_security_audit_write_failure");
    expect(serializedLogs).toContain("[redacted-email]");
    expect(serializedLogs).toContain("[redacted-url]");
    expect(serializedLogs).toContain("[redacted-token]");
    expect(serializedLogs).not.toContain("member@example.com");
    expect(serializedLogs).not.toContain("https://app.example/raw");
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("records organization security audit events through Better Auth organization hooks", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { auth, cleanup } = createAuthenticationForPluginInspection(
      {},
      {
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    try {
      const hooks = getOrganizationPluginOptions(auth).organizationHooks as
        | {
            readonly afterAcceptInvitation?: (data: {
              readonly invitation: {
                readonly email: string;
                readonly organizationId: string;
                readonly role: string;
              };
              readonly member: {
                readonly id: string;
                readonly organizationId: string;
                readonly userId: string;
              };
              readonly organization: { readonly id: string };
              readonly user: { readonly id: string };
            }) => Promise<void>;
            readonly afterCancelInvitation?: (data: {
              readonly cancelledBy: { readonly id: string };
              readonly invitation: {
                readonly email: string;
                readonly organizationId: string;
                readonly role: string;
              };
              readonly organization: { readonly id: string };
            }) => Promise<void>;
            readonly afterCreateInvitation?: (data: {
              readonly invitation: {
                readonly email: string;
                readonly organizationId: string;
                readonly role: string;
              };
              readonly inviter: { readonly id: string };
              readonly organization: { readonly id: string };
            }) => Promise<void>;
            readonly afterCreateOrganization?: (data: {
              readonly member: {
                readonly id: string;
                readonly role: string;
              };
              readonly organization: { readonly id: string };
              readonly user: { readonly id: string };
            }) => Promise<void>;
            readonly afterUpdateOrganization?: (data: {
              readonly member: { readonly id: string };
              readonly organization: {
                readonly id: string;
                readonly name: string;
              };
              readonly user: { readonly id: string };
            }) => Promise<void>;
          }
        | undefined;

      await hooks?.afterCreateOrganization?.({
        member: {
          id: "member_owner",
          role: "owner",
        },
        organization: {
          id: "org_123",
        },
        user: {
          id: "user_owner",
        },
      });
      await hooks?.afterUpdateOrganization?.({
        member: {
          id: "member_owner",
        },
        organization: {
          id: "org_123",
          name: "Acme Field Ops",
        },
        user: {
          id: "user_owner",
        },
      });
      await hooks?.afterCreateInvitation?.({
        invitation: {
          email: " Member@Example.COM ",
          organizationId: "org_123",
          role: "member",
        },
        inviter: {
          id: "user_owner",
        },
        organization: {
          id: "org_123",
        },
      });
      await hooks?.afterAcceptInvitation?.({
        invitation: {
          email: " Member@Example.COM ",
          organizationId: "org_123",
          role: "member",
        },
        member: {
          id: "member_accepted",
          organizationId: "org_123",
          userId: "user_member",
        },
        organization: {
          id: "org_123",
        },
        user: {
          id: "user_member",
        },
      });
      await hooks?.afterCancelInvitation?.({
        cancelledBy: {
          id: "user_owner",
        },
        invitation: {
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        },
        organization: {
          id: "org_123",
        },
      });

      expect(auditEvents.map((event) => event.eventType)).toStrictEqual([
        "organization_created",
        "organization_updated",
        "organization_invitation_created",
        "organization_invitation_accepted",
        "organization_invitation_canceled",
      ]);
      const organizationCreatedAuditEvent = auditEvents.find(
        (event) => event.eventType === "organization_created"
      );

      expect(organizationCreatedAuditEvent?.metadata).not.toHaveProperty(
        "previousRole"
      );
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          actorUserId: "user_owner",
          eventType: "organization_created",
          organizationId: "org_123",
          metadata: expect.objectContaining({
            memberId: "member_owner",
            role: "owner",
            targetUserId: "user_owner",
          }),
        })
      );
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          actorUserId: "user_owner",
          eventType: "organization_invitation_created",
          organizationId: "org_123",
          metadata: expect.objectContaining({
            invitationEmailMasked: "m***@e***.com",
            role: "member",
          }),
        })
      );
      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          actorUserId: "user_member",
          eventType: "organization_invitation_accepted",
          organizationId: "org_123",
          metadata: expect.objectContaining({
            invitationEmailMasked: "m***@e***.com",
            memberId: "member_accepted",
          }),
        })
      );
      const serializedAuditEvents = JSON.stringify(auditEvents);

      expect(serializedAuditEvents).not.toContain("member@example.com");
      expect(serializedAuditEvents).not.toContain("Member@Example.COM");
      expect(serializedAuditEvents).not.toContain("accept-invitation");
      expect(serializedAuditEvents).not.toContain("inv_");
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("fails open when Better Auth hook metadata contains malformed organization member IDs", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const runtimeContext = await Effect.context<never>().pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );
    const { auth, cleanup } = createAuthenticationForPluginInspection(
      {},
      {
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        runtimeContext,
      }
    );

    try {
      const hooks = getOrganizationPluginOptions(auth).organizationHooks as
        | {
            readonly afterAcceptInvitation?: (data: {
              readonly invitation: {
                readonly email: string;
                readonly organizationId: string;
                readonly role: string;
              };
              readonly member: {
                readonly id: string;
                readonly organizationId: string;
                readonly userId: string;
              };
              readonly organization: { readonly id: string };
              readonly user: { readonly id: string };
            }) => Promise<void>;
          }
        | undefined;

      await hooks?.afterAcceptInvitation?.({
        invitation: {
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        },
        member: {
          id: "",
          organizationId: "org_123",
          userId: "user_member",
        },
        organization: {
          id: "org_123",
        },
        user: {
          id: "user_member",
        },
      });

      expect(auditEvents).toStrictEqual([]);
      expect(JSON.stringify(logs)).toContain(
        "auth_security_audit_write_failure"
      );
      expect(JSON.stringify(logs)).not.toContain("member@example.com");
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("keeps malformed organization-created audit roles inside the fail-open audit boundary", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { auth, cleanup } = createAuthenticationForPluginInspection(
      {},
      {
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
      }
    );

    try {
      const hooks = getOrganizationPluginOptions(auth).organizationHooks as
        | {
            readonly afterCreateOrganization?: (data: {
              readonly member: {
                readonly id: string;
                readonly role: string;
              };
              readonly organization: { readonly id: string };
              readonly user: { readonly id: string };
            }) => Promise<void>;
          }
        | undefined;

      await expect(
        hooks?.afterCreateOrganization?.({
          member: {
            id: "member_owner",
            role: "superadmin",
          },
          organization: {
            id: "org_123",
          },
          user: {
            id: "user_owner",
          },
        })
      ).resolves.toBeUndefined();

      expect(auditEvents).toStrictEqual([]);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("adds request provenance to Better Auth organization hook audit events", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const database = makeAuthSecurityAuditEventDatabase(auditEvents);
    const { auth, cleanup } = createAuthenticationForPluginInspection(
      {},
      {
        database,
      }
    );

    try {
      const hooks = getOrganizationPluginOptions(auth).organizationHooks as
        | {
            readonly afterCreateOrganization?: (data: {
              readonly member: {
                readonly id: string;
                readonly role: string;
              };
              readonly organization: { readonly id: string };
              readonly user: { readonly id: string };
            }) => Promise<void>;
          }
        | undefined;
      const handler = withOrganizationSecurityAuditEventRecorder(
        async () => {
          await hooks?.afterCreateOrganization?.({
            member: {
              id: "member_owner",
              role: "owner",
            },
            organization: {
              id: "org_123",
            },
            user: {
              id: "user_owner",
            },
          });

          return Response.json({ ok: true });
        },
        {
          authConfig: config,
          database,
          resolveSession: () =>
            Promise.resolve(
              makeAuthenticationSessionResult({
                activeOrganizationId: "org_123",
              })
            ),
        }
      );

      await handler(
        new Request("https://api.ceird.example/api/auth/organization/create", {
          body: JSON.stringify({
            name: "Acme Field Ops",
          }),
          headers: {
            "content-type": "application/json",
            "user-agent": "Ceird Test Browser",
            "x-forwarded-for": "203.0.113.10",
          },
          method: "POST",
        })
      );

      expect(auditEvents).toContainEqual(
        expect.objectContaining({
          eventType: "organization_created",
          sessionId: "session_123",
          sourceIp: "203.0.113.10",
          userAgent: "Ceird Test Browser",
        })
      );
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("records endpoint-only organization security audit events with actor context", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const database = makeAuthSecurityAuditEventDatabase(auditEvents, {
      invitationRows: [
        {
          email: "member@example.com",
          organizationId: "org_123",
          role: "member",
        },
      ],
      memberRows: [
        {
          id: "member_123",
          organizationId: "org_123",
          role: "member",
          userId: "user_target",
        },
      ],
    });
    const makeHandler = (responseBody: unknown) =>
      withOrganizationSecurityAuditEventRecorder(
        () => Promise.resolve(Response.json(responseBody)),
        {
          authConfig: config,
          database,
          resolveSession: () =>
            Promise.resolve(
              makeAuthenticationSessionResult({
                activeOrganizationId: "org_previous",
              })
            ),
        }
      );

    await makeHandler({
      id: "org_next",
    })(
      new Request(
        "https://api.ceird.example/api/auth/organization/set-active",
        {
          body: JSON.stringify({
            organizationId: "org_next",
          }),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10",
          },
          method: "POST",
        }
      )
    );
    await makeHandler({
      id: null,
    })(
      new Request(
        "https://api.ceird.example/api/auth/organization/set-active",
        {
          body: JSON.stringify({
            organizationId: null,
          }),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10",
          },
          method: "POST",
        }
      )
    );
    await makeHandler({
      email: "member@example.com",
      organizationId: "org_123",
      role: "member",
    })(
      new Request(
        "https://api.ceird.example/api/auth/organization/invite-member",
        {
          body: JSON.stringify({
            email: "member@example.com",
            organizationId: "org_123",
            resend: true,
            role: "member",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );
    await makeHandler({
      id: "member_123",
      organizationId: "org_123",
      role: "admin",
      userId: "user_target",
    })(
      new Request(
        "https://api.ceird.example/api/auth/organization/update-member-role",
        {
          body: JSON.stringify({
            memberId: "member_123",
            organizationId: "org_123",
            role: "admin",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );
    await makeHandler({
      member: {
        id: "member_123",
        organizationId: "org_123",
        role: "admin",
        userId: "user_target",
      },
    })(
      new Request(
        "https://api.ceird.example/api/auth/organization/remove-member",
        {
          body: JSON.stringify({
            memberIdOrEmail: "member_123",
            organizationId: "org_123",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(auditEvents.map((event) => event.eventType)).toStrictEqual([
      "organization_active_changed",
      "organization_active_changed",
      "organization_invitation_resent",
      "organization_member_role_updated",
      "organization_member_removed",
    ]);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_123",
        eventType: "organization_active_changed",
        metadata: expect.objectContaining({
          activeOrganizationId: null,
          previousOrganizationId: "org_previous",
        }),
        organizationId: "org_previous",
      })
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_123",
        eventType: "organization_member_role_updated",
        metadata: expect.objectContaining({
          previousRole: "member",
          role: "admin",
          targetUserId: "user_target",
        }),
        organizationId: "org_123",
      })
    );
    expect(JSON.stringify(auditEvents)).not.toContain("member@example.com");
  }, 10_000);

  it("does not record invitation resent when resend creates a new invitation", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            email: "member@example.com",
            organizationId: "org_123",
            role: "member",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/invite-member",
        {
          body: JSON.stringify({
            email: "member@example.com",
            organizationId: "org_123",
            resend: true,
            role: "member",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(auditEvents).toStrictEqual([]);
  }, 10_000);

  it("fails open when organization member audit context lookup fails", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(function* verifyOrgAuditLookupFailOpen() {
      const runtimeContext = yield* Effect.context<never>();
      const handler = withOrganizationSecurityAuditEventRecorder(
        () =>
          Promise.resolve(
            Response.json({
              id: "member_123",
              organizationId: "org_123",
              role: "admin",
              userId: "user_target",
            })
          ),
        {
          authConfig: config,
          database: makeAuthSecurityAuditEventDatabase(auditEvents, {
            selectFailure: new Error(
              "lookup failed for member@example.com https://app.example/raw rawtokenrawtokenrawtokenrawtoken1234"
            ),
          }),
          resolveSession: () =>
            Promise.resolve(
              makeAuthenticationSessionResult({
                activeOrganizationId: "org_123",
              })
            ),
          runtimeContext,
        }
      );

      return yield* Effect.promise(() =>
        handler(
          new Request(
            "https://api.ceird.example/api/auth/organization/update-member-role",
            {
              body: JSON.stringify({
                memberId: "member_123",
                organizationId: "org_123",
                role: "admin",
              }),
              headers: {
                "content-type": "application/json",
              },
              method: "POST",
            }
          )
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "organization_member_role_updated",
        metadata: expect.objectContaining({
          previousRole: null,
          role: "admin",
          targetUserId: "user_target",
        }),
      })
    );
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain(
      "auth_security_audit_organization_context_failure"
    );
    expect(serializedLogs).not.toContain("member@example.com");
    expect(serializedLogs).not.toContain("https://app.example");
    expect(serializedLogs).not.toContain(
      "rawtokenrawtokenrawtokenrawtoken1234"
    );
  }, 10_000);

  it("fails open without audit insertion when organization invitation context rows fail schema decoding", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyInvitationContextDecodeFailure() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withOrganizationSecurityAuditEventRecorder(
          () =>
            Promise.resolve(
              Response.json({
                email: "member@example.com",
                organizationId: "org_123",
              })
            ),
          {
            authConfig: config,
            database: makeAuthSecurityAuditEventDatabase(auditEvents, {
              invitationRows: [
                {
                  email: "member@example.com",
                  organizationId: "org_123",
                  role: "superadmin",
                },
              ],
            }),
            resolveSession: () =>
              Promise.resolve(
                makeAuthenticationSessionResult({
                  activeOrganizationId: "org_123",
                })
              ),
            runtimeContext,
          }
        );

        return yield* Effect.promise(() =>
          handler(
            new Request(
              "https://api.ceird.example/api/auth/organization/invite-member",
              {
                body: JSON.stringify({
                  email: "member@example.com",
                  organizationId: "org_123",
                  resend: true,
                }),
                headers: {
                  "content-type": "application/json",
                },
                method: "POST",
              }
            )
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([]);
    const serializedLogs = JSON.stringify(logs);

    expect(serializedLogs).toContain(
      "auth_security_audit_organization_context_failure"
    );
    expect(serializedLogs).not.toContain("member@example.com");
    expect(JSON.stringify(auditEvents)).not.toContain("superadmin");
  }, 10_000);

  it("fails open from malformed organization member context rows before metadata construction", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyMemberContextDecodeFailure() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withOrganizationSecurityAuditEventRecorder(
          () =>
            Promise.resolve(
              Response.json({
                id: "member_123",
                organizationId: "org_123",
                role: "admin",
                userId: "user_target",
              })
            ),
          {
            authConfig: config,
            database: makeAuthSecurityAuditEventDatabase(auditEvents, {
              memberRows: [
                {
                  id: "member_123",
                  organizationId: "org_123",
                  role: "superadmin",
                  userId: "user_target",
                },
              ],
            }),
            resolveSession: () =>
              Promise.resolve(
                makeAuthenticationSessionResult({
                  activeOrganizationId: "org_123",
                })
              ),
            runtimeContext,
          }
        );

        return yield* Effect.promise(() =>
          handler(
            new Request(
              "https://api.ceird.example/api/auth/organization/update-member-role",
              {
                body: JSON.stringify({
                  memberId: "member_123",
                  organizationId: "org_123",
                  role: "admin",
                }),
                headers: {
                  "content-type": "application/json",
                },
                method: "POST",
              }
            )
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "organization_member_role_updated",
        metadata: expect.objectContaining({
          previousRole: null,
          role: "admin",
          targetUserId: "user_target",
        }),
      })
    );
    expect(JSON.stringify(auditEvents)).not.toContain("superadmin");
    expect(JSON.stringify(logs)).toContain(
      "auth_security_audit_organization_context_failure"
    );
  }, 10_000);

  it("ignores malformed Better Auth organization member response roles before audit construction", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            id: "member_123",
            organizationId: "org_123",
            role: "superadmin",
            userId: "user_target",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/update-member-role",
        {
          body: JSON.stringify({
            memberId: "member_123",
            organizationId: "org_123",
            role: "admin",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "organization_member_role_updated",
        metadata: expect.objectContaining({
          memberId: "member_123",
          previousRole: null,
          role: null,
          targetUserId: null,
        }),
        organizationId: "org_123",
      })
    );
    expect(JSON.stringify(auditEvents)).not.toContain("superadmin");
  }, 10_000);

  it("normalizes invite-member audit emails through schema before context lookup", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            email: " Target.Member@Example.com ",
            organizationId: "org_123",
            role: "member",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents, {
          invitationRows: [
            {
              email: "target.member@example.com",
              organizationId: "org_123",
              role: "member",
            },
          ],
        }),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/invite-member",
        {
          body: JSON.stringify({
            email: " Target.Member@Example.com ",
            organizationId: "org_123",
            resend: true,
            role: "member",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([
      expect.objectContaining({
        eventType: "organization_invitation_resent",
        metadata: expect.objectContaining({
          invitationEmailMasked: "t***@e***.com",
          role: "member",
        }),
        organizationId: "org_123",
      }),
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain("Target.Member");
  }, 10_000);

  it("rejects blank invite-member audit emails before context lookup", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            email: "member@example.com",
            organizationId: "org_123",
            role: "member",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents, {
          invitationRows: [
            {
              email: "member@example.com",
              organizationId: "org_123",
              role: "member",
            },
          ],
        }),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/invite-member",
        {
          body: JSON.stringify({
            email: "   ",
            organizationId: "org_123",
            resend: true,
            role: "member",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(auditEvents).toStrictEqual([]);
  }, 10_000);

  it("uses the schema-owned email branch for memberIdOrEmail audit context lookup", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const memberIdLookupKeys: string[] = [];
    const memberEmailLookupValues: string[][] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () => Promise.resolve(Response.json({})),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents, {
          memberEmailLookupValues,
          memberIdLookupKeys,
          memberRows: [
            {
              email: "target.member@example.com",
              id: "member_by_email",
              organizationId: "org_123",
              role: "admin",
              userId: "user_target",
            },
          ],
        }),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/remove-member",
        {
          body: JSON.stringify({
            memberIdOrEmail: " Target.Member@Example.com ",
            organizationId: "org_123",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(memberIdLookupKeys).toStrictEqual([]);
    expect(memberEmailLookupValues).toContainEqual(
      expect.arrayContaining(["org_123", "target.member@example.com"])
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "organization_member_removed",
        metadata: expect.objectContaining({
          memberId: "member_by_email",
          role: "admin",
          targetUserId: "user_target",
        }),
        organizationId: "org_123",
      })
    );
  }, 10_000);

  it("rejects empty organization member IDs before raw audit context lookup", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const memberIdLookupKeys: string[] = [];
    const config = makeAuthenticationConfig({
      baseUrl: "https://api.ceird.example/api/auth",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withOrganizationSecurityAuditEventRecorder(
      () =>
        Promise.resolve(
          Response.json({
            id: "member_123",
            organizationId: "org_123",
            role: "admin",
            userId: "user_target",
          })
        ),
      {
        authConfig: config,
        database: makeAuthSecurityAuditEventDatabase(auditEvents, {
          memberIdLookupKeys,
          memberRows: [
            {
              id: "member_123",
              organizationId: "org_123",
              role: "member",
              userId: "user_target",
            },
          ],
        }),
        resolveSession: () =>
          Promise.resolve(
            makeAuthenticationSessionResult({
              activeOrganizationId: "org_123",
            })
          ),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/update-member-role",
        {
          body: JSON.stringify({
            memberId: "",
            organizationId: "org_123",
            role: "admin",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(memberIdLookupKeys).toStrictEqual([]);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        eventType: "organization_member_role_updated",
        metadata: expect.objectContaining({
          memberId: "member_123",
          previousRole: null,
          role: "admin",
        }),
      })
    );
  }, 10_000);

  it("logs stable abuse telemetry when fail-closed reservations cannot read storage", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyReservationFailureTelemetry() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withAuthenticationRateLimitFailureResponse(
          withAuthenticationAbuseRateLimitGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            makeRateLimitReservationFailureDatabase(
              new Error("database unavailable")
            ),
            config,
            runtimeContext
          )
        );

        return yield* Effect.promise(() =>
          handler(
            new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
              body: JSON.stringify({}),
              headers: {
                "content-type": "application/json",
                "x-forwarded-for": "127.0.0.1",
              },
              method: "POST",
            })
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_reservation_failure");
    expect(logText).toContain("alert_on_sustained_storage_failure");
    expect(logText).toContain("high");
    expect(logText).toContain("/sign-in/email");
    expect(logText).toContain("fail_closed");
  }, 10_000);

  it("returns a stable unavailable response when fail-closed abuse endpoints cannot resolve a client IP", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfigWithDisabledIpTracking();

    const response = await Effect.gen(
      function* verifyMissingClientIpTelemetry() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withAuthenticationRateLimitFailureResponse(
          withAuthenticationAbuseRateLimitGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            makeRateLimitReservationDatabase({ count: 1 }),
            config,
            runtimeContext
          )
        );

        return yield* Effect.promise(() =>
          handler(
            new Request(
              "http://127.0.0.1:3000/api/auth/request-password-reset",
              {
                body: JSON.stringify({
                  email: "person@example.com",
                }),
                headers: {
                  "content-type": "application/json",
                },
                method: "POST",
              }
            )
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
      message: "Authentication protection is temporarily unavailable.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_client_ip_unavailable");
    expect(logText).toContain("alert_on_sustained_client_ip_failure");
    expect(logText).toContain("high");
    expect(logText).toContain("/request-password-reset");
    expect(logText).toContain("fail_closed");
  }, 10_000);

  it("rejects public auth delivery bursts before the auth handler runs", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(function* verifyRateLimitHitTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const handler = withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationDatabase({ count: 4 }),
        config,
        runtimeContext
      );

      return yield* Effect.promise(() =>
        handler(
          new Request("http://127.0.0.1:3000/api/auth/request-password-reset", {
            body: JSON.stringify({
              email: "person@example.com",
            }),
            headers: {
              "cf-connecting-ip": "127.0.0.1",
              "content-type": "application/json",
            },
            method: "POST",
          })
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      message: "Too many requests. Please try again later.",
    });
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("X-Retry-After")).toBe("60");
    expect(response.status).toBe(429);
    expect(delegated).toBeFalsy();
    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_hit");
    expect(logText).toContain("dashboard_until_sustained_spike");
    expect(logText).toContain("dashboard");
    expect(logText).toContain("/request-password-reset");
    expect(logText).toContain("authRateLimitKeyFingerprint");
    expect(logText).not.toContain(
      "ceird-auth-abuse:127.0.0.1|/request-password-reset"
    );
  }, 10_000);

  it("logs delivery key kind when a target-email reservation fails", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });

    const response = await Effect.gen(
      function* verifyDeliveryReservationFailureTelemetry() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withAuthenticationRateLimitFailureResponse(
          withAuthenticationAbuseRateLimitGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            makeRateLimitReservationSequenceDatabase([
              { count: 1 },
              new Error("database unavailable"),
            ]),
            config,
            runtimeContext
          )
        );

        return yield* Effect.promise(() =>
          handler(
            new Request(
              "http://127.0.0.1:3000/api/auth/request-password-reset",
              {
                body: JSON.stringify({
                  email: "person@example.com",
                }),
                headers: {
                  "content-type": "application/json",
                  "x-forwarded-for": "127.0.0.1",
                },
                method: "POST",
              }
            )
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
      message: "Authentication protection is temporarily unavailable.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_reservation_failure");
    expect(logText).toContain("target_email");
    expect(logText).not.toContain("person@example.com");
  }, 10_000);

  it("redacts raw rate-limit keys from reservation failure telemetry", async () => {
    let delegated = false;
    const { logger, logs } = captureLogs();
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const storageError = new Error(
      "insert failed client 127.0.0.1 params: ceird-auth-abuse:127.0.0.1|/request-password-reset person@example.com https://app.example/raw rawtokenrawtokenrawtokenrawtoken1234"
    );

    const response = await Effect.gen(
      function* verifyRateLimitFailureCauseRedaction() {
        const runtimeContext = yield* Effect.context<never>();
        const handler = withAuthenticationRateLimitFailureResponse(
          withAuthenticationAbuseRateLimitGuard(
            () => {
              delegated = true;
              return Promise.resolve(Response.json({ delegated: true }));
            },
            makeRateLimitReservationFailureDatabase(storageError),
            config,
            runtimeContext
          )
        );

        return yield* Effect.promise(() =>
          handler(
            new Request(
              "http://127.0.0.1:3000/api/auth/request-password-reset",
              {
                body: JSON.stringify({
                  email: "person@example.com",
                }),
                headers: {
                  "content-type": "application/json",
                  "x-forwarded-for": "127.0.0.1",
                },
                method: "POST",
              }
            )
          )
        );
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_RATE_LIMIT_UNAVAILABLE",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_reservation_failure");
    expect(logText).toContain("[redacted-rate-limit-key]");
    expect(logText).toContain("[redacted-ip]");
    expect(logText).toContain("[redacted-email]");
    expect(logText).toContain("[redacted-url]");
    expect(logText).toContain("[redacted-token]");
    expect(logText).not.toContain(
      "ceird-auth-abuse:127.0.0.1|/request-password-reset"
    );
    expect(logText).not.toContain("127.0.0.1");
    expect(logText).not.toContain("person@example.com");
    expect(logText).not.toContain("https://app.example/raw");
    expect(logText).not.toContain("rawtokenrawtokenrawtokenrawtoken1234");
  }, 10_000);

  it.each([
    ["/change-email", 4, 60],
    ["/change-password", 6, 60],
  ])(
    "uses atomic reservations for authenticated settings endpoint %s when storage is healthy",
    async (endpointPath, count, retryAfter) => {
      let delegated = false;
      const config = makeAuthenticationConfig({
        baseUrl: "http://127.0.0.1:3000",
        secret: "0123456789abcdef0123456789abcdef",
        databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      });
      const handler = withAuthenticationAbuseRateLimitGuard(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeRateLimitReservationDatabase({ count }),
        config
      );

      const response = await handler(
        new Request(`http://127.0.0.1:3000/api/auth${endpointPath}`, {
          body: JSON.stringify({}),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "127.0.0.1",
          },
          method: "POST",
        })
      );

      await expect(response.json()).resolves.toStrictEqual({
        message: "Too many requests. Please try again later.",
      });
      expect(response.headers.get("Retry-After")).toBe(String(retryAfter));
      expect(response.status).toBe(429);
      expect(delegated).toBeFalsy();
    }
  );

  it("fails open when authenticated settings abuse reservation storage fails", async () => {
    let delegated = false;
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3000",
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
    });
    const handler = withAuthenticationAbuseRateLimitGuard(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeRateLimitReservationFailureDatabase(
        new Error("database unavailable")
      ),
      config
    );

    const response = await handler(
      new Request("http://127.0.0.1:3000/api/auth/change-password", {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "127.0.0.1",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
  }, 10_000);

  it("fails open when authenticated settings rate-limit storage reads fail", async () => {
    const storage = makeObservedDatabaseRateLimitStorage(
      makeRateLimitReadFailureDatabase(new Error("database unavailable"))
    );

    await expect(storage.get("127.0.0.1|/change-password")).resolves.toBeNull();
  }, 10_000);

  it("keeps Better Auth rate-limit storage write failures non-blocking", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyRateLimitWriteFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitWriteFailureDatabase(new Error("database unavailable")),
        runtimeContext
      );

      yield* Effect.promise(() =>
        storage.set("127.0.0.1|/request-password-reset", {
          count: 1,
          key: "127.0.0.1|/request-password-reset",
          lastRequest: Date.now(),
        })
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const logText = JSON.stringify(logs);

    expect(logText).toContain("rate_limit_storage_write_failure");
    expect(logText).toContain("dashboard_until_sustained_storage_failure");
    expect(logText).toContain("dashboard");
    expect(logText).toContain("write_failed");
  }, 10_000);

  it("does not write observed rate-limit rows when Better Auth passes malformed limiter state", async () => {
    const capturedWrites: unknown[] = [];
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyRateLimitWriteDecodeFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitWriteCaptureDatabase(capturedWrites),
        runtimeContext
      );

      yield* Effect.promise(() =>
        Reflect.apply(storage.set, storage, [
          "127.0.0.1|/request-password-reset",
          {
            count: -1,
            key: "",
            lastRequest: -1,
          },
        ])
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(capturedWrites).toStrictEqual([]);
    expect(JSON.stringify(logs)).toContain("rate_limit_storage_write_failure");
  }, 10_000);

  it.each([
    ["insert", false],
    ["update", true],
  ])(
    "does not %s observed rate-limit rows when the Better Auth key and limiter value disagree",
    async (_operation, update) => {
      const capturedWrites: unknown[] = [];
      const capturedUpdates: unknown[] = [];
      const { logger, logs } = captureLogs();

      await Effect.gen(function* verifyRateLimitKeyMismatchTelemetry() {
        const runtimeContext = yield* Effect.context<never>();
        const storage = makeObservedDatabaseRateLimitStorage(
          makeRateLimitStorageMutationCaptureDatabase(
            capturedWrites,
            capturedUpdates
          ),
          runtimeContext
        );

        yield* Effect.promise(() =>
          storage.set(
            "127.0.0.1|/request-password-reset",
            {
              count: 1,
              key: "127.0.0.2|/request-password-reset",
              lastRequest: Date.now(),
            },
            update
          )
        );
      }).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Trace"),
        Effect.runPromise
      );

      expect(capturedWrites).toStrictEqual([]);
      expect(capturedUpdates).toStrictEqual([]);
      expect(JSON.stringify(logs)).toContain(
        "rate_limit_storage_write_failure"
      );
    },
    10_000
  );

  it("does not insert observed rate-limit rows when Better Auth passes a malformed storage key", async () => {
    const capturedWrites: unknown[] = [];
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyMalformedRateLimitKeyTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const storage = makeObservedDatabaseRateLimitStorage(
        makeRateLimitStorageMutationCaptureDatabase(capturedWrites, []),
        runtimeContext
      );

      yield* Effect.promise(() =>
        storage.set("", {
          count: 1,
          key: "127.0.0.1|/request-password-reset",
          lastRequest: Date.now(),
        })
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(capturedWrites).toStrictEqual([]);
    expect(JSON.stringify(logs)).toContain("rate_limit_storage_write_failure");
  }, 10_000);

  it("handles trusted auth preflight requests through the auth CORS wrapper", async () => {
    let delegated = false;
    const handler = withAuthenticationCors(() => {
      delegated = true;
      return Promise.resolve(Response.json({ delegated: true }));
    }, ["https://app.ceird.example"]);

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/sign-in/email", {
        method: "OPTIONS",
        headers: {
          "access-control-request-headers": "content-type, authorization",
          "access-control-request-method": "POST",
          origin: "https://app.ceird.example",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true"
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "content-type, authorization"
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.ceird.example"
    );
    expect(response.headers.get("Vary")).toContain("Origin");
    expect(delegated).toBeFalsy();
  });

  it("rejects untrusted auth preflight requests before Better Auth handles them", async () => {
    let delegated = false;
    const handler = withAuthenticationCors(() => {
      delegated = true;
      return Promise.resolve(Response.json({ delegated: true }));
    }, ["https://app.ceird.example"]);

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/sign-in/email", {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.example",
        },
      })
    );

    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  });

  it("matches tenant wildcard origins at the auth CORS boundary", async () => {
    const handler = withAuthenticationCors(
      () => Promise.resolve(Response.json({ delegated: true })),
      ["https://*--pr-123.ceird.app"]
    );

    const acceptedResponse = await handler(
      new Request("https://api.pr-123.ceird.app/api/auth/sign-in/email", {
        method: "OPTIONS",
        headers: {
          "access-control-request-method": "POST",
          origin: "https://acme-field-ops--pr-123.ceird.app",
        },
      })
    );
    const rejectedResponse = await handler(
      new Request("https://api.pr-123.ceird.app/api/auth/sign-in/email", {
        method: "OPTIONS",
        headers: {
          "access-control-request-method": "POST",
          origin: "https://app.pr-123.ceird.app",
        },
      })
    );

    expect(acceptedResponse.status).toBe(204);
    expect(acceptedResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://acme-field-ops--pr-123.ceird.app"
    );
    expect(rejectedResponse.status).toBe(403);
  });

  it("runs default email failure reports with the captured Effect context", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyEmailFailureReporterContext() {
      const runtimeContext = yield* Effect.context<never>();
      const reportFailure = makeEmailFailureReporter(
        "Password reset email delivery failed",
        runtimeContext
      );

      reportFailure(new Error("delivery failed"));
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await Effect.runPromise(Effect.yieldNow);

    const serializedLogs = JSON.stringify(logs);

    expect(serializedLogs).toContain(
      "Authentication background email delivery failed"
    );
    expect(serializedLogs).toContain("Password reset email delivery failed");
    expect(serializedLogs).toContain("delivery failed");
  });

  it("redacts sensitive values from email failure reports", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* verifyEmailFailureReporterRedaction() {
      const runtimeContext = yield* Effect.context<never>();
      const reportFailure = makeEmailFailureReporter(
        "Verification email delivery failed",
        runtimeContext
      );

      reportFailure(
        new Error(
          "delivery to person@example.com failed at https://example.com/reset?token=secret"
        )
      );
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await Effect.runPromise(Effect.yieldNow);

    const serializedLogs = JSON.stringify(logs);

    expect(serializedLogs).toContain("[redacted-email]");
    expect(serializedLogs).toContain("[redacted-url]");
    expect(serializedLogs).not.toContain("person@example.com");
    expect(serializedLogs).not.toContain("token=secret");
  });

  it("configures organization invitation delivery through the Better Auth organization plugin", async () => {
    const sentInvitationEmails: unknown[] = [];
    const pool = new Pool({
      connectionString: DEFAULT_AUTH_DATABASE_URL,
      allowExitOnIdle: true,
    });

    try {
      const auth = createAuthentication({
        appOrigin: "http://127.0.0.1:4173",
        backgroundTaskHandler: () => {},
        config: makeAuthenticationConfig({
          baseUrl: "http://127.0.0.1:3000",
          secret: "0123456789abcdef0123456789abcdef",
          databaseUrl: DEFAULT_AUTH_DATABASE_URL,
        }),
        database: drizzle({ client: pool }),
        reportEmailChangeConfirmationFailure: () => {},
        reportPasswordResetEmailFailure: () => {},
        reportVerificationEmailFailure: () => {},
        sendOrganizationInvitationEmail: (input) => {
          sentInvitationEmails.push(input);
          return Promise.resolve();
        },
        sendPasswordResetEmail: async () => {},
        sendVerificationEmail: async () => {},
      });

      const organizationPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "organization"
      ) as
        | {
            readonly options?: {
              readonly cancelPendingInvitationsOnReInvite?: boolean;
              readonly invitationExpiresIn?: number;
              readonly sendInvitationEmail?: (data: {
                readonly email: string;
                readonly id: string;
                readonly inviter: {
                  readonly user: {
                    readonly email: string;
                  };
                };
                readonly organization: {
                  readonly name: string;
                };
                readonly role: string;
              }) => Promise<void>;
            };
          }
        | undefined;

      expect(organizationPlugin).toBeDefined();
      if (!organizationPlugin?.options?.cancelPendingInvitationsOnReInvite) {
        throw new Error(
          "Expected invite re-sends to cancel pending invitations"
        );
      }
      expect(organizationPlugin?.options?.invitationExpiresIn).toBe(
        60 * 60 * 24 * 7
      );
      expect(organizationPlugin?.options?.sendInvitationEmail).toBeTypeOf(
        "function"
      );

      await organizationPlugin?.options?.sendInvitationEmail?.({
        email: "member@example.com",
        id: "inv_123",
        inviter: {
          user: {
            email: "owner@example.com",
          },
        },
        organization: {
          name: "Acme Field Ops",
        },
        role: "member",
      });

      expect(sentInvitationEmails).toStrictEqual([
        {
          deliveryKey: "organization-invitation/inv_123",
          invitationUrl: "http://127.0.0.1:4173/accept-invitation/inv_123",
          inviterEmail: "owner@example.com",
          organizationName: "Acme Field Ops",
          recipientEmail: "member@example.com",
          recipientName: "member@example.com",
          role: "member",
        },
      ]);
    } finally {
      await pool.end();
    }
  }, 10_000);

  it("requires verified email before organization creation", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);
      const canCreateOrganization =
        organizationPlugin.allowUserToCreateOrganization;

      if (typeof canCreateOrganization !== "function") {
        throw new TypeError(
          "Expected organization creation gate to be configured."
        );
      }

      await expect(
        Promise.resolve(
          canCreateOrganization(makeOrganizationPluginUser(false))
        )
      ).resolves.toBeFalsy();
      await expect(
        Promise.resolve(canCreateOrganization(makeOrganizationPluginUser(true)))
      ).resolves.toBeTruthy();
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("configures first-release organization limit policy through the Better Auth organization plugin", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      expect(organizationPlugin.organizationLimit).toBe(10);
      expect(organizationPlugin.membershipLimit).toBe(200);
      expect(organizationPlugin.invitationLimit).toBe(100);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("allows organization invitation acceptance below the per-user organization limit", async () => {
    await expect(
      assertUserCanAcceptOrganizationInvitation({
        database: makeOrganizationMembershipCountDatabase(9),
        userId: "user_123",
      })
    ).resolves.toBeUndefined();
  }, 10_000);

  it("rejects organization invitation acceptance at the per-user organization limit", async () => {
    await expect(
      assertUserCanAcceptOrganizationInvitation({
        database: makeOrganizationMembershipCountDatabase(10),
        userId: "user_123",
      })
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: {
        code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
      },
    });
  }, 10_000);

  it("requires verified email before organization invitations", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      await expect(async () => {
        await organizationPlugin.organizationHooks?.beforeCreateInvitation?.({
          invitation: {
            email: "member@example.com",
            organizationId: "org_123",
            inviterId: "user_123",
            role: "member",
          },
          inviter: makeOrganizationPluginUser(false),
          organization: {
            id: "org_123",
            name: "Acme Field Ops",
            slug: "acme-field-ops",
            createdAt: new Date(),
            metadata: null,
          },
        });
      }).rejects.toMatchObject({
        status: "FORBIDDEN",
        body: {
          code: "EMAIL_NOT_VERIFIED",
        },
      });

      await expect(
        organizationPlugin.organizationHooks?.beforeCreateInvitation?.({
          invitation: {
            email: "member@example.com",
            organizationId: "org_123",
            inviterId: "user_123",
            role: "member",
          },
          inviter: makeOrganizationPluginUser(true),
          organization: {
            id: "org_123",
            name: "Acme Field Ops",
            slug: "acme-field-ops",
            createdAt: new Date(),
            metadata: null,
          },
        })
      ).resolves.toMatchObject({
        data: {
          role: "member",
        },
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("rejects owner organization invitations through the Better Auth hook", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      await expect(async () => {
        await organizationPlugin.organizationHooks?.beforeCreateInvitation?.({
          invitation: {
            email: "owner@example.com",
            organizationId: "org_123",
            inviterId: "user_123",
            role: "owner",
          },
          inviter: makeOrganizationPluginUser(true),
          organization: {
            id: "org_123",
            name: "Acme Field Ops",
            slug: "acme-field-ops",
            createdAt: new Date(),
            metadata: null,
          },
        });
      }).rejects.toMatchObject({
        status: "BAD_REQUEST",
        body: {
          code: "INVALID_ORGANIZATION_ROLE",
        },
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("requires verified email before approving OAuth consent", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: false,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before approving Ceird access.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("delegates non-boolean OAuth consent accept values without a verified-email probe", async () => {
    let delegatedBody: unknown;
    const handler = withAuthenticationAuthorizationGuards(async (request) => {
      delegatedBody = await request.json();
      return Response.json({ delegated: true });
    }, makeThrowingGuardDatabase());

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: "true",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegatedBody).toStrictEqual({
      accept: "true",
    });
  }, 10_000);

  it("allows verified users to approve Ceird OAuth consent without consuming the request body", async () => {
    let delegatedBody: unknown;
    const handler = withAuthenticationAuthorizationGuards(
      async (request) => {
        delegatedBody = await request.json();
        return Response.json({ delegated: true });
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: true,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegatedBody).toStrictEqual({
      accept: true,
    });
  }, 10_000);

  it("rejects oversized accepted OAuth consent bodies before resolving session state", async () => {
    let delegated = false;
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAuthorizationGuards(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeThrowingGuardDatabase(),
        {
          resolveSession: () =>
            Promise.resolve(makeAuthenticationSessionResult(false)),
        }
      )
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
          padding: "x".repeat(17 * 1024),
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is too large.",
    });
    expect(response.status).toBe(413);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("rejects streamed accepted OAuth consent bodies without JSON content type before Better Auth handles the request", async () => {
    let delegated = false;
    const handler = withAuthenticationRateLimitFailureResponse(
      withAuthenticationAuthorizationGuards(
        () => {
          delegated = true;
          return Promise.resolve(Response.json({ delegated: true }));
        },
        makeThrowingGuardDatabase(),
        {
          resolveSession: () =>
            Promise.resolve(makeAuthenticationSessionResult(false)),
        }
      )
    );

    const response = await handler(
      makeStreamingPostRequest(
        "https://api.ceird.example/api/auth/oauth2/consent",
        JSON.stringify({
          accept: true,
        }),
        {
          cookie: "better-auth.session_token=session-token.signature",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_RATE_LIMIT_REQUEST_INVALID",
      message: "Authentication request is invalid.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("requires verified email before approving identity-only OAuth consent", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: false,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before approving Ceird access.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("uses Better Auth session resolution before verified-email fallback parsing", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeThrowingGuardDatabase(),
      {
        resolveSession: () =>
          Promise.resolve(makeAuthenticationSessionResult(false)),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/organization/create", {
        body: JSON.stringify({
          name: "Acme Field Ops",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before creating an organization.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("does not fall back to unsigned session cookies when Better Auth cannot resolve a session", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeThrowingGuardDatabase(),
      {
        resolveSession: () => Promise.resolve(null),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/organization/create", {
        body: JSON.stringify({
          name: "Acme Field Ops",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
  }, 10_000);

  it("fails closed when verified-email session resolution fails", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeThrowingGuardDatabase(),
      {
        resolveSession: () => Promise.reject(new Error("session store down")),
      }
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/oauth2/consent", {
        body: JSON.stringify({
          accept: true,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_SESSION_UNAVAILABLE",
      message: "We couldn't verify your session. Please try again.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("uses Better Auth session resolution before administrative organization guards", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeAdministrativeOrganizationGuardDatabase("member"),
      {
        resolveSession: () =>
          Promise.resolve(makeAuthenticationSessionResult(true)),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/list-members?organizationId=org_123",
        {
          headers: {
            cookie: "better-auth.session_token=session-token.signature",
          },
          method: "GET",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "FORBIDDEN",
      message:
        "Only organization owners and admins can access organization administration.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("does not fall back to unsigned session cookies for administrative organization guards", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeThrowingGuardDatabase(),
      {
        resolveSession: () => Promise.resolve(null),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/list-members?organizationId=org_123",
        {
          headers: {
            cookie: "better-auth.session_token=session-token.signature",
          },
          method: "GET",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({ delegated: true });
    expect(response.status).toBe(200);
    expect(delegated).toBeTruthy();
  }, 10_000);

  it("fails closed when administrative organization session resolution fails", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeThrowingGuardDatabase(),
      {
        resolveSession: () => Promise.reject(new Error("session store down")),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/list-members?organizationId=org_123",
        {
          headers: {
            cookie: "better-auth.session_token=session-token.signature",
          },
          method: "GET",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "AUTH_SESSION_UNAVAILABLE",
      message: "We couldn't verify your session. Please try again.",
    });
    expect(response.status).toBe(503);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("treats malformed fallback verified-email session rows as unverified", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: true,
        sessionToken: "session-token",
        userId: "",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/organization/create", {
        body: JSON.stringify({
          name: "Acme Field Ops",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before creating an organization.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("treats malformed fallback verified-email user rows as unverified", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: "yes",
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/organization/create", {
        body: JSON.stringify({
          name: "Acme Field Ops",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before creating an organization.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("treats malformed fallback administrative member rows as non-administrative", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeAdministrativeOrganizationGuardDatabase("superadmin"),
      {
        resolveSession: () =>
          Promise.resolve(makeAuthenticationSessionResult(true)),
      }
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/list-members?organizationId=org_123",
        {
          headers: {
            cookie: "better-auth.session_token=session-token.signature",
          },
          method: "GET",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "FORBIDDEN",
      message:
        "Only organization owners and admins can access organization administration.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("requires verified email before organization creation at the auth boundary", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: false,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/organization/create", {
        body: JSON.stringify({
          name: "Acme Field Ops",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before creating an organization.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("requires verified email before two-factor enrollment at the auth boundary", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: false,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/two-factor/enable", {
        body: JSON.stringify({
          password: "correct horse battery staple",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-token.signature",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before setting up two-factor authentication.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("rejects trusted-device requests on two-factor verification endpoints", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(() => {
      delegated = true;
      return Promise.resolve(Response.json({ delegated: true }));
    }, makeThrowingGuardDatabase());

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/two-factor/verify-totp", {
        body: JSON.stringify({
          code: "012345",
          trustDevice: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE",
      message: "Trusted devices are not available yet.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("rejects unreadable trusted-device capable two-factor bodies before delegation", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(() => {
      delegated = true;
      return Promise.resolve(Response.json({ delegated: true }));
    }, makeThrowingGuardDatabase());

    const response = await handler(
      new Request("https://api.ceird.example/api/auth/two-factor/verify-totp", {
        body: JSON.stringify({
          code: "012345",
          padding: "x".repeat(20 * 1024),
          trustDevice: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      })
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "TWO_FACTOR_TRUSTED_DEVICE_UNAVAILABLE",
      message: "Trusted devices are not available yet.",
    });
    expect(response.status).toBe(400);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("requires verified email before organization invite resends at the auth boundary", async () => {
    let delegated = false;
    const handler = withAuthenticationAuthorizationGuards(
      () => {
        delegated = true;
        return Promise.resolve(Response.json({ delegated: true }));
      },
      makeVerifiedEmailGuardDatabase({
        emailVerified: false,
        sessionToken: "session-token",
        userId: "user_123",
      })
    );

    const response = await handler(
      new Request(
        "https://api.ceird.example/api/auth/organization/invite-member",
        {
          body: JSON.stringify({
            email: "member@example.com",
            organizationId: "org_123",
            resend: true,
            role: "member",
          }),
          headers: {
            "content-type": "application/json",
            cookie: "better-auth.session_token=session-token.signature",
          },
          method: "POST",
        }
      )
    );

    await expect(response.json()).resolves.toStrictEqual({
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before inviting organization members.",
    });
    expect(response.status).toBe(403);
    expect(delegated).toBeFalsy();
  }, 10_000);

  it("configures JWT-backed Better Auth OAuth Provider for MCP clients", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const pluginIds = auth.options.plugins.map((plugin) => plugin.id);
      expect(pluginIds).toStrictEqual(
        expect.arrayContaining(["jwt", "oauth-provider", "organization"])
      );
      expect(pluginIds.indexOf("jwt")).toBeLessThan(
        pluginIds.indexOf("oauth-provider")
      );

      const oauthPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "oauth-provider"
      ) as
        | {
            readonly options?: {
              readonly advertisedMetadata?: {
                readonly scopes_supported?: readonly string[];
              };
              readonly allowDynamicClientRegistration?: boolean;
              readonly allowUnauthenticatedClientRegistration?: boolean;
              readonly clientRegistrationAllowedScopes?: readonly string[];
              readonly clientRegistrationDefaultScopes?: readonly string[];
              readonly consentPage?: string;
              readonly customAccessTokenClaims?: (context: {
                readonly referenceId?: string | undefined;
                readonly scopes: readonly string[];
              }) => Promise<Record<string, unknown>> | Record<string, unknown>;
              readonly disableJwtPlugin?: boolean;
              readonly grantTypes?: readonly string[];
              readonly loginPage?: string;
              readonly postLogin?: OAuthPostLoginOptions;
              readonly scopes?: readonly string[];
              readonly silenceWarnings?: {
                readonly oauthAuthServerConfig?: boolean;
                readonly openidConfig?: boolean;
              };
              readonly validAudiences?: readonly string[];
            };
          }
        | undefined;

      expect(oauthPlugin?.options).toMatchObject({
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: [
          "openid",
          "profile",
          "email",
          "offline_access",
          "ceird:read",
        ],
        clientRegistrationAllowedScopes:
          CEIRD_OAUTH_CLIENT_REGISTRATION_ALLOWED_SCOPES,
        consentPage: "http://127.0.0.1:4173/oauth/consent",
        disableJwtPlugin: false,
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage: "http://127.0.0.1:4173/login",
        scopes: CEIRD_OAUTH_SCOPES,
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        validAudiences: ["http://127.0.0.1:3000", "http://127.0.0.1:3000/mcp"],
      });
      expect(
        oauthPlugin?.options?.advertisedMetadata?.scopes_supported
      ).toStrictEqual(CEIRD_OAUTH_SCOPES);
      expect(oauthPlugin?.options?.grantTypes).not.toContain(
        "client_credentials"
      );

      const postLogin = oauthPlugin?.options?.postLogin;
      if (!postLogin) {
        throw new Error("OAuth post-login configuration is missing.");
      }

      expect(postLogin.page).toBe("http://127.0.0.1:4173/oauth/consent");
      await expect(
        Promise.resolve(
          postLogin.shouldRedirect(
            makeOAuthPostLoginContext({
              activeOrganizationId: null,
              scopes: ["openid", "profile", "email"],
            })
          )
        )
      ).resolves.toBeFalsy();
      await expect(
        Promise.resolve(
          postLogin.consentReferenceId(
            makeOAuthPostLoginContext({
              activeOrganizationId: null,
              scopes: ["openid", "profile", "email"],
            })
          )
        )
      ).resolves.toBeUndefined();
      await expect(
        Promise.resolve(
          postLogin.shouldRedirect(
            makeOAuthPostLoginContext({
              activeOrganizationId: null,
              scopes: ["openid", "ceird:read"],
            })
          )
        )
      ).resolves.toBeTruthy();
      expect(() =>
        postLogin.consentReferenceId(
          makeOAuthPostLoginContext({
            activeOrganizationId: null,
            scopes: ["openid", "ceird:read"],
          })
        )
      ).toThrow(
        "Choose a workspace before approving this Ceird authorization request."
      );
      let missingOrganizationError: unknown;
      try {
        postLogin.consentReferenceId(
          makeOAuthPostLoginContext({
            activeOrganizationId: null,
            scopes: ["openid", "ceird:read"],
          })
        );
      } catch (error) {
        missingOrganizationError = error;
      }
      expect(missingOrganizationError).toMatchObject({
        body: {
          code: "OAUTH_ACTIVE_ORGANIZATION_REQUIRED",
          message:
            "Choose a workspace before approving this Ceird authorization request.",
        },
      });
      await expect(
        Promise.resolve(
          postLogin.shouldRedirect(
            makeOAuthPostLoginContext({
              activeOrganizationId: "org_active",
              scopes: ["openid", "ceird:read"],
            })
          )
        )
      ).resolves.toBeFalsy();
      await expect(
        Promise.resolve(
          postLogin.consentReferenceId(
            makeOAuthPostLoginContext({
              activeOrganizationId: "org_active",
              scopes: ["openid", "ceird:read"],
            })
          )
        )
      ).resolves.toBe("org_active");

      const customAccessTokenClaims =
        oauthPlugin?.options?.customAccessTokenClaims;
      if (!customAccessTokenClaims) {
        throw new Error("OAuth access token claim configuration is missing.");
      }

      await expect(
        Promise.resolve(
          customAccessTokenClaims({
            referenceId: undefined,
            scopes: ["openid", "profile"],
          })
        )
      ).resolves.toStrictEqual({});
      await expect(
        Promise.resolve(
          customAccessTokenClaims({
            referenceId: "org_active",
            scopes: ["openid", "ceird:read"],
          })
        )
      ).resolves.toStrictEqual({
        ceird_org_id: "org_active",
      });
      expect(() =>
        customAccessTokenClaims({
          referenceId: undefined,
          scopes: ["openid", "ceird:read"],
        })
      ).toThrow("Ceird authorization is missing its workspace binding.");
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("keeps external Better Auth organization permissions equivalent to non-admin members", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationOptions = getOrganizationPluginOptions(auth);
      const { roles } = organizationOptions;

      expect(roles?.external).toBe(roles?.member);
      expect(roles?.external?.authorize({ ac: ["read"] }).success).toBeTruthy();
      expect(
        roles?.external?.authorize({ organization: ["update"] }).success
      ).toBeFalsy();
      expect(
        roles?.external?.authorize({ member: ["create"] }).success
      ).toBeFalsy();
      expect(
        roles?.external?.authorize({ member: ["update"] }).success
      ).toBeFalsy();
      expect(
        roles?.external?.authorize({ member: ["delete"] }).success
      ).toBeFalsy();
      expect(
        roles?.external?.authorize({ invitation: ["create"] }).success
      ).toBeFalsy();
      expect(
        roles?.external?.authorize({ invitation: ["cancel"] }).success
      ).toBeFalsy();
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("installs optional TOTP two-factor auth with encrypted backup codes", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const twoFactorPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "two-factor"
      ) as
        | {
            readonly options?: {
              readonly backupCodeOptions?: {
                readonly amount?: number;
                readonly length?: number;
                readonly storeBackupCodes?: string;
              };
              readonly issuer?: string;
              readonly otpOptions?: unknown;
              readonly skipVerificationOnEnable?: boolean;
              readonly totpOptions?: {
                readonly digits?: number;
                readonly period?: number;
              };
              readonly twoFactorCookieMaxAge?: number;
            };
          }
        | undefined;

      expect(twoFactorPlugin?.options).toMatchObject({
        backupCodeOptions: {
          amount: 10,
          length: 10,
          storeBackupCodes: "encrypted",
        },
        issuer: "Ceird",
        totpOptions: {
          digits: 6,
          period: 30,
        },
        twoFactorCookieMaxAge: 600,
      });
      expect(twoFactorPlugin?.options?.otpOptions).toBeUndefined();
      expect(
        twoFactorPlugin?.options?.skipVerificationOnEnable
      ).toBeUndefined();
      expect(auth.options.user?.additionalFields).toMatchObject({
        twoFactorEnabled: {
          defaultValue: false,
          input: false,
          required: false,
          type: "boolean",
        },
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("passes versioned rotation secrets to Better Auth while retaining the fallback secret", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      secret: "legacy-secret-value-0123456789abcdef",
      secrets: [
        {
          version: 4,
          value: "current-secret-value-0123456789abcdef",
        },
        {
          version: 3,
          value: "previous-secret-value-0123456789abcdef",
        },
      ],
    });

    try {
      expect(auth.options.secret).toBe("legacy-secret-value-0123456789abcdef");
      expect(auth.options.secrets).toStrictEqual([
        {
          version: 4,
          value: "current-secret-value-0123456789abcdef",
        },
        {
          version: 3,
          value: "previous-secret-value-0123456789abcdef",
        },
      ]);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("passes the explicit password length policy to Better Auth", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      expect(auth.options.emailAndPassword).toMatchObject({
        maxPasswordLength: 256,
        minPasswordLength: 12,
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("installs the fail-open password compromise check plugin", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      passwordCompromiseCheckEnabled: true,
    });

    try {
      const plugin = auth.options.plugins.find(
        (nextPlugin) => nextPlugin.id === "ceird-have-i-been-pwned"
      ) as
        | {
            readonly options?: {
              readonly enabled?: boolean;
              readonly failOpen?: boolean;
              readonly paths?: readonly string[];
            };
          }
        | undefined;

      expect(plugin?.options).toStrictEqual({
        enabled: true,
        failOpen: true,
        paths: ["/sign-up/email", "/change-password", "/reset-password"],
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("rejects passwords found in the pwned password range response", async () => {
    const password = "known-compromised-password";
    const { suffix } = await hashPasswordForPwnedPasswordRange(password);

    await expect(
      assertPasswordNotCompromised({
        password,
        fetchPasswordRange: () => Promise.resolve(`${suffix}:42\r\n`),
      })
    ).rejects.toMatchObject({
      body: {
        code: PASSWORD_COMPROMISED_ERROR_CODE,
      },
      status: "BAD_REQUEST",
    });
  }, 10_000);

  it("skips the pwned password provider when the password already fails the length policy", async () => {
    const fetchPasswordRange = vi.fn<() => Promise<string>>();

    await expect(
      assertPasswordNotCompromised({
        password: "short",
        fetchPasswordRange,
      })
    ).resolves.toBeUndefined();

    expect(fetchPasswordRange).not.toHaveBeenCalled();
  }, 10_000);

  it("fails open and reports when the pwned password provider is unavailable", async () => {
    const providerError = new Error("provider unavailable");
    const reportedFailures: unknown[] = [];

    await expect(
      assertPasswordNotCompromised({
        password: "not-checked-during-outage",
        fetchPasswordRange: () => Promise.reject(providerError),
        reportProviderFailure: (error) => {
          reportedFailures.push(error);
        },
      })
    ).resolves.toBeUndefined();

    expect(reportedFailures).toStrictEqual([providerError]);
  }, 10_000);

  it("can schedule password compromise provider failure telemetry through the auth background task handler", async () => {
    const { logger, logs } = captureLogs();
    const scheduledReports: Promise<unknown>[] = [];

    await Effect.gen(function* verifyScheduledProviderFailureTelemetry() {
      const runtimeContext = yield* Effect.context<never>();
      const reportFailure = makePasswordCompromiseCheckFailureReporter(
        runtimeContext,
        (task) => {
          scheduledReports.push(task);
        }
      );

      reportFailure(new Error("provider unavailable"));

      expect(scheduledReports).toHaveLength(1);
      yield* Effect.promise(() => scheduledReports[0] ?? Promise.resolve());
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    expect(JSON.stringify(logs)).toContain(
      "password_compromise_provider_failure"
    );
    expect(JSON.stringify(logs)).toContain(
      "alert_on_repeated_provider_failure"
    );
  }, 10_000);

  it("fails open and reports when the pwned password provider times out", async () => {
    const reportedFailures: unknown[] = [];
    let signal: AbortSignal | undefined;

    await expect(
      assertPasswordNotCompromised({
        password: "not-checked-during-timeout",
        requestTimeoutMs: 1,
        fetchPasswordRange: (_prefix, options) => {
          signal = options?.signal;

          return Effect.runPromise(Effect.never);
        },
        reportProviderFailure: (error) => {
          reportedFailures.push(error);
        },
      })
    ).resolves.toBeUndefined();

    expect(signal?.aborted).toBeTruthy();
    expect(reportedFailures).toHaveLength(1);
    expect(reportedFailures[0]).toBeInstanceOf(Error);
    expect(String((reportedFailures[0] as Error).message)).toContain(
      "timed out"
    );
  }, 10_000);

  it("rejects compromised passwords through the mounted sign-up auth handler", async () => {
    const password = "known-compromised-password";
    const { suffix } = await hashPasswordForPwnedPasswordRange(password);
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      passwordCompromiseCheckEnabled: true,
      passwordCompromiseCheckFetchPasswordRange: () =>
        Promise.resolve(`${suffix}:42\r\n`),
    });

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: "person@example.com",
            name: "Person Example",
            password,
          }),
        })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).toContain(PASSWORD_COMPROMISED_ERROR_CODE);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("reads new passwords from mutation bodies in the mounted auth handler", async () => {
    const password = "known-compromised-password";
    const { suffix } = await hashPasswordForPwnedPasswordRange(password);
    const { auth, cleanup } = createAuthenticationForPluginInspection({
      passwordCompromiseCheckEnabled: true,
      passwordCompromiseCheckFetchPasswordRange: () =>
        Promise.resolve(`${suffix}:42\r\n`),
    });

    try {
      const response = await makeAuthenticationWebHandler(auth)(
        new Request("https://api.ceird.example/api/auth/change-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            currentPassword: "existing-password",
            newPassword: password,
          }),
        })
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).toContain(PASSWORD_COMPROMISED_ERROR_CODE);
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("keeps the JWT plugin from changing session response headers", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const jwtPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "jwt"
      ) as
        | {
            readonly options?: {
              readonly disableSettingJwtHeader?: boolean;
            };
          }
        | undefined;

      expect(jwtPlugin?.options).toMatchObject({
        disableSettingJwtHeader: true,
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("disables direct session JWT minting while keeping OAuth token metadata", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      expect(auth.options.disabledPaths).toStrictEqual(["/token"]);

      const sessionJwtResponse = await auth.handler(
        new Request("http://127.0.0.1:3000/api/auth/token")
      );
      expect(sessionJwtResponse.status).toBe(404);

      const getOAuthServerConfig = auth.api
        .getOAuthServerConfig as unknown as (options: {
        readonly asResponse: false;
        readonly request: Request;
      }) => Promise<Record<string, unknown>>;
      const metadata = await getOAuthServerConfig({
        asResponse: false,
        request: new Request(
          "http://127.0.0.1:3000/api/auth/.well-known/oauth-authorization-server"
        ),
      });

      expect(metadata).toMatchObject({
        jwks_uri: "http://127.0.0.1:3000/api/auth/jwks",
        token_endpoint: "http://127.0.0.1:3000/api/auth/oauth2/token",
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("exposes OAuth authorization metadata for MCP clients", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const getOAuthServerConfig = auth.api
        .getOAuthServerConfig as unknown as (options: {
        readonly asResponse: false;
        readonly request: Request;
      }) => Promise<Record<string, unknown>>;
      const metadata = await getOAuthServerConfig({
        asResponse: false,
        request: new Request(
          "http://127.0.0.1:3000/api/auth/.well-known/oauth-authorization-server"
        ),
      });

      expect(metadata).toMatchObject({
        issuer: "http://127.0.0.1:3000",
        authorization_endpoint:
          "http://127.0.0.1:3000/api/auth/oauth2/authorize",
        token_endpoint: "http://127.0.0.1:3000/api/auth/oauth2/token",
        registration_endpoint: "http://127.0.0.1:3000/api/auth/oauth2/register",
        grant_types_supported: ["authorization_code", "refresh_token"],
        scopes_supported: expect.arrayContaining([
          "ceird:read",
          "ceird:write",
          "ceird:admin",
        ]),
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("reports organization invitation delivery failures", async () => {
    const reportedFailures: unknown[] = [];
    const deliveryError = new Error("invitation transport unavailable");
    const pool = new Pool({
      connectionString: DEFAULT_AUTH_DATABASE_URL,
      allowExitOnIdle: true,
    });

    try {
      const auth = createAuthentication({
        appOrigin: "http://127.0.0.1:4173",
        backgroundTaskHandler: () => {},
        config: makeAuthenticationConfig({
          baseUrl: "http://127.0.0.1:3000",
          secret: "0123456789abcdef0123456789abcdef",
          databaseUrl: DEFAULT_AUTH_DATABASE_URL,
        }),
        database: drizzle({ client: pool }),
        reportOrganizationInvitationEmailFailure: (error) => {
          reportedFailures.push(error);
        },
        reportPasswordResetEmailFailure: () => {},
        reportVerificationEmailFailure: () => {},
        sendOrganizationInvitationEmail: () => Promise.reject(deliveryError),
        sendPasswordResetEmail: async () => {},
        sendVerificationEmail: async () => {},
      });

      const organizationPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "organization"
      ) as
        | {
            readonly options?: {
              readonly sendInvitationEmail?: (data: {
                readonly email: string;
                readonly id: string;
                readonly inviter: {
                  readonly user: {
                    readonly email: string;
                  };
                };
                readonly organization: {
                  readonly name: string;
                };
                readonly role: string;
              }) => Promise<void>;
            };
          }
        | undefined;

      await expect(
        organizationPlugin?.options?.sendInvitationEmail?.({
          email: "member@example.com",
          id: "inv_123",
          inviter: {
            user: {
              email: "owner@example.com",
            },
          },
          organization: {
            name: "Acme Field Ops",
          },
          role: "member",
        })
      ).rejects.toThrow(deliveryError);

      expect(reportedFailures).toStrictEqual([deliveryError]);
    } finally {
      await pool.end();
    }
  }, 10_000);

  it("preserves organization invitation delivery failures when reporting fails", async () => {
    const deliveryError = new Error("invitation transport unavailable");
    const reporterError = new Error("reporter unavailable");
    const pool = new Pool({
      connectionString: DEFAULT_AUTH_DATABASE_URL,
      allowExitOnIdle: true,
    });

    try {
      const auth = createAuthentication({
        appOrigin: "http://127.0.0.1:4173",
        backgroundTaskHandler: () => {},
        config: makeAuthenticationConfig({
          baseUrl: "http://127.0.0.1:3000",
          secret: "0123456789abcdef0123456789abcdef",
          databaseUrl: DEFAULT_AUTH_DATABASE_URL,
        }),
        database: drizzle({ client: pool }),
        reportOrganizationInvitationEmailFailure: () => {
          throw reporterError;
        },
        reportPasswordResetEmailFailure: () => {},
        reportVerificationEmailFailure: () => {},
        sendOrganizationInvitationEmail: () => Promise.reject(deliveryError),
        sendPasswordResetEmail: async () => {},
        sendVerificationEmail: async () => {},
      });

      const organizationPlugin = auth.options.plugins.find(
        (plugin) => plugin.id === "organization"
      ) as
        | {
            readonly options?: {
              readonly sendInvitationEmail?: (data: {
                readonly email: string;
                readonly id: string;
                readonly inviter: {
                  readonly user: {
                    readonly email: string;
                  };
                };
                readonly organization: {
                  readonly name: string;
                };
                readonly role: string;
              }) => Promise<void>;
            };
          }
        | undefined;

      await expect(
        organizationPlugin?.options?.sendInvitationEmail?.({
          email: "member@example.com",
          id: "inv_123",
          inviter: {
            user: {
              email: "owner@example.com",
            },
          },
          organization: {
            name: "Acme Field Ops",
          },
          role: "member",
        })
      ).rejects.toThrow(deliveryError);
    } finally {
      await pool.end();
    }
  }, 10_000);

  it("requires current-email confirmation before verified email changes", async () => {
    const sentVerificationEmails: unknown[] = [];
    const pool = new Pool({
      connectionString: DEFAULT_AUTH_DATABASE_URL,
      allowExitOnIdle: true,
    });

    try {
      const auth = createAuthentication({
        appOrigin: "http://127.0.0.1:4173",
        backgroundTaskHandler: () => {},
        config: makeAuthenticationConfig({
          baseUrl: "http://127.0.0.1:3000",
          secret: "0123456789abcdef0123456789abcdef",
          databaseUrl: DEFAULT_AUTH_DATABASE_URL,
        }),
        database: drizzle({ client: pool }),
        reportPasswordResetEmailFailure: () => {},
        reportVerificationEmailFailure: () => {},
        sendOrganizationInvitationEmail: async () => {},
        sendPasswordResetEmail: async () => {},
        sendVerificationEmail: (input) => {
          sentVerificationEmails.push(input);
          return Promise.resolve();
        },
      });

      const changeEmail = auth.options.user?.changeEmail;

      expect(changeEmail?.sendChangeEmailConfirmation).toBeTypeOf("function");

      await changeEmail?.sendChangeEmailConfirmation?.({
        user: {
          id: "user_123",
          createdAt: new Date("2026-04-26T12:00:00.000Z"),
          email: "current@example.com",
          emailVerified: true,
          image: null,
          name: "Taylor Example",
          updatedAt: new Date("2026-04-26T12:00:00.000Z"),
        },
        newEmail: "new@example.com",
        token: "token_123",
        url: "http://127.0.0.1:3000/api/auth/verify-email?token=token_123",
      });

      expect(sentVerificationEmails).toStrictEqual([
        {
          deliveryKey: expect.stringMatching(
            /^email-change-confirmation\/[0-9a-f]{64}$/
          ),
          recipientEmail: "current@example.com",
          recipientName: "Taylor Example",
          verificationUrl:
            "http://127.0.0.1:3000/api/auth/verify-email?token=token_123",
        },
      ]);
    } finally {
      await pool.end();
    }
  }, 10_000);

  it("normalizes organization update names through the Better Auth organization hook", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      const response =
        await organizationPlugin.organizationHooks?.beforeUpdateOrganization?.({
          member: {
            id: "member_123",
            organizationId: "org_123",
            role: "owner",
            userId: "user_123",
            createdAt: new Date(),
          },
          organization: {
            name: "  Northwind Field Ops  ",
          },
          user: {
            id: "user_123",
            email: "owner@example.com",
            emailVerified: true,
            name: "Owner Example",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

      expect(response).toStrictEqual({
        data: {
          name: "Northwind Field Ops",
        },
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("rejects invalid organization update names through the Better Auth organization hook", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      await expect(async () => {
        await organizationPlugin.organizationHooks?.beforeUpdateOrganization?.({
          member: {
            id: "member_123",
            organizationId: "org_123",
            role: "owner",
            userId: "user_123",
            createdAt: new Date(),
          },
          organization: {
            name: "A",
          },
          user: {
            id: "user_123",
            email: "owner@example.com",
            emailVerified: true,
            name: "Owner Example",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }).rejects.toMatchObject({
        status: "BAD_REQUEST",
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("rejects non-name organization update fields through the Better Auth organization hook", async () => {
    const { auth, cleanup } = createAuthenticationForPluginInspection();

    try {
      const organizationPlugin = getOrganizationPluginOptions(auth);

      await expect(async () => {
        await organizationPlugin.organizationHooks?.beforeUpdateOrganization?.({
          member: {
            id: "member_123",
            organizationId: "org_123",
            role: "owner",
            userId: "user_123",
            createdAt: new Date(),
          },
          organization: {
            name: "Northwind Field Ops",
            slug: "northwind-field-ops",
          },
          user: {
            id: "user_123",
            email: "owner@example.com",
            emailVerified: true,
            name: "Owner Example",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }).rejects.toMatchObject({
        status: "BAD_REQUEST",
      });
    } finally {
      await cleanup();
    }
  }, 10_000);

  it("matches explicit wildcard trusted origins", () => {
    expect({
      api: matchesTrustedOrigin("https://preview.api.ceird.example.com", [
        "https://*.app.ceird.example.com",
      ]),
      app: matchesTrustedOrigin("https://preview.app.ceird.example.com", [
        "https://*.app.ceird.example.com",
      ]),
      nested: matchesTrustedOrigin(
        "https://nested.preview.app.ceird.example.com",
        ["https://*.app.ceird.example.com"]
      ),
      productionStageHost: matchesTrustedOrigin(
        "https://app.pr-123.ceird.app",
        ["https://*.ceird.app"]
      ),
    }).toStrictEqual({
      api: false,
      app: true,
      nested: false,
      productionStageHost: false,
    });
  }, 10_000);
});

interface OAuthPostLoginContext {
  readonly headers: Headers;
  readonly scopes: readonly string[];
  readonly session: {
    readonly activeOrganizationId?: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date;
    readonly id: string;
    readonly token: string;
    readonly updatedAt: Date;
    readonly userId: string;
  };
  readonly user: {
    readonly createdAt: Date;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly id: string;
    readonly name: string;
    readonly updatedAt: Date;
  };
}

interface OAuthPostLoginOptions {
  readonly consentReferenceId: (
    context: OAuthPostLoginContext
  ) => Promise<string | undefined> | string | undefined;
  readonly page: string;
  readonly shouldRedirect: (
    context: OAuthPostLoginContext
  ) => Promise<boolean> | boolean;
}

function makeOAuthPostLoginContext(options: {
  readonly activeOrganizationId?: string | null;
  readonly scopes: readonly string[];
}): OAuthPostLoginContext {
  const now = new Date("2026-06-07T12:00:00.000Z");

  return {
    headers: new Headers(),
    scopes: options.scopes,
    session: {
      activeOrganizationId: options.activeOrganizationId,
      createdAt: now,
      expiresAt: new Date("2026-06-14T12:00:00.000Z"),
      id: "session_123",
      token: "session_token_123",
      updatedAt: now,
      userId: "user_123",
    },
    user: {
      createdAt: now,
      email: "owner@example.com",
      emailVerified: true,
      id: "user_123",
      name: "Owner",
      updatedAt: now,
    },
  };
}

function createAuthenticationForPluginInspection(
  environmentOverrides: Partial<
    Pick<
      Parameters<typeof makeAuthenticationConfig>[0],
      | "captchaEnabled"
      | "captchaSiteVerifyURLOverride"
      | "captchaTurnstileSecretKey"
      | "passwordCompromiseCheckEnabled"
      | "passwordCompromiseCheckFetchPasswordRange"
      | "passwordCompromiseCheckRequestTimeoutMs"
      | "rateLimitEnabled"
      | "secret"
      | "secrets"
    >
  > = {},
  options: {
    readonly database?: Parameters<typeof createAuthentication>[0]["database"];
    readonly runtimeContext?: Parameters<
      typeof createAuthentication
    >[0]["runtimeContext"];
  } = {}
) {
  const pool = options.database
    ? null
    : new Pool({
        connectionString: DEFAULT_AUTH_DATABASE_URL,
        allowExitOnIdle: true,
      });

  const auth = createAuthentication({
    appOrigin: "http://127.0.0.1:4173",
    backgroundTaskHandler: () => {},
    config: makeAuthenticationConfig({
      appOrigin: "http://127.0.0.1:4173",
      baseUrl: "http://127.0.0.1:3000",
      rateLimitEnabled: false,
      secret: "0123456789abcdef0123456789abcdef",
      databaseUrl: DEFAULT_AUTH_DATABASE_URL,
      ...environmentOverrides,
    }),
    database: options.database ?? drizzle({ client: pool as Pool }),
    reportPasswordResetEmailFailure: () => {},
    reportVerificationEmailFailure: () => {},
    runtimeContext: options.runtimeContext,
    sendOrganizationInvitationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendVerificationEmail: async () => {},
  });

  return {
    auth,
    cleanup: () => pool?.end() ?? Promise.resolve(),
  };
}

function getOrganizationPluginOptions(
  auth: ReturnType<typeof createAuthentication>
) {
  const organizationPlugin = auth.options.plugins.find(
    (plugin) => plugin.id === "organization"
  ) as
    | {
        readonly options?: {
          readonly allowUserToCreateOrganization?: (user: {
            readonly emailVerified?: boolean;
          }) => Promise<boolean> | boolean;
          readonly invitationLimit?: unknown;
          readonly membershipLimit?: unknown;
          readonly organizationLimit?: unknown;
          readonly organizationHooks?: {
            readonly beforeCreateInvitation?: (data: {
              readonly invitation: {
                readonly email: string;
                readonly organizationId: string;
                readonly inviterId: string;
                readonly role: string;
              };
              readonly inviter: {
                readonly id: string;
                readonly email: string;
                readonly emailVerified: boolean;
                readonly name: string;
                readonly createdAt: Date;
                readonly updatedAt: Date;
              };
              readonly organization: {
                readonly id: string;
                readonly name: string;
                readonly slug: string;
                readonly createdAt: Date;
                readonly metadata: null;
              };
            }) => Promise<unknown>;
            readonly beforeUpdateOrganization?: (data: {
              readonly member: {
                readonly id: string;
                readonly organizationId: string;
                readonly role: string;
                readonly userId: string;
                readonly createdAt: Date;
              };
              readonly organization: {
                readonly name?: string;
                readonly slug?: string;
              };
              readonly user: {
                readonly id: string;
                readonly email: string;
                readonly emailVerified: boolean;
                readonly name: string;
                readonly createdAt: Date;
                readonly updatedAt: Date;
              };
            }) => Promise<unknown>;
          };
          readonly roles?: Record<
            string,
            {
              readonly authorize: (
                permissions: Record<string, readonly string[]>
              ) => { readonly success: boolean };
            }
          >;
        };
      }
    | undefined;

  if (!organizationPlugin?.options) {
    throw new Error("Expected organization plugin options to be configured.");
  }

  return organizationPlugin.options;
}

function getCaptchaPluginOptions(
  auth: ReturnType<typeof createAuthentication>
) {
  return auth.options.plugins.find((plugin) => plugin.id === "captcha") as
    | {
        readonly options?: {
          readonly endpoints?: readonly string[];
          readonly provider?: unknown;
          readonly secretKey?: unknown;
          readonly siteVerifyURLOverride?: unknown;
        };
      }
    | undefined;
}

function makeOrganizationPluginUser(emailVerified: boolean) {
  return {
    id: "user_123",
    email: "owner@example.com",
    emailVerified,
    name: "Owner Example",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeAuthenticationSessionResult(
  input:
    | boolean
    | {
        readonly activeOrganizationId?: string | null | undefined;
        readonly emailVerified?: boolean | undefined;
      } = true
): AuthenticationSessionResult {
  const now = new Date();
  const emailVerified =
    typeof input === "boolean" ? input : input.emailVerified;
  const activeOrganizationId =
    typeof input === "boolean" ? undefined : input.activeOrganizationId;

  return Schema.decodeUnknownSync(AuthenticationSessionResultSchema)({
    session: {
      activeOrganizationId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      id: "session_123",
      token: "session-token",
      updatedAt: now,
      userId: "user_123",
    },
    user: {
      createdAt: now,
      email: "owner@example.com",
      emailVerified: emailVerified ?? true,
      id: "user_123",
      name: "Owner Example",
      twoFactorEnabled: false,
      updatedAt: now,
    },
  });
}

function makeVerifiedEmailGuardDatabase(input: {
  readonly emailVerified: unknown;
  readonly sessionToken: string;
  readonly userId: string;
}) {
  const rows = [
    [
      {
        userId: input.userId,
      },
    ],
    [
      {
        emailVerified: input.emailVerified,
      },
    ],
  ];

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows.shift() ?? []),
        }),
      }),
    }),
  } as unknown as Parameters<typeof withAuthenticationAuthorizationGuards>[1];
}

function makeAdministrativeOrganizationGuardDatabase(role: string) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (
          getTableName(table as Parameters<typeof getTableName>[0]) ===
          "session"
        ) {
          throw new Error(
            "Administrative guard should use Better Auth session resolution."
          );
        }

        return {
          where: () => ({
            limit: () => Promise.resolve([{ role }]),
          }),
        };
      },
    }),
  } as unknown as Parameters<typeof withAuthenticationAuthorizationGuards>[1];
}

function makeThrowingGuardDatabase() {
  return {
    select: () => {
      throw new Error("Verified-email guard should not query identity scopes.");
    },
  } as unknown as Parameters<typeof withAuthenticationAuthorizationGuards>[1];
}

interface CapturedAuthSecurityAuditEvent {
  readonly actorUserId?: string | null;
  readonly eventType: string;
  readonly metadata?: Record<string, unknown>;
  readonly oauthClientId?: string | null;
  readonly organizationId?: string | null;
  readonly scopes?: readonly string[] | null;
  readonly sessionId?: string | null;
  readonly sourceIp?: string | null;
  readonly userAgent?: string | null;
}
interface CapturedOAuthTokenAuditContextRow {
  readonly clientId: string;
  readonly activeOrganizationId?: string | null;
  readonly referenceId?: string | null;
  readonly scopes: readonly string[];
  readonly sessionId?: string | null;
  readonly token: string;
  readonly userId?: string | null;
}
interface OAuthRefreshTokenConsentGuardRow {
  readonly consentScopes: readonly string[] | null;
  readonly refreshTokenScopes: readonly string[];
  readonly token: string;
}
interface CapturedOrganizationMemberAuditContextRow {
  readonly email?: string;
  readonly id: string;
  readonly organizationId: string;
  readonly role: string;
  readonly userId: string;
}
interface CapturedOrganizationInvitationAuditContextRow {
  readonly email: string;
  readonly organizationId: string;
  readonly role: string;
}

function makeOAuthRefreshTokenConsentGuardDatabase(options: {
  readonly rows?: readonly OAuthRefreshTokenConsentGuardRow[];
  readonly selectFailure?: Error;
}) {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: (condition: unknown) => ({
            limit: () => {
              if (options.selectFailure) {
                return Promise.reject(options.selectFailure);
              }

              const token = readDrizzleEqParameter(condition);
              const row =
                options.rows?.find((tokenRow) => tokenRow.token === token) ??
                null;

              return Promise.resolve(row ? [row] : []);
            },
          }),
        }),
      }),
    }),
  } as unknown as Parameters<
    typeof withOAuthRefreshTokenConsentGuard
  >[1]["database"];
}

function makeAuthSecurityAuditEventDatabase(
  events: CapturedAuthSecurityAuditEvent[],
  options?: {
    readonly invitationRows?: readonly CapturedOrganizationInvitationAuditContextRow[];
    readonly memberEmailLookupValues?: string[][];
    readonly memberIdLookupKeys?: string[];
    readonly memberRows?: readonly CapturedOrganizationMemberAuditContextRow[];
    readonly selectFailure?: Error;
    readonly tokenRows?: readonly (CapturedOAuthTokenAuditContextRow | null)[];
  }
) {
  return {
    insert: () => ({
      values: (event: CapturedAuthSecurityAuditEvent) => {
        events.push(event);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: (table: unknown) => {
        const tableName = readDrizzleTableName(table);

        return {
          innerJoin: () => ({
            where: (condition: unknown) => ({
              limit: () => {
                if (options?.selectFailure) {
                  return Promise.reject(options.selectFailure);
                }

                const parameters = readDrizzleEqParameters(condition);
                options?.memberEmailLookupValues?.push(parameters);
                const row =
                  options?.memberRows?.find(
                    (memberRow) =>
                      parameters.includes(memberRow.organizationId) &&
                      memberRow.email !== undefined &&
                      parameters.includes(memberRow.email)
                  ) ?? null;

                return Promise.resolve(row ? [row] : []);
              },
            }),
          }),
          leftJoin: () => ({
            where: (condition: unknown) => ({
              limit: () => {
                if (options?.selectFailure) {
                  return Promise.reject(options.selectFailure);
                }

                const token = readDrizzleEqParameter(condition);
                const row =
                  options?.tokenRows?.find(
                    (tokenRow) => tokenRow?.token === token
                  ) ?? null;

                return Promise.resolve(row ? [row] : []);
              },
            }),
          }),
          where: (condition: unknown) => ({
            limit: () => {
              if (options?.selectFailure) {
                return Promise.reject(options.selectFailure);
              }

              if (tableName === getTableName(invitation)) {
                return Promise.resolve(
                  options?.invitationRows?.slice(0, 1) ?? []
                );
              }

              const token = readDrizzleEqParameter(condition);
              if (tableName === getTableName(member)) {
                options?.memberIdLookupKeys?.push(token ?? "");
              }
              const row =
                options?.tokenRows?.find(
                  (tokenRow) => tokenRow?.token === token
                ) ??
                options?.memberRows?.find(
                  (memberRow) => memberRow.id === token
                ) ??
                null;

              return Promise.resolve(row ? [row] : []);
            },
          }),
        };
      },
    }),
  } as unknown as Parameters<
    typeof withOAuthSecurityAuditEventRecorder
  >[1]["database"];
}

function makeFailingAuthSecurityAuditEventDatabase(
  error: Error = new Error("audit table unavailable")
) {
  const rejectAuditInsert = async () => {
    await undefined;
    throw error;
  };

  return {
    insert: () => ({
      values: rejectAuditInsert,
    }),
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: readNoAuthSecurityAuditRows,
          }),
        }),
        where: () => ({
          limit: readNoAuthSecurityAuditRows,
        }),
      }),
    }),
  } as unknown as Parameters<
    typeof withOAuthSecurityAuditEventRecorder
  >[1]["database"];
}

async function readNoAuthSecurityAuditRows() {
  await undefined;
  return [];
}

function readDrizzleEqParameter(condition: unknown) {
  return readDrizzleEqParameters(condition)[0] ?? null;
}

function readDrizzleEqParameters(condition: unknown) {
  const parameters: string[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }

    seen.add(value);

    if ("value" in value && typeof value.value === "string") {
      parameters.push(value.value);
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    for (const item of Object.values(value)) {
      visit(item);
    }
  };

  visit(condition);

  return parameters;
}

function readDrizzleTableName(table: unknown) {
  try {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  } catch {
    return null;
  }
}

function makeOAuthAuditSessionResult(options: {
  readonly activeOrganizationId?: string | null;
  readonly sessionId: string;
  readonly userId: string;
}): AuthenticationSessionResult {
  return Schema.decodeUnknownSync(AuthenticationSessionResultSchema)({
    session: {
      activeOrganizationId: options.activeOrganizationId,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      expiresAt: new Date("2026-06-08T00:00:00.000Z"),
      id: options.sessionId,
      token: "session-token",
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
      userId: options.userId,
    },
    user: {
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      email: "person@example.com",
      emailVerified: true,
      id: options.userId,
      name: "Person",
      twoFactorEnabled: false,
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    },
  });
}

function makeRateLimitReadFailureDatabase(error: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            throw error;
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof makeObservedDatabaseRateLimitStorage>[0];
}

function makeRateLimitWriteFailureDatabase(error: unknown) {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => {
          throw error;
        },
      }),
    }),
  } as unknown as Parameters<typeof makeObservedDatabaseRateLimitStorage>[0];
}

function makeRateLimitWriteCaptureDatabase(capturedWrites: unknown[]) {
  return {
    insert: () => ({
      values: (value: unknown) => {
        capturedWrites.push(value);

        return {
          onConflictDoUpdate: () => Promise.resolve(),
        };
      },
    }),
  } as unknown as Parameters<typeof makeObservedDatabaseRateLimitStorage>[0];
}

function makeRateLimitStorageMutationCaptureDatabase(
  capturedWrites: unknown[],
  capturedUpdates: unknown[]
) {
  return {
    insert: () => ({
      values: (value: unknown) => {
        capturedWrites.push(value);

        return {
          onConflictDoUpdate: () => Promise.resolve(),
        };
      },
    }),
    update: () => ({
      set: (value: unknown) => {
        capturedUpdates.push(value);

        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  } as unknown as Parameters<typeof makeObservedDatabaseRateLimitStorage>[0];
}

function makeRateLimitFlakyReadDatabase(
  results: readonly (
    | Error
    | null
    | { count: number; key: string; lastRequest: number }
  )[]
) {
  let index = 0;

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const result = results[index] ?? results.at(-1) ?? null;
            index += 1;

            if (result instanceof Error) {
              throw result;
            }

            return Promise.resolve(result === null ? [] : [result]);
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof makeObservedDatabaseRateLimitStorage>[0];
}

function makeRateLimitReservationDatabase(result: { readonly count: number }) {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => Promise.resolve([result]),
        }),
      }),
    }),
  } as unknown as Parameters<typeof withAuthenticationAbuseRateLimitGuard>[1];
}

function makeRateLimitReservationSequenceDatabase(
  results: readonly ({ readonly count: number } | Error)[],
  keys: string[] = []
) {
  let nextResultIndex = 0;

  return {
    insert: () => ({
      values: (value: { readonly key: string }) => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            keys.push(value.key);
            const result = results[nextResultIndex] ?? results.at(-1);
            nextResultIndex += 1;

            if (result instanceof Error) {
              throw result;
            }

            return Promise.resolve(result === undefined ? [] : [result]);
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof withAuthenticationAbuseRateLimitGuard>[1];
}

function makeRateLimitReservationFailureDatabase(error: unknown) {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => {
            throw error;
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof withAuthenticationAbuseRateLimitGuard>[1];
}

function makeOrganizationMembershipCountDatabase(count: number) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ count }]),
        }),
      }),
    }),
  } as unknown as Parameters<
    typeof assertUserCanAcceptOrganizationInvitation
  >[0]["database"];
}

function makeAuthenticationConfigWithDisabledIpTracking(): Parameters<
  typeof withAuthenticationAbuseRateLimitGuard
>[2] {
  const config = makeAuthenticationConfig({
    baseUrl: "http://127.0.0.1:3000",
    secret: "0123456789abcdef0123456789abcdef",
    databaseUrl: DEFAULT_AUTH_DATABASE_URL,
  });

  return {
    ...config,
    advanced: {
      ...config.advanced,
      ipAddress: {
        disableIpTracking: true,
      },
    },
  } as unknown as Parameters<typeof withAuthenticationAbuseRateLimitGuard>[2];
}

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: input.fiber.getRef(References.CurrentLogAnnotations),
      level: input.logLevel.toUpperCase(),
      message: input.message,
    });
  });

  return { logger, logs };
}

function makeStreamingTextBody(text: string) {
  const bytes = new TextEncoder().encode(text);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeStreamingPostRequest(
  url: string,
  body: string,
  headers?: HeadersInit | undefined
) {
  const init: RequestInit = {
    body: makeStreamingTextBody(body),
    headers,
    method: "POST",
  };

  // Node's Request requires this for ReadableStream bodies; Cloudflare's type omits it.
  Object.defineProperty(init, "duplex", {
    value: "half",
  });

  return new Request(url, init);
}

async function withEnvironment(
  nextEnvironment: Record<string, string>,
  run: (provider: ConfigProvider.ConfigProvider) => Promise<void>
) {
  const managedKeys = [
    "AUTH_APP_ORIGIN",
    "AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED",
    "AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE",
    "AUTH_RATE_LIMIT_ENABLED",
    "BETTER_AUTH_BASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_SECRETS",
    "CEIRD_LOCAL_DEV",
    "DATABASE_URL",
    "MCP_RESOURCE_URL",
    "NODE_ENV",
    "OAUTH_ISSUER_URL",
  ] as const;
  const previousEnvironment = snapshotEnv(managedKeys);

  for (const key of managedKeys) {
    Reflect.deleteProperty(process.env, key);
  }

  Object.assign(process.env, nextEnvironment);
  const provider = ConfigProvider.fromEnv({ env: nextEnvironment });

  try {
    await run(provider);
  } finally {
    restoreEnv(previousEnvironment);
  }
}

function snapshotEnv<const Keys extends readonly string[]>(keys: Keys) {
  return Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  ) as Record<Keys[number], string | undefined>;
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
}

function loadAuthenticationConfigForTest(
  provider: ConfigProvider.ConfigProvider
) {
  return Effect.runPromise(
    loadAuthenticationConfig.pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, provider)
    )
  );
}
