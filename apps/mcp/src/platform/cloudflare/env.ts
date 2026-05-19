/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface McpWorkerBindingRuntimeEnv {
  readonly DOMAIN: DomainServiceBinding;
}

export interface McpWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly NODE_ENV?: string;
}

export type McpWorkerEnv = McpWorkerBindingRuntimeEnv & McpWorkerConfigEnv;
