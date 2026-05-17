import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import type { NeonPostgresResources } from "./neon.ts";
import type { InfraStageConfig } from "./stages.ts";
import { resourceName } from "./stages.ts";

const workerCompatibility = {
  date: "2026-04-30",
  flags: ["nodejs_compat"],
} satisfies NonNullable<WorkerProps["compatibility"]>;

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type ApiWorkerBindings = {
  readonly AUTH_EMAIL: Cloudflare.SendEmail;
  readonly AUTH_EMAIL_QUEUE: Cloudflare.Queue;
  readonly DATABASE: Cloudflare.Hyperdrive;
};

export type ApiWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<ApiWorkerBindings>
>;

type ApiWorkerBindingProps = {
  readonly [BindingName in keyof ApiWorkerBindings]:
    | ApiWorkerBindings[BindingName]
    | Effect.Effect<ApiWorkerBindings[BindingName], never, never>;
};

export function makeApiWorkerBindings(input: {
  readonly authEmailQueue: Cloudflare.Queue;
  readonly config: InfraStageConfig;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    AUTH_EMAIL: Cloudflare.SendEmail("AuthEmailBinding", {
      allowedSenderAddresses: [Redacted.value(input.config.authEmailFrom)],
    }),
    AUTH_EMAIL_QUEUE: input.authEmailQueue,
    DATABASE: input.hyperdrive,
  } satisfies ApiWorkerBindingProps;
}

export function makeCloudflareHyperdrive(input: {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
}) {
  return Cloudflare.Hyperdrive("PostgresHyperdrive", {
    name: resourceName(input.config, "postgres"),
    origin: input.database.hyperdriveOrigin,
    originConnectionLimit: input.config.hyperdriveOriginConnectionLimit,
    caching: { disabled: true },
  });
}

export const makeCloudflareStack = Effect.fn("CloudflareStack.make")(function* (
  input: CloudflareStackInput
) {
  yield* Effect.annotateCurrentSpan("stage", input.config.stage);
  yield* Effect.annotateCurrentSpan("appHostname", input.config.appHostname);
  yield* Effect.annotateCurrentSpan("apiHostname", input.config.apiHostname);
  yield* Effect.annotateCurrentSpan(
    "hyperdriveId",
    input.hyperdrive.hyperdriveId
  );

  const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
    bytes: 32,
  });

  const authEmailDeadLetterQueue = yield* Cloudflare.Queue(
    "AuthEmailDeadLetterQueue",
    {
      name: resourceName(input.config, "auth-email-dlq"),
    }
  );

  const authEmailQueue = yield* Cloudflare.Queue("AuthEmailQueue", {
    name: resourceName(input.config, "auth-email"),
  });

  const api = yield* Cloudflare.Worker("Api", {
    name: resourceName(input.config, "api"),
    main: "apps/api/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeApiWorkerBindings({
      authEmailQueue,
      config: input.config,
      hyperdrive: input.hyperdrive,
    }),
    env: {
      ALCHEMY_STAGE: input.config.stage,
      AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
      AUTH_EMAIL_FROM: input.config.authEmailFrom,
      AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
      BETTER_AUTH_BASE_URL: `https://${input.config.apiHostname}/api/auth`,
      BETTER_AUTH_SECRET: betterAuthSecret.text,
      GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
      NODE_ENV: "production",
    },
    domain: input.config.apiHostname,
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
      traces: {
        enabled: true,
      },
    },
    url: true,
  });

  yield* Cloudflare.QueueConsumer("AuthEmailConsumer", {
    queueId: authEmailQueue.queueId,
    scriptName: api.workerName,
    deadLetterQueue: authEmailDeadLetterQueue.queueName,
    settings: {
      batchSize: 10,
      maxRetries: 5,
      maxWaitTimeMs: 2000,
      retryDelay: 30,
    },
  });

  const app = yield* Cloudflare.Vite("App", {
    name: resourceName(input.config, "app"),
    rootDir: "apps/app",
    compatibility: workerCompatibility,
    env: {
      ALCHEMY_STAGE: input.config.stage,
      API_ORIGIN: `https://${input.config.apiHostname}`,
      CEIRD_CLOUDFLARE: "1",
      VITE_API_ORIGIN: `https://${input.config.apiHostname}`,
    },
    domain: input.config.appHostname,
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
      traces: {
        enabled: true,
      },
    },
    url: true,
  });

  return {
    api,
    app,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database: input.hyperdrive,
  } as const;
});
