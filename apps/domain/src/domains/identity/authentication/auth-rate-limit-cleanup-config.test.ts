import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import {
  configProviderFromMap,
  effectEither,
} from "../../../test/effect-test-helpers.js";
import {
  DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  DEFAULT_AUTH_RATE_LIMIT_CLEANUP_ENABLED,
  DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
  DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
} from "./auth-rate-limit-cleanup.js";
import {
  loadAuthenticationConfig,
  makeAuthenticationConfig,
} from "./config.js";

describe("auth rate-limit cleanup config", () => {
  it("uses the approved cleanup defaults", () => {
    const config = makeAuthenticationConfig(makeBaseEnvironment());

    expect(config.rateLimitCleanup).toStrictEqual({
      batchSize: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE,
      enabled: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_ENABLED,
      maxBatches: DEFAULT_AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES,
      retentionHours: DEFAULT_AUTH_RATE_LIMIT_RETENTION_HOURS,
    });
  });

  it("loads cleanup settings from typed environment config", async () => {
    const config = await Effect.runPromise(
      loadAuthenticationConfig.pipe(
        Effect.provide(
          ConfigProvider.layer(
            configProviderFromMap(
              new Map([
                ["AUTH_APP_ORIGIN", "https://app.example.com"],
                ["AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE", "500"],
                ["AUTH_RATE_LIMIT_CLEANUP_ENABLED", "false"],
                ["AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES", "3"],
                ["AUTH_RATE_LIMIT_RETENTION_HOURS", "72"],
                ["BETTER_AUTH_BASE_URL", "https://api.example.com/api/auth"],
                ["BETTER_AUTH_SECRET", "0123456789abcdef0123456789abcdef"],
                [
                  "DATABASE_URL",
                  "postgresql://postgres:postgres@localhost:5432/app",
                ],
              ])
            )
          )
        )
      )
    );

    expect(config.rateLimitCleanup).toStrictEqual({
      batchSize: 500,
      enabled: false,
      maxBatches: 3,
      retentionHours: 72,
    });
  });

  it("rejects retention that is not greater than the largest configured limiter window", async () => {
    const result = await Effect.runPromise(
      loadAuthenticationConfig.pipe(
        Effect.provide(
          ConfigProvider.layer(
            configProviderFromMap(
              new Map([
                ["AUTH_APP_ORIGIN", "https://app.example.com"],
                ["AUTH_RATE_LIMIT_RETENTION_HOURS", "24"],
                ["BETTER_AUTH_BASE_URL", "https://api.example.com/api/auth"],
                ["BETTER_AUTH_SECRET", "0123456789abcdef0123456789abcdef"],
                [
                  "DATABASE_URL",
                  "postgresql://postgres:postgres@localhost:5432/app",
                ],
              ])
            )
          )
        ),
        effectEither
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }
    expect(String(result.left)).toContain(
      "AUTH_RATE_LIMIT_RETENTION_HOURS must be greater than 24"
    );
  });
});

function makeBaseEnvironment() {
  return {
    appOrigin: "https://app.example.com",
    baseUrl: "https://api.example.com/api/auth",
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/app",
    secret: "0123456789abcdef0123456789abcdef",
  };
}
