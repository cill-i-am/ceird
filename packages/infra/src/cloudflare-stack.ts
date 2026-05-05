import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { Hyperdrive } from "./cloudflare-hyperdrive.ts";
import type { PlanetScalePostgresResources } from "./planet-scale.ts";
import type { InfraStageConfig } from "./stages.ts";
import { resourceName } from "./stages.ts";

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: PlanetScalePostgresResources;
}

export function makeCloudflareStack(input: CloudflareStackInput) {
  return Effect.gen(function* () {
    const { accountId } = yield* Cloudflare.CloudflareEnvironment;
    const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
      bytes: 32,
    });
    let authEmailCloudflareApiEnv = {};
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

      authEmailCloudflareApiEnv = {
        CLOUDFLARE_ACCOUNT_ID: authEmailApiToken.accountId,
        CLOUDFLARE_API_TOKEN: authEmailApiToken.value,
      };
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

    const database = yield* Hyperdrive("PostgresHyperdrive", {
      name: resourceName(input.config, "postgres"),
      origin: input.database.appRole.connectionUrl.pipe(
        Output.map((databaseUrl) =>
          hyperdriveOriginFromDatabaseUrl(Redacted.value(databaseUrl))
        )
      ),
      caching: { disabled: true },
      delete: false,
    });

    const api = yield* Cloudflare.Worker("Api", {
      name: resourceName(input.config, "api"),
      main: "../../apps/api/src/worker.ts",
      compatibility: {
        date: "2026-04-30",
        flags: ["nodejs_compat"],
      },
      bindings: {
        AUTH_EMAIL_QUEUE: authEmailQueue,
      },
      env: {
        AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
        AUTH_EMAIL_FROM: input.config.authEmailFrom,
        AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
        AUTH_EMAIL_TRANSPORT: input.config.authEmailTransport,
        BETTER_AUTH_BASE_URL: `https://${input.config.apiHostname}/api/auth`,
        BETTER_AUTH_SECRET: betterAuthSecret.text,
        NODE_ENV: "production",
        ...authEmailCloudflareApiEnv,
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
          id: database.hyperdriveId,
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
      compatibility: {
        date: "2026-04-30",
        flags: ["nodejs_compat"],
      },
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
      database,
    } as const;
  });
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
