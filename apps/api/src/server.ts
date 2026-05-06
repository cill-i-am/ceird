import { createServer } from "node:http";

import { makeHealthPayloadFromSandboxIdInput } from "@ceird/sandbox-core";
import {
  HttpApiBuilder,
  HttpMiddleware,
  HttpServerError,
  HttpServerRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Context, Effect, Layer } from "effect";

import {
  AuthenticationHttpLive,
  AuthenticationLive,
} from "./domains/identity/authentication/auth.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { LabelsHttpLive } from "./domains/labels/http.js";
import { SitesHttpLive } from "./domains/sites/http.js";
import { AppApi } from "./http-api.js";
import { AppDatabaseRuntimeLive } from "./platform/database/database.js";
import { ApiSentryLive } from "./platform/sentry/sentry.js";

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

const makeApiHandlersLive = () =>
  HttpApiBuilder.api(AppApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemLive,
        AuthenticationHttpLive,
        JobsHttpLive,
        LabelsHttpLive,
        SitesHttpLive
      )
    )
  );

type ApiDatabaseRuntimeLive = typeof AppDatabaseRuntimeLive;
type ApiAuthenticationLive = typeof AuthenticationLive;
type ApiBaseLive = Layer.Layer<never, never, never>;

export const makeApiLive = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive
) =>
  makeApiHandlersLive().pipe(
    Layer.provide(
      Layer.mergeAll(
        databaseRuntimeLive,
        authenticationLive.pipe(Layer.provide(databaseRuntimeLive))
      )
    )
  );

export const ApiLive = makeApiLive(AppDatabaseRuntimeLive, AuthenticationLive);

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

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

export const ServerLive = HttpApiBuilder.serve(apiRequestLogger).pipe(
  Layer.provide(
    Layer.mergeAll(
      ApiLive,
      NodeHttpServer.layerConfig(createServer, ServerConfig),
      ApiSentryLive
    )
  )
);

export const makeApiWebHandler = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive = AppDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  baseLive: ApiBaseLive = ApiSentryLive
) => {
  const apiLayer = Layer.mergeAll(
    makeApiLive(databaseRuntimeLive, authenticationLive),
    NodeHttpServer.layerContext
  ).pipe(Layer.provide(baseLive));

  return HttpApiBuilder.toWebHandler(apiLayer, {
    middleware: apiRequestLogger,
  });
};
