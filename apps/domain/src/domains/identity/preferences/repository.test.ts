import { decodeUserId } from "@ceird/identity-core";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "../../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../../platform/database/test-database.js";
import { UserPreferencesRepository } from "./repository.js";

describe("user preferences repository", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const step of cleanup.toReversed()) {
      await step();
    }
  }, 30_000);

  it("materializes missing rows with database-owned defaults", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "preferences_repository",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Preferences repository integration database unavailable; skipping materialization coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const userId = decodeUserId("user_preferences_repository_1");

    await withPool(testDatabase.url, async (pool) => {
      await pool.query(
        `insert into "user" (id, name, email)
         values ($1, $2, $3)`,
        [userId, "Preference Owner", "preferences-repository@example.com"]
      );
    });

    const live = UserPreferencesRepository.Default.pipe(
      Layer.provide(
        makeAppDatabaseRuntimeLive(makeAppDatabaseLive(testDatabase.url))
      )
    );

    const firstRead = await Effect.runPromise(
      UserPreferencesRepository.get(userId).pipe(Effect.provide(live))
    );
    const secondRead = await Effect.runPromise(
      UserPreferencesRepository.get(userId).pipe(Effect.provide(live))
    );

    expect(firstRead.routeProximityLocationEnabled).toBe(false);
    expect(firstRead.updatedAt).toMatch(/^20\d{2}-/u);
    expect(secondRead).toStrictEqual(firstRead);

    await withPool(testDatabase.url, async (pool) => {
      const rows = await pool.query<{
        readonly route_proximity_location_enabled: boolean;
        readonly updated_at: Date;
      }>(
        `select route_proximity_location_enabled, updated_at
         from user_preferences
         where user_id = $1`,
        [userId]
      );

      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]).toMatchObject({
        route_proximity_location_enabled: false,
      });
      expect(rows.rows[0]?.updated_at.toISOString()).toBe(firstRead.updatedAt);
    });
  }, 30_000);
});
