import { createServer } from "node:http";

import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import {
  HealthPayload,
  makeHealthPayloadFromSandboxIdInput,
} from "@task-tracker/sandbox-core";
import { Config, Effect, Layer, Schema } from "effect";

import { AuthenticationHttpLive } from "./domains/identity/authentication/auth.js";
import { JobsHttpLive } from "./domains/jobs/http.js";
import { AppDatabaseRuntimeLive } from "./platform/database/database.js";

const Api = HttpApi.make("TaskTrackerApi").add(
  HttpApiGroup.make("system")
    .add(HttpApiEndpoint.get("root", "/").addSuccess(Schema.String))
    .add(HttpApiEndpoint.get("health", "/health").addSuccess(HealthPayload))
);

const RuntimeConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(
    Config.withDefault("000000000000")
  ),
}).pipe(Effect.orDie);

const SystemLive = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers
    .handle("root", () => Effect.succeed("task-tracker api"))
    .handle("health", () =>
      RuntimeConfig.pipe(
        Effect.map(({ sandboxId }) =>
          makeHealthPayloadFromSandboxIdInput("api", sandboxId)
        )
      )
    )
);

const ApiContractLive = HttpApiBuilder.api(Api).pipe(Layer.provide(SystemLive));

export const ApiLive = Layer.mergeAll(
  ApiContractLive,
  AuthenticationHttpLive,
  JobsHttpLive
).pipe(Layer.provide(AppDatabaseRuntimeLive));

export const ServerConfig = Config.all({
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.port("PORT").pipe(Config.withDefault(3000)),
});

export const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(
    Layer.mergeAll(
      ApiLive,
      NodeHttpServer.layerConfig(createServer, ServerConfig)
    )
  )
);

export const makeApiWebHandler = () =>
  HttpApiBuilder.toWebHandler(
    Layer.mergeAll(ApiLive, NodeHttpServer.layerContext)
  );
