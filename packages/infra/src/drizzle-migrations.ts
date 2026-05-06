import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import type { Resource as AlchemyResource } from "alchemy/Resource";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { Pool } from "pg";

export interface DrizzleMigrationsProps {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly hyperdriveId: string;
  readonly migrationsFolder: string;
  readonly runId: string;
}

export interface DrizzleMigrationsAttributes {
  readonly appliedAt: string;
  readonly hyperdriveId: string;
  readonly migrationsFolder: string;
  readonly runId: string;
}

export type DrizzleMigrations = AlchemyResource<
  "Drizzle.Migrations",
  DrizzleMigrationsProps,
  DrizzleMigrationsAttributes
>;

export const DrizzleMigrations =
  Resource<DrizzleMigrations>("Drizzle.Migrations");

export const DrizzleMigrationsProvider = () =>
  Provider.succeed(DrizzleMigrations, {
    create: ({ news }) => applyMigrations(news),
    update: ({ news }) => applyMigrations(news),
    delete: () => Effect.void,
  });

export interface RunDrizzleMigrationsInput {
  readonly databaseUrl: string;
  readonly migrationsFolder: string;
}

const migrationRetrySchedule = Schedule.exponential("2 seconds").pipe(
  Schedule.take(5),
  Schedule.jittered
);

export function runDrizzleMigrations(input: RunDrizzleMigrationsInput) {
  return Effect.acquireUseRelease(
    Effect.sync(
      () =>
        new Pool({
          connectionString: input.databaseUrl,
          max: 1,
        })
    ),
    (pool) =>
      Effect.tryPromise({
        try: () =>
          migrate(drizzle(pool), {
            migrationsFolder: input.migrationsFolder,
          }),
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    (pool) => Effect.promise(() => pool.end())
  ).pipe(
    Effect.retry({
      schedule: migrationRetrySchedule,
      while: isTransientMigrationConnectionError,
    })
  );
}

export function isTransientMigrationConnectionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const normalized = message.toLowerCase();
  if (
    normalized.includes("remaining connection slots are reserved") ||
    normalized.includes("too many clients already")
  ) {
    return true;
  }

  if (error instanceof Error && "cause" in error && error.cause) {
    return isTransientMigrationConnectionError(error.cause);
  }

  return false;
}

function applyMigrations(
  props: DrizzleMigrationsProps
): Effect.Effect<DrizzleMigrationsAttributes> {
  return runDrizzleMigrations({
    databaseUrl: Redacted.value(props.databaseUrl),
    migrationsFolder: props.migrationsFolder,
  }).pipe(
    Effect.as({
      appliedAt: new Date().toISOString(),
      hyperdriveId: props.hyperdriveId,
      migrationsFolder: props.migrationsFolder,
      runId: props.runId,
    }),
    Effect.orDie
  );
}
