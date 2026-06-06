import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import {
  defaultWorkerAnalyticsSampleRate,
  makeWorkerObservabilityLive,
  normalizeWorkerAnalyticsPath,
  parseWorkerAnalyticsSampleRate,
  shouldSampleWorkerAnalytics,
  WorkerObservability,
  writeWorkerRequestAnalytics,
} from "./index.js";

describe("Worker observability", () => {
  it("parses bounded Analytics Engine sampling rates", () => {
    expect(parseWorkerAnalyticsSampleRate()).toBe(
      defaultWorkerAnalyticsSampleRate
    );
    expect(parseWorkerAnalyticsSampleRate("0")).toBe(0);
    expect(parseWorkerAnalyticsSampleRate("0.25")).toBe(0.25);
    expect(parseWorkerAnalyticsSampleRate("1")).toBe(1);
    expect(parseWorkerAnalyticsSampleRate("-0.1")).toBe(
      defaultWorkerAnalyticsSampleRate
    );
    expect(parseWorkerAnalyticsSampleRate("2")).toBe(
      defaultWorkerAnalyticsSampleRate
    );
    expect(parseWorkerAnalyticsSampleRate("nope")).toBe(
      defaultWorkerAnalyticsSampleRate
    );
    expect(parseWorkerAnalyticsSampleRate("0.25abc")).toBe(
      defaultWorkerAnalyticsSampleRate
    );
  });

  it("uses deterministic sampling for identical request seeds", () => {
    const first = shouldSampleWorkerAnalytics({
      sampleRate: 0.5,
      seed: "stage:api:GET:/jobs:request-1",
    });
    const second = shouldSampleWorkerAnalytics({
      sampleRate: 0.5,
      seed: "stage:api:GET:/jobs:request-1",
    });

    expect(second).toBe(first);
    expect(
      shouldSampleWorkerAnalytics({ sampleRate: 0, seed: "always-off" })
    ).toBe(false);
    expect(
      shouldSampleWorkerAnalytics({ sampleRate: 1, seed: "always-on" })
    ).toBe(true);
  });

  it("writes aggregate-safe request data points without throwing", () => {
    const writeDataPoint = vi.fn();

    expect(
      writeWorkerRequestAnalytics({
        adapter: "api",
        durationMs: 12.345,
        env: {
          ALCHEMY_STACK_NAME: "ceird",
          ALCHEMY_STAGE: "main",
          ANALYTICS: { writeDataPoint },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "1",
        },
        method: "GET",
        path: "/jobs",
        requestId: "request-1",
        status: 200,
      })
    ).toBe(true);

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["main:api"],
      blobs: ["main", "api", "GET", "/jobs", "2xx", "ceird"],
      doubles: [200, 12.35],
    });
  });

  it("treats Analytics Engine write failures as telemetry loss only", () => {
    expect(
      writeWorkerRequestAnalytics({
        adapter: "api",
        env: {
          ANALYTICS: {
            writeDataPoint: () => {
              throw new Error("analytics unavailable");
            },
          },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "1",
        },
        method: "GET",
        path: "/health",
        status: 200,
      })
    ).toBe(false);
  });

  it("records request analytics through an Effect service layer", async () => {
    const writeDataPoint = vi.fn();

    await Effect.runPromise(
      WorkerObservability.recordRequest({
        adapter: "api",
        durationMs: 20,
        method: "POST",
        path: "/jobs",
        requestId: "request-2",
        status: 201,
      }).pipe(
        Effect.provide(
          makeWorkerObservabilityLive({
            ALCHEMY_STACK_NAME: "ceird",
            ALCHEMY_STAGE: "main",
            ANALYTICS: { writeDataPoint },
            CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "1",
          })
        )
      )
    );

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["main:api"],
      blobs: ["main", "api", "POST", "/jobs", "2xx", "ceird"],
      doubles: [201, 20],
    });
  });

  it("normalizes high-cardinality path segments before writing analytics", () => {
    expect(
      normalizeWorkerAnalyticsPath(
        "/agents/ceird-agent/org%3Aorg_123%3Auser%3Auser_123%3Athread%3A11111111-1111-4111-8111-111111111111"
      )
    ).toBe("/agents/:agent/:instance");
    expect(normalizeWorkerAnalyticsPath("/jobs/123/activity")).toBe(
      "/jobs/:param/activity"
    );
    expect(
      normalizeWorkerAnalyticsPath(
        "/sites/11111111-1111-4111-8111-111111111111"
      )
    ).toBe("/sites/:param");
  });
});
