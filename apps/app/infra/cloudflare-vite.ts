import * as Cloudflare from "alchemy/Cloudflare";
import type { ViteProps, WorkerProps } from "alchemy/Cloudflare";
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

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export type AppWorkerStageConfig = Pick<
  InfraStageConfig,
  | "authCaptchaEnabled"
  | "authCaptchaTurnstileSiteKey"
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
  readonly CEIRD_LOCAL_DEV?: "true" | undefined;
  readonly SYSTEM_APP_ORIGIN: string;
  readonly TENANT_BASE_DOMAIN: string;
  readonly TENANT_HOST_MODE: TenantHostMode;
  readonly TENANT_RESERVED_HOSTNAMES: string;
  readonly TENANT_STAGE_ALIAS?: string | undefined;
  readonly VITE_AGENT_ORIGIN: Input<string>;
  readonly VITE_API_ORIGIN: Input<string>;
  readonly VITE_AUTH_CAPTCHA_ENABLED?: "false" | "true" | undefined;
  readonly VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY?: string | undefined;
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
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
}): AppWorkerConfiguredEnv {
  const systemAppOrigin =
    input.localDev === true && input.localAppOrigin
      ? input.localAppOrigin
      : `https://${input.config.appHostname}`;
  const tenantHostMode =
    input.localDev === true ? "disabled" : input.config.tenantHostMode;
  const tenantReservedHostnames =
    input.localDev === true
      ? ""
      : input.config.tenantReservedHostnames.join(",");
  const tenantStageAlias =
    input.localDev === true ? undefined : input.config.tenantStageAlias;

  return {
    AGENT_ORIGIN: input.agentOrigin,
    API_ORIGIN: input.apiOrigin,
    CEIRD_CLOUDFLARE: "1",
    ...(input.localDev === true
      ? {
          CEIRD_LOCAL_DEV: "true" as const,
        }
      : {}),
    SYSTEM_APP_ORIGIN: systemAppOrigin,
    TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
    TENANT_HOST_MODE: tenantHostMode,
    TENANT_RESERVED_HOSTNAMES: tenantReservedHostnames,
    ...(tenantStageAlias === undefined
      ? {}
      : { TENANT_STAGE_ALIAS: tenantStageAlias }),
    VITE_AGENT_ORIGIN: input.agentOrigin,
    VITE_API_ORIGIN: input.apiOrigin,
    ...(input.config.authCaptchaEnabled === undefined
      ? {}
      : {
          VITE_AUTH_CAPTCHA_ENABLED: input.config.authCaptchaEnabled
            ? "true"
            : "false",
        }),
    ...(input.config.authCaptchaTurnstileSiteKey === undefined
      ? {}
      : {
          VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY:
            input.config.authCaptchaTurnstileSiteKey,
        }),
    VITE_SYSTEM_APP_ORIGIN: systemAppOrigin,
    VITE_TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
    VITE_TENANT_HOST_MODE: tenantHostMode,
    VITE_TENANT_RESERVED_HOSTNAMES: tenantReservedHostnames,
    ...(tenantStageAlias === undefined
      ? {}
      : { VITE_TENANT_STAGE_ALIAS: tenantStageAlias }),
  } satisfies AppWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeAppWorker(input: {
  readonly agentOrigin: Input<string>;
  readonly apiOrigin: Input<string>;
  readonly config: AppWorkerStageConfig;
  readonly hostname: string;
  readonly localDev?: boolean | undefined;
  readonly localAppOrigin?: string | undefined;
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
        localDev: input.localDev,
        localAppOrigin: input.localAppOrigin,
      }),
    },
    domain: input.hostname,
    observability: appWorkerObservability,
    url: true,
  });
}
