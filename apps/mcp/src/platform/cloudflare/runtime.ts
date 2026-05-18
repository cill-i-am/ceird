import { SiteGeocoder } from "@ceird/backend-core";
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "@ceird/backend-core/database";
import {
  loadMcpResourceAuthConfig,
  makeMcpWebHandler,
} from "@ceird/backend-core/mcp";
import { Config, ConfigProvider, Effect, Layer } from "effect";

import type { McpWorkerEnv } from "./env.js";
import { mcpWorkerEnvConfigMap } from "./env.js";

type McpWorkerHandler = ReturnType<typeof makeMcpWebHandler>;

interface McpWorkerHandlerCacheKey {
  readonly alchemyStackName: string | undefined;
  readonly alchemyStage: string | undefined;
  readonly betterAuthBaseUrl: string;
  readonly databaseConnectionString: string;
  readonly googleMapsApiKey: string;
  readonly mcpResourceUrl: string;
  readonly nodeEnv: string | undefined;
  readonly oauthIssuerUrl: string;
}

interface McpWorkerHandlerCacheEntry {
  readonly handler: McpWorkerHandler;
  readonly key: McpWorkerHandlerCacheKey;
}

let cachedMcpWorkerHandler: McpWorkerHandlerCacheEntry | undefined;

export function makeMcpWorkerBaseLive(env: McpWorkerEnv) {
  return Layer.setConfigProvider(
    ConfigProvider.fromMap(mcpWorkerEnvConfigMap(env))
  );
}

export function makeMcpWorkerRuntimeLayers(env: McpWorkerEnv) {
  const baseLive = makeMcpWorkerBaseLive(env);
  const databaseRuntimeLive = makeAppDatabaseRuntimeLive(
    makeAppDatabaseLive(env.DATABASE.connectionString)
  );

  return {
    baseLive,
    databaseRuntimeLive,
    siteGeocoderLive: SiteGeocoder.Google,
  };
}

function makeMcpWorkerHandler(env: McpWorkerEnv) {
  const cacheKey = makeMcpWorkerHandlerCacheKey(env);

  if (
    cachedMcpWorkerHandler !== undefined &&
    areMcpWorkerHandlerCacheKeysEqual(cachedMcpWorkerHandler.key, cacheKey)
  ) {
    return cachedMcpWorkerHandler.handler;
  }

  if (cachedMcpWorkerHandler !== undefined) {
    void cachedMcpWorkerHandler.handler.dispose();
  }

  const { baseLive, databaseRuntimeLive, siteGeocoderLive } =
    makeMcpWorkerRuntimeLayers(env);
  const authConfig = Effect.runSync(
    Effect.gen(function* () {
      const baseUrl = yield* Config.string("BETTER_AUTH_BASE_URL");
      return yield* loadMcpResourceAuthConfig(baseUrl);
    }).pipe(Effect.provide(baseLive))
  );

  const handler = makeMcpWebHandler({
    authConfig,
    baseLive,
    runtimeLive: Layer.mergeAll(databaseRuntimeLive, siteGeocoderLive),
  });

  cachedMcpWorkerHandler = {
    handler,
    key: cacheKey,
  };

  return handler;
}

export function handleMcpWorkerFetch(request: Request, env: McpWorkerEnv) {
  const handler = makeMcpWorkerHandler(env);

  return Effect.promise(() => Promise.resolve(handler(request))).pipe(
    Effect.map((response) => response ?? new Response(null, { status: 404 }))
  );
}

function makeMcpWorkerHandlerCacheKey(
  env: McpWorkerEnv
): McpWorkerHandlerCacheKey {
  return {
    alchemyStackName: env.ALCHEMY_STACK_NAME,
    alchemyStage: env.ALCHEMY_STAGE,
    betterAuthBaseUrl: env.BETTER_AUTH_BASE_URL,
    databaseConnectionString: env.DATABASE.connectionString,
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY,
    mcpResourceUrl: env.MCP_RESOURCE_URL,
    nodeEnv: env.NODE_ENV,
    oauthIssuerUrl: env.OAUTH_ISSUER_URL,
  };
}

function areMcpWorkerHandlerCacheKeysEqual(
  left: McpWorkerHandlerCacheKey,
  right: McpWorkerHandlerCacheKey
) {
  return (
    left.alchemyStackName === right.alchemyStackName &&
    left.alchemyStage === right.alchemyStage &&
    left.betterAuthBaseUrl === right.betterAuthBaseUrl &&
    left.databaseConnectionString === right.databaseConnectionString &&
    left.googleMapsApiKey === right.googleMapsApiKey &&
    left.mcpResourceUrl === right.mcpResourceUrl &&
    left.nodeEnv === right.nodeEnv &&
    left.oauthIssuerUrl === right.oauthIssuerUrl
  );
}
