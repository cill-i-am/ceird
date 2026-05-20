import { createServer } from "node:http";

import { makeDomainOriginClient } from "@ceird/domain-core";
import type { DomainHttpClient } from "@ceird/domain-core";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Context, Effect, Layer } from "effect";
import {
  HttpEffect,
  HttpMiddleware,
  HttpServer,
  HttpServerError,
  HttpServerRequest,
} from "effect/unstable/http";

import { makeHealthPayload } from "./system/health.js";

export interface ApiRuntimeConfigOverrides {
  readonly stackName?: string | undefined;
  readonly stage?: string | undefined;
}

const RuntimeConfig = Config.all({
  stackName: Config.string("ALCHEMY_STACK_NAME").pipe(
    Config.withDefault("local")
  ),
  stage: Config.string("ALCHEMY_STAGE").pipe(Config.withDefault("local")),
}).pipe(Effect.orDie);

const DomainOriginConfig = Config.string("DOMAIN_ORIGIN").pipe(
  Config.withDefault("http://127.0.0.1:3002")
);

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3001)),
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

export function makeApiWebHandler(
  domain: DomainHttpClient = makeDomainOriginClient(
    Effect.runSync(DomainOriginConfig)
  ),
  runtimeConfig?: ApiRuntimeConfigOverrides | undefined
) {
  return {
    dispose: () => Promise.resolve(),
    handler: (request: Request) =>
      Promise.resolve(handleApiRequest(request, domain, runtimeConfig)),
  };
}

function handleApiRequest(
  request: Request,
  domain: DomainHttpClient,
  runtimeConfig?: ApiRuntimeConfigOverrides | undefined
): Response | Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response("ceird api");
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json(makeHealthPayload(readRuntimeConfig(runtimeConfig)));
  }

  return domain.request(request);
}

function readRuntimeConfig(overrides?: ApiRuntimeConfigOverrides | undefined) {
  if (overrides?.stackName !== undefined && overrides.stage !== undefined) {
    return {
      stackName: overrides.stackName,
      stage: overrides.stage,
    };
  }

  const config = Effect.runSync(RuntimeConfig);

  return {
    stackName: overrides?.stackName ?? config.stackName,
    stage: overrides?.stage ?? config.stage,
  };
}

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

export const ServerLive = Layer.effectDiscard(
  Effect.gen(function* runNodeServer() {
    const webHandler = makeApiWebHandler();

    yield* HttpEffect.fromWebHandler(webHandler.handler).pipe(
      HttpServer.serveEffect(apiRequestLogger)
    );
  })
).pipe(Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig)));
