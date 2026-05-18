import type { Hyperdrive, Queue, SendEmail } from "@cloudflare/workers-types";

export interface ApiWorkerBindingRuntimeEnv {
  readonly AUTH_EMAIL: SendEmail;
  readonly AUTH_EMAIL_QUEUE: Queue<unknown>;
  readonly DATABASE: Hyperdrive;
}

export interface ApiWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME?: string;
  readonly AUTH_RATE_LIMIT_ENABLED?: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly GOOGLE_MAPS_API_KEY: string;
  readonly MCP_RESOURCE_URL?: string;
  readonly NODE_ENV?: string;
  readonly OAUTH_ISSUER_URL?: string;
}

export type ApiWorkerEnv = ApiWorkerBindingRuntimeEnv & ApiWorkerConfigEnv;

export function apiWorkerEnvConfigMap(env: ApiWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      AUTH_APP_ORIGIN: env.AUTH_APP_ORIGIN,
      AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
      AUTH_EMAIL_FROM_NAME: env.AUTH_EMAIL_FROM_NAME,
      AUTH_RATE_LIMIT_ENABLED: env.AUTH_RATE_LIMIT_ENABLED,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
      MCP_RESOURCE_URL: env.MCP_RESOURCE_URL,
      NODE_ENV: env.NODE_ENV,
      OAUTH_ISSUER_URL: env.OAUTH_ISSUER_URL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
