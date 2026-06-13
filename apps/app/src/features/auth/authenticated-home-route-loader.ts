import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import {
  EMPTY_AUTHENTICATED_HOME_DASHBOARD,
  buildAuthenticatedHomeDashboard,
} from "#/features/auth/authenticated-shell-home-dashboard";
import {
  getCurrentServerHomeDashboardSummary,
  listCurrentServerOrganizationActivity,
} from "#/features/jobs/jobs-server";
import { assertOrganizationInternalRouteContext } from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

export function loadOrganizationHomeRoute(context: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationInternalRouteContext(context);
}

export async function loadOrganizationHomeDashboardRouteData(context: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationInternalRouteContext(context);

  if (context.activeOrganizationSync.required) {
    return EMPTY_AUTHENTICATED_HOME_DASHBOARD;
  }

  const [summary, activity] = await Promise.all([
    getCurrentServerHomeDashboardSummary(),
    canLoadHomeActivity(context.currentOrganizationRole)
      ? listCurrentServerOrganizationActivity({ limit: 5 })
      : Promise.resolve({ items: [], nextCursor: undefined }),
  ]);

  return buildAuthenticatedHomeDashboard({
    activity,
    activityAvailable: canLoadHomeActivity(context.currentOrganizationRole),
    summary,
  });
}

function canLoadHomeActivity(role: OrganizationRole | undefined) {
  return role === "owner" || role === "admin";
}
