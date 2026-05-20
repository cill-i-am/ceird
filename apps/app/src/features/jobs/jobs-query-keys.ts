import type { OrganizationQueryScope } from "#/features/organizations/organization-query-scope";
import { organizationScopedQueryKey } from "#/features/organizations/organization-query-scope";

export function organizationJobsQueryKey(scope: OrganizationQueryScope) {
  return organizationScopedQueryKey("jobs", scope);
}
