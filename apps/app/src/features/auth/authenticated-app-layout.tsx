import { useRouteContext } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

export function AuthenticatedAppLayout() {
  const { activeOrganizationId, currentOrganizationRole, session } =
    useRouteContext({
      from: "/_app",
    });

  return (
    <AppLayout
      activeOrganizationId={activeOrganizationId}
      currentOrganizationRole={currentOrganizationRole}
      user={session.user}
    />
  );
}
