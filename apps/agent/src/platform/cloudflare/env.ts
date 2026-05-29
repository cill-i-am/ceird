/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface AgentWorkerBindingRuntimeEnv {
  readonly AI: Ai;
  readonly CeirdAgent: DurableObjectNamespace;
  readonly DOMAIN: DomainServiceBinding;
}

export interface AgentWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly AGENT_INTERNAL_SECRET: string;
  readonly AGENT_MODEL?: string;
  readonly AGENT_MUTATION_TOOLS_ENABLED?: string;
  readonly AUTH_APP_ORIGIN?: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly CEIRD_LOCAL_DEV?: "true";
  readonly NODE_ENV?: string;
}

export type AgentWorkerEnv = AgentWorkerBindingRuntimeEnv &
  AgentWorkerConfigEnv;
