/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface ApiWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainServiceBinding;
}

export type ApiWorkerBindingRuntimeEnv = ApiWorkerBindingEnv;

export interface ApiWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE?: string;
  readonly NODE_ENV?: string;
}

export type ApiWorkerEnv = ApiWorkerBindingRuntimeEnv & ApiWorkerConfigEnv;

export function apiWorkerEnvConfigMap(env: ApiWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE:
        env.CEIRD_WORKER_ANALYTICS_SAMPLE_RATE,
      NODE_ENV: env.NODE_ENV,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
