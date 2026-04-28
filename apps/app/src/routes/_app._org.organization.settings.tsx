import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";

export const Route = createFileRoute("/_app/_org/organization/settings")({
  staticData: {
    breadcrumb: {
      label: "Organization settings",
      to: "/organization/settings",
    },
  },
  beforeLoad: ({ context }) => loadSettingsRoute(context),
  component: SettingsRoute,
});

export function loadSettingsRoute(context: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: {
    readonly required: boolean;
    readonly targetOrganizationId: OrganizationId | null;
  };
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationAdministrationRouteContext(context);
}

function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return <OrganizationSettingsPage organization={activeOrganization} />;
}
