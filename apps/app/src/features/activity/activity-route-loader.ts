import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import {
  assertOrganizationInternalRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

interface ActivityRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function assertActivityRouteAccess(
  context: ActivityRouteOrganizationAccess
) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  const role = requireOrganizationRouteContextRole(context);

  assertOrganizationInternalRole({ role });
}
