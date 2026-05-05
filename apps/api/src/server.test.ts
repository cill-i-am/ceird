import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect, HashMap, LogLevel, Logger } from "effect";

import { apiRequestLogger } from "./server.js";

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
