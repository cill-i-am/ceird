import { logger as sentryLogger } from "@sentry/cloudflare";
import { Effect, Layer, Logger } from "effect";

import type { ApiSentryConfig } from "./sentry-common.js";
import {
  apiSentryConfigFromWorkerEnv,
  isApiSentryEnabled,
  loadApiSentryConfig,
  makeApiSentryEffectLogger,
  makeSentryOptions,
} from "./sentry-common.js";

export { apiSentryConfigFromWorkerEnv, makeSentryOptions };

export const ApiSentryWorkerInstrumentationLive = Layer.unwrapEffect(
  loadApiSentryConfig.pipe(Effect.map(makeApiSentryWorkerInstrumentationLayer))
).pipe(Layer.orDie);

export function makeApiSentryWorkerInstrumentationLayer(
  config: ApiSentryConfig
) {
  if (!isApiSentryEnabled(config)) {
    return Layer.empty;
  }

  return Logger.add(makeApiSentryEffectLogger(sentryLogger));
}
