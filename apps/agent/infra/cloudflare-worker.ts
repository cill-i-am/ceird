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
  readonly CeirdAgent: Cloudflare.DurableObjectNamespaceLike;
  readonly DOMAIN: DomainWorkerResource;
};

export interface AgentWorkerBindingEnv {
  readonly AI: Ai;
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
  readonly tenantTrustedOriginPattern?: string | undefined;
}

export interface AgentWorkerConfiguredEnv {
  readonly AGENT_INTERNAL_SECRET: Input<Redacted.Redacted<string>>;
  readonly AGENT_MUTATION_TOOLS_ENABLED: "true";
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly CEIRD_LOCAL_DEV?: "true" | undefined;
  readonly NODE_ENV: "production";
}

export function makeAgentWorkerBindings(input: {
  readonly domain: DomainWorkerResource;
}) {
  return {
    CeirdAgent: Cloudflare.DurableObjectNamespace("CeirdAgent", {
      className: "CeirdAgent",
    }),
    DOMAIN: input.domain,
  } satisfies AgentWorkerBindingProps;
}

export function makeAgentWorkersAiBinding() {
  return {
    bindings: [{ type: "ai", name: "AI" }],
  } satisfies Cloudflare.Worker["Binding"];
}

export function makeAgentWorkerEnv(input: {
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
    AGENT_INTERNAL_SECRET: input.agentInternalSecret,
    AGENT_MUTATION_TOOLS_ENABLED: "true",
    AUTH_APP_ORIGIN: authAppOrigin,
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    ...(input.localDev === true
      ? {
          CEIRD_LOCAL_DEV: "true" as const,
        }
      : {}),
    NODE_ENV: "production",
  } satisfies AgentWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAgentWorkerProps(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
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
      domain: input.domain,
    }),
    env: {
      ...makeAgentWorkerEnv({
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

export function makeAgentWorker(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly config: AgentWorkerStageConfig;
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
  readonly name: string;
}) {
  return Effect.gen(function* () {
    const worker = yield* Cloudflare.Worker(
      "Agent",
      makeAgentWorkerProps(input)
    );

    yield* worker.bind("AgentWorkersAiBinding", makeAgentWorkersAiBinding());

    return worker;
  });
}
