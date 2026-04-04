import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedAppLayout } from "#/features/auth/authenticated-app-layout";
import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const session = await requireAuthenticatedSession();

    return { session };
  },
  component: AuthenticatedAppLayout,
});
