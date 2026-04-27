import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";
import type { Pool } from "pg";

import { authSchema } from "../../domains/identity/authentication/schema.js";
import {
  AppDatabase,
  AppEffectDrizzle,
  AppEffectSqlLive,
  makeAppDatabaseRuntimeLive,
} from "./database.js";

const IMPOSSIBLE_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:1/should-not-be-used";
const SHARED_POOL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/task_tracker_shared_pool";

describe("shared app database effect layers", () => {
  it("builds the Effect SQL client from AppDatabase.pool", async () => {
    const client = await Effect.runPromise(
      Effect.scoped(
        PgClient.PgClient.pipe(
          Effect.provide(
            AppEffectSqlLive.pipe(
              Layer.provide(makeTestAppDatabaseLayer(makeTestPool()))
            )
          ),
          Effect.withConfigProvider(makeConfigProvider())
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
          drizzle: AppEffectDrizzle,
          sqlClient: PgClient.PgClient,
        }).pipe(
          Effect.provide(
            makeAppDatabaseRuntimeLive(makeTestAppDatabaseLayer(pool))
          ),
          Effect.withConfigProvider(makeConfigProvider())
        )
      )
    );

    const databaseUrl = services.sqlClient.config.url
      ? Redacted.value(services.sqlClient.config.url)
      : undefined;

    expect(services.appDatabase.pool).toBe(pool);
    expect(services.drizzle.db).toBeDefined();
    expect(databaseUrl).toBe(SHARED_POOL_DATABASE_URL);
  }, 10_000);
});

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([["DATABASE_URL", IMPOSSIBLE_DATABASE_URL]])
  );
}

function makeTestAppDatabaseLayer(pool: Pool) {
  return Layer.succeed(
    AppDatabase,
    AppDatabase.make({
      authDb: drizzle(pool, { schema: authSchema }),
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
      application_name: "@task-tracker/test",
      connectionString: SHARED_POOL_DATABASE_URL,
    },
    query: vi.fn<() => void>(),
  } as unknown as Pool;
}
