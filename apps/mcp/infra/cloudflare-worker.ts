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

const mcpWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;

export type WorkerServiceBinding = Service;

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for service bindings.
export type McpWorkerBindings = {
  readonly ANALYTICS?: Cloudflare.AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainWorkerResource;
};

export interface McpWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: WorkerServiceBinding;
}

type McpWorkerBindingProps = {
  readonly [BindingName in keyof McpWorkerBindings]:
    | NonNullable<McpWorkerBindings[BindingName]>
    | Effect.Effect<NonNullable<McpWorkerBindings[BindingName]>, never, never>;
};

export interface McpWorkerConfiguredEnv {
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly NODE_ENV: "production";
}

export function makeMcpWorkerBindings(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...(input.localDev === true ? {} : { ANALYTICS: input.analytics }),
    DOMAIN: input.domain,
  } satisfies McpWorkerBindingProps;
}

export function makeMcpWorkerEnv(input: {
  readonly workerAnalyticsSampleRate: number;
}): McpWorkerConfiguredEnv {
  return {
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(input.workerAnalyticsSampleRate),
    NODE_ENV: "production",
  } satisfies McpWorkerConfiguredEnv &
    Record<string, NonNullable<WorkerProps["env"]>[string]>;
}

export function makeMcpWorkerProps(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: mcpWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeMcpWorkerBindings({
      analytics: input.analytics,
      domain: input.domain,
      localDev: input.localDev,
    }),
    env: {
      ...makeMcpWorkerEnv({
        workerAnalyticsSampleRate: input.config.workerAnalyticsSampleRate,
      }),
    },
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<McpWorkerBindingProps>>;
}

export function makeMcpWorker(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly name: string;
}) {
  return Cloudflare.Worker("Mcp", makeMcpWorkerProps(input));
}
