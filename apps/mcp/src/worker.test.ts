import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, HashMap, LogLevel, Logger } from "effect";

import type { McpWorkerEnv } from "./platform/cloudflare/env.js";
import { handleMcpWorkerFetch } from "./platform/cloudflare/runtime.js";

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
      throw new Error("Service binding connect is not used by the MCP adapter");
    },
    fetch,
  };
}

describe("MCP Worker adapter", () => {
  it("forwards MCP protocol requests to the private domain Worker", async () => {
    const { logger } = captureLogs();
    const forwardedRequests: Request[] = [];
    const env = {
      DOMAIN: makeDomainService((request: Request) => {
        forwardedRequests.push(request);
        return Promise.resolve(Response.json({ ok: true }));
      }),
    } satisfies McpWorkerEnv;

    const response = await handleMcpWorkerFetch(
      new Request("https://mcp.example.com/mcp", {
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
        headers: {
          authorization: "Bearer mcp-token",
          "cf-connecting-ip": "203.0.113.20",
          "content-type": "application/json",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "http",
        },
        method: "POST",
      }),
      env,
      makeExecutionContext()
    ).pipe(
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Trace),
      Effect.runPromise
    );

    await expect(response.json()).resolves.toStrictEqual({ ok: true });
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0].url).pathname).toBe("/mcp");
    expect(forwardedRequests[0].method).toBe("POST");
    expect(forwardedRequests[0].headers.get("authorization")).toBe(
      "Bearer mcp-token"
    );
    expect(forwardedRequests[0].headers.get("content-type")).toBe(
      "application/json"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-for")).toBe(
      "203.0.113.20"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-host")).toBe(
      "mcp.example.com"
    );
    expect(forwardedRequests[0].headers.get("x-forwarded-proto")).toBe("https");
    await expect(forwardedRequests[0].text()).resolves.toBe(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      })
    );
  });

  it.each([
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ])("forwards MCP metadata requests for %s", async (path) => {
    const forwardedRequests: Request[] = [];
    const env = {
      DOMAIN: makeDomainService((request: Request) => {
        forwardedRequests.push(request);
        return Promise.resolve(Response.json({ resource: "mcp" }));
      }),
    } satisfies McpWorkerEnv;

    const response = await handleMcpWorkerFetch(
      new Request(`https://mcp.example.com${path}`),
      env,
      makeExecutionContext()
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({ resource: "mcp" });
    expect(forwardedRequests).toHaveLength(1);
    expect(new URL(forwardedRequests[0].url).pathname).toBe(path);
  });

  it("logs forwarded MCP request outcomes without query strings", async () => {
    const { logger, logs } = captureLogs();
    const env = {
      ALCHEMY_STACK_NAME: "ceird",
      ALCHEMY_STAGE: "codex-domain-worker-boundary-split",
      DOMAIN: makeDomainService(() =>
        Promise.resolve(new Response(null, { status: 202 }))
      ),
    } satisfies McpWorkerEnv;

    const response = await handleMcpWorkerFetch(
      new Request("https://mcp.example.com/mcp?token=secret", {
        method: "POST",
      }),
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
          "ceird.adapter": "mcp",
          "ceird.domainBinding": "DOMAIN",
          "http.method": "POST",
          "http.path": "/mcp",
          "http.status": 202,
        },
        level: "INFO",
        message: ["Forwarded MCP request to domain Worker"],
      },
    ]);
  });

  it("does not publish the domain HTTP surface on the MCP hostname", async () => {
    const domain = makeDomainService(vi.fn<() => Promise<Response>>());
    const env = {
      DOMAIN: domain,
    } satisfies McpWorkerEnv;

    const response = await handleMcpWorkerFetch(
      new Request("https://mcp.example.com/jobs"),
      env,
      makeExecutionContext()
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(404);
    expect(domain.fetch).not.toHaveBeenCalled();
  });

  it("returns an observable bad gateway response when domain forwarding fails", async () => {
    const { logger, logs } = captureLogs();
    const env = {
      DOMAIN: makeDomainService(() =>
        Promise.reject(new Error("domain unavailable"))
      ),
    } satisfies McpWorkerEnv;

    const response = await handleMcpWorkerFetch(
      new Request("https://mcp.example.com/mcp", { method: "POST" }),
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
          "ceird.adapter": "mcp",
          "ceird.domainBinding": "DOMAIN",
          "http.method": "POST",
          "http.path": "/mcp",
          "http.status": 502,
          "mcp.failure": "domain_forwarding_failed",
          "mcp.failureBinding": "DOMAIN",
          "mcp.failureTag": "@ceird/mcp/DomainForwardingError",
        },
        level: "WARN",
        message: ["MCP domain forwarding failed"],
      },
    ]);
  });
});
