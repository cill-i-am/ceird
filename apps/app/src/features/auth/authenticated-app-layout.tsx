import { useRouteContext } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";

export function AuthenticatedAppLayout() {
  const { session } = useRouteContext({ from: "/_app" });

  return <AppLayout user={session.user} />;
}
