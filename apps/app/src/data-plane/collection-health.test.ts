import { describe, expect, it, vi } from "vitest";

import {
  createDataPlaneCollectionHealth,
  markDataPlaneCollectionFallbackActive,
} from "./collection-health";

describe("data-plane collection health", () => {
  it("records slow initial readiness latency per collection", () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(24_000)
      .mockReturnValue(24_000);
    const health = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: "organization:org_123:user:user_123:role:owner:jobs",
      now,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });

    const ready = health.markReady();
    const readyAgain = health.markReady();

    expect(ready).toStrictEqual({
      collection: "jobs",
      collectionId: "organization:org_123:user:user_123:role:owner:jobs",
      initialReadyLatencyMs: 23_000,
      lastStatusChangeAtMs: 24_000,
      recoveryAttempts: 0,
      source: "electric",
      startedAtMs: 1000,
      status: "ready",
      subscriptionName: "jobs",
    });
    expect(readyAgain.initialReadyLatencyMs).toBe(23_000);
  });

  it("records unavailable sync origin and recovery attempts without raw internals", () => {
    const now = vi.fn<() => number>().mockReturnValue(2000);
    const health = createDataPlaneCollectionHealth({
      collection: "sites",
      collectionId: "organization:org_123:user:user_123:role:owner:sites",
      now,
      source: "electric",
      status: "connecting",
      subscriptionName: "sites",
    });

    const unavailable = health.markUnavailable({
      kind: "server",
      message: "Sync origin is unavailable with status 503.",
      retryable: true,
      status: 503,
    });

    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.recoveryAttempts).toBe(1);
    expect(unavailable.lastError).toStrictEqual({
      kind: "server",
      message: "Sync origin is unavailable with status 503.",
      retryable: true,
      status: 503,
    });
    expect(unavailable.lastError).not.toHaveProperty("cause");
    expect(unavailable.lastError).not.toHaveProperty("url");
  });

  it("records retrying sync origin errors without demoting ready collections", () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(3000)
      .mockReturnValue(3000);
    const health = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: "organization:org_123:user:user_123:role:owner:jobs",
      now,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });

    health.markReady();
    const retrying = health.markRetrying({
      kind: "server",
      message: "Sync origin is unavailable with status 503.",
      retryable: true,
      status: 503,
    });

    expect(retrying).toStrictEqual({
      collection: "jobs",
      collectionId: "organization:org_123:user:user_123:role:owner:jobs",
      initialReadyLatencyMs: 1000,
      lastError: {
        kind: "server",
        message: "Sync origin is unavailable with status 503.",
        retryable: true,
        status: 503,
      },
      lastStatusChangeAtMs: 3000,
      recoveryAttempts: 1,
      source: "electric",
      startedAtMs: 1000,
      status: "ready",
      subscriptionName: "jobs",
    });
  });

  it("lets Query Collection fallback consume the same status surface", () => {
    const health = createDataPlaneCollectionHealth({
      collection: "labels",
      collectionId: "organization:org_123:user:user_123:role:owner:labels",
      source: "electric",
      status: "unavailable",
      subscriptionName: "labels",
    });

    const fallback = markDataPlaneCollectionFallbackActive(health, {
      reason: "query-collection",
    });

    expect(fallback.status).toBe("fallback-active");
    expect(fallback.fallbackReason).toBe("query-collection");
  });
});
