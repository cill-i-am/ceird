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

function matchesTrustedOrigin(
  origin: string,
  trustedOrigins: readonly string[]
) {
  return trustedOrigins.some((pattern) => {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      return pattern === origin;
    }

    const escapedPattern = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
    const matcher = escapedPattern
      .replaceAll("\\*", ".*")
      .replaceAll("\\?", ".");

    return new RegExp(`^${matcher}$`).test(origin);
  });
}

function appendVaryHeader(headers: Headers, value: string) {
  const current = headers.get("Vary");

  if (!current) {
    headers.set("Vary", value);
    return;
  }

  const values = new Set([
    ...current
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
    value,
  ]);
  headers.set("Vary", [...values].join(", "));
}

function withAuthenticationCors(
  handler: (request: Request) => Promise<Response>,
  trustedOrigins: readonly string[]
) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const isTrustedOrigin =
      typeof origin === "string" &&
      matchesTrustedOrigin(origin, trustedOrigins);

    if (request.method === "OPTIONS") {
      if (!isTrustedOrigin) {
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Headers":
            request.headers.get("access-control-request-headers") ??
            "content-type",
          "Access-Control-Allow-Methods":
            request.headers.get("access-control-request-method") ??
            "GET, POST, OPTIONS",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Max-Age": "600",
        },
      });

      appendVaryHeader(response.headers, "Origin");
      appendVaryHeader(response.headers, "Access-Control-Request-Headers");

      return response;
    }

    const response = await handler(request);

    if (!isTrustedOrigin) {
      return response;
    }

    const corsResponse = new Response(response.body, response);
    corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
    corsResponse.headers.set("Access-Control-Allow-Origin", origin);
    appendVaryHeader(corsResponse.headers, "Origin");

    return corsResponse;
  };
}

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
    const config = yield* loadAuthenticationConfig;

    // Effect strips mount prefixes by default. Better Auth expects to receive
    // its configured basePath, so we preserve the full /api/auth prefix here.
    yield* router.mountApp(
      "/api/auth",
      HttpApp.fromWebHandler(
        withAuthenticationCors(auth.handler, config.trustedOrigins)
      ),
      {
        includePrefix: true,
      }
    );
  })
).pipe(Layer.provide(AuthenticationLive));
