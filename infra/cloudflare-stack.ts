/// <reference types="@cloudflare/workers-types" />

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
export type DomainWorkerBindings = {
  readonly AUTH_EMAIL: Cloudflare.SendEmail;
  readonly AUTH_EMAIL_QUEUE: Cloudflare.Queue;
  readonly DATABASE: Cloudflare.Hyperdrive;
};

export type DomainWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<DomainWorkerBindings>
>;

type DomainWorkerResource = Cloudflare.Worker<DomainWorkerBindings>;
export type WorkerServiceBinding = Service;

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type ApiWorkerBindings = {
  readonly DOMAIN: DomainWorkerResource;
};

export type ApiWorkerBindingEnv = {
  readonly [BindingName in keyof ApiWorkerBindings]: WorkerServiceBinding;
};

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type McpWorkerBindings = {
  readonly DOMAIN: DomainWorkerResource;
};

export type McpWorkerBindingEnv = {
  readonly [BindingName in keyof McpWorkerBindings]: WorkerServiceBinding;
};

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type AgentWorkerBindings = {
  readonly AI: Cloudflare.AiGateway;
  readonly CeirdAgent: Cloudflare.DurableObjectNamespaceLike;
  readonly DOMAIN: DomainWorkerResource;
};

export interface AgentWorkerBindingEnv {
  readonly AI: Ai;
  readonly CeirdAgent: DurableObjectNamespace;
  readonly DOMAIN: WorkerServiceBinding;
}

type ApiWorkerBindingProps = {
  readonly [BindingName in keyof ApiWorkerBindings]:
    | ApiWorkerBindings[BindingName]
    | Effect.Effect<ApiWorkerBindings[BindingName], never, never>;
};

type DomainWorkerBindingProps = {
  readonly [BindingName in keyof DomainWorkerBindings]:
    | DomainWorkerBindings[BindingName]
    | Effect.Effect<DomainWorkerBindings[BindingName], never, never>;
};

type McpWorkerBindingProps = {
  readonly [BindingName in keyof McpWorkerBindings]:
    | McpWorkerBindings[BindingName]
    | Effect.Effect<McpWorkerBindings[BindingName], never, never>;
};

type AgentWorkerBindingProps = {
  readonly [BindingName in keyof AgentWorkerBindings]:
    | AgentWorkerBindings[BindingName]
    | Effect.Effect<AgentWorkerBindings[BindingName], never, never>;
};

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface AppWorkerConfiguredEnv {
  readonly API_ORIGIN: Input<string>;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly VITE_API_ORIGIN: Input<string>;
}

export interface ApiWorkerConfiguredEnv {
  readonly NODE_ENV: "production";
}

export interface DomainWorkerConfiguredEnv {
  readonly AGENT_INTERNAL_SECRET: Input<Redacted.Redacted<string>>;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: Redacted.Redacted<string>;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly AUTH_RATE_LIMIT_ENABLED: "false" | "true";
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: Input<Redacted.Redacted<string>>;
  readonly GOOGLE_MAPS_API_KEY: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
}

export interface McpWorkerConfiguredEnv {
  readonly NODE_ENV: "production";
}

export interface AgentWorkerConfiguredEnv {
  readonly AGENT_INTERNAL_SECRET: Input<Redacted.Redacted<string>>;
  readonly AGENT_MUTATION_TOOLS_ENABLED: "false";
  readonly AUTH_APP_ORIGIN: string;
  readonly NODE_ENV: "production";
}

export function makeDomainWorkerBindings(input: {
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
  } satisfies DomainWorkerBindingProps;
}

export function makeApiWorkerBindings(input: {
  readonly domain: DomainWorkerResource;
}) {
  return {
    DOMAIN: input.domain,
  } satisfies ApiWorkerBindingProps;
}

export function makeMcpWorkerBindings(input: {
  readonly domain: DomainWorkerResource;
}) {
  return {
    DOMAIN: input.domain,
  } satisfies McpWorkerBindingProps;
}

export function makeAgentWorkerBindings(input: {
  readonly ai: Cloudflare.AiGateway;
  readonly domain: DomainWorkerResource;
}) {
  return {
    AI: input.ai,
    CeirdAgent: Cloudflare.DurableObjectNamespace("CeirdAgent", {
      className: "CeirdAgent",
    }),
    DOMAIN: input.domain,
  } satisfies AgentWorkerBindingProps;
}

