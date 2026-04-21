import { HealthPayload } from "@task-tracker/sandbox-core";
import type { SandboxRecord } from "@task-tracker/sandbox-core";
import { Effect, Schema } from "effect";

export interface SandboxHttpHealth {
  readonly check: (
    port: number,
    service: "app" | "api",
    sandboxId: SandboxRecord["sandboxId"]
  ) => Effect.Effect<boolean, never, never>;
}

export class SandboxHttpHealthService extends Effect.Service<SandboxHttpHealthService>()(
  "@task-tracker/sandbox-cli/SandboxHttpHealthService",
  {
    accessors: true,
    effect: Effect.succeed<SandboxHttpHealth>({
      check: (port, service, sandboxId) =>
        Effect.tryPromise({
          try: () =>
            fetch(`http://127.0.0.1:${port}/health`, {
              headers: { accept: "application/json" },
              signal: AbortSignal.timeout(2000),
            }),
          catch: (error) => error,
        }).pipe(
          Effect.catchAll(() => Effect.succeed<Response | false>(false)),
          Effect.flatMap((responseOrFalse) => {
            if (responseOrFalse === false || !responseOrFalse.ok) {
              return Effect.succeed(false);
            }

            return Effect.tryPromise({
              try: () => responseOrFalse.json(),
              catch: () => false,
            }).pipe(
              Effect.flatMap((payloadOrFalse) =>
                payloadOrFalse === false
                  ? Effect.succeed(false)
                  : Schema.decodeUnknown(HealthPayload)(payloadOrFalse).pipe(
                      Effect.map(
                        (payload) =>
                          payload.ok === true &&
                          payload.service === service &&
                          payload.sandboxId === sandboxId
                      ),
                      Effect.orElseSucceed(() => false)
                    )
              )
            );
          }),
          Effect.orElseSucceed(() => false)
        ),
    }),
  }
) {}
