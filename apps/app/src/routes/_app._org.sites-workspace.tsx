import { createFileRoute, redirect } from "@tanstack/react-router";

import { decodeSitesWorkspaceSearch } from "#/features/sites-workspace/sites-workspace-search";

export const Route = createFileRoute("/_app/_org/sites-workspace")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  validateSearch: decodeSitesWorkspaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      search,
      to: "/sites",
    });
  },
});
