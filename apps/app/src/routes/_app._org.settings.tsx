import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import {
  assertOrganizationAdministrationRole,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";
import { OrganizationSettingsPage } from "#/features/organizations/organization-settings-page";

export const Route = createFileRoute("/_app/_org/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
      to: "/settings",
    },
  },
  beforeLoad: ({ context }) => loadSettingsRoute(context),
  component: SettingsRoute,
});

export async function loadSettingsRoute(context: {
  readonly activeOrganizationId: string;
  readonly activeOrganizationSync: {
    readonly required: boolean;
    readonly targetOrganizationId: string | null;
  };
}) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  const role = await getCurrentOrganizationMemberRole(
    context.activeOrganizationId
  );

  assertOrganizationAdministrationRole(role);
}

function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return <OrganizationSettingsPage organization={activeOrganization} />;
}
