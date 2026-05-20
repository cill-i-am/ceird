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
    for (const migrationIdentifier of await readMigrationIdentifiers()) {
      await applyMigrationWithPool(pool, migrationIdentifier);
    }
  } finally {
    await pool.end();
  }
}

export async function readMigrationSql(
  migrationIdentifier: string
): Promise<string> {
  return await fs.readFile(
    await resolveMigrationPath(migrationIdentifier),
    "utf8"
  );
}

async function readMigrationIdentifiers(): Promise<readonly string[]> {
  const journalPath = path.resolve(
    process.cwd(),
    "drizzle",
    "meta",
    "_journal.json"
  );

  try {
    const journal = JSON.parse(
      await fs.readFile(journalPath, "utf8")
    ) as DrizzleJournal;

    return journal.entries.map((entry) => `${entry.tag}.sql`);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  return await readMigrationDirectoryNames();
}

async function applyMigrationWithPool(
  pool: Pool,
  migrationIdentifier: string
): Promise<void> {
  const migrationSql = await readMigrationSql(migrationIdentifier);
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function resolveMigrationPath(
  migrationIdentifier: string
): Promise<string> {
  const migrationsDirectory = path.resolve(process.cwd(), "drizzle");
  const directPath = path.resolve(migrationsDirectory, migrationIdentifier);

  if (await isFile(directPath)) {
    return directPath;
  }

  const directDirectoryMigrationPath = path.join(directPath, "migration.sql");
  if (await isFile(directDirectoryMigrationPath)) {
    return directDirectoryMigrationPath;
  }

  const legacyTag = migrationIdentifier.replace(/\.sql$/u, "");
  const migrationSlug = legacyTag.replace(/^\d+_/u, "");
  const migrationDirectoryNames = await readMigrationDirectoryNames();
  const matches = migrationDirectoryNames.filter(
    (directoryName) =>
      directoryName === legacyTag || directoryName.endsWith(`_${migrationSlug}`)
  );
  const [match] = matches;

  if (matches.length === 1 && match !== undefined) {
    return path.join(migrationsDirectory, match, "migration.sql");
  }

  throw new Error(
    `Unable to resolve migration "${migrationIdentifier}" from ${migrationsDirectory}`
  );
}

async function readMigrationDirectoryNames(): Promise<readonly string[]> {
  const migrationsDirectory = path.resolve(process.cwd(), "drizzle");
  const entries = await fs.readdir(migrationsDirectory, {
    withFileTypes: true,
  });
  const directoryNames = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const migrationPath = path.join(
          migrationsDirectory,
          entry.name,
          "migration.sql"
        );

        return (await isFile(migrationPath)) ? entry.name : null;
      })
  );

  return directoryNames
    .filter((name): name is string => name !== null)
    .toSorted();
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);

    return stats.isFile();
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
