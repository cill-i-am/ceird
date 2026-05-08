import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

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
  codeSplitGroupings: [["loader", "component"]],
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
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const { organizationLabels } = Route.useLoaderData();

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return (
    <OrganizationSettingsPage
      organizationLabels={organizationLabels}
      organization={activeOrganization}
    />
  );
}
