import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";

import { AppOrganizationCommandActions } from "#/features/command-bar/app-global-command-actions";
import { decodeJobsViewerUserId } from "#/features/jobs/jobs-viewer";
import { requireOrganizationAccess } from "#/features/organizations/organization-access";
import { OrganizationActiveSyncBoundary } from "#/features/organizations/organization-active-sync-boundary";

export const Route = createFileRoute("/_app/_org")({
  beforeLoad: async () => {
    const organizationAccess = await requireOrganizationAccess();

    return {
      activeOrganization: organizationAccess.activeOrganization,
      activeOrganizationId: organizationAccess.activeOrganizationId,
      activeOrganizationSync: organizationAccess.activeOrganizationSync,
      currentUserId: decodeJobsViewerUserId(organizationAccess.session.user.id),
    };
  },
  component: OrganizationRouteComponent,
});

function OrganizationRouteComponent() {
  const { activeOrganizationSync } = useRouteContext({ from: "/_app/_org" });

  return (
    <OrganizationActiveSyncBoundary
      activeOrganizationSync={activeOrganizationSync}
    >
      <AppOrganizationCommandActions />
      <Outlet />
    </OrganizationActiveSyncBoundary>
  );
}
