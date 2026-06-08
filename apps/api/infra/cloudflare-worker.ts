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
  readonly ANALYTICS?: Cloudflare.AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainWorkerResource;
};

export interface ApiWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: WorkerServiceBinding;
}

type ApiWorkerBindingProps = {
  readonly [BindingName in keyof ApiWorkerBindings]:
    | NonNullable<ApiWorkerBindings[BindingName]>
    | Effect.Effect<NonNullable<ApiWorkerBindings[BindingName]>, never, never>;
};

export interface ApiWorkerConfiguredEnv {
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly NODE_ENV: "production";
}

export function makeApiWorkerBindings(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...(input.localDev === true ? {} : { ANALYTICS: input.analytics }),
    DOMAIN: input.domain,
  } satisfies ApiWorkerBindingProps;
}

export function makeApiWorkerEnv(input: {
  readonly workerAnalyticsSampleRate: number;
}): ApiWorkerConfiguredEnv {
  return {
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(input.workerAnalyticsSampleRate),
    NODE_ENV: "production",
  } satisfies ApiWorkerConfiguredEnv &
    Record<string, NonNullable<WorkerProps["env"]>[string]>;
}

export function makeApiWorkerProps(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: apiWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeApiWorkerBindings({
      analytics: input.analytics,
      domain: input.domain,
      localDev: input.localDev,
    }),
    env: {
      ...makeApiWorkerEnv({
        workerAnalyticsSampleRate: input.config.workerAnalyticsSampleRate,
      }),
    },
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: true,
  } satisfies InputProps<WorkerProps<ApiWorkerBindingProps>>;
}

export function makeApiWorker(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly name: string;
}) {
  return Cloudflare.Worker("Api", makeApiWorkerProps(input));
}
