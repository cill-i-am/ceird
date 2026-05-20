import type { SiteIdType } from "@ceird/sites-core";

import type { OrganizationQueryScope } from "#/features/organizations/organization-query-scope";
import { organizationScopedQueryKey } from "#/features/organizations/organization-query-scope";

export function organizationSitesQueryKey(scope: OrganizationQueryScope) {
  return organizationScopedQueryKey("sites", scope);
}

export function siteCommentsQueryKey(
  scope: OrganizationQueryScope,
  siteId: SiteIdType
) {
  return [
    ...organizationScopedQueryKey("site-comments", scope),
    siteId,
  ] as const;
}
