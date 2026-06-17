import type {
  OrganizationId,
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import { decodeOrganizationId } from "@ceird/identity-core";
import {
  Outlet,
  createFileRoute,
  redirect,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";

import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { DataPlaneProvider } from "#/data-plane/session";
import type { ServerAuthSession } from "#/features/auth/server-session-types";
import { AppOrganizationCommandActions } from "#/features/command-bar/app-global-command-actions";
import { OrganizationActiveSyncBoundary } from "#/features/organizations/organization-active-sync-boundary";
import { decodeOrganizationViewerUserId } from "#/features/organizations/organization-viewer";
import { WorkspaceSheetEventsProvider } from "#/features/workspace-sheets/workspace-sheet-events";
import { WorkspaceSheetNavigationProvider } from "#/features/workspace-sheets/workspace-sheet-navigation";
import { decodeWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

export const Route = createFileRoute("/_app/_org")({
  validateSearch: decodeWorkspaceSheetSearch,
  beforeLoad: async ({ context }) => {
    const {
      ensureActiveOrganizationIdForSession,
      getCurrentOrganizationMemberRole,
    } = await import("#/features/organizations/organization-access");
    const preloadedOrganizations = context.organizations;
    const organizationAccess =
      preloadedOrganizations === undefined
        ? await ensureActiveOrganizationIdForSession(context.session)
        : resolveOrganizationAccessFromContext({
            activeOrganizationId: context.activeOrganizationId,
            organizations: preloadedOrganizations,
            session: context.session,
          });
    const { currentOrganizationRole: contextCurrentOrganizationRole } = context;
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
  },
  component: OrganizationRouteComponent,
});

function resolveOrganizationAccessFromContext(context: {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly organizations: readonly OrganizationSummary[];
  readonly session: ServerAuthSession;
}) {
  const currentActiveOrganizationId = context.session.session
    .activeOrganizationId
    ? decodeOrganizationId(context.session.session.activeOrganizationId)
    : null;
  const routeActiveOrganizationId = context.activeOrganizationId ?? null;
  const activeOrganization =
    routeActiveOrganizationId === null
      ? (context.organizations[0] ?? null)
      : (context.organizations.find(
          (organization) => organization.id === routeActiveOrganizationId
        ) ??
        context.organizations[0] ??
        null);
  const activeOrganizationId = activeOrganization?.id ?? null;

  if (!activeOrganizationId || !activeOrganization) {
    throw redirect({ to: "/create-organization" });
  }

  return {
    activeOrganization,
    activeOrganizationId,
    activeOrganizationSync: {
      required: currentActiveOrganizationId !== activeOrganizationId,
      targetOrganizationId: activeOrganizationId,
    },
    organizations: context.organizations,
    session: context.session,
  };
}

function OrganizationRouteComponent() {
  const {
    activeOrganizationId,
    activeOrganizationSync,
    currentOrganizationRole,
    currentUserId,
    queryClient,
  } = useRouteContext({
    from: "/_app/_org",
  });
  const stack = Route.useSearch().sheets ?? [];
  const routeOwnsSheetStack = useRouterState({
    select: (state) => state.location.pathname === "/sites",
  });

  return (
    <OrganizationActiveSyncBoundary
      activeOrganizationSync={activeOrganizationSync}
    >
      <DataPlaneProvider
        queryClient={queryClient}
        scope={createOrganizationDataScope({
          organizationId: activeOrganizationId,
          role: currentOrganizationRole,
          userId: currentUserId,
        })}
      >
        <WorkspaceSheetEventsProvider>
          <WorkspaceSheetNavigationProvider stack={stack}>
            <AppOrganizationCommandActions
              currentOrganizationRole={currentOrganizationRole}
            />
            <Outlet />
            {routeOwnsSheetStack ? null : <WorkspaceSheetStack stack={stack} />}
          </WorkspaceSheetNavigationProvider>
        </WorkspaceSheetEventsProvider>
      </DataPlaneProvider>
    </OrganizationActiveSyncBoundary>
  );
}
