import type { SiteIdType } from "@ceird/sites-core";

import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationQueryScope } from "#/features/organizations/organization-query-scope";

export function organizationSitesQueryKey(scope: OrganizationQueryScope) {
  return organizationDataQueryKey("sites", scope);
}

export function siteCommentsQueryKey(
  scope: OrganizationQueryScope,
  siteId: SiteIdType
) {
  return [...organizationDataQueryKey("site-comments", scope), "site", siteId];
}
