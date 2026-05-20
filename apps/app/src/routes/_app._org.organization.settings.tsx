import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import * as React from "react";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";
import { loadSettingsRoute } from "#/features/organizations/organization-settings-route-loader";

export const Route = createFileRoute("/_app/_org/organization/settings")({
  staticData: {
    breadcrumb: {
      label: "Organization settings",
      to: "/organization/settings",
    },
  },
  // Keep the loader out of the React component chunk so dev reloads never wrap
  // the lazy loader module in React Refresh component state.
  codeSplitGroupings: [["loader"], ["component"]],
  beforeLoad: ({ context }) => assertSettingsRouteAccess(context),
  loader: ({ context }) => loadSettingsRoute(context),
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

function SettingsRoute() {
  const { activeOrganization, currentOrganizationRole, currentUserId } =
    useRouteContext({ from: "/_app/_org" });
  const { queryClient } = Route.useRouteContext();
  const { organizationLabels } = Route.useLoaderData();

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  const queryScope = React.useMemo(
    () => ({
      organizationId: activeOrganization.id,
      role: currentOrganizationRole,
      userId: currentUserId,
    }),
    [activeOrganization.id, currentOrganizationRole, currentUserId]
  );

  return (
    <OrganizationSettingsPage
      organizationLabels={organizationLabels}
      organization={activeOrganization}
      queryScope={queryScope}
      queryClient={queryClient}
    />
  );
}
