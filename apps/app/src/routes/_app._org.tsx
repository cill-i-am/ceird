import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requireOrganizationAccess } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/_org")({
  beforeLoad: async () => {
    const organizationAccess = await requireOrganizationAccess();

    return {
      activeOrganizationId: organizationAccess.activeOrganizationId,
    };
  },
  component: Outlet,
});
