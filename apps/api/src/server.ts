import { createServer } from "node:http";

import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { makeHealthPayload } from "@task-tracker/sandbox-core";
import { Config, Effect, Layer, Schema } from "effect";

import { AuthenticationHttpLive } from "./domains/identity/authentication/auth.js";

const StatusResponse = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
  sandboxId: Schema.String,
});

const Api = HttpApi.make("TaskTrackerApi").add(
  HttpApiGroup.make("system")
    .add(HttpApiEndpoint.get("root", "/").addSuccess(Schema.String))
    .add(HttpApiEndpoint.get("health", "/health").addSuccess(StatusResponse))
);

const RuntimeConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(Config.withDefault("local")),
}).pipe(Effect.orDie);

const SystemLive = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("task-tracker api"))
    .handle("health", () =>
      RuntimeConfig.pipe(
        Effect.map(({ sandboxId }) => makeHealthPayload("api", sandboxId))
      )
    )
);

const ApiContractLive = HttpApiBuilder.api(Api).pipe(Layer.provide(SystemLive));

export const ApiLive = Layer.mergeAll(ApiContractLive, AuthenticationHttpLive);

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

export const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig))
);

export const makeApiWebHandler = () =>
  HttpApiBuilder.toWebHandler(
    Layer.mergeAll(ApiLive, NodeHttpServer.layerContext)
  );
