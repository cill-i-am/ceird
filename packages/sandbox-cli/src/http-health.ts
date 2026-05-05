import { HealthPayload } from "@ceird/sandbox-core";
import type { SandboxRecord } from "@ceird/sandbox-core";
import { Effect, Option, Schema } from "effect";

export interface SandboxHttpHealth {
  readonly check: (
    port: number,
    service: "app" | "api",
    sandboxId: SandboxRecord["sandboxId"]
  ) => Effect.Effect<boolean, never, never>;
}

export class SandboxHttpHealthService extends Effect.Service<SandboxHttpHealthService>()(
  "@ceird/sandbox-cli/SandboxHttpHealthService",
  {
    accessors: true,
    effect: Effect.succeed<SandboxHttpHealth>({
      check: Effect.fn("SandboxHttpHealth.check")(
        function* (port, service, sandboxId) {
          yield* Effect.annotateCurrentSpan("port", String(port));
          yield* Effect.annotateCurrentSpan("service", service);
          yield* Effect.annotateCurrentSpan("sandboxId", sandboxId);

          const response = yield* fetchHealth(port).pipe(
            Effect.tapError((error) =>
              Effect.logWarning("Sandbox health request failed", {
                error: formatUnknownError(error),
                port,
                sandboxId,
                service,
              })
            ),
            Effect.option
          );

          return yield* Option.match(response, {
            onNone: () => Effect.succeed(false),
            onSome: (healthResponse) =>
              healthResponse.ok
                ? decodeHealthPayload(healthResponse).pipe(
                    Effect.tapError((error) =>
                      Effect.logWarning(
                        "Sandbox health payload decode failed",
                        {
                          error: formatUnknownError(error),
                          port,
                          sandboxId,
                          service,
                        }
                      )
                    ),
                    Effect.option,
                    Effect.map((payload) =>
                      Option.match(payload, {
                        onNone: () => false,
                        onSome: (decoded) =>
                          decoded.ok === true &&
                          decoded.service === service &&
                          decoded.sandboxId === sandboxId,
                      })
                    )
                  )
                : Effect.logWarning("Sandbox health endpoint returned not ok", {
                    port,
                    sandboxId,
                    service,
                    status: healthResponse.status,
                  }).pipe(Effect.as(false)),
          });
        }
      ),
    }),
  }
) {}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function fetchHealth(port: number) {
  return Effect.tryPromise({
    try: () =>
      fetch(`http://127.0.0.1:${port}/health`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(2000),
      }),
    catch: (error) => error,
  });
}

function decodeHealthPayload(response: Response) {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => error,
  }).pipe(Effect.flatMap(Schema.decodeUnknown(HealthPayload)));
}
