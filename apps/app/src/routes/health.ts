import { createFileRoute } from "@tanstack/react-router";
import { makeHealthPayloadFromSandboxIdInput } from "@task-tracker/sandbox-core";
import { Config, Effect } from "effect";

const AppRuntimeConfig = Config.all({
  sandboxId: Config.string("SANDBOX_ID").pipe(
    Config.withDefault("000000000000")
  ),
}).pipe(Effect.orDie);

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const payload = await AppRuntimeConfig.pipe(
          Effect.map(({ sandboxId }) =>
            makeHealthPayloadFromSandboxIdInput("app", sandboxId)
          ),
          Effect.runPromise
        );

        return Response.json(payload);
      },
    },
  },
});
