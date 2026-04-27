import * as PgDrizzle from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";
import { Pool } from "pg";

import { authSchema } from "../../domains/identity/authentication/schema.js";
import { appDatabaseUrlConfig } from "./config.js";
import { AppDatabaseConnectionError } from "./errors.js";
import { appSchema } from "./schema.js";

export interface AppDatabaseService {
  readonly authDb: NodePgDatabase<typeof authSchema>;
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
        pool,
      };
    }),
  }
) {}

export const AppDatabaseLive = AppDatabase.Default;

export const AppEffectSqlLive = Layer.unwrapEffect(
  Effect.gen(function* AppEffectSqlLiveLayer() {
    const { pool } = yield* AppDatabase;

    return PgClient.layerFromPool({
      // AppDatabase owns the pool lifecycle; the SQL client only borrows it.
      acquire: Effect.acquireRelease(Effect.succeed(pool), () => Effect.void),
    });
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
);

export const makeAppEffectSqlRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) => AppEffectSqlLive.pipe(Layer.provideMerge(appDatabaseLive));

export const makeAppDatabaseRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) => {
  const appEffectSqlRuntimeLive = makeAppEffectSqlRuntimeLive(appDatabaseLive);

  return AppEffectDrizzleLive.pipe(Layer.provideMerge(appEffectSqlRuntimeLive));
};

export const AppEffectSqlRuntimeLive =
  makeAppEffectSqlRuntimeLive(AppDatabaseLive);

export const AppDatabaseRuntimeLive =
  makeAppDatabaseRuntimeLive(AppDatabaseLive);

export const AppEffectDrizzleRuntimeLive = AppDatabaseRuntimeLive;
