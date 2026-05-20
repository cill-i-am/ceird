import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "@effect/vitest";

import {
  domainAlchemyDrizzleMigrationsDir,
  domainDrizzleMigrationsDir,
  domainDrizzleSchemaPath,
} from "./stages.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function loadConfiguredSchemaWithPlainNode() {
  const schemaUrl = pathToFileURL(
    realpathSync(resolve(repoRoot, domainDrizzleSchemaPath))
  ).href;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const schemaModule = await import(${JSON.stringify(schemaUrl)});
console.log(JSON.stringify({
  exportNames: Object.keys(schemaModule).sort(),
  tableCount: Object.keys(schemaModule.databaseSchema ?? {}).length
}));`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return JSON.parse(output.trim()) as {
    readonly exportNames: readonly string[];
    readonly tableCount: number;
  };
}

function readDomainMigrationSqlBySlug(slug: string): string {
  const migrationsDirectory = resolve(repoRoot, domainDrizzleMigrationsDir);
  const matches = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory() && entry.name.endsWith(`_${slug}`));
  const [match] = matches;

  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected exactly one domain migration ending in "_${slug}"`
    );
  }

  return readFileSync(
    join(migrationsDirectory, match.name, "migration.sql"),
    "utf8"
  );
}

describe("Alchemy Drizzle integration", () => {
  it("can load the configured schema entry with plain Node like Alchemy Drizzle.Schema", () => {
    const schemaModule = loadConfiguredSchemaWithPlainNode();

    expect(schemaModule.exportNames).toEqual(
      expect.arrayContaining(["comment", "databaseSchema", "workItem"])
    );
    expect(schemaModule.tableCount).toBeGreaterThan(0);
  });

  it("can load and inspect the API schema with the Drizzle Kit API used by Drizzle.Schema", async () => {
    const requireFromAlchemySchema = createRequire(
      realpathSync("node_modules/alchemy/lib/Drizzle/Schema.js")
    );
    const drizzleKitApiPath = requireFromAlchemySchema.resolve(
      "drizzle-kit/api-postgres"
    );
    const drizzleKitApi = await import(pathToFileURL(drizzleKitApiPath).href);
    const schemaModule = await import(
      pathToFileURL(realpathSync(resolve(repoRoot, domainDrizzleSchemaPath)))
        .href
    );
    const snapshot = await drizzleKitApi.generateDrizzleJson(schemaModule);
    const migrationDir = resolve(
      repoRoot,
      domainAlchemyDrizzleMigrationsDir,
      "00000000000000_baseline"
    );
    const committedSnapshot = JSON.parse(
      readFileSync(join(migrationDir, "snapshot.json"), "utf8")
    ) as unknown;
    const pendingMigration = await drizzleKitApi.generateMigration(
      committedSnapshot,
      snapshot
    );
    const trgmMigrationSql = readDomainMigrationSqlBySlug("chunky_mercury");

    expect(drizzleKitApi.generateDrizzleJson).toEqual(expect.any(Function));
    expect(drizzleKitApi.generateMigration).toEqual(expect.any(Function));
    expect(snapshot).toEqual(expect.any(Object));
    expect(pendingMigration).toStrictEqual([]);
    expect(trgmMigrationSql).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    );
  });
});
