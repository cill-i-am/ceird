/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";

export interface ApiWorkerBindingRuntimeEnv {
  readonly DOMAIN: DomainServiceBinding;
}

export interface ApiWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly NODE_ENV?: string;
}

export type ApiWorkerEnv = ApiWorkerBindingRuntimeEnv & ApiWorkerConfigEnv;

export function apiWorkerEnvConfigMap(env: ApiWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      NODE_ENV: env.NODE_ENV,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
