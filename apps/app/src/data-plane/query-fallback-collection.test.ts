import type { SyncShapeName } from "@ceird/domain-core";
import { QueryClient } from "@tanstack/query-core";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { seedQueryCollectionInitialData } from "./bootstrap";
import {
  COMPLETE_TENANT_COLLECTION,
  defineQueryCollectionContract,
  syncBackedCollectionCompleteness,
} from "./collection-contract";
import type { DataPlaneCollectionHealth } from "./collection-health";
import { createDataPlaneCollectionHealth } from "./collection-health";
import type {
  CreateDataPlaneElectricCollectionOptions,
  DataPlaneElectricCollectionResult,
  DataPlaneElectricSyncError,
} from "./electric-collection";
import { defineElectricCollectionContract } from "./electric-collection";
import {
  createCollectionWithQueryFallback,
  fallbackReasonFromElectricError,
} from "./query-fallback-collection";

const TestRowSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});
const TestRowStandardSchema = Schema.toStandardSchemaV1(TestRowSchema);
type TestRow = Schema.Schema.Type<typeof TestRowSchema>;

const queryContract = defineQueryCollectionContract({
  collection: "labels",
  completeness: COMPLETE_TENANT_COLLECTION,
  getKey: (row: TestRow) => row.id,
  id: "organization:org_123:user:user_123:role:owner:labels",
  queryFn: () => [{ id: "query-label", name: "Query label" }],
  queryKey: ["labels", "organization", "org_123"],
  schema: TestRowStandardSchema,
  syncMode: "on-demand",
});

const electricContract = defineElectricCollectionContract({
  collection: "labels",
  completeness: syncBackedCollectionCompleteness({
    covers: COMPLETE_TENANT_COLLECTION,
    source: "electric",
    subscriptionName: "labels",
  }),
  getKey: (row: TestRow) => row.id,
  id: "organization:org_123:user:user_123:role:owner:labels:electric",
  schema: TestRowStandardSchema,
  shapeName: "labels",
});

