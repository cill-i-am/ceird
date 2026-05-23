import { authClient } from "#/lib/auth-client";

const CLIENT_AUTH_SESSION_CACHE_TTL_MS = 10_000;

export type ClientAuthSession = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;

interface ClientAuthSessionCacheEntry {
  readonly expiresAt: number;
  readonly promise: Promise<ClientAuthSession | null>;
}

let clientAuthSessionCache: ClientAuthSessionCacheEntry | undefined;

export function clearClientAuthSessionCache() {
  clientAuthSessionCache = undefined;
}

export async function getCachedClientAuthSession(): Promise<ClientAuthSession | null> {
  if (isFreshClientAuthSessionCacheEntry(clientAuthSessionCache)) {
    return await clientAuthSessionCache.promise;
  }

  const promise = (async () =>
    readClientAuthSession(await authClient.getSession()))();

  clientAuthSessionCache = createClientAuthSessionCacheEntry(promise);

  try {
    const session = await promise;

    if (session === null && clientAuthSessionCache?.promise === promise) {
      clientAuthSessionCache = undefined;
    }

    return session;
  } catch (error) {
    if (clientAuthSessionCache?.promise === promise) {
      clientAuthSessionCache = undefined;
    }

    throw error;
  }
}

function createClientAuthSessionCacheEntry(
  promise: Promise<ClientAuthSession | null>
): ClientAuthSessionCacheEntry {
  return {
    expiresAt: Date.now() + CLIENT_AUTH_SESSION_CACHE_TTL_MS,
    promise,
  };
}

function isFreshClientAuthSessionCacheEntry(
  entry: ClientAuthSessionCacheEntry | undefined
): entry is ClientAuthSessionCacheEntry {
  return entry !== undefined && entry.expiresAt > Date.now();
}

function readClientAuthSession(
  input: Awaited<ReturnType<typeof authClient.getSession>>
) {
  if (input.error) {
    throw input.error;
  }

  return input.data ?? null;
}
