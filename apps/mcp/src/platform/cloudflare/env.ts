/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface McpWorkerBindingEnv {
  readonly DOMAIN: DomainServiceBinding;
}

export type McpWorkerBindingRuntimeEnv = McpWorkerBindingEnv;

export interface McpWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly NODE_ENV?: string;
}

export type McpWorkerEnv = McpWorkerBindingRuntimeEnv & McpWorkerConfigEnv;
