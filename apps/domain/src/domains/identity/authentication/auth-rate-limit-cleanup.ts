import { performance } from "node:perf_hooks";

import { Config, ConfigProvider, Effect, Result, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { sanitizeProviderErrorMessage } from "./auth-email-transport-helpers.js";

export const DEFAULT_AUTH_RATE_LIMIT_CLEANUP_ENABLED = true;
export const DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS = 48;
export const DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE = 1000;
export const DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES = 10;
export const AUTH_RATE_LIMIT_MAX_CONFIGURED_WINDOW_HOURS = 24;
export const AUTH_RATE_LIMIT_CLEANUP_FAILED_SIGNAL =
  "rate_limit_cleanup_failed" as const;

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface RateLimitCleanupConfig {
  readonly batchSize: number;
  readonly enabled: boolean;
  readonly maxBatches: number;
  readonly retentionHours: number;
}

export interface RateLimitCleanupResult {
  readonly batchCount: number;
  readonly cutoffMs: number;
  readonly deletedRows: number;
  readonly durationMs: number;
  readonly retentionHours: number;
}

export interface RateLimitCleanupBatchInput {
  readonly batchSize: number;
  readonly cutoffMs: number;
}

interface RateLimitCleanupRow {
  readonly id: string;
}

export class RateLimitCleanupBatchFailed extends Schema.TaggedErrorClass<RateLimitCleanupBatchFailed>()(
  "@ceird/domain/auth/RateLimitCleanupBatchFailed",
  {
    batchCount: Schema.Number,
    cause: Schema.String,
    cutoffMs: Schema.Number,
    deletedRows: Schema.Number,
    message: Schema.String,
    retentionHours: Schema.Number,
  }
) {}

export function makeRateLimitCleanupConfig(
  input: Partial<RateLimitCleanupConfig> = {}
): RateLimitCleanupConfig {
  const config = {
    batchSize: input.batchSize ?? DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
    enabled: input.enabled ?? DEFAULT_AUTH_RATE_LIMIT_CLEANUP_ENABLED,
    maxBatches: input.maxBatches ?? DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
    retentionHours:
      input.retentionHours ?? DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
  } satisfies RateLimitCleanupConfig;

  validateRateLimitCleanupConfig(config);

  return config;
}

export function validateRateLimitCleanupConfig(config: RateLimitCleanupConfig) {
  if (!Number.isInteger(config.retentionHours) || config.retentionHours <= 0) {
    throw new Error(
      "AUTH_RATE_LIMIT_RETENTION_HOURS must be a positive integer"
    );
  }

  if (config.retentionHours <= AUTH_RATE_LIMIT_MAX_CONFIGURED_WINDOW_HOURS) {
    throw new Error(
      `AUTH_RATE_LIMIT_RETENTION_HOURS must be greater than ${AUTH_RATE_LIMIT_MAX_CONFIGURED_WINDOW_HOURS} hours`
    );
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize <= 0) {
    throw new Error(
      "AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE must be a positive integer"
    );
  }

  if (!Number.isInteger(config.maxBatches) || config.maxBatches <= 0) {
    throw new Error(
      "AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES must be a positive integer"
    );
  }
}

export const loadRateLimitCleanupConfig = Effect.gen(
  function* loadRateLimitCleanupConfig() {
    const enabled = yield* Config.boolean(
      "AUTH_RATE_LIMIT_CLEANUP_ENABLED"
    ).pipe(Config.withDefault(DEFAULT_AUTH_RATE_LIMIT_CLEANUP_ENABLED));
    const retentionHours = yield* Config.int(
      "AUTH_RATE_LIMIT_RETENTION_HOURS"
    ).pipe(Config.withDefault(DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS));
    const batchSize = yield* Config.int(
      "AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE"
    ).pipe(Config.withDefault(DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE));
    const maxBatches = yield* Config.int(
      "AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES"
    ).pipe(Config.withDefault(DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES));
    const config = {
      batchSize,
      enabled,
      maxBatches,
      retentionHours,
    } satisfies RateLimitCleanupConfig;

    yield* Effect.try({
      catch: (cause) =>
        new Config.ConfigError(
          new ConfigProvider.SourceError({
            message: cause instanceof Error ? cause.message : String(cause),
          })
        ),
      try: () => validateRateLimitCleanupConfig(config),
    });

    return config;
  }
);

export const cleanupRateLimitRowsWithDeleteBatch = Effect.fn(
  "AuthRateLimitCleanup.cleanupWithDeleteBatch"
)(function* <Error, Requirements>(input: {
  readonly batchSize: number;
  readonly deleteBatch: (
    batch: RateLimitCleanupBatchInput
  ) => Effect.Effect<number, Error, Requirements>;
  readonly maxBatches: number;
  readonly nowMs?: number | undefined;
  readonly retentionHours: number;
}) {
  const startedAt = performance.now();
  const nowMs = input.nowMs ?? Date.now();
  const cutoffMs = nowMs - input.retentionHours * MILLISECONDS_PER_HOUR;
  let deletedRows = 0;
  let batchCount = 0;

  for (let batchIndex = 0; batchIndex < input.maxBatches; batchIndex += 1) {
    const batchResult = yield* input
      .deleteBatch({
        batchSize: input.batchSize,
        cutoffMs,
      })
      .pipe(Effect.result);

    if (Result.isFailure(batchResult)) {
      return yield* Effect.fail(
        new RateLimitCleanupBatchFailed({
          batchCount,
          cause: serializeCleanupFailureCause(batchResult.failure),
          cutoffMs,
          deletedRows,
          message: "Auth rate-limit cleanup batch failed",
          retentionHours: input.retentionHours,
        })
      );
    }

    const batchDeletedRows = batchResult.success;

    batchCount += 1;
    deletedRows += batchDeletedRows;

    if (batchDeletedRows < input.batchSize) {
      break;
    }
  }

  return {
    batchCount,
    cutoffMs,
    deletedRows,
    durationMs: roundDurationMs(performance.now() - startedAt),
    retentionHours: input.retentionHours,
  } satisfies RateLimitCleanupResult;
});

export const cleanupRateLimitRows = Effect.fn("AuthRateLimitCleanup.cleanup")(
  function* (config: RateLimitCleanupConfig) {
    return yield* cleanupRateLimitRowsWithDeleteBatch({
      batchSize: config.batchSize,
      deleteBatch: deleteExpiredRateLimitBatch,
      maxBatches: config.maxBatches,
      retentionHours: config.retentionHours,
    });
  }
);

export const deleteExpiredRateLimitBatch = Effect.fn(
  "AuthRateLimitCleanup.deleteExpiredBatch"
)(function* (input: RateLimitCleanupBatchInput) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<RateLimitCleanupRow>`
    with victims as (
      select id
      from rate_limit
      where last_request < ${input.cutoffMs}
      order by last_request, id
      for update skip locked
      limit ${input.batchSize}
    )
    delete from rate_limit
    using victims
    where rate_limit.id = victims.id
    returning rate_limit.id
  `;

  return rows.length;
});

function serializeCleanupFailureCause(cause: unknown) {
  return sanitizeProviderErrorMessage(
    cause instanceof Error ? cause.message : String(cause)
  );
}

function roundDurationMs(value: number) {
  return Math.round(value * 100) / 100;
}
