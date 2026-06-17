import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SitesWorkspaceRouteContent } from "#/features/sites-workspace/sites-workspace-route-content";
import { decodeSitesWorkspaceSearch } from "#/features/sites-workspace/sites-workspace-search";
import type { SitesWorkspaceSearch } from "#/features/sites-workspace/sites-workspace-search";

export const Route = createFileRoute("/_app/_org/sites")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  codeSplitGroupings: [["component"]],
  validateSearch: decodeSitesWorkspaceSearch,
  component: SitesRoute,
});

function SitesRoute() {
  const { currentOrganizationRole } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/sites" });
  const search = Route.useSearch();
  const shellState = search.shell ?? "unavailable";

  function updateWorkspaceSearch(
    nextSearch: Partial<Omit<SitesWorkspaceSearch, "shell">>
  ) {
    navigate({
      replace: true,
      search: (current) => ({
        ...current,
        ...nextSearch,
      }),
    });
  }

  return (
    <SitesWorkspaceRouteContent
      currentOrganizationRole={currentOrganizationRole}
      shellState={shellState}
      workspaceSearch={search}
      onWorkspaceSearchChange={updateWorkspaceSearch}
    />
  );
}
