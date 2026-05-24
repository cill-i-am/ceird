import {
  createExpiringPromiseCacheEntry,
  isFreshExpiringPromiseCacheEntry,
} from "#/lib/expiring-promise-cache";
import type { ExpiringPromiseCacheEntry } from "#/lib/expiring-promise-cache";

import type { AppAuthContextSnapshot } from "./app-context-types";

const APP_CONTEXT_CLIENT_CACHE_TTL_MS = 10_000;

export type AppContextClientCacheScope = "auth" | "organization";

const appContextClientCache = new Map<
  AppContextClientCacheScope,
  ExpiringPromiseCacheEntry<AppAuthContextSnapshot>
>();

export function clearAppContextClientCache() {
  appContextClientCache.clear();
}

export function readFreshAppContextClientCache(
  scope: AppContextClientCacheScope
): Promise<AppAuthContextSnapshot> | undefined {
  if (scope === "auth") {
    return (
      readFreshScopedAppContextClientCache("organization") ??
      readFreshScopedAppContextClientCache("auth")
    );
  }

  return readFreshScopedAppContextClientCache(scope);
}

export function setAppContextClientCache(
  scope: AppContextClientCacheScope,
  promise: Promise<AppAuthContextSnapshot>
) {
  appContextClientCache.set(
    scope,
    createExpiringPromiseCacheEntry(promise, APP_CONTEXT_CLIENT_CACHE_TTL_MS)
  );
}

export function clearAppContextClientCacheForPromise(
  scope: AppContextClientCacheScope,
  promise: Promise<AppAuthContextSnapshot>
) {
  if (appContextClientCache.get(scope)?.promise === promise) {
    appContextClientCache.delete(scope);
  }
}

function readFreshScopedAppContextClientCache(
  scope: AppContextClientCacheScope
) {
  const cachedSnapshot = appContextClientCache.get(scope);

  if (!isFreshExpiringPromiseCacheEntry(cachedSnapshot)) {
    appContextClientCache.delete(scope);
    return;
  }

  return cachedSnapshot.promise;
}
