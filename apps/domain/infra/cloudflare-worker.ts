/// <reference types="@cloudflare/workers-types" />

import * as Cloudflare from "alchemy/Cloudflare";
import type { WorkerProps } from "alchemy/Cloudflare";
import type { Input, InputProps } from "alchemy/Input";
import type * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import {
  ceirdDomainWorkerPlacement,
  ceirdWorkerCompatibility,
  ceirdWorkerObservability,
} from "../../../infra/cloudflare-worker-defaults.ts";

const domainWorkerMain = new URL("../src/worker.ts", import.meta.url).pathname;

export interface DomainWorkerStageConfig {
  readonly agentActionRunStaleAfterSeconds: number;
  readonly apiHostname: string;
  readonly appHostname: string;
  readonly authCookieDomain?: string | undefined;
  readonly authCookiePrefix: string;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly authRateLimitEnabled: boolean;
  readonly googleMapsApiKey: Redacted.Redacted<string>;
  readonly mcpAuthorizedAppCacheMaxEntries?: number | undefined;
  readonly mcpAuthorizedAppCacheTtlSeconds?: number | undefined;
  readonly mcpHostname: string;
  readonly stage?: string | undefined;
  readonly tenantBaseDomain: string;
  readonly tenantTrustedOriginPattern: string | undefined;
  readonly workerAnalyticsSampleRate: number;
}

// oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Cloudflare.Worker needs an exact keyed object type for InferEnv.
export type DomainWorkerBindings = {
  readonly ANALYTICS: Cloudflare.AnalyticsEngineDataset;
  readonly AUTH_EMAIL?: Cloudflare.SendEmail | undefined;
  readonly AUTH_EMAIL_QUEUE?: Cloudflare.Queue | undefined;
  readonly DATABASE?: Cloudflare.Hyperdrive | undefined;
};

export type DomainWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<DomainWorkerBindings>
>;

export type DomainWorkerResource = Cloudflare.Worker<DomainWorkerBindings>;

type DomainWorkerBindingProps = {
  readonly [BindingName in keyof DomainWorkerBindings]:
    | NonNullable<DomainWorkerBindings[BindingName]>
    | Effect.Effect<
        NonNullable<DomainWorkerBindings[BindingName]>,
        never,
        never
      >;
};

type WorkerConfiguredEnvValue = Input<NonNullable<WorkerProps["env"]>[string]>;
type WorkerConfiguredEnv = Record<string, WorkerConfiguredEnvValue>;

export interface DomainWorkerConfiguredEnv {
  readonly AGENT_ACTION_RUN_STALE_AFTER_SECONDS: string;
  readonly AGENT_INTERNAL_SECRET: Input<Redacted.Redacted<string>>;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_COOKIE_DOMAIN?: string | undefined;
  readonly AUTH_COOKIE_PREFIX: string;
  readonly AUTH_EMAIL_FROM: Redacted.Redacted<string>;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly AUTH_RATE_LIMIT_ENABLED: "false" | "true";
  readonly AUTH_TRUSTED_ORIGINS: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: Input<Redacted.Redacted<string>>;
  readonly CEIRD_LOCAL_DEV?: "true" | undefined;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: string;
  readonly DATABASE_URL?: Input<Redacted.Redacted<string>> | undefined;
  readonly GOOGLE_MAPS_API_KEY: Redacted.Redacted<string>;
  readonly MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES?: string | undefined;
  readonly MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS?: string | undefined;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
}

export function makeDomainWorkerBindings(input: {
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly config: Pick<DomainWorkerStageConfig, "authEmailFrom">;
  readonly hyperdrive: Cloudflare.Hyperdrive;
  readonly localDev?: boolean | undefined;
}): DomainWorkerBindingProps {
  if (input.localDev === true) {
    return {
      ANALYTICS: input.analytics,
    } satisfies DomainWorkerBindingProps;
  }

  return {
    ANALYTICS: input.analytics,
    AUTH_EMAIL: Cloudflare.SendEmail("AuthEmailBinding", {
      allowedSenderAddresses: [Redacted.value(input.config.authEmailFrom)],
    }),
    AUTH_EMAIL_QUEUE: input.authEmailQueue,
    DATABASE: input.hyperdrive,
  } satisfies DomainWorkerBindingProps;
}

