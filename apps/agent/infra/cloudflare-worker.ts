/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";

import {
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";
import {
  makeAlchemyStageIdentity,
  stageResourceName,
} from "../../../infra/stages.ts";
import type { InfraStageConfig } from "../../../infra/stages.ts";
import type { DomainWorkerResource } from "../../domain/infra/cloudflare-worker.ts";

const agentWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;
const agentWorkerObservability = {
  ...ceirdWorkerObservability,
  logs: {
    ...ceirdWorkerObservability.logs,
    invocationLogs: false,
  },
} satisfies WorkerProps["observability"];

export type WorkerServiceBinding = Service;

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for service bindings.
export type AgentWorkerBindings = {
  readonly AI: Cloudflare.AiGateway;
  readonly ANALYTICS: Cloudflare.AnalyticsEngineDataset;
  readonly CeirdAgent: Cloudflare.DurableObjectNamespaceLike;
  readonly DOMAIN: DomainWorkerResource;
};

export interface AgentWorkerBindingEnv {
  readonly AI: Ai;
  readonly ANALYTICS: AnalyticsEngineDataset;
  readonly CeirdAgent: DurableObjectNamespace;
  readonly DOMAIN: WorkerServiceBinding;
}

type AgentWorkerBindingProps = {
  readonly [BindingName in keyof AgentWorkerBindings]:
    | AgentWorkerBindings[BindingName]
    | Effect.Effect<AgentWorkerBindings[BindingName], never, never>;
};

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface AgentWorkerStageConfig {
  readonly appHostname: string;
  readonly appName: string;
  readonly stage: string;
  readonly tenantTrustedOriginPattern?: string | undefined;
  readonly workerAnalyticsSampleRate: number;
}

export interface AgentWorkerConfiguredEnv {
  readonly AGENT_AI_GATEWAY_ID: Input<string>;
  readonly AGENT_INTERNAL_SECRET: Input<Redacted.Redacted<string>>;
  readonly AGENT_MUTATION_TOOLS_ENABLED: "true";
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly CEIRD_LOCAL_DEV?: "true" | undefined;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly NODE_ENV: "production";
}

export function makeAgentWorkerBindings(input: {
  readonly aiGateway: Cloudflare.AiGateway;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
}) {
  return {
    AI: input.aiGateway,
    ANALYTICS: input.analytics,
    CeirdAgent: Cloudflare.DurableObjectNamespace("CeirdAgent", {
      className: "CeirdAgent",
    }),
    DOMAIN: input.domain,
  } satisfies AgentWorkerBindingProps;
}

export function makeAgentAiGatewayProps(input: {
  readonly config: Pick<InfraStageConfig, "appName" | "stage">;
}) {
  return {
    authentication: true,
    cacheTtl: null,
    collectLogs: false,
    id: stageResourceName(makeAlchemyStageIdentity(input.config), "agent-ai"),
    rateLimitingInterval: null,
    rateLimitingLimit: null,
  } satisfies InputProps<Cloudflare.AiGatewayProps>;
}

export function makeAgentWorkerEnv(input: {
  readonly aiGatewayId: Input<string>;
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly config: AgentWorkerStageConfig;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
}): AgentWorkerConfiguredEnv {
  const authAppOrigin =
    input.localDev === true && input.localAppOrigin
      ? input.localAppOrigin
      : `https://${input.config.appHostname}`;
  const authTrustedOrigins = [
    authAppOrigin,
    input.localDev === true
      ? undefined
      : input.config.tenantTrustedOriginPattern,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(",");

  return {
    AGENT_AI_GATEWAY_ID: input.aiGatewayId,
    AGENT_INTERNAL_SECRET: input.agentInternalSecret,
    AGENT_MUTATION_TOOLS_ENABLED: "true",
    AUTH_APP_ORIGIN: authAppOrigin,
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    ...(input.localDev === true
      ? {
          CEIRD_LOCAL_DEV: "true" as const,
        }
      : {}),
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(
      input.config.workerAnalyticsSampleRate
    ),
    NODE_ENV: "production",
  } satisfies AgentWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAgentWorkerProps(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly aiGateway: Cloudflare.AiGateway;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: AgentWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: agentWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeAgentWorkerBindings({
      aiGateway: input.aiGateway,
      analytics: input.analytics,
      domain: input.domain,
    }),
    env: {
      ...makeAgentWorkerEnv({
        aiGatewayId: input.aiGateway.gatewayId,
        agentInternalSecret: input.agentInternalSecret,
        config: input.config,
        localDev: input.localDev,
        localAppOrigin: input.localAppOrigin,
      }),
    },
    domain: input.hostname,
    observability: agentWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<AgentWorkerBindingProps>>;
}

export const makeAgentWorker = Effect.fn("AgentWorker.make")(function* (input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly aiGateway: Cloudflare.AiGateway;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: AgentWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
}) {
  return yield* Cloudflare.Worker("Agent", makeAgentWorkerProps(input));
});
