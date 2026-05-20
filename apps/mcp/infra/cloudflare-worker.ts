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
  readonly DOMAIN: DomainWorkerResource;
};

export type McpWorkerBindingEnv = {
  readonly [BindingName in keyof McpWorkerBindings]: WorkerServiceBinding;
};

type McpWorkerBindingProps = {
  readonly [BindingName in keyof McpWorkerBindings]:
    | McpWorkerBindings[BindingName]
    | Effect.Effect<McpWorkerBindings[BindingName], never, never>;
};

export interface McpWorkerConfiguredEnv {
  readonly NODE_ENV: "production";
}

export function makeMcpWorkerBindings(input: {
  readonly domain: DomainWorkerResource;
}) {
  return {
    DOMAIN: input.domain,
  } satisfies McpWorkerBindingProps;
}

export function makeMcpWorkerEnv(): McpWorkerConfiguredEnv {
  return {
    NODE_ENV: "production",
  } satisfies McpWorkerConfiguredEnv &
    Record<string, NonNullable<WorkerProps["env"]>[string]>;
}

export function makeMcpWorkerProps(input: {
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: mcpWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeMcpWorkerBindings({ domain: input.domain }),
    env: { ...makeMcpWorkerEnv() },
    domain: input.hostname,
    observability: ceirdWorkerObservability,
    url: false,
  } satisfies InputProps<WorkerProps<McpWorkerBindingProps>>;
}

export function makeMcpWorker(input: {
  readonly domain: DomainWorkerResource;
  readonly hostname: string;
  readonly name: string;
}) {
  return Cloudflare.Worker("Mcp", makeMcpWorkerProps(input));
}
