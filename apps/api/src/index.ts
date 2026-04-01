import { createServer } from "node:http";

import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer, Schema } from "effect";

const StatusResponse = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.String,
});

const Api = HttpApi.make("TaskTrackerApi").add(
  HttpApiGroup.make("system")
    .add(HttpApiEndpoint.get("root", "/").addSuccess(Schema.String))
    .add(HttpApiEndpoint.get("health", "/health").addSuccess(StatusResponse))
);

const SystemLive = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("task-tracker api"))
    .handle("health", () =>
      Effect.succeed({
        ok: true,
        service: "api",
      })
    )
);

const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(SystemLive));

const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(NodeHttpServer.layerConfig(createServer, ServerConfig))
);

NodeRuntime.runMain(Layer.launch(ServerLive));
