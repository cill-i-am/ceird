import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute } from "@tanstack/react-router";

import { listAllCurrentServerSites } from "#/features/api/app-api-server";
import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";
import {
  EMPTY_AUTHENTICATED_HOME_DASHBOARD,
  buildAuthenticatedHomeDashboard,
} from "#/features/auth/authenticated-shell-home-dashboard";
import {
  getCurrentServerJobMemberOptions,
  listAllCurrentServerJobs,
  listCurrentServerOrganizationActivity,
} from "#/features/jobs/jobs-server";
import { assertOrganizationInternalRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import { deriveServiceAreasFromSites } from "#/features/sites/sites-options";

export const Route = createFileRoute("/_app/_org/")({
  staticData: {
    breadcrumb: {
      label: "Home",
      to: "/",
    },
  },
  beforeLoad: ({ context }) => loadOrganizationHomeRoute(context),
  loader: ({ context }) => loadOrganizationHomeDashboardRouteData(context),
  component: OrganizationHomeRoute,
});

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

  const [jobs, jobMemberOptions, sites, activity] = await Promise.all([
    listAllCurrentServerJobs({}),
    getCurrentServerJobMemberOptions(),
    listAllCurrentServerSites(),
    canLoadHomeActivity(context.currentOrganizationRole)
      ? listCurrentServerOrganizationActivity({ limit: 5 })
      : Promise.resolve({ items: [], nextCursor: undefined }),
  ]);

  return buildAuthenticatedHomeDashboard({
    activity,
    activityAvailable: canLoadHomeActivity(context.currentOrganizationRole),
    jobs: jobs.items,
    jobMemberOptions,
    sites: {
      serviceAreas: deriveServiceAreasFromSites(sites.items),
      sites: sites.items,
    },
  });
}

function OrganizationHomeRoute() {
  const dashboard = Route.useLoaderData();

  return <AuthenticatedShellHome dashboard={dashboard} />;
}

function canLoadHomeActivity(role: OrganizationRole | undefined) {
  return role === "owner" || role === "admin";
}
