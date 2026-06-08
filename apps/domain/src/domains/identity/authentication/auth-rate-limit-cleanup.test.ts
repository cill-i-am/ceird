import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import {
  cleanupRateLimitRowsWithDeleteBatch,
  DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
  DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
  RateLimitCleanupBatchFailed,
} from "./auth-rate-limit-cleanup.js";

describe("auth rate-limit cleanup", () => {
  const nowMs = Date.UTC(2026, 5, 8, 12, 0, 0);

  it("deletes expired rows in bounded batches until a short batch is returned", async () => {
    const deletedRowsByBatch = [1000, 400];
    const deleteBatch = vi.fn((_input: CleanupBatchInput) =>
      Effect.succeed(deletedRowsByBatch.shift() ?? 0)
    );

    const result = await Effect.runPromise(
      cleanupRateLimitRowsWithDeleteBatch({
        batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
        deleteBatch,
        maxBatches: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
        nowMs,
        retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
      })
    );

    const cutoffMs =
      nowMs - DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS * 60 * 60 * 1000;

    expect(result).toMatchObject({
      batchCount: 2,
      cutoffMs,
      deletedRows: 1400,
      retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(deleteBatch).toHaveBeenCalledTimes(2);
    expect(deleteBatch).toHaveBeenNthCalledWith(1, {
      batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
      cutoffMs,
    });
    expect(deleteBatch).toHaveBeenNthCalledWith(2, {
      batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
      cutoffMs,
    });
  });

  it("stops after the configured maximum batch count", async () => {
    const deleteBatch = vi.fn(() =>
      Effect.succeed(DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE)
    );

    const result = await Effect.runPromise(
      cleanupRateLimitRowsWithDeleteBatch({
        batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
        deleteBatch,
        maxBatches: 2,
        nowMs,
        retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
      })
    );

    expect(result).toMatchObject({
      batchCount: 2,
      deletedRows: 2000,
    });
    expect(deleteBatch).toHaveBeenCalledTimes(2);
  });

  it("returns partial progress when a later batch fails", async () => {
    const failure = new Error("database unavailable");
    const deleteBatch = vi
      .fn<(input: CleanupBatchInput) => Effect.Effect<number, Error>>()
      .mockReturnValueOnce(
        Effect.succeed(DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE)
      )
      .mockReturnValueOnce(Effect.fail(failure));

    const result = await Effect.runPromise(
      cleanupRateLimitRowsWithDeleteBatch({
        batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
        deleteBatch,
        maxBatches: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
        nowMs,
        retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
      }).pipe(Effect.result)
    );

    expect(result._tag).toBe("Failure");
    if (result._tag !== "Failure") {
      return;
    }

    expect(result.failure).toBeInstanceOf(RateLimitCleanupBatchFailed);
    expect(result.failure).toMatchObject({
      batchCount: 1,
      cause: "database unavailable",
      deletedRows: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
      retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
    });
    expect(deleteBatch).toHaveBeenCalledTimes(2);
  });
});

interface CleanupBatchInput {
  readonly batchSize: number;
  readonly cutoffMs: number;
}