describe("data-plane Query Collection fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("uses Query Collection when VITE_SYNC_ORIGIN is missing", () => {
    const queryCollection = makeTestCollection([
      { id: "query-label", name: "Query label" },
    ]);

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );

    expect(result.collection).toBe(queryCollection);
    expect(result.health.current).toMatchObject({
      collection: "labels",
      collectionId: electricContract.id,
      disabledReason: "missing-sync-origin",
      fallbackReason: "missing-sync-origin",
      source: "electric",
      status: "fallback-active",
    });
  });

  it("keeps explicit sync-disabled configuration on Query Collection", () => {
    const queryCollection = makeTestCollection([]);
    const createElectricCollection =
      vi.fn<
        (
          contract: typeof electricContract,
          options: CreateDataPlaneElectricCollectionOptions
        ) => DataPlaneElectricCollectionResult<
          ReturnType<typeof makeTestCollection>
        >
      >();

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection,
        createQueryCollection: () => queryCollection,
        electricEnabled: false,
        runtime: { isBrowser: true },
      }
    );

    expect(result.collection).toBe(queryCollection);
    expect(createElectricCollection).not.toHaveBeenCalled();
    expect(result.health.current).toMatchObject({
      collection: "labels",
      collectionId: queryContract.id,
      fallbackReason: "sync-disabled",
      source: "query",
      status: "fallback-active",
    });
  });

  it("falls back to Query Collection and exposes auth failures as recoverable status", () => {
    const queryCollection = makeTestCollection([
      { id: "query-label", name: "Query label" },
    ]);
    const electricCollection = makeTestCollection([
      { id: "electric-label", name: "Electric label" },
    ]);
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;
    const health = makeElectricHealth();

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );

    expect(result.health.current).toMatchObject({
      collection: "labels",
      collectionId: electricContract.id,
      source: "electric",
      status: "connecting",
    });
    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["electric-label"]);

    const error = makeElectricError({ kind: "auth", status: 401 });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(result.health.current).toMatchObject({
      fallbackReason: "sync-unauthorized",
      lastError: {
        kind: "auth",
        retryable: false,
        status: 401,
      },
      source: "electric",
      status: "fallback-active",
    });
    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["query-label"]);
    expect(result.health.retryElectric()).toBeFalsy();
  });

  it("activates Query fallback for unavailable sync responses", () => {
    const queryCollection = makeTestCollection([
      { id: "query-label", name: "Query label" },
    ]);
    const electricCollection = makeTestCollection([
      { id: "electric-label", name: "Electric label" },
    ]);
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;
    const health = makeElectricHealth();
    const retriedHealth = makeElectricHealth();
    let createElectricCallCount = 0;

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          createElectricCallCount += 1;
          return {
            collection: electricCollection,
            health: createElectricCallCount === 1 ? health : retriedHealth,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );

    const error = makeElectricError({
      kind: "server",
      message: "electric_container_unavailable",
      status: 503,
    });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(fallbackReasonFromElectricError(error)).toBe("sync-unavailable");
    expect(result.health.current).toMatchObject({
      fallbackReason: "sync-unavailable",
      lastError: {
        kind: "server",
        retryable: true,
        status: 503,
      },
      recoveryAttempts: 1,
      status: "fallback-active",
    });
    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["query-label"]);
    expect(result.health.retryElectric()).toBeTruthy();
    expect(result.health.current).toMatchObject({
      source: "electric",
      status: "connecting",
    });
  });

  it("keeps first-paint Query data useful when fallback activates after hydration", () => {
    const queryCollection = makeTestCollection([
      { id: "loader-label", name: "Loader label" },
    ]);
    const electricCollection = makeTestCollection([
      { id: "electric-label", name: "Electric label" },
    ]);
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;
    const health = makeElectricHealth();

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );

    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["electric-label"]);

    const error = makeElectricError({ kind: "network" });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(result.health.current).toMatchObject({
      fallbackReason: "sync-unavailable",
      status: "fallback-active",
    });
    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["loader-label"]);
  });

  it("preserves subscription options and replays requested snapshots after fallback switches", () => {
    const queryCollection = makeTestCollection([
      { id: "query-label", name: "Query label" },
    ]);
    const electricCollection = makeTestCollection([
      { id: "electric-label", name: "Electric label" },
    ]);
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;
    const health = makeElectricHealth();

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );
    const callback = vi.fn<() => void>();
    const subscribeOptions = { includeInitialState: false };
    const snapshotOptions = { optimizedOnly: false };

    const subscription = readTestSubscription(result.collection);
    const activeSubscription = subscription.subscribeChanges(
      callback,
      subscribeOptions
    );
    activeSubscription.requestSnapshot?.(snapshotOptions);

    expect(electricCollection.subscribeChanges).toHaveBeenCalledWith(
      callback,
      subscribeOptions
    );
    expect(
      electricCollection.subscriptions[0]?.requestSnapshot
    ).toHaveBeenCalledWith(snapshotOptions);

    const error = makeElectricError({ kind: "network" });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(queryCollection.subscribeChanges).toHaveBeenCalledWith(
      callback,
      subscribeOptions
    );
    expect(
      queryCollection.subscriptions[0]?.requestSnapshot
    ).toHaveBeenCalledWith(snapshotOptions);
  });

  it("replays requested snapshots to the newly retried Electric collection", () => {
    const queryCollection = makeTestCollection([
      { id: "query-label", name: "Query label" },
    ]);
    const firstElectricCollection = makeTestCollection([
      { id: "first-electric-label", name: "First Electric label" },
    ]);
    const retriedElectricCollection = makeTestCollection([
      { id: "retried-electric-label", name: "Retried Electric label" },
    ]);
    const firstHealth = makeElectricHealth();
    const retriedHealth = makeElectricHealth();
    let createElectricCallCount = 0;
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          createElectricCallCount += 1;
          return {
            collection:
              createElectricCallCount === 1
                ? firstElectricCollection
                : retriedElectricCollection,
            health: createElectricCallCount === 1 ? firstHealth : retriedHealth,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        createQueryCollection: () => queryCollection,
        runtime: { isBrowser: true },
      }
    );
    const callback = vi.fn<() => void>();
    const subscribeOptions = { includeInitialState: false };
    const snapshotOptions = { optimizedOnly: false };
    const collection = readTestSubscription(result.collection);
    const activeSubscription = collection.subscribeChanges(
      callback,
      subscribeOptions
    );
    activeSubscription.requestSnapshot?.(snapshotOptions);

    const error = makeElectricError({ kind: "network", status: 503 });
    firstHealth.markUnavailable(error);
    onSyncError?.(error);

    expect(
      queryCollection.subscriptions[0]?.requestSnapshot
    ).toHaveBeenCalledWith(snapshotOptions);
    expect(result.health.retryElectric()).toBeTruthy();

    expect(firstElectricCollection.subscribeChanges).toHaveBeenCalledOnce();
    expect(
      firstElectricCollection.subscriptions[0]?.requestSnapshot
    ).toHaveBeenCalledOnce();
    expect(retriedElectricCollection.subscribeChanges).toHaveBeenCalledWith(
      callback,
      subscribeOptions
    );
    expect(
      retriedElectricCollection.subscriptions[0]?.requestSnapshot
    ).toHaveBeenCalledWith(snapshotOptions);
    expect(
      [...result.collection.entries()].map(([, row]) => row.id)
    ).toStrictEqual(["retried-electric-label"]);
  });

  it("loads seeded Query Collection data after hydration snapshot replay and Electric fallback", async () => {
    const queryClient = new QueryClient();
    const queryKey = ["labels", "hydrated-fallback"];
    const loaderRow = {
      id: "loader-label",
      name: "Loader label",
    } satisfies TestRow;
    const queryFn = vi.fn<() => readonly TestRow[]>(() => [
      { id: "server-label", name: "Server label" },
    ]);
    const hydrationQueryContract = defineQueryCollectionContract({
      ...queryContract,
      id: "organization:org_123:user:user_123:role:owner:labels:hydrated",
      queryFn,
      queryKey,
      staleTime: 30_000,
    });
    seedQueryCollectionInitialData(queryClient, queryKey, [loaderRow]);
    const electricCollection = makeTestCollection([
      { id: "electric-label", name: "Electric label" },
    ]);
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;
    const health = makeElectricHealth();

    const result = createCollectionWithQueryFallback(
      queryClient,
      {
        electric: electricContract,
        query: hydrationQueryContract,
      },
      {
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);
          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.example/v1/shapes/labels",
            status: "enabled",
          };
        },
        runtime: { isBrowser: true },
      }
    );
    const collection = readTestSubscription(result.collection);
    const activeSubscription = collection.subscribeChanges(vi.fn(), {
      includeInitialState: false,
    });
    activeSubscription.requestSnapshot?.({ optimizedOnly: false });

    expect([...collection.entries()].map(([, row]) => row.id)).toStrictEqual([
      "electric-label",
    ]);

    const error = makeElectricError({ kind: "network" });
    health.markUnavailable(error);
    onSyncError?.(error);

    await vi.waitFor(() => {
      expect([...collection.entries()].map(([, row]) => row.id)).toStrictEqual([
        "loader-label",
      ]);
    });
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("activates Query fallback when Electric is slow to become ready", () => {
    vi.useFakeTimers();

    const queryCollection = makeTestCollection([]);
    const electricCollection = makeTestCollection([], { status: "loading" });
    const health = makeElectricHealth();

    const result = createCollectionWithQueryFallback(
      new QueryClient(),
      {
        electric: electricContract,
        query: queryContract,
      },
      {
        createElectricCollection: () => ({
          collection: electricCollection,
          health,
          shapeUrl: "https://sync.example/v1/shapes/labels",
          status: "enabled",
        }),
        createQueryCollection: () => queryCollection,
        readinessTimeoutMs: 25,
        runtime: { isBrowser: true },
      }
    );

    expect(result.health.current.status).toBe("connecting");

    vi.advanceTimersByTime(25);

    expect(result.health.current).toMatchObject({
      fallbackReason: "sync-readiness-timeout",
      source: "electric",
      status: "fallback-active",
    });
  });
});

