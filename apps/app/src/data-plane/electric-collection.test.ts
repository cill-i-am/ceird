import type { SyncShapeName } from "@ceird/domain-core";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { syncBackedCollectionCompleteness } from "./collection-contract";
import {
  assertSafeElectricShapeOptions,
  assertSupportedElectricSyncMode,
  createElectricCollectionFromContract,
  createElectricShapeOptions,
  defineElectricCollectionContract,
  makeCredentialedSyncFetch,
  makeElectricShapeUrl,
  normalizeElectricSyncError,
} from "./electric-collection";

const TestRowSchema = Schema.Struct({
  createdAt: Schema.String,
  id: Schema.String,
  name: Schema.String,
});
const TestRowStandardSchema = Schema.toStandardSchemaV1(TestRowSchema);

type TestRow = Schema.Schema.Type<typeof TestRowSchema>;

const testContract = defineElectricCollectionContract({
  collection: "labels",
  completeness: syncBackedCollectionCompleteness({
    covers: { mode: "complete-tenant" },
    source: "electric",
    subscriptionName: "labels",
  }),
  getKey: (row: TestRow) => row.id,
  id: "organization:org_123:user:user_123:role:owner:labels:electric",
  schema: TestRowStandardSchema,
  shapeName: "labels",
});

describe("Ceird Electric collection factory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds public sync Worker shape URLs from VITE_SYNC_ORIGIN", () => {
    expect(
      makeElectricShapeUrl({
        shapeName: "jobs",
        syncOrigin: "https://sync.codex.ceird.localhost/",
      })
    ).toBe("https://sync.codex.ceird.localhost/v1/shapes/jobs");

    expect(
      makeElectricShapeUrl({
        shapeName: "jobs",
        style: "query",
        syncOrigin: "https://sync.codex.ceird.localhost/ignored?table=jobs",
      })
    ).toBe("https://sync.codex.ceird.localhost/v1/shape?shape=jobs");
  });

  it("does not create Electric browser stream state during server render", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const result = createElectricCollectionFromContract(testContract, {
      runtime: {
        isBrowser: false,
      },
    });

    expect(result).toStrictEqual({
      collection: null,
      disabledReason: "server-render",
      health: expect.objectContaining({
        current: expect.objectContaining({
          disabledReason: "server-render",
          status: "disabled",
        }),
      }),
      status: "disabled",
    });
  });

  it("returns a disabled result when VITE_SYNC_ORIGIN is missing", () => {
    const result = createElectricCollectionFromContract(testContract, {
      runtime: { isBrowser: true },
    });

    expect(result).toStrictEqual({
      collection: null,
      disabledReason: "missing-sync-origin",
      health: expect.objectContaining({
        current: expect.objectContaining({
          disabledReason: "missing-sync-origin",
          status: "disabled",
        }),
      }),
      status: "disabled",
    });
  });

  it("returns a disabled result when VITE_SYNC_ORIGIN is invalid", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://user:secret@sync.example");

    const result = createElectricCollectionFromContract(testContract, {
      runtime: { isBrowser: true },
    });

    expect(result).toStrictEqual({
      collection: null,
      disabledReason: "invalid-sync-origin",
      health: expect.objectContaining({
        current: expect.objectContaining({
          disabledReason: "invalid-sync-origin",
          status: "disabled",
        }),
      }),
      status: "disabled",
    });
  });

  it("creates an Electric collection with connecting health in browser runtime", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const result = createElectricCollectionFromContract(testContract, {
      runtime: {
        fetch: makeTestFetch(new Response("ok")),
        isBrowser: true,
      },
    });

    expect(result.status).toBe("enabled");
    if (result.status !== "enabled") {
      throw new Error("Expected Electric collection to be enabled");
    }
    expect(result.shapeUrl).toBe(
      "https://sync.codex.ceird.localhost/v1/shapes/labels"
    );
    expect(result.collection.id).toBe(testContract.id);
    expect(result.collection.config.schema).toBe(TestRowStandardSchema);
    expect(result.collection.config.syncMode).toBe("eager");
    expect(result.health.current).toStrictEqual(
      expect.objectContaining({
        collection: "labels",
        collectionId: testContract.id,
        recoveryAttempts: 0,
        source: "electric",
        status: "connecting",
        subscriptionName: "labels",
      })
    );
  });

  it("converts schema and safe shape options into Electric ShapeStream options", async () => {
    const onSyncError = vi.fn<(error: unknown) => void>();
    const callerOnError = vi.fn<
      () => { readonly headers: { readonly Authorization: string } }
    >(() => ({
      headers: { Authorization: "fresh" },
    }));
    const shapeOptions = createElectricShapeOptions(
      defineElectricCollectionContract({
        ...testContract,
        shapeOptions: {
          liveSse: true,
          onError: callerOnError,
          parser: {
            timestamptz: (value) => value,
          },
          subscribe: true,
        },
      }),
      {
        fetch: makeTestFetch(new Response("ok")),
        onSyncError,
        shapeUrl: "https://sync.codex.ceird.localhost/v1/shapes/labels",
      }
    );

    expect(shapeOptions.url).toBe(
      "https://sync.codex.ceird.localhost/v1/shapes/labels"
    );
    expect(shapeOptions.subscribe).toBeTruthy();
    expect(shapeOptions.liveSse).toBeTruthy();
    expect(shapeOptions.columnMapper?.decode("created_at")).toBe("createdAt");
    expect(shapeOptions.columnMapper?.encode("createdAt")).toBe("created_at");

    const parsed = shapeOptions.parser?.timestamptz?.(
      "2026-06-14T12:00:00.000Z"
    );
    expect(parsed).toBe("2026-06-14T12:00:00.000Z");

    await expect(
      shapeOptions.onError?.({
        message: "unauthorized",
        status: 401,
      } as Error & { readonly status: number })
    ).resolves.toStrictEqual({ headers: { Authorization: "fresh" } });
    expect(callerOnError).toHaveBeenCalledOnce();
    expect(onSyncError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "auth",
        message: "Sync authorization failed.",
        retryable: false,
        shapeName: "labels",
        status: 401,
      })
    );
  });

  it("rejects caller-controlled trusted Electric source params", () => {
    expect(() =>
      assertSafeElectricShapeOptions({
        params: {
          "params[1]": "org_123",
          subset__where: "id = $1",
          table: "work_items",
          where: "organization_id = $1",
        },
      })
    ).toThrow(
      "Electric shapeOptions.params cannot include trusted source parameters: params[1], subset__where, table, where"
    );

    expect(() =>
      assertSafeElectricShapeOptions({
        params: {
          replica: "full",
        },
      })
    ).not.toThrow();
  });

  it("rejects unsafe retry params returned from Electric onError", async () => {
    const shapeOptions = createElectricShapeOptions(
      defineElectricCollectionContract({
        ...testContract,
        shapeOptions: {
          onError: () => ({
            params: {
              table: "work_items",
            },
          }),
        },
      }),
      {
        fetch: makeTestFetch(new Response("ok")),
        shapeUrl: "https://sync.codex.ceird.localhost/v1/shapes/labels",
      }
    );

    await expect(
      shapeOptions.onError?.({
        message: "retry",
        status: 503,
      } as Error & { readonly status: number })
    ).rejects.toThrow(
      "Electric shapeOptions.params cannot include trusted source parameters: table"
    );
  });

  it("rejects subset-based sync modes until the sync Worker supports subsets", () => {
    expect(() => assertSupportedElectricSyncMode("eager")).not.toThrow();
    expect(() => assertSupportedElectricSyncMode("on-demand")).toThrow(
      "Electric collections currently support eager full-shape sync only"
    );
    expect(() => assertSupportedElectricSyncMode("progressive")).toThrow(
      "Electric collections currently support eager full-shape sync only"
    );
  });

  it("rejects raw collection contracts with subset-based sync modes before construction", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    expect(() =>
      createElectricCollectionFromContract(
        {
          ...testContract,
          syncMode: "on-demand",
        },
        {
          runtime: {
            fetch: makeTestFetch(new Response("ok")),
            isBrowser: true,
          },
        }
      )
    ).toThrow(
      "Electric collections currently support eager full-shape sync only"
    );
  });

  it("uses an auth-aware fetch client with credentials included", async () => {
    const response = new Response("ok");
    const fetchClient = makeTestFetch(response);
    const credentialedFetch = makeCredentialedSyncFetch(fetchClient);

    await expect(
      credentialedFetch("https://sync.codex.ceird.localhost/v1/shapes/jobs", {
        headers: { "x-request-id": "req_123" },
      })
    ).resolves.toBe(response);
    expect(fetchClient).toHaveBeenCalledWith(
      "https://sync.codex.ceird.localhost/v1/shapes/jobs",
      {
        credentials: "include",
        headers: { "x-request-id": "req_123" },
      }
    );
  });

  it("normalizes Electric errors for the future sync status surface", () => {
    expect(
      normalizeElectricSyncError(
        {
          message: "source secret should not leak",
          status: 503,
        },
        "jobs" satisfies SyncShapeName
      )
    ).toStrictEqual(
      expect.objectContaining({
        kind: "server",
        message: "Sync origin is unavailable with status 503.",
        retryable: true,
        shapeName: "jobs",
        status: 503,
      })
    );

    expect(
      normalizeElectricSyncError(
        {
          message: "bad shape",
          status: 400,
        },
        "jobs"
      )
    ).toStrictEqual(
      expect.objectContaining({
        kind: "configuration",
        message: "Sync configuration failed with status 400.",
        retryable: false,
        shapeName: "jobs",
        status: 400,
      })
    );

    expect(
      normalizeElectricSyncError(
        {
          message: "rate limited",
          status: 429,
        },
        "jobs"
      )
    ).toStrictEqual(
      expect.objectContaining({
        kind: "rate-limited",
        message: "Sync origin rate limited the collection.",
        retryable: true,
        shapeName: "jobs",
        status: 429,
      })
    );

    expect(
      normalizeElectricSyncError(new TypeError("Failed to fetch"), "jobs")
    ).toStrictEqual(
      expect.objectContaining({
        kind: "network",
        message: "Sync request failed before a response was received.",
        retryable: true,
        shapeName: "jobs",
      })
    );

    expect(
      normalizeElectricSyncError(
        new Error("response is missing required headers"),
        "jobs"
      )
    ).toStrictEqual(
      expect.objectContaining({
        kind: "missing-headers",
        message: "Sync response is missing required Electric headers.",
        retryable: false,
        shapeName: "jobs",
      })
    );
  });

  it("records authorization failures as unavailable collection health", async () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const result = createElectricCollectionFromContract(testContract, {
      runtime: {
        fetch: makeTestFetch(new Response("denied raw-token", { status: 403 })),
        isBrowser: true,
      },
    });

    expect(result.status).toBe("enabled");
    if (result.status !== "enabled") {
      throw new Error("Expected Electric collection to be enabled");
    }

    await result.collection.preload();

    expect(result.health.current).toStrictEqual(
      expect.objectContaining({
        lastError: {
          kind: "auth",
          message: "Sync authorization failed.",
          retryable: false,
          status: 403,
        },
        recoveryAttempts: 0,
        status: "unavailable",
      })
    );
    expect(result.health.current.lastError).not.toHaveProperty("cause");
  });

  it("records retryable sync origin failures as recovery attempts", async () => {
    const { health } = createElectricCollectionFromContract(testContract, {
      runtime: { isBrowser: false },
    });
    const shapeOptions = createElectricShapeOptions(testContract, {
      onSyncError: (error) => {
        health.markUnavailable(error);
      },
      shapeUrl: "https://sync.codex.ceird.localhost/v1/shapes/labels",
    });

    await shapeOptions.onError?.({
      message: "upstream source_secret=s3cr3t",
      status: 503,
    } as Error & { readonly status: number });

    expect(health.current).toStrictEqual(
      expect.objectContaining({
        lastError: {
          kind: "server",
          message: "Sync origin is unavailable with status 503.",
          retryable: true,
          status: 503,
        },
        recoveryAttempts: 1,
        status: "unavailable",
      })
    );
  });
});

function makeTestFetch(response: Response) {
  return Object.assign(
    vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>(
      () => Promise.resolve(response) as ReturnType<typeof fetch>
    ),
    {
      preconnect: vi.fn<typeof fetch.preconnect>(),
    }
  ) satisfies typeof fetch;
}
