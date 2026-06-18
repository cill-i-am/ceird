import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import {
  Outlet,
  createFileRoute,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";

export const Route = createFileRoute("/_app/_org/organization/settings")({
  staticData: {
    breadcrumb: {
      label: "Organization settings",
      to: "/organization/settings",
    },
  },
  codeSplitGroupings: [["component"]],
  beforeLoad: ({ context }) => assertSettingsRouteAccess(context),
  component: SettingsRoute,
});

interface SettingsRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function assertSettingsRouteAccess(context: SettingsRouteContext) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  assertOrganizationAdministrationRouteContext(context);
}

export function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const isSettingsIndexRoute = useRouterState({
    select: (state) => state.location.pathname === "/organization/settings",
  });

  if (!isSettingsIndexRoute) {
    return <Outlet />;
  }

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return <OrganizationSettingsPage organization={activeOrganization} />;
}