export function makeDomainWorkerEnv(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: InfraStageConfig;
}): DomainWorkerConfiguredEnv {
  const betterAuthBaseUrl = `https://${input.config.apiHostname}/api/auth`;

  return {
    AGENT_INTERNAL_SECRET: input.agentInternalSecret,
    AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
    AUTH_EMAIL_FROM: input.config.authEmailFrom,
    AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
    AUTH_RATE_LIMIT_ENABLED: input.config.authRateLimitEnabled
      ? "true"
      : "false",
    BETTER_AUTH_BASE_URL: betterAuthBaseUrl,
    BETTER_AUTH_SECRET: input.betterAuthSecret,
    GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
    MCP_RESOURCE_URL: `https://${input.config.mcpHostname}/mcp`,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: betterAuthBaseUrl,
  } satisfies DomainWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeApiWorkerEnv(): ApiWorkerConfiguredEnv {
  return {
    NODE_ENV: "production",
  } satisfies ApiWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeMcpWorkerEnv(): McpWorkerConfiguredEnv {
  return {
    NODE_ENV: "production",
  } satisfies McpWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAgentWorkerEnv(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly config: InfraStageConfig;
}): AgentWorkerConfiguredEnv {
  return {
    AGENT_INTERNAL_SECRET: input.agentInternalSecret,
    AGENT_MUTATION_TOOLS_ENABLED: "false",
    AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
    NODE_ENV: "production",
  } satisfies AgentWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAgentWorkerProps(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly ai: Cloudflare.AiGateway;
  readonly config: InfraStageConfig;
  readonly domain: DomainWorkerResource;
}) {
  return {
    name: resourceName(input.config, "agent"),
    main: "apps/agent/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeAgentWorkerBindings({
      ai: input.ai,
      domain: input.domain,
    }),
    env: {
      ...makeAgentWorkerEnv({
        agentInternalSecret: input.agentInternalSecret,
        config: input.config,
      }),
    },
    domain: input.config.agentHostname,
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: false,
      },
      traces: {
        enabled: true,
      },
    },
    url: false,
  } satisfies InputProps<WorkerProps<AgentWorkerBindingProps>>;
}

export function makeMcpWorkerProps(input: {
  readonly config: InfraStageConfig;
  readonly domain: DomainWorkerResource;
}) {
  return {
    name: resourceName(input.config, "mcp"),
    main: "apps/mcp/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeMcpWorkerBindings({ domain: input.domain }),
    env: { ...makeMcpWorkerEnv() },
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
    url: false,
  } satisfies InputProps<WorkerProps<McpWorkerBindingProps>>;
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

export function makeDomainWorkerProps(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: InfraStageConfig;
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    name: resourceName(input.config, "domain"),
    main: "apps/domain/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeDomainWorkerBindings({
      authEmailQueue: input.authEmailQueue,
      config: input.config,
      hyperdrive: input.hyperdrive,
    }),
    env: {
      ...makeDomainWorkerEnv({
        agentInternalSecret: input.agentInternalSecret,
        betterAuthSecret: input.betterAuthSecret,
        config: input.config,
      }),
    },
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
    url: false,
  } satisfies InputProps<WorkerProps<DomainWorkerBindingProps>>;
}

export const makeCloudflareStack = Effect.fn("CloudflareStack.make")(function* (
  input: CloudflareStackInput
) {
  yield* Effect.annotateCurrentSpan("stage", input.config.stage);
  yield* Effect.annotateCurrentSpan("appHostname", input.config.appHostname);
  yield* Effect.annotateCurrentSpan("apiHostname", input.config.apiHostname);
  yield* Effect.annotateCurrentSpan(
    "agentHostname",
    input.config.agentHostname
  );
  yield* Effect.annotateCurrentSpan("mcpHostname", input.config.mcpHostname);
  yield* Effect.annotateCurrentSpan(
    "hyperdriveId",
    input.hyperdrive.hyperdriveId
  );

  const betterAuthSecret = yield* Alchemy.Random("BetterAuthSecret", {
    bytes: 32,
  });
  const agentInternalSecret = yield* Alchemy.Random("AgentInternalSecret", {
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

  const domain = yield* Cloudflare.Worker(
    "Domain",
    makeDomainWorkerProps({
      agentInternalSecret: agentInternalSecret.text,
      authEmailQueue,
      betterAuthSecret: betterAuthSecret.text,
      config: input.config,
      hyperdrive: input.hyperdrive,
    })
  );

  const api = yield* Cloudflare.Worker("Api", {
    name: resourceName(input.config, "api"),
    main: "apps/api/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeApiWorkerBindings({ domain }),
    env: { ...makeApiWorkerEnv() },
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
    scriptName: domain.workerName,
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

  const mcp = yield* Cloudflare.Worker(
    "Mcp",
    makeMcpWorkerProps({
      config: input.config,
      domain,
    })
  );

  const mcpOrigin = mcp.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.mcpHostname,
      })
    )
  );

  const agentAi = yield* Cloudflare.AiGateway("AgentAiGateway", {
    id: resourceName(input.config, "agent"),
    collectLogs: false,
  });

  const agent = yield* Cloudflare.Worker(
    "Agent",
    makeAgentWorkerProps({
      agentInternalSecret: agentInternalSecret.text,
      ai: agentAi,
      config: input.config,
      domain,
    })
  );

  const agentOrigin = agent.domains.pipe(
    Output.map((domains) =>
      makeCloudflareWorkerOrigin({
        domains,
        fallbackHostname: input.config.agentHostname,
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
    agent,
    agentAi,
    agentOrigin,
    app,
    appOrigin,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database: input.hyperdrive,
    domain,
    mcp,
    mcpOrigin,
  } as const;
});
