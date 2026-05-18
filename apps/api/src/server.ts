import { createServer } from "node:http";

import { SiteGeocoder } from "@ceird/backend-core";
import { AppDatabaseRuntimeLive } from "@ceird/backend-core/database";
import type { AppDatabase } from "@ceird/backend-core/database";
import {
  HttpApp,
  HttpApiBuilder,
  HttpMiddleware,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Context, Effect, Layer } from "effect";

import type { Authentication } from "./domains/identity/authentication/auth.js";
import {
  AuthenticationHttpLive,
  AuthenticationLive,
  makeAuthenticationOrganizationSessionResolverLive,
} from "./domains/identity/authentication/auth.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { LabelsHttpLive } from "./domains/labels/http.js";
import { SitesHttpLive } from "./domains/sites/http.js";
import { AppApi } from "./http-api.js";
import { makeHealthPayload } from "./system/health.js";

const RuntimeConfig = Config.all({
  stackName: Config.string("ALCHEMY_STACK_NAME").pipe(
    Config.withDefault("local")
  ),
  stage: Config.string("ALCHEMY_STAGE").pipe(Config.withDefault("local")),
}).pipe(Effect.orDie);

const SystemLive = HttpApiBuilder.group(AppApi, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("ceird api"))
    .handle("health", () =>
      RuntimeConfig.pipe(Effect.map((config) => makeHealthPayload(config)))
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
type ApiAuthenticationLive = Layer.Layer<Authentication, unknown, AppDatabase>;
type ApiBaseLive = Layer.Layer<never, never, never>;
type ApiSiteGeocoderLive = Layer.Layer<SiteGeocoder, unknown, never>;

export const makeApiLive = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  siteGeocoderLive: ApiSiteGeocoderLive = SiteGeocoder.Local
) => {
  const apiAuthenticationLive = authenticationLive.pipe(
    Layer.provide(databaseRuntimeLive)
  );
  const organizationSessionResolverLive =
    makeAuthenticationOrganizationSessionResolverLive(apiAuthenticationLive);

  return makeApiHandlersLive().pipe(
    Layer.provide(
      Layer.mergeAll(
        databaseRuntimeLive,
        apiAuthenticationLive,
        organizationSessionResolverLive,
        siteGeocoderLive
      )
    )
  );
};

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
  const queryIndex = url.indexOf("?");
  const pathOrUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);

  if (pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }

  const protocolSeparatorIndex = pathOrUrl.indexOf("://");

  if (protocolSeparatorIndex === -1) {
    return pathOrUrl;
  }

  const pathnameStartIndex = pathOrUrl.indexOf("/", protocolSeparatorIndex + 3);

  return pathnameStartIndex === -1 ? "/" : pathOrUrl.slice(pathnameStartIndex);
}

function shouldSkipRequestLog(path: string) {
  return path === "/health";
}

export const makeApiWebHandler = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive = AppDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  siteGeocoderLive: ApiSiteGeocoderLive = SiteGeocoder.Local,
  baseLive: ApiBaseLive = Layer.empty
) => {
  const apiLayer = Layer.mergeAll(
    makeApiLive(databaseRuntimeLive, authenticationLive, siteGeocoderLive),
    NodeHttpServer.layerContext
  ).pipe(Layer.provide(baseLive), Layer.orDie);
  const handler = HttpApiBuilder.toWebHandler(apiLayer, {
    middleware: apiRequestLogger,
  });

  return {
    dispose: handler.dispose,
    handler: handler.handler,
  };
};

export const ServerLive = Layer.scopedDiscard(
  Effect.gen(function* runNodeServer() {
    const webHandler = yield* Effect.acquireRelease(
      Effect.sync(() => makeApiWebHandler()),
      ({ dispose }) => Effect.promise(() => dispose()).pipe(Effect.orDie)
    );

    yield* HttpApp.fromWebHandler(webHandler.handler).pipe(
      HttpServer.serveEffect()
    );
  })
).pipe(Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig)));
