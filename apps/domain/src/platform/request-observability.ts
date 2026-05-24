import { AsyncLocalStorage } from "node:async_hooks";

export type RequestObservationAnnotation = boolean | number | string;

export interface PlatformRequestObservation {
  readonly annotations: Record<string, RequestObservationAnnotation>;
  readonly cfRay?: string | undefined;
  readonly requestId: string;
}

const platformRequestObservability =
  new AsyncLocalStorage<PlatformRequestObservation>();

export function makePlatformRequestObservation(input: {
  readonly cfRay?: string | undefined;
  readonly requestId: string;
}): PlatformRequestObservation {
  return {
    annotations: {},
    cfRay: input.cfRay,
    requestId: input.requestId,
  };
}

export function runWithPlatformRequestObservation<T>(
  observation: PlatformRequestObservation,
  evaluate: () => T
) {
  return platformRequestObservability.run(observation, evaluate);
}

export function readCurrentPlatformRequestObservation() {
  return platformRequestObservability.getStore();
}

export function recordPlatformRequestAnnotation(
  name: string,
  value: RequestObservationAnnotation
) {
  const observation = readCurrentPlatformRequestObservation();

  if (observation === undefined) {
    return;
  }

  observation.annotations[name] = value;
}

export function makePlatformRequestLogAnnotations(
  observation: PlatformRequestObservation
) {
  return {
    "ceird.requestId": observation.requestId,
    ...(observation.cfRay === undefined ? {} : { "cf.ray": observation.cfRay }),
    ...observation.annotations,
  };
}
