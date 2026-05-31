import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationQueryScope } from "#/features/organizations/organization-query-scope";

export function organizationJobsQueryKey(scope: OrganizationQueryScope) {
  return organizationDataQueryKey("jobs", scope);
}
