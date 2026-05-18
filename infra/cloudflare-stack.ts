import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import type { NeonPostgresResources } from "./neon.ts";
import type { InfraGoogleMapsApiKey, InfraStageConfig } from "./stages.ts";
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

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type McpWorkerBindings = {
  readonly DATABASE: Cloudflare.Hyperdrive;
};

export type ApiWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<ApiWorkerBindings>
>;

export type McpWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<McpWorkerBindings>
>;

type ApiWorkerBindingProps = {
  readonly [BindingName in keyof ApiWorkerBindings]:
    | ApiWorkerBindings[BindingName]
    | Effect.Effect<ApiWorkerBindings[BindingName], never, never>;
};

type McpWorkerBindingProps = {
  readonly [BindingName in keyof McpWorkerBindings]:
    | McpWorkerBindings[BindingName]
    | Effect.Effect<McpWorkerBindings[BindingName], never, never>;
};

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface AppWorkerConfiguredEnv {
  readonly API_ORIGIN: Input<string>;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly VITE_API_ORIGIN: Input<string>;
}

export interface ApiWorkerConfiguredEnv {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: Redacted.Redacted<string>;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: Input<Redacted.Redacted<string>>;
  readonly GOOGLE_MAPS_API_KEY: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
}

export interface McpWorkerConfiguredEnv {
  readonly BETTER_AUTH_BASE_URL: string;
  readonly GOOGLE_MAPS_API_KEY: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
}

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

export function makeMcpWorkerBindings(input: {
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    DATABASE: input.hyperdrive,
  } satisfies McpWorkerBindingProps;
}

export function makeApiWorkerEnv(input: {
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: InfraStageConfig;
}): ApiWorkerConfiguredEnv {
  const apiAuthUrl = `https://${input.config.apiHostname}/api/auth`;
  const mcpResourceUrl = `https://${input.config.mcpHostname}/mcp`;

  return {
    AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
    AUTH_EMAIL_FROM: input.config.authEmailFrom,
    AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
    BETTER_AUTH_BASE_URL: apiAuthUrl,
    BETTER_AUTH_SECRET: input.betterAuthSecret,
    GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
    MCP_RESOURCE_URL: mcpResourceUrl,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: apiAuthUrl,
  } satisfies ApiWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeMcpWorkerEnv(input: {
  readonly config: InfraStageConfig;
}): McpWorkerConfiguredEnv {
  const apiAuthUrl = `https://${input.config.apiHostname}/api/auth`;
  const mcpResourceUrl = `https://${input.config.mcpHostname}/mcp`;

  return {
    BETTER_AUTH_BASE_URL: apiAuthUrl,
    GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
    MCP_RESOURCE_URL: mcpResourceUrl,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: apiAuthUrl,
  } satisfies McpWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeCloudflareWorkerOrigin(input: {
  readonly domains: readonly {
    readonly hostname: string;
    readonly id?: string;
    readonly zoneId?: string;
  }[];
  readonly fallbackHostname: string;
}) {
  return `https://${input.domains[0]?.hostname ?? input.fallbackHostname}`;
}

export function makeAppWorkerEnv(input: {
  readonly apiOrigin: Input<string>;
}): AppWorkerConfiguredEnv {
  return {
    API_ORIGIN: input.apiOrigin,
    CEIRD_CLOUDFLARE: "1",
    VITE_API_ORIGIN: input.apiOrigin,
  } satisfies AppWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeCloudflareHyperdrive(input: {
  readonly config: InfraStageConfig;
  readonly database: NeonPostgresResources;
}) {
  return Cloudflare.Hyperdrive(
    "PostgresHyperdrive",
    makeCloudflareHyperdriveProps({
      config: input.config,
      origin: input.database.hyperdriveOrigin,
    })
  );
}

export function makeCloudflareHyperdriveProps(input: {
  readonly config: InfraStageConfig;
  readonly origin: Input<Cloudflare.HyperdriveOrigin>;
}) {
  return {
    name: input.config.hyperdriveName,
    origin: input.origin,
    originConnectionLimit: input.config.hyperdriveOriginConnectionLimit,
    caching: { disabled: true },
  } satisfies InputProps<Cloudflare.HyperdriveProps>;
}

export const makeCloudflareStack = Effect.fn("CloudflareStack.make")(function* (
  input: CloudflareStackInput
) {
  yield* Effect.annotateCurrentSpan("stage", input.config.stage);
  yield* Effect.annotateCurrentSpan("appHostname", input.config.appHostname);
  yield* Effect.annotateCurrentSpan("apiHostname", input.config.apiHostname);
  yield* Effect.annotateCurrentSpan("mcpHostname", input.config.mcpHostname);
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
      ...makeApiWorkerEnv({
        betterAuthSecret: betterAuthSecret.text,
        config: input.config,
      }),
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

  const apiOrigin = api.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.apiHostname,
      })
    )
  );

  const mcp = yield* Cloudflare.Worker("Mcp", {
    name: resourceName(input.config, "mcp"),
    main: "apps/mcp/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeMcpWorkerBindings({
      hyperdrive: input.hyperdrive,
    }),
    env: {
      ...makeMcpWorkerEnv({
        config: input.config,
      }),
    },
    domain: input.config.mcpHostname,
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

  const mcpOrigin = mcp.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.mcpHostname,
      })
    )
  );

  const app = yield* Cloudflare.Vite("App", {
    name: resourceName(input.config, "app"),
    rootDir: "apps/app",
    compatibility: workerCompatibility,
    env: { ...makeAppWorkerEnv({ apiOrigin }) },
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

  const appOrigin = app.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.appHostname,
      })
    )
  );

  return {
    api,
    apiOrigin,
    app,
    appOrigin,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database: input.hyperdrive,
    mcp,
    mcpOrigin,
  } as const;
});
