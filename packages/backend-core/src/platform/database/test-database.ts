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
  const migrationDirectory = await resolveMigrationDirectory();

  try {
    await applyMigrationWithPool(pool, migrationDirectory, migrationFileName);
  } finally {
    await pool.end();
  }
}

export async function applyAllMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const migrationDirectory = await resolveMigrationDirectory();

  try {
    for (const migrationFileName of await readMigrationFileNames(
      migrationDirectory
    )) {
      await applyMigrationWithPool(pool, migrationDirectory, migrationFileName);
    }
  } finally {
    await pool.end();
  }
}

async function readMigrationFileNames(
  migrationDirectory: string
): Promise<readonly string[]> {
  const journalPath = path.join(migrationDirectory, "meta", "_journal.json");
  const journal = JSON.parse(
    await fs.readFile(journalPath, "utf8")
  ) as DrizzleJournal;

  return journal.entries.map((entry) => `${entry.tag}.sql`);
}

async function applyMigrationWithPool(
  pool: Pool,
  migrationDirectory: string,
  migrationFileName: string
): Promise<void> {
  const migrationPath = path.join(migrationDirectory, migrationFileName);
  const migrationSql = await fs.readFile(migrationPath, "utf8");
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function resolveMigrationDirectory(): Promise<string> {
  const localDrizzleDirectory = path.resolve(process.cwd(), "drizzle");

  if (await isMigrationDirectory(localDrizzleDirectory)) {
    return localDrizzleDirectory;
  }

  let currentDirectory = process.cwd();

  while (true) {
    const candidate = path.join(currentDirectory, "apps", "api", "drizzle");

    if (await isMigrationDirectory(candidate)) {
      return candidate;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return localDrizzleDirectory;
    }

    currentDirectory = parentDirectory;
  }
}

async function isMigrationDirectory(directory: string): Promise<boolean> {
  try {
    await fs.access(path.join(directory, "meta", "_journal.json"));
    return true;
  } catch {
    return false;
  }
}
