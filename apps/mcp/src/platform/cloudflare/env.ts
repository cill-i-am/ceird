import type { Hyperdrive } from "@cloudflare/workers-types";

export interface McpWorkerBindingRuntimeEnv {
  readonly DATABASE: Hyperdrive;
}

export interface McpWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly GOOGLE_MAPS_API_KEY: string;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV?: string;
  readonly OAUTH_ISSUER_URL: string;
}

export type McpWorkerEnv = McpWorkerBindingRuntimeEnv & McpWorkerConfigEnv;

export function mcpWorkerEnvConfigMap(env: McpWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
      MCP_RESOURCE_URL: env.MCP_RESOURCE_URL,
      NODE_ENV: env.NODE_ENV,
      OAUTH_ISSUER_URL: env.OAUTH_ISSUER_URL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
