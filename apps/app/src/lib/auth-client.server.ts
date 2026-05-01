import { readConfiguredServerApiOrigin } from "./api-origin.server";
import { resolveAuthBaseURL } from "./auth-client";

export function resolveConfiguredServerAuthBaseURL(): string | undefined {
  return resolveAuthBaseURL(undefined, readConfiguredServerApiOrigin());
}
