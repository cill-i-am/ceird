import { env as cloudflareEnv } from "cloudflare:workers";

interface ServerApiOriginEnv {
  readonly API_ORIGIN?: string | undefined;
}

function readOptionalOrigin(value: string | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readConfiguredServerApiOrigin(
  runtimeEnv: ServerApiOriginEnv = cloudflareEnv
): string | undefined {
  const processEnvOrigin = (
    globalThis as unknown as {
      readonly process?: {
        readonly env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.API_ORIGIN;

  return (
    readOptionalOrigin(runtimeEnv.API_ORIGIN) ??
    readOptionalOrigin(processEnvOrigin)
  );
}
