import type {
  OrganizationId,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";

import { clearAppContextClientCache } from "../auth/app-context-client-cache";

const CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS = 10_000;

interface ClientAccessCacheEntry<Value> {
  readonly expiresAt: number;
  readonly promise: Promise<Value>;
}

let clientOrganizationsCache:
  | ClientAccessCacheEntry<readonly OrganizationSummary[]>
  | undefined;
const clientOrganizationRoleCache = new Map<
  OrganizationId,
  ClientAccessCacheEntry<OrganizationMemberRoleResponse>
>();

export function clearOrganizationAccessClientCache() {
  clearAppContextClientCache();
  clientOrganizationsCache = undefined;
  clientOrganizationRoleCache.clear();
}

export function readFreshClientOrganizationsCache():
  | Promise<readonly OrganizationSummary[]>
  | undefined {
  if (!isFreshClientCacheEntry(clientOrganizationsCache)) {
    return undefined;
  }

  return clientOrganizationsCache.promise;
}

export function setClientOrganizationsCache(
  promise: Promise<readonly OrganizationSummary[]>
) {
  clientOrganizationsCache = createClientCacheEntry(promise);
}

export function clearClientOrganizationsCacheForPromise(
  promise: Promise<readonly OrganizationSummary[]>
) {
  if (clientOrganizationsCache?.promise === promise) {
    clientOrganizationsCache = undefined;
  }
}

export function readFreshClientOrganizationRoleCache(
  organizationId: OrganizationId
): Promise<OrganizationMemberRoleResponse> | undefined {
  const cachedRole = clientOrganizationRoleCache.get(organizationId);

  if (!isFreshClientCacheEntry(cachedRole)) {
    return undefined;
  }

  return cachedRole.promise;
}

export function setClientOrganizationRoleCache(
  organizationId: OrganizationId,
  promise: Promise<OrganizationMemberRoleResponse>
) {
  clientOrganizationRoleCache.set(
    organizationId,
    createClientCacheEntry(promise)
  );
}

export function clearClientOrganizationRoleCacheForPromise(
  organizationId: OrganizationId,
  promise: Promise<OrganizationMemberRoleResponse>
) {
  if (clientOrganizationRoleCache.get(organizationId)?.promise === promise) {
    clientOrganizationRoleCache.delete(organizationId);
  }
}

function createClientCacheEntry<Value>(
  promise: Promise<Value>
): ClientAccessCacheEntry<Value> {
  return {
    expiresAt: Date.now() + CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS,
    promise,
  };
}

function isFreshClientCacheEntry<Value>(
  entry: ClientAccessCacheEntry<Value> | undefined
): entry is ClientAccessCacheEntry<Value> {
  return entry !== undefined && entry.expiresAt > Date.now();
}
