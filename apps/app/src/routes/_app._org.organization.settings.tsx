import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";

import { getCurrentServerJobLabels } from "#/features/jobs/jobs-server";
import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
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
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  if (context.activeOrganizationSync.required) {
    return {
      jobLabels: [],
    };
  }

  assertOrganizationAdministrationRouteContext(context);

  return getCurrentServerJobLabels().then((labels) => ({
    jobLabels: labels.labels,
  }));
}

function SettingsRoute() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const { jobLabels } = Route.useRouteContext();

  if (!activeOrganization) {
    throw new Error("Organization settings require an active organization.");
  }

  return (
    <OrganizationSettingsPage
      jobLabels={jobLabels}
      organization={activeOrganization}
    />
  );
}
