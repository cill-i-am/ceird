import { Duration, Effect } from "effect";

const MUTATION_SUCCESS_MINIMUM_PENDING_MS = 500;

export function beginMutationFeedback({
  minimumDurationMs = MUTATION_SUCCESS_MINIMUM_PENDING_MS,
}: {
  readonly minimumDurationMs?: number;
} = {}) {
  const startedAt = performance.now();

  return {
    waitForSuccess: () =>
      waitForMinimumMutationPendingDuration({
        minimumDurationMs,
        startedAt,
      }),
  };
}

async function waitForMinimumMutationPendingDuration({
  minimumDurationMs = MUTATION_SUCCESS_MINIMUM_PENDING_MS,
  startedAt,
}: {
  readonly minimumDurationMs?: number;
  readonly startedAt: number;
}) {
  const elapsedMs = performance.now() - startedAt;
  const remainingMs = minimumDurationMs - elapsedMs;

  if (remainingMs <= 0) {
    return;
  }

  await Effect.runPromise(Effect.sleep(Duration.millis(remainingMs)));
}
