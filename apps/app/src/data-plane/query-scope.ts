import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import type { DataPlaneCollectionName } from "./collection-contract";

export interface OrganizationDataScope {
  readonly organizationId: OrganizationId;
  readonly role?: OrganizationRole | undefined;
  readonly userId?: string | undefined;
}

export function createOrganizationDataScope(
  scope: OrganizationDataScope
): OrganizationDataScope {
  return scope;
}

export function organizationDataQueryKey(
  collection: DataPlaneCollectionName,
  scope: OrganizationDataScope
) {
  return [
    collection,
    "organization",
    scope.organizationId,
    "user",
    scope.userId ?? "unknown",
    "role",
    scope.role ?? "unknown",
  ] as const;
}
