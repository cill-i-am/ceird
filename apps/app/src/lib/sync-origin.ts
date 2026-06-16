import { mapAppOriginToServiceOrigin, toURL } from "./app-service-origin";
import type { TenantHostConfig } from "./tenant-host";
import { parseTenantHost, readTenantHostConfigFromEnv } from "./tenant-host";

function mapAppOriginToSyncOrigin(url: URL): URL | undefined {
  return mapAppOriginToServiceOrigin(url, {
    serviceLabel: "sync",
  });
}

function mapTenantOriginToSyncOrigin(
  url: URL,
  config: TenantHostConfig
): URL | undefined {
  const resolution = parseTenantHost(url.hostname, config);

  if (resolution.kind !== "tenant") {
    return;
  }

  const baseDomain = config.baseDomain.trim().toLowerCase();

  if (baseDomain.length === 0) {
    return;
  }

  const syncHost =
    config.hostMode === "stage" && config.stageAlias
      ? `sync.${config.stageAlias.trim().toLowerCase()}.${baseDomain}`
      : `sync.${baseDomain}`;
  const mapped = new URL(url.toString());
  mapped.hostname = syncHost;
  mapped.pathname = "";
  mapped.search = "";
  mapped.hash = "";

  return mapped;
}

export function resolveSyncOrigin(
  origin?: string | undefined,
  explicitSyncOrigin?: string | undefined,
  tenantConfig: TenantHostConfig = readTenantHostConfigFromEnv()
): string | undefined {
  const configuredOrigin = explicitSyncOrigin ?? readConfiguredSyncOrigin();

  if (typeof configuredOrigin === "string") {
    const trimmed = configuredOrigin.trim();

    if (trimmed.length > 0) {
      const configuredUrl = toURL(trimmed);

      return configuredUrl &&
        configuredUrl.username.length === 0 &&
        configuredUrl.password.length === 0
        ? configuredUrl.origin
        : trimmed;
    }
  }

  const url = typeof origin === "string" ? toURL(origin) : undefined;

  if (!url) {
    return undefined;
  }

  return (
    mapAppOriginToSyncOrigin(url)?.origin ??
    mapTenantOriginToSyncOrigin(url, tenantConfig)?.origin
  );
}

export function readConfiguredSyncOrigin(): string | undefined {
  const envOrigin = import.meta.env.VITE_SYNC_ORIGIN;
  return typeof envOrigin === "string" ? envOrigin : undefined;
}
