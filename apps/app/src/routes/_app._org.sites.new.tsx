import { createFileRoute } from "@tanstack/react-router";

import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";
import { SitesCreateSheet } from "#/features/sites/sites-create-sheet";

export const Route = createFileRoute("/_app/_org/sites/new")({
  staticData: {
    breadcrumb: {
      label: "New site",
      to: "/sites/new",
    },
  },
  beforeLoad: async () => {
    await requireOrganizationAdministrationAccess();
  },
  component: SitesCreateRoute,
});

function SitesCreateRoute() {
  return <SitesCreateSheet />;
}
