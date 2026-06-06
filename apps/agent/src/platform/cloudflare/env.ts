/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";
import { Schema } from "effect";

const agentAiGatewayIdPattern = /^[a-z0-9-]+$/;

export const AgentAiGatewayId = Schema.NonEmptyString.check(
  Schema.isPattern(agentAiGatewayIdPattern, {
    message:
      "AGENT_AI_GATEWAY_ID may only contain lowercase letters, digits, and hyphens",
  })
).pipe(Schema.brand("@ceird/agent/AiGatewayId"));
export type AgentAiGatewayId = Schema.Schema.Type<typeof AgentAiGatewayId>;
const decodeAgentAiGatewayId = Schema.decodeUnknownSync(AgentAiGatewayId);

export interface AgentWorkerBindingRuntimeEnv {
  readonly AI: Ai;
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly CeirdAgent: DurableObjectNamespace;
  readonly DOMAIN: DomainServiceBinding;
}

export interface AgentWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly AGENT_AI_GATEWAY_ID?: string;
  readonly AGENT_INTERNAL_SECRET: string;
  readonly AGENT_MODEL?: string;
  readonly AGENT_MUTATION_TOOLS_ENABLED?: string;
  readonly AUTH_APP_ORIGIN?: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly CEIRD_LOCAL_DEV?: "true";
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE?: string;
  readonly NODE_ENV?: string;
}

export type AgentWorkerEnv = AgentWorkerBindingRuntimeEnv &
  AgentWorkerConfigEnv;

export function readAgentAiGatewayId(
  env: Pick<AgentWorkerEnv, "AGENT_AI_GATEWAY_ID">
) {
  const value = env.AGENT_AI_GATEWAY_ID?.trim();

  return value === undefined || value.length === 0
    ? undefined
    : decodeAgentAiGatewayId(value);
}
