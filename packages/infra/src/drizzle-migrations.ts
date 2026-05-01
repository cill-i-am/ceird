import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import type { Resource as AlchemyResource } from "alchemy/Resource";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { Pool } from "pg";

export interface DrizzleMigrationsProps {
  readonly databaseUrl: Redacted.Redacted<string>;
  readonly migrationsFolder: string;
  readonly runId: string;
}

export interface DrizzleMigrationsAttributes {
  readonly appliedAt: string;
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
      Effect.promise(() =>
        migrate(drizzle(pool), {
          migrationsFolder: input.migrationsFolder,
        })
      ),
    (pool) => Effect.promise(() => pool.end())
  );
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
      migrationsFolder: props.migrationsFolder,
      runId: props.runId,
    })
  );
}
