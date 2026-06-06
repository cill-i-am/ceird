import type { SyncShapeName } from "@ceird/domain-core";
import { SyncShapeAuthorizationSchema } from "@ceird/domain-core";
import { describe, expect, it, vi } from "@effect/vitest";
import { Effect, Logger, Redacted, References, Schema } from "effect";

import type { SyncWorkerEnv } from "./env.js";
import { handleSyncWorkerFetch, SyncWorkerFailure } from "./runtime.js";

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

function makeExecutionContext() {
  return {
    passThroughOnException: vi.fn<() => void>(),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  } as unknown as ExecutionContext;
}

const baseEnv = {
  AUTH_APP_ORIGIN: "https://app.example.com",
  AUTH_TRUSTED_ORIGINS: "https://app.example.com,https://*--main.example.com",
  DOMAIN: {
    connect: () => {
      throw new Error("connect is not used by the sync adapter");
    },
    fetch: () => Promise.resolve(Response.json({ error: "unused" })),
  },
  ELECTRIC_SQL_LOCATION_HINT: "weur",
  ELECTRIC_SOURCE_SECRET: "electric-secret",
  ElectricSql: {} as DurableObjectNamespace,
  NODE_ENV: "production",
} satisfies SyncWorkerEnv;

function makeJobsAuthorization() {
  return Schema.decodeUnknownSync(SyncShapeAuthorizationSchema)({
    organizationId: "org_sync",
    params: {
      "1": "org_sync",
    },
    shape: "jobs",
    scope: "organization",
    table: "work_items",
    userId: "user_sync",
    where: "organization_id = $1",
  });
}

