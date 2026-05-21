import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

export interface OrganizationQueryScope {
  readonly organizationId: OrganizationId;
  readonly role?: OrganizationRole | undefined;
  readonly userId?: string | undefined;
}

export function organizationScopedQueryKey(
  collection: string,
  scope: OrganizationQueryScope
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
