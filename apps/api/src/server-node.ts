import { createServer } from "node:http";

import { HttpApiBuilder } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Config, Layer } from "effect";

import { ApiSentryLive } from "./platform/sentry/sentry.js";
import { ApiLive, apiRequestLogger } from "./server.js";

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

export const ServerLive = HttpApiBuilder.serve(apiRequestLogger).pipe(
  Layer.provide(
    Layer.mergeAll(
      ApiLive,
      NodeHttpServer.layerConfig(createServer, ServerConfig),
      ApiSentryLive
    )
  )
);
