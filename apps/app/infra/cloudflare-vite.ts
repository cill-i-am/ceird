import * as Cloudflare from "alchemy/Cloudflare";
import type { ViteProps } from "alchemy/Cloudflare";
import type { Input } from "alchemy/Input";

import type {
  InfraStageConfig,
  TenantHostMode,
} from "../../../infra/stages.ts";

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

export type AppWorkerStageConfig = Pick<
  InfraStageConfig,
  | "appHostname"
  | "tenantBaseDomain"
  | "tenantHostMode"
  | "tenantReservedHostnames"
  | "tenantStageAlias"
>;

export interface AppWorkerConfiguredEnv {
  readonly AGENT_ORIGIN: Input<string>;
  readonly API_ORIGIN: Input<string>;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly SYSTEM_APP_ORIGIN: string;
  readonly TENANT_BASE_DOMAIN: string;
  readonly TENANT_HOST_MODE: TenantHostMode;
  readonly TENANT_RESERVED_HOSTNAMES: string;
  readonly TENANT_STAGE_ALIAS?: string | undefined;
  readonly VITE_AGENT_ORIGIN: Input<string>;
  readonly VITE_API_ORIGIN: Input<string>;
  readonly VITE_SYSTEM_APP_ORIGIN: string;
  readonly VITE_TENANT_BASE_DOMAIN: string;
  readonly VITE_TENANT_HOST_MODE: TenantHostMode;
  readonly VITE_TENANT_RESERVED_HOSTNAMES: string;
  readonly VITE_TENANT_STAGE_ALIAS?: string | undefined;
}

export function makeAppWorkerEnv(input: {
  readonly agentOrigin: Input<string>;
  readonly apiOrigin: Input<string>;
  readonly config: AppWorkerStageConfig;
}): AppWorkerConfiguredEnv {
  const systemAppOrigin = `https://${input.config.appHostname}`;
  const tenantReservedHostnames =
    input.config.tenantReservedHostnames.join(",");

  return {
    AGENT_ORIGIN: input.agentOrigin,
    API_ORIGIN: input.apiOrigin,
    CEIRD_CLOUDFLARE: "1",
    SYSTEM_APP_ORIGIN: systemAppOrigin,
    TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
    TENANT_HOST_MODE: input.config.tenantHostMode,
    TENANT_RESERVED_HOSTNAMES: tenantReservedHostnames,
    ...(input.config.tenantStageAlias === undefined
      ? {}
      : { TENANT_STAGE_ALIAS: input.config.tenantStageAlias }),
    VITE_AGENT_ORIGIN: input.agentOrigin,
    VITE_API_ORIGIN: input.apiOrigin,
    VITE_SYSTEM_APP_ORIGIN: systemAppOrigin,
    VITE_TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
    VITE_TENANT_HOST_MODE: input.config.tenantHostMode,
    VITE_TENANT_RESERVED_HOSTNAMES: tenantReservedHostnames,
    ...(input.config.tenantStageAlias === undefined
      ? {}
      : { VITE_TENANT_STAGE_ALIAS: input.config.tenantStageAlias }),
  } satisfies AppWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAppWorker(input: {
  readonly agentOrigin: Input<string>;
  readonly apiOrigin: Input<string>;
  readonly config: AppWorkerStageConfig;
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
        config: input.config,
      }),
    },
    domain: input.hostname,
    observability: appWorkerObservability,
    url: true,
  });
}
