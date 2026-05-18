import {
  AppDatabase,
  makeAppDatabaseRuntimeLive,
} from "@ceird/backend-core/database";
import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  ConfigProvider,
  Effect,
  HashMap,
  Layer,
  LogLevel,
  Logger,
} from "effect";
import type { Pool } from "pg";

import { Authentication } from "./domains/identity/authentication/auth.js";
import { apiRequestLogger, makeApiWebHandler } from "./server.js";

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: Object.fromEntries(HashMap.toEntries(input.annotations)),
      level: input.logLevel.label,
      message: input.message,
    });
  });

  return { logger, logs };
}

describe("API request logging", () => {
  it("logs request outcomes without query strings", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testRedactedRequestLogger() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get(
          "/api/auth/callback",
          HttpServerResponse.text("callback ok")
        ),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get(
          "/api/auth/callback?token=secret-token&callbackURL=https%3A%2F%2Fexample.com"
        )
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("callback ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toHaveLength(1);
    expect(logs).toStrictEqual([
      {
        annotations: {
          "http.method": "GET",
          "http.path": "/api/auth/callback",
          "http.status": 200,
        },
        level: "INFO",
        message: ["Sent HTTP response"],
      },
    ]);
  });

  it("skips health probe logging", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testHealthProbeLogging() {
      yield* HttpRouter.empty.pipe(
        HttpRouter.get("/health", HttpServerResponse.text("ok")),
        HttpServer.serveEffect(apiRequestLogger)
      );

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get("/health")
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("ok");
    }).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toStrictEqual([]);
  });
});

describe("API MCP boundary", () => {
  it("does not serve MCP resource metadata or protocol requests", async () => {
    const api = makeApiWebHandler(
      makeAppDatabaseRuntimeLive(makeTestAppDatabaseLayer()),
      makeTestAuthenticationLive(),
      undefined,
      makeTestApiBaseLive()
    );

    try {
      const metadataResponse = await api.handler(
        new Request(
          "http://127.0.0.1:3000/.well-known/oauth-protected-resource"
        )
      );
      const mcpResponse = await api.handler(
        new Request("http://127.0.0.1:3000/mcp", { method: "POST" })
      );

      expect(metadataResponse.status).toBe(404);
      expect(mcpResponse.status).toBe(404);
      expect(mcpResponse.headers.get("WWW-Authenticate")).toBeNull();
    } finally {
      await api.dispose();
    }
  });
});

function makeTestAuthenticationLive() {
  return Layer.succeed(
    Authentication,
    Authentication.make({
      api: {
        getSession: () => Promise.resolve(null),
      },
      handler: () => Promise.resolve(new Response(null, { status: 404 })),
      options: {
        plugins: [],
      },
    })
  );
}

function makeTestApiBaseLive() {
  return Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ["BETTER_AUTH_BASE_URL", "http://127.0.0.1:3000/api/auth"],
        ["BETTER_AUTH_SECRET", "0123456789abcdef0123456789abcdef"],
        ["DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/test"],
      ])
    )
  );
}

function makeTestAppDatabaseLayer() {
  const pool = {
    connect: vi.fn<() => void>(),
    ending: false,
    end: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    on: vi.fn<() => void>(),
    options: {
      connectionString:
        "postgresql://postgres:postgres@127.0.0.1:5432/ceird_test",
    },
    query: vi.fn<() => void>(),
  } as unknown as Pool;

  return Layer.succeed(
    AppDatabase,
    AppDatabase.make({
      authDb: drizzle({ client: pool }),
      pool,
    })
  );
}
