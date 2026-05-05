import * as Sentry from "@sentry/tanstackstart-react";
import { Config, Effect } from "effect";

import { createServerSentryOptions } from "./sentry-config";

const SentryRuntimeConfig = Config.all({
  environment: Config.string("NODE_ENV").pipe(Config.withDefault("production")),
}).pipe(Effect.orDie);

const { environment } = Effect.runSync(SentryRuntimeConfig);

Sentry.init(
  createServerSentryOptions({
    environment,
  })
);
