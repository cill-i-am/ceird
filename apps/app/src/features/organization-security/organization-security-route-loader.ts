import type {
  OrganizationId,
  OrganizationRole,
  OrganizationSecurityActivityListResponse,
} from "@ceird/identity-core";

import {
  assertOrganizationAdministrationRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

import type { OrganizationSecurityActivitySearch } from "./organization-security-search";
import { toOrganizationSecurityActivityQuery } from "./organization-security-search";
import { listCurrentServerOrganizationSecurityActivity } from "./organization-security-server";

const EMPTY_SECURITY_ACTIVITY: OrganizationSecurityActivityListResponse = {
  items: [],
  nextCursor: undefined,
};

interface OrganizationSecurityRouteAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export async function loadOrganizationSecurityActivityRouteData(
  context: OrganizationSecurityRouteAccess,
  search: OrganizationSecurityActivitySearch
) {
  if (context.activeOrganizationSync.required) {
    return {
      activity: EMPTY_SECURITY_ACTIVITY,
    };
  }

  const role = requireOrganizationRouteContextRole(context);

  assertOrganizationAdministrationRole({ role });

  const activity = await listCurrentServerOrganizationSecurityActivity(
    toOrganizationSecurityActivityQuery(search)
  );

  return {
    activity,
  };
}
