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
  makeAuthenticationConfig,
  makeDynamicAuthenticationBaseUrl,
} from "./config.js";
import {
  authSchema,
  account,
  rateLimit,
  session,
  user,
  verification,
} from "./schema.js";

describe("makeAuthenticationConfig()", () => {
  it("builds the minimal Better Auth configuration for email/password auth", () => {
    const config = makeAuthenticationConfig({
      host: "127.0.0.1",
      port: 3001,
      explicitBaseUrl: "http://127.0.0.1:3001",
      secret: "super-secret-value",
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker",
    });

    expect(config).toMatchObject({
      basePath: "/api/auth",
      baseURL: "http://127.0.0.1:3001",
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
      },
    });

    expect("socialProviders" in config).toBe(false);
  }, 10_000);

  it("supports a dynamic host configuration for sandbox aliases and local fallbacks", () => {
    const baseUrl = makeDynamicAuthenticationBaseUrl({
      host: "0.0.0.0",
      port: 4301,
      portlessUrl: "https://task-tracker.api.task-tracker.localhost:1355",
    });

    expect(baseUrl.fallback).toBe("http://127.0.0.1:4301");
    expect(baseUrl.allowedHosts).toStrictEqual(
      expect.arrayContaining([
        "127.0.0.1:4301",
        "localhost:4301",
        "*.localhost:1355",
        "task-tracker.api.task-tracker.localhost:1355",
      ])
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
