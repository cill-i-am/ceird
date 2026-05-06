import { makeHealthPayloadFromSandboxIdInput } from "@ceird/sandbox-core";
import {
  HttpApiBuilder,
  HttpMiddleware,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
} from "@effect/platform";
import { Config, Context, Effect, Layer } from "effect";

import type { Authentication } from "./domains/identity/authentication/auth.js";
import {
  AuthenticationHttpLive,
  AuthenticationLive,
} from "./domains/identity/authentication/auth.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { LabelsHttpLive } from "./domains/labels/http.js";
import { SitesHttpLive } from "./domains/sites/http.js";
import { AppApi } from "./http-api.js";
import type { AppDatabase } from "./platform/database/database.js";
import { AppDatabaseRuntimeLive } from "./platform/database/database.js";

const RuntimeConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(
    Config.withDefault("000000000000")
  ),
}).pipe(Effect.orDie);

const SystemLive = HttpApiBuilder.group(AppApi, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("ceird api"))
    .handle("health", () =>
      RuntimeConfig.pipe(
        Effect.map(({ sandboxId }) =>
          makeHealthPayloadFromSandboxIdInput("api", sandboxId)
        )
      )
    )
);

type ApiDatabaseRuntimeLive = typeof AppDatabaseRuntimeLive;
type ApiAuthenticationLive = Layer.Layer<Authentication, unknown, AppDatabase>;
type ApiBaseLive = Layer.Layer<never, never, never>;

const makeApiHandlersLive = (authenticationLive: ApiAuthenticationLive) =>
  HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemLive,
        AuthenticationHttpLive.pipe(Layer.provide(authenticationLive)),
        JobsHttpLive,
        LabelsHttpLive,
        SitesHttpLive
      )
    )
  );

export const makeApiLive = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive
) =>
  makeApiHandlersLive(
    authenticationLive.pipe(Layer.provide(databaseRuntimeLive))
  ).pipe(Layer.provide(Layer.mergeAll(databaseRuntimeLive)));

export const ApiLive = makeApiLive(AppDatabaseRuntimeLive, AuthenticationLive);

export const apiRequestLogger: typeof HttpMiddleware.logger =
  HttpMiddleware.make((httpApp) => {
    let counter = 0;

    return Effect.withFiberRuntime((fiber) => {
      const request = Context.unsafeGet(
        fiber.currentContext,
        HttpServerRequest.HttpServerRequest
      );
      const path = requestPathname(request.url);

      counter += 1;

      return Effect.withLogSpan(
        Effect.flatMap(Effect.exit(httpApp), (exit) => {
          if (
            fiber.getFiberRef(HttpMiddleware.loggerDisabled) ||
            shouldSkipRequestLog(path)
          ) {
            return exit;
          }

          const status =
            exit._tag === "Failure"
              ? HttpServerError.causeResponseStripped(exit.cause)[0].status
              : exit.value.status;
          const log =
            status >= 500
              ? Effect.logWarning("Sent HTTP error response")
              : Effect.logInfo("Sent HTTP response");

          return Effect.zipRight(
            log.pipe(
              Effect.annotateLogs({
                "http.method": request.method,
                "http.path": path,
                "http.status": status,
              })
            ),
            exit
          );
        }),
        `http.request.${counter}`
      );
    });
  });

function requestPathname(url: string) {
  try {
    return new URL(url, "http://ceird.local").pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function shouldSkipRequestLog(path: string) {
  return path === "/health";
}

export const makeApiWebHandler = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive = AppDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  baseLive: ApiBaseLive = Layer.empty
) => {
  const apiLayer = Layer.mergeAll(
    makeApiLive(databaseRuntimeLive, authenticationLive),
    HttpServer.layerContext
  ).pipe(Layer.provide(baseLive));

  return HttpApiBuilder.toWebHandler(apiLayer, {
    middleware: apiRequestLogger,
  });
};
