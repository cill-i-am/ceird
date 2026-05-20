/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { InputProps } from "alchemy/Input";
import type * as Effect from "effect/Effect";

import {
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";
import type { DomainWorkerResource } from "../../domain/infra/cloudflare-worker.ts";

const apiWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;

export type WorkerServiceBinding = Service;

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for service bindings.
export type ApiWorkerBindings = {
  readonly DOMAIN: DomainWorkerResource;
};

export type ApiWorkerBindingEnv = {
  readonly [BindingName in keyof ApiWorkerBindings]: WorkerServiceBinding;
};

type ApiWorkerBindingProps = {
  readonly [BindingName in keyof ApiWorkerBindings]:
    | ApiWorkerBindings[BindingName]
    | Effect.Effect<ApiWorkerBindings[BindingName], never, never>;
};

export interface ApiWorkerConfiguredEnv {
  readonly NODE_ENV: "production";
}

export function makeApiWorkerBindings(input: {
  readonly domain: DomainWorkerResource;
}) {
  return {
    DOMAIN: input.domain,
  } satisfies ApiWorkerBindingProps;
}

export function makeApiWorkerEnv(): ApiWorkerConfiguredEnv {
  return {
    NODE_ENV: "production",
  } satisfies ApiWorkerConfiguredEnv &
    Record<string, NonNullable<WorkerProps["env"]>[string]>;
}

export function makeApiWorkerProps(input: {
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: apiWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeApiWorkerBindings({ domain: input.domain }),
    env: { ...makeApiWorkerEnv() },
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: true,
  } satisfies InputProps<WorkerProps<ApiWorkerBindingProps>>;
}

export function makeApiWorker(input: {
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly name: string;
}) {
  return Cloudflare.Worker("Api", makeApiWorkerProps(input));
}