export function makeDomainWorkerEnv(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly localDev?: boolean | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
}): DomainWorkerConfiguredEnv {
  const authAppOrigin =
    input.localDev === true && input.localOrigins
      ? input.localOrigins.app
      : `https://${input.config.appHostname}`;
  const apiOrigin =
    input.localDev === true && input.localOrigins
      ? input.localOrigins.api
      : `https://${input.config.apiHostname}`;
  const mcpOrigin =
    input.localDev === true && input.localOrigins
      ? input.localOrigins.mcp
      : `https://${input.config.mcpHostname}`;
  const betterAuthBaseUrl = `${apiOrigin}/api/auth`;
  const authTrustedOrigins = [
    authAppOrigin,
    input.localDev === true
      ? undefined
      : input.config.tenantTrustedOriginPattern,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(",");

  return {
    AGENT_ACTION_RUN_STALE_AFTER_SECONDS: String(
      input.config.agentActionRunStaleAfterSeconds
    ),
    AGENT_INTERNAL_SECRET: input.agentInternalSecret,
    AUTH_APP_ORIGIN: authAppOrigin,
    AUTH_COOKIE_PREFIX: input.config.authCookiePrefix,
    AUTH_EMAIL_FROM: input.config.authEmailFrom,
    AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
    AUTH_RATE_LIMIT_ENABLED: input.config.authRateLimitEnabled
      ? "true"
      : "false",
    AUTH_TRUSTED_ORIGINS: authTrustedOrigins,
    BETTER_AUTH_BASE_URL: betterAuthBaseUrl,
    BETTER_AUTH_SECRET: input.betterAuthSecret,
    ...(input.localDev === true
      ? {
          CEIRD_LOCAL_DEV: "true" as const,
        }
      : {}),
    CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: String(
      input.config.workerAnalyticsSampleRate
    ),
    ...(input.databaseUrl === undefined
      ? {}
      : {
          DATABASE_URL: input.databaseUrl,
        }),
    GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
    ...(input.config.authCookieDomain === undefined || input.localDev === true
      ? {}
      : {
          AUTH_COOKIE_DOMAIN: input.config.authCookieDomain,
        }),
    ...(input.config.mcpAuthorizedAppCacheMaxEntries === undefined
      ? {}
      : {
          MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: String(
            input.config.mcpAuthorizedAppCacheMaxEntries
          ),
        }),
    ...(input.config.mcpAuthorizedAppCacheTtlSeconds === undefined
      ? {}
      : {
          MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: String(
            input.config.mcpAuthorizedAppCacheTtlSeconds
          ),
        }),
    MCP_RESOURCE_URL: `${mcpOrigin}/mcp`,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: betterAuthBaseUrl,
  } satisfies DomainWorkerConfiguredEnv & WorkerConfiguredEnv;
}

export function makeDomainWorkerProps(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly hyperdrive: Cloudflare.Hyperdrive;
  readonly localDev?: boolean | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
  readonly name: string;
}) {
  return {
    name: input.name,
    main: domainWorkerMain,
    compatibility: ceirdWorkerCompatibility,
    bindings: makeDomainWorkerBindings({
      analytics: input.analytics,
      authEmailQueue: input.authEmailQueue,
      config: input.config,
      hyperdrive: input.hyperdrive,
      localDev: input.localDev,
    }),
    env: {
      ...makeDomainWorkerEnv({
        agentInternalSecret: input.agentInternalSecret,
        betterAuthSecret: input.betterAuthSecret,
        config: input.config,
        databaseUrl: input.databaseUrl,
        localDev: input.localDev,
        localOrigins: input.localOrigins,
      }),
    },
    observability: ceirdWorkerObservability,
    placement: ceirdDomainWorkerPlacement,
    url: false,
  } satisfies InputProps<WorkerProps<DomainWorkerBindingProps>>;
}

export function makeDomainWorker(input: {
  readonly agentInternalSecret: Input<Redacted.Redacted<string>>;
  readonly analytics: Cloudflare.AnalyticsEngineDataset;
  readonly authEmailQueue: Cloudflare.Queue;
  readonly betterAuthSecret: Input<Redacted.Redacted<string>>;
  readonly config: DomainWorkerStageConfig;
  readonly databaseUrl?: Input<Redacted.Redacted<string>> | undefined;
  readonly hyperdrive: Cloudflare.Hyperdrive;
  readonly localDev?: boolean | undefined;
  readonly localOrigins?:
    | {
        readonly app: string;
        readonly api: string;
        readonly mcp: string;
      }
    | undefined;
  readonly name: string;
}) {
  return Cloudflare.Worker("Domain", makeDomainWorkerProps(input));
}
