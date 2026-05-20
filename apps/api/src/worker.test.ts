import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, HashMap, LogLevel, Logger } from "effect";

import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { handleWorkerFetch } from "./platform/cloudflare/runtime.js";
import worker from "./worker.js";

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

function makeExecutionContext() {
  return {
    passThroughOnException: vi.fn<() => void>(),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  } as unknown as ExecutionContext;
}

function makeDomainService(fetch: Service["fetch"]): Service {
  return {
    connect: () => {
      throw new Error("Service binding connect is not used by the API adapter");
    },
    fetch,
  };
}

describe("API Worker adapter", () => {
  it("forwards public domain requests to the private domain Worker binding", async () => {
    const forwardedRequests: Request[] = [];
    const env = {
      DOMAIN: makeDomainService((request: Request) => {
        forwardedRequests.push(request);
        return Promise.resolve(Response.json({ jobs: [] }));
      }),
    } satisfies ApiWorkerEnv;

    const response = await worker.fetch(
      new Request("https://api.example.com/jobs?limit=10", {
        body: JSON.stringify({ title: "Install boiler" }),
        headers: {
          authorization: "Bearer public-token",
          "cf-connecting-ip": "203.0.113.10",
          "content-type": "application/json",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "http",
        },
        method: "POST",
      }),
      env,
      makeExecutionContext()
    );

    await expect(response.json()).resolves.toStrictEqual({ jobs: [] });
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0].url).pathname).toBe("/jobs");
    expect(new URL(forwardedRequests[0].url).search).toBe("?limit=10");
    expect(forwardedRequests[0].method).toBe("POST");
    expect(forwardedRequests[0].headers.get("authorization")).toBe(
      "Bearer public-token"
    );
    expect(forwardedRequests[0].headers.get("content-type")).toBe(
      "application/json"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-for")).toBe(
      "203.0.113.10"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-host")).toBe(
      "api.example.com"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-proto")).toBe("https");
    await expect(forwardedRequests[0].text()).resolves.toBe(
      JSON.stringify({ title: "Install boiler" })
    );
  });

  it("logs forwarded API request outcomes without query strings", async () => {
    const { logger, logs } = captureLogs();
    const env = {
      ALCHEMY_STACK_NAME: "ceird",
      ALCHEMY_STAGE: "codex-domain-worker-boundary-split",
      DOMAIN: makeDomainService(() =>
        Promise.resolve(new Response(null, { status: 202 }))
      ),
    } satisfies ApiWorkerEnv;

    const response = await handleWorkerFetch(
      new Request("https://api.example.com/jobs?token=secret"),
      env,
      makeExecutionContext()
    ).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.runPromise
    );

    expect(response.status).toBe(202);
    expect(logs).toStrictEqual([
      {
        annotations: {
          "alchemy.stackName": "ceird",
          "alchemy.stage": "codex-domain-worker-boundary-split",
          "ceird.adapter": "api",
          "ceird.domainBinding": "DOMAIN",
          "http.method": "GET",
          "http.path": "/jobs",
          "http.status": 202,
        },
        level: "INFO",
        message: ["Handled API Worker request"],
      },
    ]);
  });

  it("returns an observable bad gateway response when domain forwarding fails", async () => {
    const { logger, logs } = captureLogs();
    const env = {
      DOMAIN: makeDomainService(() =>
        Promise.reject(new Error("domain unavailable"))
      ),
    } satisfies ApiWorkerEnv;

    const response = await handleWorkerFetch(
      new Request("https://api.example.com/jobs"),
      env,
      makeExecutionContext()
    ).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({
      error: "domain_forwarding_failed",
    });
    expect(response.status).toBe(502);
    expect(logs).toStrictEqual([
      {
        annotations: {
          "api.failure": "domain_forwarding_failed",
          "api.failureBinding": "DOMAIN",
          "api.failureTag": "@ceird/api/DomainForwardingError",
          "ceird.adapter": "api",
          "ceird.domainBinding": "DOMAIN",
          "http.method": "GET",
          "http.path": "/jobs",
          "http.status": 502,
        },
        level: "WARN",
        message: ["API domain forwarding failed"],
      },
    ]);
  });

  it("does not forward internal Agent routes", async () => {
    const domain = makeDomainService(vi.fn<() => Promise<Response>>());
    const env = {
      DOMAIN: domain,
    } satisfies ApiWorkerEnv;

    const responses = await Promise.all([
      worker.fetch(
        new Request("https://api.example.com/agent/internal/actions", {
          method: "POST",
        }),
        env,
        makeExecutionContext()
      ),
      worker.fetch(
        new Request(
          "https://api.example.com/agent/internal/threads/11111111-1111-4111-8111-111111111111/activity",
          { method: "POST" }
        ),
        env,
        makeExecutionContext()
      ),
    ]);

    expect(responses.map((response) => response.status)).toStrictEqual([
      404, 404,
    ]);
    await expect(responses[0].text()).resolves.toBe("Not found");
    await expect(responses[1].text()).resolves.toBe("Not found");
    expect(domain.fetch).not.toHaveBeenCalled();
  });

  it("keeps public health checks in the API adapter", async () => {
    const domain = makeDomainService(vi.fn<() => Promise<Response>>());
    const env = {
      ALCHEMY_STACK_NAME: "ceird",
      ALCHEMY_STAGE: "codex-domain-worker-boundary-split",
      DOMAIN: domain,
    } satisfies ApiWorkerEnv;

    const response = await worker.fetch(
      new Request("https://api.example.com/health"),
      env,
      makeExecutionContext()
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "api",
      stackName: "ceird",
      stage: "codex-domain-worker-boundary-split",
    });
    expect(domain.fetch).not.toHaveBeenCalled();
  });
});
