import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";

export const Route = createFileRoute("/_app/_org/")({
  staticData: {
    breadcrumb: {
      label: "Home",
      to: "/",
    },
  },
  component: AuthenticatedShellHome,
});
