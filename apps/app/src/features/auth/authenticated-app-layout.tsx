import {
  Outlet,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

import { shouldBypassAuthenticatedAppShell } from "./app-context-route-selection";

export function AuthenticatedAppLayout() {
  const { activeOrganizationId, currentOrganizationRole, session } =
    useRouteContext({
      from: "/_app",
    });
  const isOrganizationCreation = useRouterState({
    select: (state) =>
      shouldBypassAuthenticatedAppShell(state.location.pathname),
  });

  if (isOrganizationCreation) {
    return <Outlet />;
  }

  return (
    <AppLayout
      activeOrganizationId={activeOrganizationId}
      currentOrganizationRole={currentOrganizationRole}
      user={session.user}
    />
  );
}
