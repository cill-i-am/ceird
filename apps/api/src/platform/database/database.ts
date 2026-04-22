import * as PgDrizzle from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";

import { authSchema } from "../../domains/identity/authentication/schema.js";
import { appDatabaseUrlConfig, DEFAULT_APP_DATABASE_URL } from "./config.js";
import { AppDatabaseConnectionError } from "./errors.js";
import { appSchema } from "./schema.js";

export interface AppDatabaseService {
  readonly authDb: NodePgDatabase<typeof authSchema>;
  readonly db: NodePgDatabase<typeof appSchema>;
  readonly pool: Pool;
}

export class AppDatabase extends Effect.Service<AppDatabase>()(
  "@task-tracker/platform/database/AppDatabase",
  {
    scoped: Effect.gen(function* AppDatabaseLiveEffect() {
      const databaseUrl = yield* appDatabaseUrlConfig;

      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: databaseUrl })),
        (poolInstance) => Effect.promise(() => poolInstance.end())
      );

      yield* Effect.tryPromise({
        try: () => pool.query("select 1"),
        catch: (cause) =>
          new AppDatabaseConnectionError({
            cause: cause instanceof Error ? cause.message : String(cause),
            message: "Failed to connect to the application database",
          }),
      });

      return {
        authDb: drizzle(pool, { schema: authSchema }),
        db: drizzle(pool, { schema: appSchema }),
        pool,
      };
    }),
  }
) {}

export const AppDatabaseLive = AppDatabase.Default;

export const AppEffectSqlLive = PgClient.layerConfig(
  Config.all({
    url: appDatabaseUrlConfig.pipe(
      Config.map((url) => Redacted.make(url)),
      Config.withDefault(Redacted.make(DEFAULT_APP_DATABASE_URL))
    ),
  })
);

const makeAppEffectDrizzle = PgDrizzle.make<typeof appSchema>({
  schema: appSchema,
});

export interface AppEffectDrizzleService {
  readonly db: Effect.Effect.Success<typeof makeAppEffectDrizzle>;
}

export const AppEffectDrizzle = Context.GenericTag<AppEffectDrizzleService>(
  "@task-tracker/platform/database/AppEffectDrizzle"
);

export const AppEffectDrizzleLive = Layer.effect(
  AppEffectDrizzle,
  makeAppEffectDrizzle.pipe(Effect.map((db) => ({ db })))
).pipe(Layer.provide(AppEffectSqlLive));
