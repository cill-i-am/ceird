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
  return readMigrationSqlBySlug(domainDrizzleMigrationsDir, slug);
}

function readAlchemyMigrationSqlBySlug(slug: string): string {
  return readMigrationSqlBySlug(domainAlchemyDrizzleMigrationsDir, slug);
}

function readMigrationSqlBySlug(migrationsDir: string, slug: string): string {
  const migrationsDirectory = resolve(repoRoot, migrationsDir);
  const matches = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory() && entry.name.endsWith(`_${slug}`));
  const [match] = matches;

  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected exactly one migration in ${migrationsDir} ending in "_${slug}"`
    );
  }

  return readFileSync(
    join(migrationsDirectory, match.name, "migration.sql"),
    "utf8"
  );
}

function readLatestAlchemySnapshot(): unknown {
  const migrationsDirectory = resolve(
    repoRoot,
    domainAlchemyDrizzleMigrationsDir
  );
  let latestMigrationDir: string | undefined;
  for (const entry of readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || !/^\d+_/.test(entry.name)) {
      continue;
    }

    if (latestMigrationDir === undefined || entry.name > latestMigrationDir) {
      latestMigrationDir = entry.name;
    }
  }

  if (latestMigrationDir === undefined) {
    throw new Error("Expected at least one Alchemy migration snapshot");
  }

  return JSON.parse(
    readFileSync(
      join(migrationsDirectory, latestMigrationDir, "snapshot.json"),
      "utf8"
    )
  ) as unknown;
}

describe("Alchemy Drizzle integration", () => {
  it("can load the configured schema entry with plain Node like Alchemy Drizzle.Schema", () => {
    const schemaModule = loadConfiguredSchemaWithPlainNode();

    expect(schemaModule.exportNames).toStrictEqual(
      expect.arrayContaining([
        "authSecurityAuditEvent",
        "comment",
        "databaseSchema",
        "twoFactor",
        "workItem",
      ])
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
    const committedSnapshot = readLatestAlchemySnapshot();
    const pendingMigration = await drizzleKitApi.generateMigration(
      committedSnapshot,
      snapshot
    );
    const trgmMigrationSql = readDomainMigrationSqlBySlug("chunky_mercury");
    const agentMigrationSql = readDomainMigrationSqlBySlug("neat_skullbuster");
    const agentAlchemyMigrationSql =
      readAlchemyMigrationSqlBySlug("neat_skullbuster");
    const syncReviewMigrationSql = readDomainMigrationSqlBySlug(
      "sync_review_indexes"
    );
    const syncReviewAlchemyMigrationSql = readAlchemyMigrationSqlBySlug(
      "sync_review_indexes"
    );

    expect(drizzleKitApi.generateDrizzleJson).toStrictEqual(
      expect.any(Function)
    );
    expect(drizzleKitApi.generateMigration).toStrictEqual(expect.any(Function));
    expect(snapshot).toStrictEqual(expect.any(Object));
    expect(pendingMigration).toStrictEqual([]);
    expect(
      domainAlchemyDrizzleMigrationsDir.startsWith("apps/domain/drizzle/")
    ).toBe(false);
    expect(trgmMigrationSql).toContain(
      "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
    );
    expect(agentAlchemyMigrationSql).toBe(agentMigrationSql);
    expect(syncReviewAlchemyMigrationSql).toBe(syncReviewMigrationSql);
    expect(syncReviewMigrationSql).toContain(
      `CREATE INDEX "labels_organization_id_idx" ON "labels" USING btree ("organization_id");`
    );
  }, 15_000);
});
