import {
  clearAppContextClientCacheForPromise,
  readFreshAppContextClientCache,
  setAppContextClientCache,
} from "./app-context-client-cache-state";
import type { AppContextClientCacheScope } from "./app-context-client-cache-state";
import { getCurrentAppContext } from "./app-context-functions";
import type { AppAuthContextSnapshot } from "./app-context-types";
import { decodeAppAuthContextSnapshot } from "./app-context-types";

export { clearAppContextClientCache } from "./app-context-client-cache-state";

export interface AppContextClientCacheOptions {
  readonly hydrateOrganizationContext?: boolean | undefined;
}

export function readFreshCachedClientAppContext(
  options: AppContextClientCacheOptions = {}
): Promise<AppAuthContextSnapshot> | undefined {
  return readFreshAppContextClientCache(getCacheScope(options));
}

export async function getCachedClientAppContext(
  options: AppContextClientCacheOptions = {}
): Promise<AppAuthContextSnapshot> {
  const cacheScope = getCacheScope(options);
  const cachedSnapshot = readFreshAppContextClientCache(cacheScope);

  if (cachedSnapshot) {
    return await cachedSnapshot;
  }

  const promise = fetchCurrentAppContext(options);

  setAppContextClientCache(cacheScope, promise);

  try {
    const snapshot = await promise;

    if (snapshot.session === null) {
      clearAppContextClientCacheForPromise(cacheScope, promise);
    }

    return snapshot;
  } catch (error) {
    clearAppContextClientCacheForPromise(cacheScope, promise);

    throw error;
  }
}

function fetchCurrentAppContext(options: AppContextClientCacheOptions) {
  return (async () =>
    decodeAppAuthContextSnapshot(
      await getCurrentAppContext({
        data: {
          hydrateOrganizationContext:
            options.hydrateOrganizationContext === true,
        },
      })
    ))();
}

function getCacheScope(
  options: AppContextClientCacheOptions
): AppContextClientCacheScope {
  return options.hydrateOrganizationContext === true ? "organization" : "auth";
}
