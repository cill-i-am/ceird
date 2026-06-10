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

const apiWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;

export interface ApiWorkerResourceEnv {
  readonly ANALYTICS?: Cloudflare.AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainWorkerResource;
}

export interface ApiWorkerBindingEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainServiceBinding;
}

export interface ApiWorkerConfiguredEnv {
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly NODE_ENV: "production";
}

type ApiWorkerEnv = ApiWorkerResourceEnv & ApiWorkerConfiguredEnv;
type WorkerEnvShape<Env extends object> = {
  readonly [Key in keyof Env]: Env[Key];
};
type WorkerEnvInput<Env extends object> = {
  readonly [Key in keyof WorkerEnvShape<Env>]: undefined extends WorkerEnvShape<Env>[Key]
    ? Input<Exclude<WorkerEnvShape<Env>[Key], undefined>> | undefined
    : Input<WorkerEnvShape<Env>[Key]>;
};

export function makeApiWorkerResourceEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...(input.localDev === true ? {} : { ANALYTICS: input.analytics }),
    DOMAIN: input.domain,
  } satisfies WorkerEnvInput<ApiWorkerResourceEnv>;
}

export function makeApiWorkerConfiguredEnv(input: {
  readonly workerAnalyticsSampleRate: number;
}): ApiWorkerConfiguredEnv {
  return {
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(input.workerAnalyticsSampleRate),
    NODE_ENV: "production",
  };
}

export function makeApiWorkerEnv(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly config: { readonly workerAnalyticsSampleRate: number };
  readonly domain: DomainWorkerResource;
  readonly localDev?: boolean | undefined;
}) {
  return {
    ...makeApiWorkerResourceEnv({
      analytics: input.analytics,
      domain: input.domain,
      localDev: input.localDev,
    }),
    ...makeApiWorkerConfiguredEnv({
      workerAnalyticsSampleRate: input.config.workerAnalyticsSampleRate,
    }),
  } satisfies WorkerEnvInput<ApiWorkerEnv>;
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
    env: makeApiWorkerEnv({
      analytics: input.analytics,
      config: input.config,
      domain: input.domain,
      localDev: input.localDev,
    }),
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: true,
  } satisfies InputProps<WorkerProps<WorkerEnvShape<ApiWorkerEnv>>>;
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
