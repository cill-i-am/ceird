import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { Hyperdrive } from "./cloudflare-hyperdrive.ts";
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
  readonly hyperdrive: Hyperdrive;
  readonly migrationRunId?: Input<string>;
}

export function makeCloudflareHyperdrive(input: {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
}) {
  return Hyperdrive("PostgresHyperdrive", {
    name: resourceName(input.config, "postgres"),
    origin: input.database.hyperdriveOrigin,
    originCredentialFingerprint:
      input.database.hyperdriveOriginCredentialFingerprint,
    originConnectionLimit: input.config.hyperdriveOriginConnectionLimit,
    caching: { disabled: true },
    delete: false,
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
  yield* Effect.annotateCurrentSpan(
    "migrationRunId.present",
    input.migrationRunId !== undefined
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
    main: "../../apps/api/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: {
      AUTH_EMAIL_QUEUE: authEmailQueue,
    },
    env: {
      AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
      AUTH_EMAIL_FROM: input.config.authEmailFrom,
      AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
      BETTER_AUTH_BASE_URL: `https://${input.config.apiHostname}/api/auth`,
      BETTER_AUTH_SECRET: betterAuthSecret.text,
      GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
      NODE_ENV: "production",
      ...(input.migrationRunId
        ? { CEIRD_MIGRATIONS_RUN_ID: input.migrationRunId }
        : {}),
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

  yield* api.bind`PostgresHyperdrive`({
    bindings: [
      {
        type: "hyperdrive",
        name: "DATABASE",
        id: input.hyperdrive.hyperdriveId,
      },
    ],
  });

  yield* api.bind`AuthEmailBinding`({
    bindings: [
      {
        type: "send_email",
        name: "AUTH_EMAIL",
        allowedSenderAddresses: [Redacted.value(input.config.authEmailFrom)],
      },
    ],
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
    rootDir: "../../apps/app",
    compatibility: workerCompatibility,
    env: {
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
