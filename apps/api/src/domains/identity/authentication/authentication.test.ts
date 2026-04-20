import fs from "node:fs/promises";
import path from "node:path";

import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect } from "effect";
import { Pool } from "pg";

import { createAuthentication, matchesTrustedOrigin } from "./auth.js";
import {
  DEFAULT_AUTH_DATABASE_URL,
  loadAuthenticationConfig,
  makeAuthenticationConfig,
  makeAuthenticationTrustedOrigins,
} from "./config.js";
import * as schemaModule from "./schema.js";
import {
  authSchema,
  account,
  invitation,
  member,
  organization,
  rateLimit,
  session,
  user,
  verification,
} from "./schema.js";

describe("makeAuthenticationConfig()", () => {
  it("builds the minimal Better Auth configuration for email/password auth", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
    });

    expect(config).toMatchObject({
      basePath: "/api/auth",
      baseURL: "http://127.0.0.1:3001",
      trustedOrigins: expect.arrayContaining([
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://*.app.task-tracker.localhost:1355",
        "https://*.app.task-tracker.localhost:1355",
      ]),
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
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
    });

    expect(config).not.toHaveProperty("socialProviders");
  }, 10_000);

  it("applies a dedicated resend verification email rate limit", () => {
    const config = makeAuthenticationConfig({
      baseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
    });

    expect(
      config.rateLimit.customRules["/send-verification-email"]
    ).toStrictEqual({
      window: 60,
      max: 3,
    });
  }, 10_000);

  it("adds the matching app origin for a portless sandbox URL", () => {
    expect(
      makeAuthenticationTrustedOrigins({
        portlessUrl: "https://task-tracker.api.task-tracker.localhost:1355",
      })
    ).toContain("https://task-tracker.app.task-tracker.localhost:1355");
  }, 10_000);

  it("adds the explicit app origin to the trusted origin allowlist", () => {
    expect(
      makeAuthenticationTrustedOrigins({
        appOrigin: "http://127.0.0.1:4304",
      })
    ).toContain("http://127.0.0.1:4304");
  }, 10_000);

  it("requires BETTER_AUTH_BASE_URL when loading auth config", async () => {
    await withEnvironment(
      {
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
        PORTLESS_URL: "https://task-tracker.api.task-tracker.localhost:1355",
      },
      async () => {
        const result = Effect.runPromise(loadAuthenticationConfig);

        await expect(result).rejects.toThrow(/BETTER_AUTH_BASE_URL/);
      }
    );
  }, 10_000);

  it("loads the explicit Better Auth base URL from config", async () => {
    await withEnvironment(
      {
        AUTH_APP_ORIGIN: "http://127.0.0.1:4304",
        BETTER_AUTH_BASE_URL: "https://api.task-tracker.localhost:1355",
        BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
        DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
        PORTLESS_URL: "https://api.task-tracker.localhost:1355",
      },
      async () => {
        const config = await Effect.runPromise(loadAuthenticationConfig);

        expect(config.baseURL).toBe("https://api.task-tracker.localhost:1355");
        expect(config.trustedOrigins).toContain(
          "https://app.task-tracker.localhost:1355"
        );
        expect(config.trustedOrigins).toContain("http://127.0.0.1:4304");
      }
    );
  }, 10_000);
});

describe("auth schema", () => {
  it("defines the core Better Auth tables for the authentication slice", () => {
    expect(getTableName(user)).toBe("user");
    expect(getTableName(session)).toBe("session");
    expect(getTableName(account)).toBe("account");
    expect(getTableName(verification)).toBe("verification");
    expect(getTableName(rateLimit)).toBe("rate_limit");

    expect(authSchema).toMatchObject({
      user,
      session,
      account,
      verification,
      rateLimit,
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

  it("stores a database-level slug format check in the organization migration", async () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "drizzle",
      "0003_organizations.sql"
    );
    const migrationSql = await fs.readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("organization_slug_format_chk");
    expect(migrationSql).toContain("~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
  }, 10_000);

  it("preserves the /api/auth prefix when mounting auth routes", async () => {
    await Effect.gen(function* verifyAuthenticationPrefixPreserved() {
      const child = HttpRouter.empty.pipe(
        HttpRouter.get(
          "/api/auth/get-session",
          HttpServerRequest.HttpServerRequest.pipe(
            Effect.map((request) => HttpServerResponse.text(request.url))
          )
        )
      );

      yield* HttpRouter.empty.pipe(
        HttpRouter.get("/health", HttpServerResponse.text("ok")),
        HttpRouter.mountApp("/api/auth", child, { includePrefix: true }),
        HttpServer.serveEffect()
      );

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
    }).pipe(
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );
  }, 10_000);
});

describe("createAuthentication()", () => {
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
        database: drizzle(pool, { schema: authSchema }),
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
          idempotencyKey: "organization-invitation/inv_123",
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

  it("matches wildcard trusted origins for sandbox aliases", () => {
    expect({
      api: matchesTrustedOrigin(
        "https://organization-invitations.api.task-tracker.localhost:1355",
        ["https://*.app.task-tracker.localhost:1355"]
      ),
      app: matchesTrustedOrigin(
        "https://organization-invitations.app.task-tracker.localhost:1355",
        ["https://*.app.task-tracker.localhost:1355"]
      ),
    }).toStrictEqual({
      api: false,
      app: true,
    });
  }, 10_000);
});

async function withEnvironment(
  nextEnvironment: Record<string, string>,
  run: () => Promise<void>
) {
  const previousEnvironment = { ...process.env };

  delete process.env.AUTH_APP_ORIGIN;
  delete process.env.BETTER_AUTH_BASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.PORTLESS_URL;

  Object.assign(process.env, nextEnvironment);

  try {
    await run();
  } finally {
    process.env = previousEnvironment;
  }
}