function makeElectricError({
  kind,
  message = "sync failed",
  status,
}: {
  readonly kind: DataPlaneElectricSyncError["kind"];
  readonly message?: string | undefined;
  readonly status?: number | undefined;
}): DataPlaneElectricSyncError {
  return {
    kind,
    message,
    retryable: status === undefined || status >= 500,
    shapeName: "labels" satisfies SyncShapeName,
    ...(status === undefined ? {} : { status }),
  };
}

function makeElectricHealth(): DataPlaneCollectionHealth {
  return createDataPlaneCollectionHealth({
    collection: electricContract.collection,
    collectionId: electricContract.id,
    source: "electric",
    status: "connecting",
    subscriptionName: "labels",
  });
}

interface TestSubscription {
  readonly requestSnapshot: ReturnType<
    typeof vi.fn<(...args: unknown[]) => true>
  >;
  readonly unsubscribe: ReturnType<typeof vi.fn<() => void>>;
}

interface TestSubscribableCollection {
  entries: () => Iterable<[string, TestRow]>;
  subscribeChanges: (...args: unknown[]) => {
    requestSnapshot?: (...args: unknown[]) => unknown;
    unsubscribe: () => void;
  };
}

function readTestSubscription(collection: object): TestSubscribableCollection {
  return collection as TestSubscribableCollection;
}

function makeTestCollection(
  rows: readonly TestRow[],
  options: { readonly status?: string | undefined } = {}
) {
  let currentRows = [...rows];
  const subscriptions: TestSubscription[] = [];

  return {
    cleanup: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    entries: () => currentRows.map((row) => [row.id, row] as const).values(),
    id: "test-collection",
    keys: () => currentRows.map((row) => row.id).values(),
    preload: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    status: options.status ?? "ready",
    subscribeChanges: vi.fn<(..._args: unknown[]) => TestSubscription>(() => {
      const subscription = {
        requestSnapshot: vi.fn<(..._snapshotArgs: unknown[]) => true>(
          () => true
        ),
        unsubscribe: vi.fn<() => void>(),
      };
      subscriptions.push(subscription);

      return subscription;
    }),
    subscriptions,
    subscriberCount: 0,
    toArray: currentRows,
    utils: {
      writeBatch: (callback: () => void) => callback(),
      writeDelete: (key: string | string[]) => {
        const keys = new Set(Array.isArray(key) ? key : [key]);
        currentRows = currentRows.filter((row) => !keys.has(row.id));
      },
      writeUpsert: (data: TestRow | TestRow[]) => {
        const incomingRows = Array.isArray(data) ? data : [data];
        const nextRowsById = new Map(currentRows.map((row) => [row.id, row]));
        for (const row of incomingRows) {
          nextRowsById.set(row.id, row);
        }
        currentRows = [...nextRowsById.values()];
      },
    },
  };
}
