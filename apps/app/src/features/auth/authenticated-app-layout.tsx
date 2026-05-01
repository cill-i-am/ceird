import { useRouteContext } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

export function AuthenticatedAppLayout() {
  const { currentOrganizationRole, session } = useRouteContext({
    from: "/_app",
  });

  return (
    <AppLayout
      currentOrganizationRole={currentOrganizationRole}
      user={session.user}
    />
  );
}
