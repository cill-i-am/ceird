import { NodeHttpServer } from "@effect/platform-node";
import { getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConfigProvider, Effect, Layer, Logger, References } from "effect";
import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { Pool } from "pg";

import { readMigrationSql } from "../../../platform/database/test-database.js";
import {
  makeAuthenticationRequestObservation,
  runWithAuthenticationRequestObservation,
} from "./auth-observability.js";
import {
  createAuthentication,
  extractBetterAuthSessionToken,
  makeEmailFailureReporter,
  makeAuthenticationWebHandler,
  maskInvitationEmail,
  matchesTrustedOrigin,
  withAuthenticationCors,
} from "./auth.js";
import type { CeirdAuthentication } from "./auth.js";
import {
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
        },
      },
      emailAndPassword: {
        enabled: true,
        revokeSessionsOnPasswordReset: true,
      },
      emailVerification: {
        autoSignInAfterVerification: false,
        expiresIn: 3600,
        sendOnSignIn: false,
        sendOnSignUp: true,
      },
      user: {
        changeEmail: {
          enabled: true,
        },
      },
      mcpResourceUrl: "http://127.0.0.1:3001/mcp",
      oauthIssuerUrl: "http://127.0.0.1:3001",
      oauthConsentPath: "/oauth/consent",
      oauthScopes: CEIRD_OAUTH_SCOPES,
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

  it("keeps local Alchemy proxy OAuth issuer URLs on HTTP", async () => {
    await withEnvironment(
      {
        OAUTH_ISSUER_URL: "http://api.localhost:1337/api/auth",
        BETTER_AUTH_BASE_URL: "http://api.localhost:1337/api/auth",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      },
      async (provider) => {
        const config = await loadAuthenticationConfigForTest(provider);

        expect(config.oauthIssuerUrl).toBe(
          "http://api.localhost:1337/api/auth"
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

  it("applies a dedicated resend verification email rate limit", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    });

    expect(
      config.rateLimit.customRules["/send-verification-email"]
    ).toStrictEqual({
      window: 60,
      max: 3,
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
    ).toThrow(Error);
    expect(() =>
      makeAuthenticationTrustedOrigins({
        trustedOrigins: ["https://tenant.ceird.app/path"],
      })
    ).toThrow(Error);
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

  it("exposes the OAuth Provider tables for MCP authorization", () => {
    expect(schemaModule.oauthClient).toBeDefined();
    expect(schemaModule.oauthRefreshToken).toBeDefined();
    expect(schemaModule.oauthAccessToken).toBeDefined();
    expect(schemaModule.oauthConsent).toBeDefined();

    expect(getTableName(schemaModule.oauthClient)).toBe("oauth_client");
    expect(getTableName(schemaModule.oauthRefreshToken)).toBe(
      "oauth_refresh_token"
    );
    expect(getTableName(schemaModule.oauthAccessToken)).toBe(
      "oauth_access_token"
    );
    expect(getTableName(schemaModule.oauthConsent)).toBe("oauth_consent");

    expect(authSchema).toMatchObject({
      oauthClient: schemaModule.oauthClient,
      oauthRefreshToken: schemaModule.oauthRefreshToken,
      oauthAccessToken: schemaModule.oauthAccessToken,
      oauthConsent: schemaModule.oauthConsent,
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

      yield* HttpServer.serveEffect(app);
      const client = yield* HttpClient.HttpClient;

      const authPath = yield* client
        .get("/api/auth/get-session")
        .pipe(Effect.flatMap((response) => response.text));
      const health = yield* client
        .get("/health")
        .pipe(Effect.flatMap((response) => response.text));
      const duplicatePathStatus = yield* client
        .get("/api/auth/api/auth/get-session")
        .pipe(Effect.map((response) => response.status));

      expect(authPath).toBe("/api/auth/get-session");
      expect(health).toBe("ok");
      expect(duplicatePathStatus).toBe(404);
    }).pipe(Effect.provide(NodeHttpServer.layerTest), Effect.scoped, (effect) =>
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
        token: "session-token-1",
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
              readonly disableJwtPlugin?: boolean;
              readonly grantTypes?: readonly string[];
              readonly loginPage?: string;
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
        clientRegistrationAllowedScopes: CEIRD_OAUTH_SCOPES,
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

function createAuthenticationForPluginInspection() {
  const pool = new Pool({
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
    }),
    database: drizzle({ client: pool }),
    reportPasswordResetEmailFailure: () => {},
    reportVerificationEmailFailure: () => {},
    sendOrganizationInvitationEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendVerificationEmail: async () => {},
  });

  return {
    auth,
    cleanup: () => pool.end(),
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
          readonly organizationHooks?: {
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
        };
      }
    | undefined;

  if (!organizationPlugin?.options) {
    throw new Error("Expected organization plugin options to be configured.");
  }

  return organizationPlugin.options;
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

async function withEnvironment(
  nextEnvironment: Record<string, string>,
  run: (provider: ConfigProvider.ConfigProvider) => Promise<void>
) {
  const previousEnvironment = { ...process.env };

  delete process.env.AUTH_APP_ORIGIN;
  delete process.env.AUTH_RATE_LIMIT_ENABLED;
  delete process.env.BETTER_AUTH_BASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.MCP_RESOURCE_URL;
  delete process.env.OAUTH_ISSUER_URL;

  Object.assign(process.env, nextEnvironment);
  const provider = ConfigProvider.fromEnv({ env: nextEnvironment });

  try {
    await run(provider);
  } finally {
    process.env = previousEnvironment;
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
