/* eslint-disable max-classes-per-file */
import { performance } from "node:perf_hooks";

import { PgClient } from "@effect/sql-pg";
import { defineRelations } from "drizzle-orm";
import {
  EffectDrizzleQueryError,
  EffectTransactionRollbackError,
} from "drizzle-orm/effect-core";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";
import { SqlError } from "effect/unstable/sql";
import { Pool } from "pg";
import type { PoolConfig } from "pg";

import {
  makePlatformRequestLogAnnotations,
  readCurrentPlatformRequestObservation,
  recordPlatformRequestAnnotation,
} from "../request-observability.js";
import { nodeDatabaseUrl } from "./database-url.js";
import { databaseSchema } from "./schema.js";

export interface AppDatabaseService {
  readonly authDb: NodePgDatabase;
  readonly pool: Pool;
}

const domainRelations = defineRelations(databaseSchema);

export type DomainDrizzleDatabase = PgDrizzle.EffectPgDatabase<
  typeof domainRelations
> & {
  readonly $client: PgClient.PgClient;
};

export interface DomainDrizzleService {
  readonly db: DomainDrizzleDatabase;
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

export const DomainDrizzle = Context.Service<DomainDrizzleService>(
  "@ceird/platform/database/DomainDrizzle"
);

export const DomainDrizzleLive = Layer.effect(
  DomainDrizzle,
  Effect.gen(function* DomainDrizzleLiveEffect() {
    const db = yield* PgDrizzle.makeWithDefaults({
      relations: domainRelations,
    });

    return DomainDrizzle.of({ db });
  })
);

export const makeAppEffectSqlRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) =>
  Layer.mergeAll(
    appDatabaseLive,
    AppEffectSqlLive.pipe(Layer.provide(appDatabaseLive)),
    DomainDrizzleLive.pipe(
      Layer.provide(AppEffectSqlLive.pipe(Layer.provide(appDatabaseLive)))
    )
  );

export const makeAppDatabaseRuntimeLive = <Error, Requirements>(
  appDatabaseLive: Layer.Layer<AppDatabase, Error, Requirements>
) => makeAppEffectSqlRuntimeLive(appDatabaseLive);

export const AppEffectSqlRuntimeLive =
  makeAppEffectSqlRuntimeLive(AppDatabaseLive);

export const AppDatabaseRuntimeLive =
  makeAppDatabaseRuntimeLive(AppDatabaseLive);

export type DomainDrizzleStorageFailure =
  | EffectDrizzleQueryError
  | EffectTransactionRollbackError
  | SqlError.SqlError;

export function isDomainDrizzleStorageFailure(
  error: unknown
): error is DomainDrizzleStorageFailure {
  return (
    error instanceof EffectDrizzleQueryError ||
    error instanceof EffectTransactionRollbackError ||
    error instanceof SqlError.SqlError
  );
}

export function describeDomainStorageFailure(error: unknown) {
  if (error instanceof EffectDrizzleQueryError) {
    return `Drizzle query failed: ${error.message}`;
  }

  if (error instanceof EffectTransactionRollbackError) {
    return "Drizzle transaction rolled back";
  }

  if (error instanceof SqlError.SqlError) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

function roundDurationMs(value: number) {
  return Math.round(value * 100) / 100;
}

function makeCurrentRequestLogAnnotations() {
  const observation = readCurrentPlatformRequestObservation();

  return observation === undefined
    ? {}
    : makePlatformRequestLogAnnotations(observation);
}
