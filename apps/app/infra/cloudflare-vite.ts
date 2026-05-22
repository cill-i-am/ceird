import * as Cloudflare from "alchemy/Cloudflare";
import type { ViteProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";

const appWorkerCompatibility = {
  date: "2026-04-30",
  flags: ["nodejs_compat"],
} satisfies NonNullable<ViteProps["compatibility"]>;

const appWorkerObservability = {
  enabled: true,
  logs: {
    enabled: true,
    invocationLogs: true,
  },
  traces: {
    enabled: true,
  },
} satisfies NonNullable<ViteProps["observability"]>;

type WorkerConfiguredEnvValue = Input<NonNullable<ViteProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface AppWorkerConfiguredEnv {
  readonly AGENT_ORIGIN: Input<string>;
  readonly API_ORIGIN: Input<string>;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly VITE_AGENT_ORIGIN: Input<string>;
  readonly VITE_API_ORIGIN: Input<string>;
}

export function makeAppWorkerEnv(input: {
  readonly agentOrigin: Input<string>;
  readonly apiOrigin: Input<string>;
}): AppWorkerConfiguredEnv {
  return {
    AGENT_ORIGIN: input.agentOrigin,
    API_ORIGIN: input.apiOrigin,
    CEIRD_CLOUDFLARE: "1",
    VITE_AGENT_ORIGIN: input.agentOrigin,
    VITE_API_ORIGIN: input.apiOrigin,
  } satisfies AppWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAppWorker(input: {
  readonly agentOrigin: Input<string>;
  readonly apiOrigin: Input<string>;
  readonly hostname: string;
  readonly name: string;
}) {
  return Cloudflare.Vite("App", {
    name: input.name,
    rootDir: "apps/app",
    compatibility: appWorkerCompatibility,
    env: {
      ...makeAppWorkerEnv({
        agentOrigin: input.agentOrigin,
        apiOrigin: input.apiOrigin,
      }),
    },
    domain: input.hostname,
    observability: appWorkerObservability,
    url: true,
  });
}
