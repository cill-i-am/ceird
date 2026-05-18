export interface AppCloudflareEnv {
  readonly ALCHEMY_STACK_NAME: string;
  readonly ALCHEMY_STAGE: string;
  readonly API_ORIGIN: string;
  readonly CEIRD_CLOUDFLARE: "1";
  readonly VITE_API_ORIGIN: string;
}

declare global {
  type CloudflareEnv = AppCloudflareEnv;
}
