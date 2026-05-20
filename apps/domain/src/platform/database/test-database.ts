import fs from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { DEFAULT_APP_DATABASE_URL } from "./config.js";

const UNAVAILABLE_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:1/test_database_unavailable";

export interface CreateTestDatabaseOptions {
  readonly baseUrl?: string;
  readonly prefix?: string;
}

export interface TestDatabaseEnvironment {
  readonly API_TEST_DATABASE_URL?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly TEST_DATABASE_URL?: string | undefined;
}

interface DrizzleJournal {
  readonly entries: readonly {
    readonly tag: string;
  }[];
}

export async function createTestDatabase(
  options: CreateTestDatabaseOptions = {}
): Promise<{
  readonly cleanup: () => Promise<void>;
  readonly url: string;
}> {
  const baseUrl = new URL(resolveTestDatabaseBaseUrl(options));
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";

  const databaseName = `${options.prefix ?? "app_test"}_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}`;
  const adminPool = new Pool({ connectionString: adminUrl.toString() });

  if (!(await canConnect(adminPool))) {
    await adminPool.end();

    return {
      cleanup: () => Promise.resolve(),
      // Fail closed so callers skip or fail rather than mutating a shared DB.
      url: UNAVAILABLE_TEST_DATABASE_URL,
    };
  }

  await adminPool.query(`create database "${databaseName}"`);
  await adminPool.end();

  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return {
    cleanup: async () => {
      const dropPool = new Pool({ connectionString: adminUrl.toString() });

      try {
        await dropPool.query(
          `select pg_terminate_backend(pid)
           from pg_stat_activity
           where datname = $1 and pid <> pg_backend_pid()`,
          [databaseName]
        );
        await dropPool.query(`drop database if exists "${databaseName}"`);
      } finally {
        await dropPool.end();
      }
    },
    url: databaseUrl.toString(),
  };
}

export function resolveTestDatabaseBaseUrl(
  options: CreateTestDatabaseOptions = {},
  environment: TestDatabaseEnvironment = process.env
): string {
  return (
    options.baseUrl ??
    environment.API_TEST_DATABASE_URL ??
    environment.TEST_DATABASE_URL ??
    environment.DATABASE_URL ??
    DEFAULT_APP_DATABASE_URL
  );
}

export async function canConnect(pool: Pool): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch {
    return false;
  }
}

export async function withPool<Result>(
  connectionString: string,
  operation: (pool: Pool) => Promise<Result>
): Promise<Result> {
  const pool = new Pool({ connectionString });

  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

export async function applyMigration(
  databaseUrl: string,
  migrationFileName: string
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await applyMigrationWithPool(pool, migrationFileName);
  } finally {
    await pool.end();
  }
}

export async function applyAllMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    for (const migrationPath of await readMigrationFilePaths()) {
      await applyMigrationWithPool(pool, migrationPath);
    }
  } finally {
    await pool.end();
  }
}

async function readMigrationFilePaths(): Promise<readonly string[]> {
  const journalPath = path.resolve(
    process.cwd(),
    "drizzle",
    "meta",
    "_journal.json"
  );
  const journal = await readJsonFile<DrizzleJournal>(journalPath);

  if (journal !== undefined) {
    return journal.entries.map((entry) =>
      path.resolve(process.cwd(), "drizzle", `${entry.tag}.sql`)
    );
  }

  const drizzlePath = path.resolve(process.cwd(), "drizzle");
  const entries = await fs.readdir(drizzlePath, { withFileTypes: true });

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name !== "alchemy" && entry.name !== "meta"
    )
    .map((entry) => path.resolve(drizzlePath, entry.name, "migration.sql"))
    .toSorted();
}

async function applyMigrationWithPool(
  pool: Pool,
  migrationFileNameOrPath: string
): Promise<void> {
  const migrationSql = await readMigrationSql(migrationFileNameOrPath);
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

export async function readMigrationSql(
  migrationFileNameOrPath: string
): Promise<string> {
  const migrationPath = path.isAbsolute(migrationFileNameOrPath)
    ? migrationFileNameOrPath
    : await resolveMigrationPath(migrationFileNameOrPath);

  return fs.readFile(migrationPath, "utf8");
}

export async function resolveMigrationPath(
  migrationFileName: string
): Promise<string> {
  const drizzlePath = path.resolve(process.cwd(), "drizzle");
  const flatPath = path.resolve(process.cwd(), "drizzle", migrationFileName);

  if (await fileExists(flatPath)) {
    return flatPath;
  }

  const migrationDirectory = migrationFileName.endsWith(".sql")
    ? migrationFileName.slice(0, -".sql".length)
    : migrationFileName;
  const folderPath = path.resolve(
    drizzlePath,
    migrationDirectory,
    "migration.sql"
  );

  if (await fileExists(folderPath)) {
    return folderPath;
  }

  const legacyTag = migrationDirectory.replace(/^\d+_/, "");
  const entries = await fs.readdir(drizzlePath, { withFileTypes: true });
  const timestampedDirectory = entries
    .filter((entry) => entry.isDirectory())
    .find((entry) => entry.name.endsWith(`_${legacyTag}`));

  if (timestampedDirectory !== undefined) {
    return path.resolve(
      drizzlePath,
      timestampedDirectory.name,
      "migration.sql"
    );
  }

  return folderPath;
}

async function readJsonFile<Value>(
  filePath: string
): Promise<Value | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Value;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
