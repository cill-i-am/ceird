export interface AppCloudflareEnv {
  readonly ALCHEMY_STACK_NAME: string;
  readonly ALCHEMY_STAGE: string;
  readonly AGENT_ORIGIN: string;
  readonly API_ORIGIN: string;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly SYSTEM_APP_ORIGIN: string;
  readonly TENANT_BASE_DOMAIN: string;
  readonly TENANT_HOST_MODE: "disabled" | "production" | "stage";
  readonly TENANT_RESERVED_HOSTNAMES: string;
  readonly TENANT_STAGE_ALIAS?: string | undefined;
  readonly VITE_AGENT_ORIGIN: string;
  readonly VITE_API_ORIGIN: string;
  readonly VITE_SYSTEM_APP_ORIGIN: string;
  readonly VITE_TENANT_BASE_DOMAIN: string;
  readonly VITE_TENANT_HOST_MODE: "disabled" | "production" | "stage";
  readonly VITE_TENANT_RESERVED_HOSTNAMES: string;
  readonly VITE_TENANT_STAGE_ALIAS?: string | undefined;
}

declare global {
  type CloudflareEnv = AppCloudflareEnv;
}
