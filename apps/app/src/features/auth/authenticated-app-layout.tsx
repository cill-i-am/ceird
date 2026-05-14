import {
  Outlet,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

export function AuthenticatedAppLayout() {
  const { activeOrganizationId, currentOrganizationRole, session } =
    useRouteContext({
      from: "/_app",
    });
  const isOrganizationCreation = useRouterState({
    select: (state) => state.location.pathname === "/create-organization",
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
