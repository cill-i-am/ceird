import type {
  OrganizationId,
  OrganizationMemberRoleResponse,
  OrganizationSummary,
} from "@ceird/identity-core";

import {
  createExpiringPromiseCacheEntry,
  isFreshExpiringPromiseCacheEntry,
} from "#/lib/expiring-promise-cache";
import type { ExpiringPromiseCacheEntry } from "#/lib/expiring-promise-cache";

import { clearAppContextClientCache } from "../auth/app-context-client-cache-state";

const CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS = 10_000;

let clientOrganizationsCache:
  | ExpiringPromiseCacheEntry<readonly OrganizationSummary[]>
  | undefined;
const clientOrganizationRoleCache = new Map<
  OrganizationId,
  ExpiringPromiseCacheEntry<OrganizationMemberRoleResponse>
>();

export function clearOrganizationAccessClientCache() {
  clearAppContextClientCache();
  clientOrganizationsCache = undefined;
  clientOrganizationRoleCache.clear();
}

export function readFreshClientOrganizationsCache():
  | Promise<readonly OrganizationSummary[]>
  | undefined {
  if (!isFreshExpiringPromiseCacheEntry(clientOrganizationsCache)) {
    clientOrganizationsCache = undefined;
    return undefined;
  }

  return clientOrganizationsCache.promise;
}

export function setClientOrganizationsCache(
  promise: Promise<readonly OrganizationSummary[]>
) {
  clientOrganizationsCache = createExpiringPromiseCacheEntry(
    promise,
    CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS
  );
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

  if (!isFreshExpiringPromiseCacheEntry(cachedRole)) {
    clientOrganizationRoleCache.delete(organizationId);
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
    createExpiringPromiseCacheEntry(
      promise,
      CLIENT_ORGANIZATION_ACCESS_CACHE_TTL_MS
    )
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
