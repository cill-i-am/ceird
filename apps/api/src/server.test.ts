import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, HashMap, LogLevel, Logger } from "effect";

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
  it("forwards package-local traffic to the domain origin default", async () => {
    const originalDomainOrigin = process.env.DOMAIN_ORIGIN;
    delete process.env.DOMAIN_ORIGIN;

    const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
      Promise.resolve(new Response("domain ok"))
    );
    vi.stubGlobal("fetch", fetch);

    try {
      const webHandler = makeApiWebHandler();
      const response = await webHandler.handler(
        new Request("http://127.0.0.1:3001/jobs?limit=10")
      );

      await expect(response.text()).resolves.toBe("domain ok");
      expect(fetch).toHaveBeenCalledOnce();
      const [[forwarded]] = fetch.mock.calls as [[Request]];

      expect(forwarded.url).toBe("http://127.0.0.1:3002/jobs?limit=10");
    } finally {
      vi.unstubAllGlobals();
      if (originalDomainOrigin === undefined) {
        delete process.env.DOMAIN_ORIGIN;
      } else {
        process.env.DOMAIN_ORIGIN = originalDomainOrigin;
      }
    }
  });

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
