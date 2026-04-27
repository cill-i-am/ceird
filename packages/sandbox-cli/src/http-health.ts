import { HealthPayload } from "@task-tracker/sandbox-core";
import type { SandboxRecord } from "@task-tracker/sandbox-core";
import { Effect, Option, Schema } from "effect";

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
        Effect.gen(function* () {
          const response = yield* fetchHealth(port).pipe(Effect.option);

          if (Option.isNone(response) || !response.value.ok) {
            return false;
          }

          const payload = yield* decodeHealthPayload(response.value).pipe(
            Effect.option
          );

          return Option.match(payload, {
            onNone: () => false,
            onSome: (decoded) =>
              decoded.ok === true &&
              decoded.service === service &&
              decoded.sandboxId === sandboxId,
          });
        }),
    }),
  }
) {}

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
