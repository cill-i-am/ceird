/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";
import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";

import {
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";
import type { DomainWorkerResource } from "../../domain/infra/cloudflare-worker.ts";

const mcpWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;

export interface McpWorkerResourceEnv {
  readonly ANALYTICS?: Cloudflare.AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainWorkerResource;
}

export interface McpWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainServiceBinding;
}

export interface McpWorkerConfiguredEnv {
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly NODE_ENV: "production";
}

type McpWorkerEnv = McpWorkerResourceEnv & McpWorkerConfiguredEnv;
type WorkerEnvShape<Env extends object> = {
  readonly [Key in keyof Env]: Env[Key];
};
type WorkerEnvInput<Env extends object> = {
  readonly [Key in keyof WorkerEnvShape<Env>]: undefined extends WorkerEnvShape<Env>[Key]
    ? Input<Exclude<WorkerEnvShape<Env>[Key], undefined>> | undefined
    : Input<WorkerEnvShape<Env>[Key]>;
};

export function makeMcpWorkerResourceEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...(input.localDev === true ? {} : { ANALYTICS: input.analytics }),
    DOMAIN: input.domain,
  } satisfies WorkerEnvInput<McpWorkerResourceEnv>;
}

export function makeMcpWorkerConfiguredEnv(input: {
  readonly workerAnalyticsSampleRate: number;
}): McpWorkerConfiguredEnv {
  return {
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(input.workerAnalyticsSampleRate),
    NODE_ENV: "production",
  };
}

export function makeMcpWorkerEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...makeMcpWorkerResourceEnv({
      analytics: input.analytics,
      domain: input.domain,
      localDev: input.localDev,
    }),
    ...makeMcpWorkerConfiguredEnv({
      workerAnalyticsSampleRate: input.config.workerAnalyticsSampleRate,
    }),
  } satisfies WorkerEnvInput<McpWorkerEnv>;
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
    env: makeMcpWorkerEnv({
      analytics: input.analytics,
      config: input.config,
      domain: input.domain,
      localDev: input.localDev,
    }),
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<WorkerEnvShape<McpWorkerEnv>>>;
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
