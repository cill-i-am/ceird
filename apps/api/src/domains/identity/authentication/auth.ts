import { HttpApiBuilder, HttpApp } from "@effect/platform";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Context, Effect, Layer } from "effect";

import { loadAuthenticationConfig } from "./config.js";
import type { AuthenticationConfig } from "./config.js";
import {
  AuthenticationDatabase,
  AuthenticationDatabaseLive,
} from "./database.js";
import { authSchema } from "./schema.js";

export function createAuthentication(options: {
  readonly config: AuthenticationConfig;
  readonly database: NodePgDatabase<typeof authSchema>;
}) {
  const { config, database } = options;
  const { databaseUrl: _databaseUrl, ...authConfig } = config;

  return betterAuth({
    ...authConfig,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
  });
}

export type AuthenticationService = ReturnType<typeof createAuthentication>;

export class Authentication extends Context.Tag(
  "@task-tracker/domains/identity/authentication/Authentication"
)<Authentication, AuthenticationService>() {}

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* AuthenticationLive() {
    const config = yield* loadAuthenticationConfig;
    const { db } = yield* AuthenticationDatabase;

    return createAuthentication({
      config,
      database: db,
    });
  })
).pipe(Layer.provide(AuthenticationDatabaseLive));

export const AuthenticationHttpLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* mountAuthenticationHttp() {
    const auth = yield* Authentication;

    // Effect strips mount prefixes by default. Better Auth expects to receive
    // its configured basePath, so we preserve the full /api/auth prefix here.
    yield* router.mountApp("/api/auth", HttpApp.fromWebHandler(auth.handler), {
      includePrefix: true,
    });
  })
).pipe(Layer.provide(AuthenticationLive));
