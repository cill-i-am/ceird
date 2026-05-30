/// <reference types="@cloudflare/workers-types" />

export interface DomainWorkerBindingRuntimeEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly AUTH_EMAIL?: SendEmail | undefined;
  readonly AUTH_EMAIL_QUEUE?: Queue<unknown> | undefined;
  readonly DATABASE?: Hyperdrive | undefined;
}

export interface DomainWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly AGENT_ACTION_RUN_STALE_AFTER_SECONDS?: string;
  readonly AGENT_INTERNAL_SECRET: string;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_COOKIE_DOMAIN?: string;
  readonly AUTH_COOKIE_PREFIX?: string;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME?: string;
  readonly AUTH_RATE_LIMIT_ENABLED?: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly CEIRD_LOCAL_DEV?: "true";
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE?: string;
  readonly DATABASE_URL?: string;
  readonly GOOGLE_MAPS_API_KEY: string;
  readonly MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES?: string;
  readonly MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS?: string;
  readonly MCP_RESOURCE_URL?: string;
  readonly NODE_ENV?: string;
  readonly OAUTH_ISSUER_URL?: string;
}

export type DomainWorkerEnv = DomainWorkerBindingRuntimeEnv &
  DomainWorkerConfigEnv;

export function domainWorkerEnvConfigMap(env: DomainWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      AGENT_ACTION_RUN_STALE_AFTER_SECONDS:
        env.AGENT_ACTION_RUN_STALE_AFTER_SECONDS,
      AGENT_INTERNAL_SECRET: env.AGENT_INTERNAL_SECRET,
      AUTH_APP_ORIGIN: env.AUTH_APP_ORIGIN,
      AUTH_COOKIE_DOMAIN: env.AUTH_COOKIE_DOMAIN,
      AUTH_COOKIE_PREFIX: env.AUTH_COOKIE_PREFIX,
      AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
      AUTH_EMAIL_FROM_NAME: env.AUTH_EMAIL_FROM_NAME,
      AUTH_RATE_LIMIT_ENABLED: env.AUTH_RATE_LIMIT_ENABLED,
      AUTH_TRUSTED_ORIGINS: env.AUTH_TRUSTED_ORIGINS,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      CEIRD_LOCAL_DEV: env.CEIRD_LOCAL_DEV,
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE:
        env.CEIRD_WORKER_ANALYTICS_SAMPLE_RATE,
      DATABASE_URL: env.DATABASE_URL,
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
      MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES:
        env.MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES,
      MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS:
        env.MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS,
      MCP_RESOURCE_URL: env.MCP_RESOURCE_URL,
      NODE_ENV: env.NODE_ENV,
      OAUTH_ISSUER_URL: env.OAUTH_ISSUER_URL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
