import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect, Layer, Redacted } from "effect";
import type { Pool } from "pg";

import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  AppDatabase,
  AppEffectSqlLive,
  makeAppDatabaseRuntimeLive,
} from "./database.js";

const IMPOSSIBLE_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:1/should-not-be-used";
const SHARED_POOL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/ceird_shared_pool";

describe("shared app database effect layers", () => {
  it("does not run a database round trip when constructing AppDatabase", async () => {
    vi.resetModules();

    const pool = {
      connect: vi.fn<() => void>(),
      end: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      ending: false,
      on: vi.fn<() => void>(),
      options: {
        application_name: "@ceird/test",
        connectionString: SHARED_POOL_DATABASE_URL,
      },
      query: vi.fn<() => Promise<{ readonly rows: readonly unknown[] }>>(() =>
        Promise.resolve({ rows: [{ one: 1 }] })
      ),
    } as unknown as Pool;
    const PoolMock = vi.fn<() => Pool>(() => pool) as unknown as typeof Pool;

    vi.doMock(import("pg"), () => ({ Pool: PoolMock }));

    try {
      const databaseModule = await import("./database.js");

      const database = await Effect.runPromise(
        Effect.scoped(
          databaseModule.AppDatabase.pipe(
            Effect.provide(
              databaseModule.makeAppDatabaseLive(SHARED_POOL_DATABASE_URL)
            )
          )
        )
      );

      expect(database.pool).toBe(pool);
      expect(PoolMock).toHaveBeenCalledWith({
        application_name: "ceird-domain",
        connectionString: SHARED_POOL_DATABASE_URL,
        connectionTimeoutMillis: 5000,
        idle_in_transaction_session_timeout: 10_000,
        idleTimeoutMillis: 5000,
        max: 1,
        query_timeout: 30_000,
        statement_timeout: 30_000,
      });
      expect(pool.query).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("pg");
      vi.resetModules();
    }
  }, 10_000);

  it("builds the Effect SQL client from AppDatabase.pool", async () => {
    const client = await Effect.runPromise(
      Effect.scoped(
        PgClient.PgClient.pipe(
          Effect.provide(
            AppEffectSqlLive.pipe(
              Layer.provide(makeTestAppDatabaseLayer(makeTestPool()))
            )
          ),
          withConfigProvider(makeConfigProvider())
        )
      )
    );

    const databaseUrl = client.config.url
      ? Redacted.value(client.config.url)
      : undefined;

    expect(databaseUrl).toBe(SHARED_POOL_DATABASE_URL);
  }, 10_000);

  it("builds the runtime database layers from the shared AppDatabase layer", async () => {
    const pool = makeTestPool();
    const services = await Effect.runPromise(
      Effect.scoped(
        Effect.all({
          appDatabase: AppDatabase,
          sqlClient: PgClient.PgClient,
        }).pipe(
          Effect.provide(
            makeAppDatabaseRuntimeLive(makeTestAppDatabaseLayer(pool))
          ),
          withConfigProvider(makeConfigProvider())
        )
      )
    );

    const databaseUrl = services.sqlClient.config.url
      ? Redacted.value(services.sqlClient.config.url)
      : undefined;

    expect(services.appDatabase.pool).toBe(pool);
    expect(databaseUrl).toBe(SHARED_POOL_DATABASE_URL);
  }, 10_000);
});

function makeConfigProvider() {
  return configProviderFromMap(
    new Map([["DATABASE_URL", IMPOSSIBLE_DATABASE_URL]])
  );
}

function makeTestAppDatabaseLayer(pool: Pool) {
  return Layer.succeed(
    AppDatabase,
    AppDatabase.of({
      authDb: drizzle({ client: pool }),
      pool,
    })
  );
}

function makeTestPool(): Pool {
  return {
    connect: vi.fn<() => void>(),
    ending: false,
    on: vi.fn<() => void>(),
    options: {
      application_name: "@ceird/test",
      connectionString: SHARED_POOL_DATABASE_URL,
    },
    query: vi.fn<() => void>(),
  } as unknown as Pool;
}
