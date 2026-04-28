import { createFileRoute } from "@tanstack/react-router";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import { SitesCreateSheet } from "#/features/sites/sites-create-sheet";

export const Route = createFileRoute("/_app/_org/sites/new")({
  staticData: {
    breadcrumb: {
      label: "New site",
      to: "/sites/new",
    },
  },
  beforeLoad: ({ context }) => {
    assertOrganizationAdministrationRouteContext(context);
  },
  component: SitesCreateRoute,
});

function SitesCreateRoute() {
  return <SitesCreateSheet />;
}
