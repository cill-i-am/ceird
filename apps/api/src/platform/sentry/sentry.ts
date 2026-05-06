import * as Sentry from "@sentry/effect/server";
import { Effect, Layer, Logger } from "effect";

import type { ApiSentryConfig } from "./sentry-common.js";
import {
  apiSentryConfigFromWorkerEnv,
  formatApiSentryLogMessage,
  isApiSentryEnabled,
  loadApiSentryConfig,
  makeApiSentryEffectLogger,
  makeSentryOptions,
  scrubApiSentryEvent,
  scrubApiSentryLog,
  scrubApiSentrySpan,
  scrubApiSentryTransaction,
} from "./sentry-common.js";

export {
  type ApiSentryConfig,
  apiSentryConfigFromWorkerEnv,
  formatApiSentryLogMessage,
  isApiSentryEnabled,
  makeSentryOptions,
  scrubApiSentryEvent,
  scrubApiSentryLog,
  scrubApiSentrySpan,
  scrubApiSentryTransaction,
};

export const ApiSentryLive = Layer.unwrapEffect(
  loadApiSentryConfig.pipe(Effect.map(makeApiSentryLayer))
).pipe(Layer.orDie);

export const ApiSentryInstrumentationLive = Layer.unwrapEffect(
  loadApiSentryConfig.pipe(Effect.map(makeApiSentryInstrumentationLayer))
).pipe(Layer.orDie);

export function makeApiSentryLayer(config: ApiSentryConfig) {
  if (!isApiSentryEnabled(config)) {
    return Layer.empty;
  }

  return Layer.mergeAll(
    Sentry.effectLayer(makeSentryOptions(config)),
    makeApiSentryInstrumentationLayer(config)
  );
}

export function makeApiSentryInstrumentationLayer(config: ApiSentryConfig) {
  if (!isApiSentryEnabled(config)) {
    return Layer.empty;
  }

  return Layer.mergeAll(
    Layer.setTracer(Sentry.SentryEffectTracer),
    Logger.add(makeApiSentryEffectLogger(Sentry.logger)),
    Sentry.SentryEffectMetricsLayer
  );
}
