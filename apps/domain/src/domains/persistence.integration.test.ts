import { afterAll, describe, expect, it } from "@effect/vitest";

import { databaseSchema } from "../platform/database/schema.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../platform/database/test-database.js";

describe("domain persistence", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const step of cleanup.toReversed()) {
      await step();
    }
  }, 30_000);

  it("keeps the schema barrel aligned to the narrowed product surface", () => {
    const tableNames = Object.keys(databaseSchema).join(" ");

    expect(tableNames).toContain("site");
    expect(tableNames).toContain("workItem");
    expect(tableNames).toContain("workItemLabel");
    expect(tableNames).toContain("siteLabel");
    expect(tableNames).toContain("workItemCollaborator");
    expect(tableNames).toContain("userPreferences");
  });

  it("applies migrations with retained Jobs V1 tables and removed scope absent", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "persistence_scope",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Persistence integration database unavailable; skipping migration coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    await withPool(testDatabase.url, async (pool) => {
      const retained = await pool.query<{ readonly table_name: string }>(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name = any($1::text[])
         order by table_name asc`,
        [
          [
            "comments",
            "labels",
            "sites",
            "site_labels",
            "user_preferences",
            "work_items",
            "work_item_activity",
            "work_item_collaborators",
            "work_item_labels",
            "work_item_visits",
          ],
        ]
      );
      expect(retained.rows.map((row) => row.table_name)).toStrictEqual([
        "comments",
        "labels",
        "site_labels",
        "sites",
        "user_preferences",
        "work_item_activity",
        "work_item_collaborators",
        "work_item_labels",
        "work_item_visits",
        "work_items",
      ]);

      const userPreferenceColumns = await pool.query<{
        readonly column_name: string;
        readonly data_type: string;
      }>(
        `select column_name, data_type
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'user_preferences'
         order by ordinal_position asc`
      );

      expect(userPreferenceColumns.rows).toStrictEqual([
        { column_name: "user_id", data_type: "text" },
        {
          column_name: "route_proximity_location_enabled",
          data_type: "boolean",
        },
        {
          column_name: "created_at",
          data_type: "timestamp with time zone",
        },
        {
          column_name: "updated_at",
          data_type: "timestamp with time zone",
        },
      ]);
    });
  }, 30_000);
});
