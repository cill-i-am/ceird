import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { Hyperdrive } from "./cloudflare-hyperdrive.ts";
import type { PlanetScalePostgresResources } from "./planet-scale.ts";
import type { InfraStageConfig } from "./stages.ts";
import { resourceName } from "./stages.ts";

const workerCompatibility = {
  date: "2026-04-30",
  flags: ["nodejs_compat"],
} satisfies NonNullable<WorkerProps["compatibility"]>;

type WorkerEnv = Record<string, Input<string | Redacted.Redacted<string>>>;

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: PlanetScalePostgresResources;
  readonly hyperdrive: Hyperdrive;
  readonly migrationRunId?: Input<string>;
}

export function makeCloudflareHyperdrive(input: {
  readonly config: InfraStageConfig;
  readonly database: PlanetScalePostgresResources;
}) {
  return Hyperdrive("PostgresHyperdrive", {
    name: resourceName(input.config, "postgres"),
    origin: input.database.appRole.connectionUrl.pipe(
      Output.map((databaseUrl) =>
        hyperdriveOriginFromDatabaseUrl(Redacted.value(databaseUrl))
      )
    ),
    originConnectionLimit: input.config.hyperdriveOriginConnectionLimit,
    caching: { disabled: true },
    delete: false,
  });
}

export function makeCloudflareStack(input: CloudflareStackInput) {
  return Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;
    const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
      bytes: 32,
    });
    const authEmailCloudflareApiEnv: WorkerEnv = {};
    if (input.config.authEmailTransport === "cloudflare-api") {
      const authEmailApiToken = yield* Cloudflare.AccountApiToken(
        "AuthEmailApiToken",
        {
          name: resourceName(input.config, "auth-email-runtime-token"),
          policies: [
            {
              effect: "allow",
              permissionGroups: ["Email Sending Write"],
              resources: {
                [`com.cloudflare.api.account.${accountId}`]: "*",
              },
            },
          ],
        }
      );

      authEmailCloudflareApiEnv.CLOUDFLARE_ACCOUNT_ID =
        authEmailApiToken.accountId;
      authEmailCloudflareApiEnv.CLOUDFLARE_API_TOKEN = authEmailApiToken.value;
    }
    const googleGeocodingEnv: WorkerEnv = {};
    if (input.config.googleMapsApiKey !== undefined) {
      googleGeocodingEnv.GOOGLE_MAPS_API_KEY = Redacted.value(
        input.config.googleMapsApiKey
      );
    }
    const apiEnv: WorkerEnv = {
      AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
      AUTH_EMAIL_FROM: input.config.authEmailFrom,
      AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
      AUTH_EMAIL_TRANSPORT: input.config.authEmailTransport,
      BETTER_AUTH_BASE_URL: `https://${input.config.apiHostname}/api/auth`,
      BETTER_AUTH_SECRET: betterAuthSecret.text,
      NODE_ENV: "production",
      SENTRY_DSN: input.config.sentryDsn,
      SENTRY_ENVIRONMENT: input.config.stage,
      SENTRY_TRACES_SAMPLE_RATE: String(input.config.sentryTracesSampleRate),
      SITE_GEOCODER_MODE: input.config.siteGeocoderMode,
      ...authEmailCloudflareApiEnv,
      ...googleGeocodingEnv,
    };
    if (input.config.sentryRelease !== undefined) {
      apiEnv.SENTRY_RELEASE = input.config.sentryRelease;
    }
    if (input.migrationRunId) {
      apiEnv.CEIRD_MIGRATIONS_RUN_ID = input.migrationRunId;
    }

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
      env: apiEnv,
      build: apiWorkerBuild(input.config),
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

    if (input.config.authEmailTransport === "cloudflare-binding") {
      yield* api.bind`AuthEmailBinding`({
        bindings: [
          {
            type: "send_email",
            name: "AUTH_EMAIL",
            allowedSenderAddresses: [
              Redacted.value(input.config.authEmailFrom),
            ],
          },
        ],
      });
    }

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
}

function apiWorkerBuild(config: InfraStageConfig): WorkerProps["build"] {
  if (
    !config.sentryApiSourceMapUploadEnabled ||
    config.sentryOrg === undefined ||
    config.sentryRelease === undefined
  ) {
    return undefined;
  }

  return {
    plugins: sentryRollupPlugin({
      org: config.sentryOrg,
      project: config.sentryApiProject,
      release: {
        create: true,
        finalize: true,
        inject: false,
        name: config.sentryRelease,
        setCommits: false,
      },
      telemetry: false,
    }),
    write: true,
  };
}

function hyperdriveOriginFromDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    database: url.pathname.slice(1),
    host: url.hostname,
    password: Redacted.make(decodeURIComponent(url.password)),
    port: Number.parseInt(url.port || "5432", 10),
    scheme: "postgres",
    user: decodeURIComponent(url.username),
  } as const;
}
