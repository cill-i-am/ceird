import { getCurrentAppContext } from "./app-context-functions";
import {
  type AppAuthContextSnapshot,
  decodeAppAuthContextSnapshot,
} from "./app-context-types";

const APP_CONTEXT_CLIENT_CACHE_TTL_MS = 10_000;

interface AppContextClientCacheEntry {
  readonly expiresAt: number;
  readonly promise: Promise<AppAuthContextSnapshot>;
}

let appContextClientCache: AppContextClientCacheEntry | undefined;

export function clearAppContextClientCache() {
  appContextClientCache = undefined;
}

export function readFreshCachedClientAppContext():
  | Promise<AppAuthContextSnapshot>
  | undefined {
  if (!isFreshAppContextClientCacheEntry(appContextClientCache)) {
    return undefined;
  }

  return appContextClientCache.promise;
}

export async function getCachedClientAppContext(): Promise<AppAuthContextSnapshot> {
  if (isFreshAppContextClientCacheEntry(appContextClientCache)) {
    return await appContextClientCache.promise;
  }

  const promise = (async () =>
    decodeAppAuthContextSnapshot(await getCurrentAppContext()))();

  appContextClientCache = createAppContextClientCacheEntry(promise);

  try {
    const snapshot = await promise;

    if (
      snapshot.session === null &&
      appContextClientCache?.promise === promise
    ) {
      appContextClientCache = undefined;
    }

    return snapshot;
  } catch (error) {
    if (appContextClientCache?.promise === promise) {
      appContextClientCache = undefined;
    }

    throw error;
  }
}

function createAppContextClientCacheEntry(
  promise: Promise<AppAuthContextSnapshot>
): AppContextClientCacheEntry {
  return {
    expiresAt: Date.now() + APP_CONTEXT_CLIENT_CACHE_TTL_MS,
    promise,
  };
}

function isFreshAppContextClientCacheEntry(
  entry: AppContextClientCacheEntry | undefined
): entry is AppContextClientCacheEntry {
  return entry !== undefined && entry.expiresAt > Date.now();
}
