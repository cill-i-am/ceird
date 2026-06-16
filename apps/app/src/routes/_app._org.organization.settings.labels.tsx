import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { useDataPlaneSession } from "#/data-plane/session";
import { getOrCreateSettingsLabelsCollectionState } from "#/features/labels/labels-data-plane";
import { OrganizationLabelsSettingsPage } from "#/features/organizations/organization-labels-settings-page";
import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

export const Route = createFileRoute("/_app/_org/organization/settings/labels")(
  {
    staticData: {
      breadcrumb: {
        label: "Labels",
        to: "/organization/settings/labels",
      },
    },
    beforeLoad: ({ context }) => assertLabelsSettingsRouteAccess(context),
    component: LabelsSettingsRoute,
  }
);

interface LabelsSettingsRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function assertLabelsSettingsRouteAccess(
  context: LabelsSettingsRouteContext
) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  assertOrganizationAdministrationRouteContext(context);
}

function LabelsSettingsRoute() {
  const dataPlaneSession = useDataPlaneSession();
  const { activeOrganization, currentOrganizationRole } = useRouteContext({
    from: "/_app/_org",
  });

  if (!activeOrganization) {
    throw new Error("Label settings require an active organization.");
  }

  return (
    <OrganizationLabelsSettingsPage
      collectionState={getOrCreateSettingsLabelsCollectionState({
        scope: dataPlaneSession.scope,
        session: dataPlaneSession,
      })}
      mutationJournal={dataPlaneSession.mutationJournal}
      organization={activeOrganization}
      organizationRole={currentOrganizationRole}
    />
  );
}
