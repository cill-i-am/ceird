import { NodeHttpServer } from "@effect/platform-node";
import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Logger, References } from "effect";
import {
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "effect/unstable/http";

import { apiRequestLogger, makeApiWebHandler } from "./server.js";

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
      const app = yield* HttpRouter.toHttpEffect(
        HttpRouter.add(
          "GET",
          "/api/auth/callback",
          HttpServerResponse.text("callback ok")
        )
      );

      yield* HttpServer.serveEffect(app, apiRequestLogger);

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get(
          "/api/auth/callback?token=secret-token&callbackURL=https%3A%2F%2Fexample.com"
        )
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("callback ok");
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
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

  it("does not forward internal Agent routes through the public API adapter", async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
      Promise.resolve(new Response("domain ok"))
    );
    vi.stubGlobal("fetch", fetch);

    try {
      const webHandler = makeApiWebHandler();
      const responses = await Promise.all([
        webHandler.handler(
          new Request("http://127.0.0.1:3001/agent/internal/actions", {
            method: "POST",
          })
        ),
        webHandler.handler(
          new Request(
            "http://127.0.0.1:3001/agent/internal/threads/11111111-1111-4111-8111-111111111111/activity",
            { method: "POST" }
          )
        ),
      ]);

      expect(responses.map((response) => response.status)).toStrictEqual([
        404, 404,
      ]);
      await expect(responses[0].text()).resolves.toBe("Not found");
      await expect(responses[1].text()).resolves.toBe("Not found");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("skips health probe logging", async () => {
    const { logger, logs } = captureLogs();

    await Effect.gen(function* testHealthProbeLogging() {
      const app = yield* HttpRouter.toHttpEffect(
        HttpRouter.add("GET", "/health", HttpServerResponse.text("ok"))
      );

      yield* HttpServer.serveEffect(app, apiRequestLogger);

      const client = yield* HttpClient.HttpClient;
      const responseText = yield* client
        .get("/health")
        .pipe(Effect.flatMap((response) => response.text));

      expect(responseText).toBe("ok");
    }).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.provide(NodeHttpServer.layerTest),
      Effect.scoped,
      Effect.runPromise
    );

    expect(logs).toStrictEqual([]);
  });
});