describe("Sync Worker runtime", () => {
  it("uses default domain and Electric bindings with generated request-id propagation", async () => {
    const domainRequests: Request[] = [];
    const electricRequests: Request[] = [];
    const env = {
      ...baseEnv,
      DOMAIN: {
        connect: () => {
          throw new Error("connect is not used by the sync adapter");
        },
        fetch: (request: Request) => {
          domainRequests.push(request);

          return Promise.resolve(
            Response.json({
              organizationId: "org_sync",
              params: {
                "1": "org_sync",
              },
              shape: "jobs",
              scope: "organization",
              table: "work_items",
              userId: "user_sync",
              where: "organization_id = $1",
            })
          );
        },
      },
      ElectricSql: {
        getByName: (
          name: string,
          options?: DurableObjectNamespaceGetDurableObjectOptions
        ) => {
          expect(name).toBe("primary");
          expect(options).toStrictEqual({ locationHint: "weur" });

          return {
            fetch: (request: Request) => {
              electricRequests.push(request);

              return Promise.resolve(
                Response.json([{ headers: { control: "up-to-date" } }], {
                  headers: {
                    "electric-handle": "shape-handle",
                  },
                })
              );
            },
          };
        },
      } as unknown as DurableObjectNamespace,
    } satisfies SyncWorkerEnv;

    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs?offset=-1", {
        headers: {
          cookie: "ceird=auth",
          origin: "https://app.example.com",
        },
      }),
      env,
      makeExecutionContext()
    ).pipe(Effect.runPromise);
    const requestId = response.headers.get("x-request-id");

    expect(response.status).toBe(200);
    expect(requestId).toBeTruthy();
    expect(domainRequests).toHaveLength(1);
    expect(new URL(domainRequests[0].url).pathname).toBe(
      "/sync/internal/shapes/jobs/authorize"
    );
    expect(domainRequests[0].headers.get("cookie")).toBe("ceird=auth");
    expect(domainRequests[0].headers.get("x-request-id")).toBe(requestId);
    expect(electricRequests).toHaveLength(1);
    expect(electricRequests[0].headers.get("x-request-id")).toBe(requestId);
    expect(electricRequests[0].headers.get("cookie")).toBeNull();
    expect(new URL(electricRequests[0].url).searchParams.get("table")).toBe(
      "work_items"
    );
  });

  it("returns a controlled failure for malformed domain authorization payloads", async () => {
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs?offset=-1", {
        headers: {
          origin: "https://app.example.com",
        },
      }),
      {
        ...baseEnv,
        DOMAIN: {
          connect: () => {
            throw new Error("connect is not used by the sync adapter");
          },
          fetch: () => Promise.resolve(Response.json({ ok: true })),
        },
      },
      makeExecutionContext(),
      {
        fetchElectric: () => Effect.die("unexpected electric request"),
      }
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "sync_unavailable",
    });
    expect(response.status).toBe(502);
  });

  it("maps domain authorization 5xx responses to sync unavailability", async () => {
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs?offset=-1", {
        headers: {
          origin: "https://app.example.com",
        },
      }),
      {
        ...baseEnv,
        DOMAIN: {
          connect: () => {
            throw new Error("connect is not used by the sync adapter");
          },
          fetch: () =>
            Promise.resolve(
              Response.json(
                {
                  _tag: "@ceird/domain-core/SyncAuthorizationStorageError",
                  message: "storage unavailable",
                },
                { status: 503 }
              )
            ),
        },
      },
      makeExecutionContext(),
      {
        fetchElectric: () => Effect.die("unexpected electric request"),
      }
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "sync_unavailable",
    });
    expect(response.status).toBe(503);
  });

  it("authorizes a named shape and injects Electric table, params, and secret server-side", async () => {
    const forwardedRequests: Request[] = [];
    const response = await handleSyncWorkerFetch(
      new Request(
        "https://sync.example.com/v1/shape?shape=jobs&offset=-1&secret=user-supplied&table=evil&params%5B1%5D=evil&subset__where=1%3D1&columns=id",
        {
          headers: {
            cookie: "ceird=auth",
            origin: "https://app.example.com",
            "x-request-id": "req_sync",
          },
        }
      ),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: () => Effect.succeed(makeJobsAuthorization()),
        fetchElectric: (request) =>
          Effect.sync(() => {
            forwardedRequests.push(request);
            return Response.json([{ headers: { control: "up-to-date" } }], {
              headers: {
                "content-encoding": "gzip",
                "content-length": "999",
                "electric-handle": "shape-handle",
              },
            });
          }),
      }
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com"
    );
    expect(response.headers.get("access-control-expose-headers")).toContain(
      "electric-handle"
    );
    expect(response.headers.get("electric-handle")).toBe("shape-handle");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("x-request-id")).toBe("req_sync");
    expect(forwardedRequests).toHaveLength(1);

    const electricUrl = new URL(forwardedRequests[0].url);
    expect(electricUrl.pathname).toBe("/v1/shape");
    expect(electricUrl.searchParams.get("shape")).toBeNull();
    expect(electricUrl.searchParams.get("offset")).toBe("-1");
    expect(electricUrl.searchParams.get("subset__where")).toBeNull();
    expect(electricUrl.searchParams.get("columns")).toBeNull();
    expect(electricUrl.searchParams.get("table")).toBe("work_items");
    expect(electricUrl.searchParams.get("where")).toBe("organization_id = $1");
    expect(electricUrl.searchParams.get("params[1]")).toBe("org_sync");
    expect(electricUrl.searchParams.get("secret")).toBe("electric-secret");
    expect(forwardedRequests[0].headers.get("cookie")).toBeNull();
  });

  it("replaces unsafe caller request IDs before forwarding", async () => {
    const seenRequestIds: string[] = [];
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs?offset=-1", {
        headers: {
          "x-request-id": "bad request id",
        },
      }),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: (_request, _shapeName, requestId) =>
          Effect.sync(() => {
            seenRequestIds.push(requestId);

            return makeJobsAuthorization();
          }),
        fetchElectric: (request) =>
          Effect.sync(() => {
            seenRequestIds.push(request.headers.get("x-request-id") ?? "");

            return Response.json([{ headers: { control: "up-to-date" } }]);
          }),
      }
    ).pipe(Effect.runPromise);
    const requestId = response.headers.get("x-request-id");

    expect(response.status).toBe(200);
    expect(requestId).toBeTruthy();
    expect(requestId).not.toBe("bad request id");
    expect(seenRequestIds).toStrictEqual([requestId, requestId]);
  });

  it("supports both query and path style public shape requests", async () => {
    const shapeRequests = [
      "https://sync.example.com/v1/shape?shape=jobs&offset=-1",
      "https://sync.example.com/v1/shapes/jobs?offset=-1",
    ];

    for (const requestUrl of shapeRequests) {
      const authorizedShapes: SyncShapeName[] = [];
      const forwardedRequests: Request[] = [];
      const response = await handleSyncWorkerFetch(
        new Request(requestUrl),
        baseEnv,
        makeExecutionContext(),
        {
          authorizeShape: (_request, shapeName) =>
            Effect.sync(() => {
              authorizedShapes.push(shapeName);

              return makeJobsAuthorization();
            }),
          fetchElectric: (request) =>
            Effect.sync(() => {
              forwardedRequests.push(request);

              return Response.json([{ headers: { control: "up-to-date" } }]);
            }),
        }
      ).pipe(Effect.runPromise);

      expect(response.status).toBe(200);
      expect(authorizedShapes).toStrictEqual(["jobs"]);
      expect(forwardedRequests).toHaveLength(1);
      expect(new URL(forwardedRequests[0].url).searchParams.get("shape")).toBe(
        null
      );
    }
  });

  it("rejects missing and unknown public shape names before authorization", async () => {
    const requests = [
      {
        status: 400,
        url: "https://sync.example.com/v1/shape?offset=-1",
      },
      {
        status: 404,
        url: "https://sync.example.com/v1/shapes/unknown-shape?offset=-1",
      },
    ];

    for (const requestInput of requests) {
      let authorizeCalled = false;
      const fetchElectric = vi.fn<() => Effect.Effect<Response>>();
      const response = await handleSyncWorkerFetch(
        new Request(requestInput.url),
        baseEnv,
        makeExecutionContext(),
        {
          authorizeShape: () =>
            Effect.sync(() => {
              authorizeCalled = true;

              return makeJobsAuthorization();
            }),
          fetchElectric,
        }
      ).pipe(Effect.runPromise);

      expect(response.status).toBe(requestInput.status);
      expect(authorizeCalled).toBeFalsy();
      expect(fetchElectric).not.toHaveBeenCalled();
    }
  });

  it("rejects POST subset requests instead of forwarding caller-controlled SQL bodies", async () => {
    const fetchElectric = vi.fn<() => Effect.Effect<Response>>();
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shape?shape=jobs&offset=-1", {
        body: JSON.stringify({ where: "1 = 1" }),
        headers: {
          "content-type": "application/json",
          origin: "https://app.example.com",
        },
        method: "POST",
      }),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: () => Effect.die("unexpected auth"),
        fetchElectric,
      }
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "sync_method_not_allowed",
    });
    expect(response.status).toBe(405);
    expect(fetchElectric).not.toHaveBeenCalled();
  });

  it("rejects unknown public sync paths without touching Electric", async () => {
    const fetchElectric = vi.fn<() => Effect.Effect<Response>>();
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/jobs"),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: () => Effect.die("unexpected auth"),
        fetchElectric,
      }
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(404);
    expect(fetchElectric).not.toHaveBeenCalled();
  });

  it("allows configured wildcard tenant origins on preflight", async () => {
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs", {
        headers: {
          "access-control-request-headers": "x-request-id",
          origin: "https://acme--main.example.com",
        },
        method: "OPTIONS",
      }),
      baseEnv,
      makeExecutionContext()
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://acme--main.example.com"
    );
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET,OPTIONS"
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "x-request-id"
    );
  });

  it("does not emit credentialed CORS headers for untrusted origins", async () => {
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/health", {
        headers: {
          origin: "https://evil.example.com",
        },
      }),
      baseEnv,
      makeExecutionContext()
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("rejects malformed encoded shape path segments without throwing", async () => {
    const fetchElectric = vi.fn<() => Effect.Effect<Response>>();
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/%E0%A4%A"),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: () => Effect.die("unexpected auth"),
        fetchElectric,
      }
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(404);
    expect(fetchElectric).not.toHaveBeenCalled();
  });

  it("keeps source secrets out of logs and responses when authorization fails", async () => {
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shape?shape=jobs&offset=-1", {
        headers: {
          origin: "https://app.example.com",
        },
      }),
      {
        ...baseEnv,
        ELECTRIC_SOURCE_SECRET: Redacted.value(
          Redacted.make("electric-secret")
        ),
      },
      makeExecutionContext(),
      {
        authorizeShape: () =>
          Effect.fail(
            new SyncWorkerFailure({
              failureTag: "SyncAuthorizationRejected",
              message: "Authentication is required",
              status: 401,
            })
          ),
        fetchElectric: () => Effect.die("unexpected electric request"),
      }
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "sync_unauthorized",
    });
    expect(response.status).toBe(401);
  });

  it("redacts Electric source secrets from forwarding failure logs", async () => {
    const { logger, logs } = captureLogs();
    const response = await handleSyncWorkerFetch(
      new Request("https://sync.example.com/v1/shapes/jobs?offset=-1", {
        headers: {
          origin: "https://app.example.com",
        },
      }),
      baseEnv,
      makeExecutionContext(),
      {
        authorizeShape: () => Effect.succeed(makeJobsAuthorization()),
        fetchElectric: (request) =>
          Effect.fail(
            new SyncWorkerFailure({
              failureTag: "ElectricForwardingFailed",
              message: `Failed to fetch ${request.url}`,
              status: 502,
            })
          ),
      }
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );
    const serializedLogs = JSON.stringify(logs);

    await expect(response.json()).resolves.toStrictEqual({
      error: "sync_unavailable",
    });
    expect(response.status).toBe(502);
    expect(serializedLogs).not.toContain("electric-secret");
    expect(serializedLogs).toContain("secret=[REDACTED]");
  });
});
