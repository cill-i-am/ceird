import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { AppLayout } from "#/components/app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";

export function AuthenticatedAppLayout() {
  const { session } = useRouteContext({ from: "/_app" });

  return <AppLayout user={session.user} />;
}

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAuthenticatedSession();

    return { session };
  },
  component: AuthenticatedAppLayout,
});
