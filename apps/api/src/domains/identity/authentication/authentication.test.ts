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
import { Effect } from "effect";

import {
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
        },
      },
      emailAndPassword: {
        enabled: true,
        revokeSessionsOnPasswordReset: true,
      },
    });

    expect(config).not.toHaveProperty("socialProviders");
  }, 10_000);

  it("adds the matching app origin for a portless sandbox URL", () => {
    expect(
      makeAuthenticationTrustedOrigins({
        portlessUrl: "https://task-tracker.api.task-tracker.localhost:1355",
      })
    ).toContain("https://task-tracker.app.task-tracker.localhost:1355");
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

async function withEnvironment(
  nextEnvironment: Record<string, string>,
  run: () => Promise<void>
) {
  const previousEnvironment = { ...process.env };

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
