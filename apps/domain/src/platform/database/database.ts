/* eslint-disable max-classes-per-file */
import { performance } from "node:perf_hooks";

import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";
import { Pool } from "pg";
import type { PoolConfig } from "pg";

import {
  makePlatformRequestLogAnnotations,
  readCurrentPlatformRequestObservation,
  recordPlatformRequestAnnotation,
} from "../request-observability.js";
import { nodeDatabaseUrl } from "./database-url.js";

export interface AppDatabaseService {
  readonly authDb: NodePgDatabase;
  readonly pool: Pool;
}

export class AppDatabaseUrl extends Context.Service<AppDatabaseUrl, string>()(
  "@ceird/platform/database/AppDatabaseUrl"
) {}

export const AppDatabaseUrlLive = Layer.effect(AppDatabaseUrl, nodeDatabaseUrl);

const APP_DATABASE_POOL_OPTIONS = {
  application_name: "ceird-domain",
  connectionTimeoutMillis: 5000,
  idle_in_transaction_session_timeout: 10_000,
  idleTimeoutMillis: 5000,
  max: 1,
  query_timeout: 30_000,
  statement_timeout: 30_000,
} as const satisfies PoolConfig;

export class AppDatabase extends Context.Service<AppDatabase>()(
  "@ceird/platform/database/AppDatabase",
  {
    make: Effect.gen(function* AppDatabaseLiveEffect() {
      const databaseUrl = yield* AppDatabaseUrl;
      const initializedAt = performance.now();

      const pool = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new Pool({
              connectionString: databaseUrl,
              ...APP_DATABASE_POOL_OPTIONS,
            })
        ),
        (poolInstance) => Effect.promise(() => poolInstance.end())
      );
      const authDb = drizzle({ client: pool });
      const dbInitMs = roundDurationMs(performance.now() - initializedAt);

      recordPlatformRequestAnnotation("db.initMs", dbInitMs);
      recordPlatformRequestAnnotation("db.preflightQuery", false);

      yield* Effect.logInfo("App database initialized").pipe(
        Effect.annotateLogs({
          ...makeCurrentRequestLogAnnotations(),
          "db.initMs": dbInitMs,
          "db.preflightQuery": false,
        })
      );

      return {
        authDb,
        pool,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    AppDatabase,
    AppDatabase.make
  );
  static readonly Default = AppDatabase.DefaultWithoutDependencies;
}

export const AppDatabaseLive = AppDatabase.Default.pipe(
  Layer.provide(AppDatabaseUrlLive)
);

export const makeAppDatabaseLive = (databaseUrl: string) =>
  AppDatabase.Default.pipe(
    Layer.provide(Layer.succeed(AppDatabaseUrl, databaseUrl))
  );

export const AppEffectSqlLive = Layer.unwrap(
  Effect.gen(function* AppEffectSqlLiveLayer() {
    const { pool } = yield* AppDatabase;

    return PgClient.layerFrom(
      PgClient.fromPool({
        // AppDatabase owns the pool lifecycle; the SQL client only borrows it.
        acquire: Effect.acquireRelease(Effect.succeed(pool), () => Effect.void),
      })
    );
  })
);

export const makeAppEffectSqlRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) =>
  Layer.mergeAll(
    appDatabaseLive,
    AppEffectSqlLive.pipe(Layer.provide(appDatabaseLive))
  );

export const makeAppDatabaseRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) => makeAppEffectSqlRuntimeLive(appDatabaseLive);

export const AppEffectSqlRuntimeLive =
  makeAppEffectSqlRuntimeLive(AppDatabaseLive);

export const AppDatabaseRuntimeLive =
  makeAppDatabaseRuntimeLive(AppDatabaseLive);

function roundDurationMs(value: number) {
  return Math.round(value * 100) / 100;
}

function makeCurrentRequestLogAnnotations() {
  const observation = readCurrentPlatformRequestObservation();

  return observation === undefined
    ? {}
    : makePlatformRequestLogAnnotations(observation);
}
