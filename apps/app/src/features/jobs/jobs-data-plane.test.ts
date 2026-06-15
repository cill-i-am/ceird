import type { OrganizationId } from "@ceird/identity-core";
import type {
  JobListCursorType,
  JobListItem,
  JobListResponse,
} from "@ceird/jobs-core";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";

import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type { DataPlaneElectricSyncError } from "#/data-plane/electric-collection";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { getDataPlaneSessionKey } from "#/data-plane/session";

import {
  createJobsListSeed,
  createJobsListScope,
  getOrCreateJobsCollectionState,
  jobsCollectionId,
  jobsCollectionKey,
} from "./jobs-data-plane";

describe("jobs data plane", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const job = {
    assignees: [],
    contacts: [],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "job_123",
    kind: "job",
    labels: [],
    priority: "normal",
    status: "open",
    title: "Inspect boiler",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as JobListItem;

  it("uses organization scoped jobs collection identity", () => {
    expect(jobsCollectionKey(scope)).toStrictEqual([
      "jobs",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "list",
      "cursor",
      "initial",
      "limit",
      50,
      "status",
      "all",
      "assignee",
      "all",
      "coordinator",
      "all",
      "priority",
      "all",
      "label",
      "all",
      "site",
      "all",
      "search",
      "",
      "sort",
      "updated-desc",
    ]);
    expect(jobsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:jobs:list:cursor:initial:limit:50:status:all:assignee:all:coordinator:all:priority:all:label:all:site:all:search::sort:updated-desc"
    );
  });

  it("creates paged-query jobs seed envelopes for route loaders", () => {
    const response = {
      items: [job],
      nextCursor: "cursor-two" as JobListCursorType,
    } satisfies JobListResponse;
    const listScope = createJobsListScope({
      limit: 25,
      query: "boiler",
      status: "active",
    });

    expect(createJobsListSeed(scope, response, listScope, 1000)).toMatchObject({
      collection: "jobs",
      completeness: {
        filters: [
          { field: "status", operator: "eq", value: "active" },
          { field: "query", operator: "search", value: "boiler" },
        ],
        mode: "paged-query",
        page: {
          hasNextPage: true,
          limit: 25,
          type: "cursor",
        },
        queryName: "jobs.list",
      },
      data: [job],
      queryKey: jobsCollectionKey(scope, listScope),
      requestStartedAt: 1000,
    });
  });

  it("reuses collection state through the data-plane registry", () => {
    const queryClient = new QueryClient();
    const session = {
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateJobsCollectionState({
      initialJobs: [job],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });
    const second = getOrCreateJobsCollectionState({
      initialJobs: [],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });

    expect(first).toBe(second);
    expect(
      session.registry.has(
        jobsCollectionId(
          scope,
          createJobsListScope({ limit: 25, status: "active" })
        )
      )
    ).toBeTruthy();
    expect(getDataPlaneSessionKey(session.scope)).toBe(
      "organization:org_123:user:user_123:role:owner"
    );
  });

  it("keeps jobs on Query Collection by default even when sync origin is configured", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: jobsCollectionId(scope),
      fallbackReason: "sync-disabled",
      source: "query",
      status: "fallback-active",
    });
  });

  it("can opt the jobs canary into the public Sync Worker jobs shape", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(`${jobsCollectionId(scope)}:electric`);
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
  });

  it("falls back to loader-seeded Query data when VITE_SYNC_ORIGIN is missing", () => {
    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      disabledReason: "missing-sync-origin",
      fallbackReason: "missing-sync-origin",
      source: "electric",
      status: "fallback-active",
    });
  });

  it("does not create browser-only jobs Electric state during server render", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          isBrowser: false,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      disabledReason: "server-render",
      fallbackReason: "server-render",
      source: "electric",
      status: "fallback-active",
    });
  });

  it("keeps the jobs route collection usable when sync origin is unavailable", () => {
    const electricCollection = makeTestCollection([job], {
      id: `${jobsCollectionId(scope)}:electric`,
    });
    const health = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);

          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.codex.ceird.localhost/v1/shapes/jobs",
            status: "enabled",
          };
        },
        runtime: { isBrowser: true },
      },
    });

    const error = makeElectricError({
      kind: "server",
      message: "electric_container_unavailable",
      status: 503,
    });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(state.health.current).toMatchObject({
      fallbackReason: "sync-unavailable",
      lastError: {
        kind: "server",
        retryable: true,
        status: 503,
      },
      source: "electric",
      status: "fallback-active",
    });
    expect(state.collection.id).toBe(jobsCollectionId(scope));
  });

  it("reports jobs Electric initial readiness latency", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(11_000)
      .mockReturnValue(11_000);

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
          now,
        },
      },
    });

    readElectricLifecycle(state.collection).setStatus("loading");
    readElectricLifecycle(state.collection).markReady();

    expect(state.health.current).toMatchObject({
      initialReadyLatencyMs: 10_000,
      lastStatusChangeAtMs: 11_000,
      status: "ready",
    });
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

function readElectricLifecycle(collection: object) {
  return (
    collection as {
      readonly _lifecycle: {
        readonly markReady: () => void;
        readonly setStatus: (status: string) => void;
      };
    }
  )._lifecycle;
}

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
    shapeName: "jobs",
    ...(status === undefined ? {} : { status }),
  };
}

function makeTestCollection(
  rows: readonly JobListItem[],
  options: { readonly id: string }
) {
  let currentRows = [...rows];

  return {
    cleanup: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    entries: () =>
      currentRows
        .map((row) => [row.id, row] as [JobListItem["id"], JobListItem])
        .values(),
    id: options.id,
    keys: () => currentRows.map((row) => row.id).values(),
    preload: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    status: "ready",
    subscribeChanges: vi.fn<() => { unsubscribe: () => void }>(() => ({
      unsubscribe: vi.fn<() => void>(),
    })),
    subscriberCount: 0,
    get toArray() {
      return currentRows;
    },
    utils: {
      writeBatch: (callback: () => void) => callback(),
      writeDelete: (key: JobListItem["id"] | readonly JobListItem["id"][]) => {
        const keys = new Set(Array.isArray(key) ? key : [key]);
        currentRows = currentRows.filter((row) => !keys.has(row.id));
      },
      writeUpsert: (data: JobListItem | readonly JobListItem[]) => {
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
