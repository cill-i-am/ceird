import { mapAppOriginToServiceOrigin, toURL } from "./app-service-origin";

function isTestMode() {
  return import.meta.env.MODE === "test";
}

function mapAppOriginToAgentOrigin(url: URL): URL | undefined {
  return mapAppOriginToServiceOrigin(url, {
    allowRawLocalOrigin: isTestMode(),
    serviceLabel: "agent",
  });
}

export function resolveAgentOrigin(
  origin?: string | undefined,
  explicitAgentOrigin?: string | undefined
): string | undefined {
  const configuredOrigin = explicitAgentOrigin ?? readConfiguredAgentOrigin();
  const configuredUrl =
    typeof configuredOrigin === "string" ? toURL(configuredOrigin) : undefined;

  if (configuredUrl) {
    return configuredUrl.origin;
  }

  const url = typeof origin === "string" ? toURL(origin) : undefined;

  if (!url) {
    return undefined;
  }

  return mapAppOriginToAgentOrigin(url)?.origin;
}

export function resolveAgentHost(
  origin?: string | undefined,
  explicitAgentOrigin?: string | undefined
): string | undefined {
  const resolvedOrigin = resolveAgentOrigin(origin, explicitAgentOrigin);
  const url =
    typeof resolvedOrigin === "string" ? toURL(resolvedOrigin) : undefined;

  return url?.host;
}

export function readConfiguredAgentOrigin(): string | undefined {
  const envOrigin = import.meta.env.VITE_AGENT_ORIGIN;
  return typeof envOrigin === "string" ? envOrigin : undefined;
}
