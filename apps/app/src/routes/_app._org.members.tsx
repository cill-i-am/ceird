import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";
import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";

export const Route = createFileRoute("/_app/_org/members")({
  staticData: {
    breadcrumb: {
      label: "Members",
      to: "/members",
    },
  },
  beforeLoad: async () => {
    await requireOrganizationAdministrationAccess();
  },
  component: MembersRoute,
});

function MembersRoute() {
  const { activeOrganizationId } = useRouteContext({ from: "/_app/_org" });

  return (
    <OrganizationMembersPage activeOrganizationId={activeOrganizationId} />
  );
}
