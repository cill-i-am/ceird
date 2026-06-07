import { createServer } from "node:http";

import { NodeHttpServer } from "@effect/platform-node";
import { Config, Context, Effect, Layer } from "effect";
import {
  HttpEffect,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AgentsHttpLive } from "./domains/agents/http.js";
import {
  AuthenticationHttpLive,
  AuthenticationLive,
} from "./domains/identity/authentication/auth.js";
import { loadAuthenticationConfig } from "./domains/identity/authentication/config.js";
import { IdentityHttpLive } from "./domains/identity/http.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { LabelsHttpLive } from "./domains/labels/http.js";
import type { McpAuthorizedAppCacheOptions } from "./domains/mcp/cache-config.js";
import type { McpAuthorizedAppCache } from "./domains/mcp/http.js";
import { makeMcpWebHandler } from "./domains/mcp/http.js";
import { SitesHttpLive } from "./domains/sites/http.js";
import { SiteLocationProvider } from "./domains/sites/location-provider.js";
import { SyncHttpLive } from "./domains/sync/http.js";
import { AppApi } from "./http-api.js";
import { AppDatabaseRuntimeLive } from "./platform/database/database.js";
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
  HttpApiBuilder.layer(AppApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        SystemLive,
        AgentsHttpLive,
        AuthenticationHttpLive,
        IdentityHttpLive,
        JobsHttpLive,
        LabelsHttpLive,
        SitesHttpLive,
        SyncHttpLive
      )
    )
  );

type ApiDatabaseRuntimeLive = typeof AppDatabaseRuntimeLive;
type ApiAuthenticationLive = typeof AuthenticationLive;
type ApiBaseLive = Layer.Layer<never, never, never>;
type ApiSiteLocationProviderLive = Layer.Layer<
  SiteLocationProvider,
  unknown,
  never
>;
export interface ApiWebHandlerOptions {
  readonly mcpAuthorizedAppCache?: McpAuthorizedAppCache | undefined;
  readonly mcpAuthorizedAppCacheOptions?:
    | McpAuthorizedAppCacheOptions
    | undefined;
}
export interface ApiWebHandlerInput extends ApiWebHandlerOptions {
  readonly authenticationLive?: ApiAuthenticationLive | undefined;
  readonly baseLive?: ApiBaseLive | undefined;
  readonly databaseRuntimeLive?: ApiDatabaseRuntimeLive | undefined;
  readonly siteLocationProviderLive?: ApiSiteLocationProviderLive | undefined;
}

export const makeApiLive = (
  databaseRuntimeLive: ApiDatabaseRuntimeLive,
  authenticationLive: ApiAuthenticationLive = AuthenticationLive,
  siteLocationProviderLive: ApiSiteLocationProviderLive = SiteLocationProvider.Local
) =>
  makeApiHandlersLive().pipe(
    Layer.provide(
      Layer.mergeAll(
        databaseRuntimeLive,
        authenticationLive.pipe(Layer.provide(databaseRuntimeLive)),
        siteLocationProviderLive
      )
    )
  );

export const ApiLive = makeApiLive(AppDatabaseRuntimeLive, AuthenticationLive);

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3002)),
});

export const apiRequestLogger: typeof HttpMiddleware.logger =
  HttpMiddleware.make((httpApp) =>
    Effect.withFiber((fiber) => {
      const request = Context.getUnsafe(
        fiber.context,
        HttpServerRequest.HttpServerRequest
      );
      const path = requestPathname(request.url);

      return Effect.withLogSpan(
        Effect.flatMap(Effect.exit(httpApp), (exit) => {
          if (shouldSkipRequestLog(path)) {
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

          return Effect.andThen(
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
        "http.request"
      );
    })
  );

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

export const makeApiWebHandler = (input: ApiWebHandlerInput = {}) => {
  const databaseRuntimeLive =
    input.databaseRuntimeLive ?? AppDatabaseRuntimeLive;
  const authenticationLive = input.authenticationLive ?? AuthenticationLive;
  const siteLocationProviderLive =
    input.siteLocationProviderLive ?? SiteLocationProvider.Local;
  const baseLive = input.baseLive ?? Layer.empty;
  const authConfig = Effect.runSync(
    loadAuthenticationConfig.pipe(Effect.provide(baseLive))
  );
  const runtimeLive = Layer.mergeAll(
    databaseRuntimeLive,
    authenticationLive.pipe(Layer.provide(databaseRuntimeLive)),
    siteLocationProviderLive
  );
  const mcpWebHandler = makeMcpWebHandler({
    authorizedAppCache: input.mcpAuthorizedAppCache,
    authorizedAppCacheOptions: input.mcpAuthorizedAppCacheOptions,
    authConfig,
    baseLive,
    runtimeLive,
  });
  const apiLayer = makeApiLive(
    databaseRuntimeLive,
    authenticationLive,
    siteLocationProviderLive
  ).pipe(
    Layer.provide(NodeHttpServer.layerHttpServices),
    Layer.provide(baseLive)
  );
  const handler = HttpRouter.toWebHandler(apiLayer, {
    disableLogger: true,
    middleware: apiRequestLogger,
  });

  return {
    dispose: async () => {
      throwIfDisposeFailed(
        await Promise.allSettled([handler.dispose(), mcpWebHandler.dispose()])
      );
    },
    handler: async (request: Request) =>
      (await mcpWebHandler(request)) ??
      (handler.handler as (request: Request) => Promise<Response>)(request),
  };
};

function throwIfDisposeFailed(
  results: readonly PromiseSettledResult<unknown>[]
) {
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failures.length === 1) {
    throw failures[0].reason;
  }

  if (failures.length > 1) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "API web handler disposal failed"
    );
  }
}

export const ServerLive = Layer.effectDiscard(
  Effect.gen(function* runNodeServer() {
    const webHandler = yield* Effect.acquireRelease(
      Effect.sync(() => makeApiWebHandler()),
      ({ dispose }) => Effect.promise(() => dispose()).pipe(Effect.orDie)
    );

    yield* HttpEffect.fromWebHandler(webHandler.handler).pipe(
      HttpServer.serveEffect()
    );
  })
).pipe(Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig)));
