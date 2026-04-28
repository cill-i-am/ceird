import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";
import type { OrganizationRole } from "@task-tracker/identity-core";

import { AppOrganizationCommandActions } from "#/features/command-bar/app-global-command-actions";
import {
  getCurrentOrganizationMemberRole,
  requireOrganizationAccess,
} from "#/features/organizations/organization-access";
import { OrganizationActiveSyncBoundary } from "#/features/organizations/organization-active-sync-boundary";

export const Route = createFileRoute("/_app/_org")({
  beforeLoad: async () => {
    const organizationAccess = await requireOrganizationAccess();
    let currentOrganizationRole: OrganizationRole | undefined;

    if (!organizationAccess.activeOrganizationSync.required) {
      const currentMemberRole = await getCurrentOrganizationMemberRole(
        organizationAccess.activeOrganizationId
      );
      currentOrganizationRole = currentMemberRole.role;
    }

    return {
      activeOrganization: organizationAccess.activeOrganization,
      activeOrganizationId: organizationAccess.activeOrganizationId,
      activeOrganizationSync: organizationAccess.activeOrganizationSync,
      currentOrganizationRole,
      currentUserId: organizationAccess.session.user.id,
    };
  },
  component: OrganizationRouteComponent,
});

function OrganizationRouteComponent() {
  const { activeOrganizationSync, currentOrganizationRole } = useRouteContext({
    from: "/_app/_org",
  });

  return (
    <OrganizationActiveSyncBoundary
      activeOrganizationSync={activeOrganizationSync}
    >
      <AppOrganizationCommandActions
        currentOrganizationRole={currentOrganizationRole}
      />
      <Outlet />
    </OrganizationActiveSyncBoundary>
  );
}
