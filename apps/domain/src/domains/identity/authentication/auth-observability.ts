import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

export interface AuthenticationRequestObservation {
  readonly timings: Record<string, number>;
}

const authenticationRequestObservability =
  new AsyncLocalStorage<AuthenticationRequestObservation>();

export function makeAuthenticationRequestObservation(): AuthenticationRequestObservation {
  return {
    timings: {},
  };
}

export function runWithAuthenticationRequestObservation<T>(
  observation: AuthenticationRequestObservation,
  evaluate: () => T
) {
  return authenticationRequestObservability.run(observation, evaluate);
}

export function readCurrentAuthenticationRequestObservation() {
  return authenticationRequestObservability.getStore();
}

export async function measureAuthenticationPhase<T>(
  phase: string,
  evaluate: () => Promise<T>
): Promise<T> {
  const startedAt = nowMs();

  try {
    return await evaluate();
  } finally {
    recordAuthenticationPhaseTiming(phase, elapsedMs(startedAt));
  }
}

export function recordAuthenticationPhaseTiming(
  phase: string,
  durationMs: number
) {
  const observation = readCurrentAuthenticationRequestObservation();

  if (observation === undefined) {
    return;
  }

  observation.timings[phase] = roundedMs(
    (observation.timings[phase] ?? 0) + durationMs
  );
}

function nowMs() {
  return performance.now();
}

function elapsedMs(startedAt: number) {
  return roundedMs(nowMs() - startedAt);
}

function roundedMs(value: number) {
  return Math.round(value * 100) / 100;
}
