import {
  Outlet,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

import {
  shouldBypassAuthenticatedAppShell,
  shouldBypassAuthenticatedAppShellForRouteMatches,
} from "./app-context-route-selection";

export function AuthenticatedAppLayout() {
  const router = useRouter();
  const { activeOrganizationId, currentOrganizationRole, session } =
    useRouteContext({
      from: "/_app",
    });
  const isOrganizationCreation = useRouterState({
    select: (state) =>
      shouldBypassAuthenticatedAppShell(router.latestLocation.pathname) ||
      shouldBypassAuthenticatedAppShellForRouteMatches(state.matches) ||
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
