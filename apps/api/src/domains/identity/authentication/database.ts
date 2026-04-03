import * as PgDrizzle from "@effect/sql-drizzle/Pg";
import { PgClient } from "@effect/sql-pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import { Pool } from "pg";

import {
  authenticationDatabaseUrlConfig,
  DEFAULT_AUTH_DATABASE_URL,
  loadAuthenticationConfig,
} from "./config.js";
import { AuthenticationDatabaseConnectionError } from "./errors.js";
import { authSchema } from "./schema.js";

export interface AuthenticationDatabaseService {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof authSchema>;
}

export class AuthenticationDatabase extends Context.Tag(
  "@task-tracker/domains/identity/authentication/AuthenticationDatabase"
)<AuthenticationDatabase, AuthenticationDatabaseService>() {}

export const AuthenticationDatabaseLive = Layer.scoped(
  AuthenticationDatabase,
  Effect.gen(function* AuthenticationDatabaseLive() {
    const config = yield* loadAuthenticationConfig;

    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => new Pool({ connectionString: config.databaseUrl })),
      (poolInstance) => Effect.promise(() => poolInstance.end())
    );

    yield* Effect.tryPromise({
      try: () => pool.query("select 1"),
      catch: (cause) =>
        new AuthenticationDatabaseConnectionError({
          cause: cause instanceof Error ? cause.message : String(cause),
          message: "Failed to connect to the authentication database",
        }),
    });

    return {
      pool,
      db: drizzle(pool, { schema: authSchema }),
    };
  })
);

export const EffectSqlLive = PgClient.layerConfig(
  Config.all({
    url: authenticationDatabaseUrlConfig.pipe(
      Config.map((url) => Redacted.make(url)),
      Config.withDefault(Redacted.make(DEFAULT_AUTH_DATABASE_URL))
    ),
  })
);

const makeAuthenticationEffectDrizzle = PgDrizzle.make<typeof authSchema>({
  schema: authSchema,
});

export interface AuthenticationEffectDrizzleService {
  readonly db: Effect.Effect.Success<typeof makeAuthenticationEffectDrizzle>;
}

export const AuthenticationEffectDrizzle =
  Context.GenericTag<AuthenticationEffectDrizzleService>(
    "@task-tracker/domains/identity/authentication/AuthenticationEffectDrizzle"
  );

export const EffectDrizzleLive = Layer.effect(
  AuthenticationEffectDrizzle,
  makeAuthenticationEffectDrizzle.pipe(Effect.map((db) => ({ db })))
).pipe(Layer.provide(EffectSqlLive));
