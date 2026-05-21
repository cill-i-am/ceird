import { mapAppOriginToServiceOrigin, toURL } from "./app-service-origin";

const LOCAL_API_PORT = "3001";

function mapAppOriginToApiOrigin(url: URL): URL | undefined {
  return mapAppOriginToServiceOrigin(url, {
    localServicePort: LOCAL_API_PORT,
    serviceLabel: "api",
  });
}

export function resolveApiOrigin(
  origin?: string | undefined,
  explicitApiOrigin?: string | undefined
): string | undefined {
  const configuredOrigin = explicitApiOrigin ?? readConfiguredApiOrigin();
  const configuredUrl =
    typeof configuredOrigin === "string" ? toURL(configuredOrigin) : undefined;

  if (configuredUrl) {
    return configuredUrl.origin;
  }

  const url = typeof origin === "string" ? toURL(origin) : undefined;

  if (!url) {
    return undefined;
  }

  return mapAppOriginToApiOrigin(url)?.origin;
}

export function readConfiguredApiOrigin(): string | undefined {
  const envOrigin = import.meta.env.VITE_API_ORIGIN;
  return typeof envOrigin === "string" ? envOrigin : undefined;
}
