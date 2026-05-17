import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";

import {
  apiAlchemyDrizzleMigrationsDir,
  apiDrizzleMigrationsDir,
  apiDrizzleSchemaPath,
} from "./stages.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("Alchemy Drizzle integration", () => {
  it("can load and inspect the API schema with the Drizzle Kit API used by Drizzle.Schema", async () => {
    const requireFromAlchemySchema = createRequire(
      realpathSync("node_modules/alchemy/lib/Drizzle/Schema.js")
    );
    const drizzleKitApiPath = requireFromAlchemySchema.resolve(
      "drizzle-kit/api-postgres"
    );
    const drizzleKitApi = await import(pathToFileURL(drizzleKitApiPath).href);
    const schemaModule = await import(
      pathToFileURL(realpathSync(resolve(repoRoot, apiDrizzleSchemaPath))).href
    );
    const snapshot = await drizzleKitApi.generateDrizzleJson(schemaModule);
    const migrationDir = resolve(
      repoRoot,
      apiAlchemyDrizzleMigrationsDir,
      "00000000000000_baseline"
    );
    const committedSnapshot = JSON.parse(
      readFileSync(join(migrationDir, "snapshot.json"), "utf8")
    ) as unknown;
    const pendingMigration = await drizzleKitApi.generateMigration(
      committedSnapshot,
      snapshot
    );
    const trgmMigrationSql = readFileSync(
      resolve(repoRoot, apiDrizzleMigrationsDir, "0012_chunky_mercury.sql"),
      "utf8"
    );

    expect(drizzleKitApi.generateDrizzleJson).toEqual(expect.any(Function));
    expect(drizzleKitApi.generateMigration).toEqual(expect.any(Function));
    expect(snapshot).toEqual(expect.any(Object));
    expect(pendingMigration).toStrictEqual([]);
    expect(trgmMigrationSql).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    );
  });
});
