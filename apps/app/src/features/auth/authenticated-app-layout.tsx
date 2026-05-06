import { useRouteContext } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";
import { SentryRouteContext } from "#/features/sentry/sentry-route-context";

export function AuthenticatedAppLayout() {
  const { activeOrganizationId, currentOrganizationRole, session } =
    useRouteContext({
      from: "/_app",
    });

  return (
    <>
      <SentryRouteContext />
      <AppLayout
        activeOrganizationId={activeOrganizationId}
        currentOrganizationRole={currentOrganizationRole}
        user={session.user}
      />
    </>
  );
}
