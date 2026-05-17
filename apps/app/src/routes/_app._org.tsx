import type { OrganizationRole } from "@ceird/identity-core";
import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";

import { observeAppRouteOperation } from "#/features/api/app-route-observability";
import { AppOrganizationCommandActions } from "#/features/command-bar/app-global-command-actions";
import {
  getCurrentOrganizationMemberRole,
  requireOrganizationAccess,
} from "#/features/organizations/organization-access";
import { OrganizationActiveSyncBoundary } from "#/features/organizations/organization-active-sync-boundary";
import { decodeOrganizationViewerUserId } from "#/features/organizations/organization-viewer";

export const Route = createFileRoute("/_app/_org")({
  beforeLoad: ({ context }) => loadOrganizationRoute(context),
  component: OrganizationRouteComponent,
});

async function loadOrganizationRoute(context: {
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  return await observeAppRouteOperation(
    {
      currentOrganizationRole: context.currentOrganizationRole,
      operation: "loadOrganizationRoute",
      routeId: "/_app/_org",
    },
    async () => {
      const organizationAccess = await requireOrganizationAccess();
      const { currentOrganizationRole: contextCurrentOrganizationRole } =
        context;
      let currentOrganizationRole: OrganizationRole | undefined;

      if (!organizationAccess.activeOrganizationSync.required) {
        if (contextCurrentOrganizationRole === undefined) {
          const currentMemberRole = await getCurrentOrganizationMemberRole(
            organizationAccess.activeOrganizationId
          );
          currentOrganizationRole = currentMemberRole.role;
        } else {
          currentOrganizationRole = contextCurrentOrganizationRole;
        }
      }

      return {
        activeOrganization: organizationAccess.activeOrganization,
        activeOrganizationId: organizationAccess.activeOrganizationId,
        activeOrganizationSync: organizationAccess.activeOrganizationSync,
        currentOrganizationRole,
        currentUserId: decodeOrganizationViewerUserId(
          organizationAccess.session.user.id
        ),
        organizations: organizationAccess.organizations,
      };
    }
  );
}

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
