import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import type { OrganizationRole } from "@task-tracker/identity-core";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";

export const Route = createFileRoute("/_app/_org/members")({
  staticData: {
    breadcrumb: {
      label: "Members",
      to: "/members",
    },
  },
  beforeLoad: ({ context }) => loadMembersRouteData(context),
  component: MembersRoute,
});

export function loadMembersRouteData(context: {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationAdministrationRouteContext(context);

  return {
    currentMemberRole: context.currentOrganizationRole,
  };
}

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
        role: currentMemberRole ?? "member",
      }}
    />
  );
}
