import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import {
  getCurrentOrganizationMemberRole,
  requireOrganizationAdministrationAccess,
} from "#/features/organizations/organization-access";
import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";

export const Route = createFileRoute("/_app/_org/members")({
  staticData: {
    breadcrumb: {
      label: "Members",
      to: "/members",
    },
  },
  beforeLoad: async () => {
    const organizationAccess = await requireOrganizationAdministrationAccess();
    const role = await getCurrentOrganizationMemberRole(
      organizationAccess.activeOrganizationId
    );

    return {
      currentMemberRole: role.role,
    };
  },
  component: MembersRoute,
});

function MembersRoute() {
  const { activeOrganizationId } = useRouteContext({ from: "/_app/_org" });
  const { session } = useRouteContext({ from: "/_app" });
  const { currentMemberRole } = Route.useRouteContext();

  return (
    <OrganizationMembersPage
      activeOrganizationId={activeOrganizationId}
      currentMember={{
        email: session.user.email,
        name: session.user.name,
        role: currentMemberRole,
      }}
    />
  );
}
