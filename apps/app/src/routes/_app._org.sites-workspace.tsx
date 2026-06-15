import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SitesWorkspaceRouteContent } from "#/features/sites-workspace/sites-workspace-route-content";
import { decodeSitesWorkspaceSearch } from "#/features/sites-workspace/sites-workspace-search";
import type { SitesWorkspaceShellState } from "#/features/sites-workspace/sites-workspace-search";

export const Route = createFileRoute("/_app/_org/sites-workspace")({
  staticData: {
    breadcrumb: {
      label: "Sites workspace",
      to: "/sites-workspace",
    },
  },
  codeSplitGroupings: [["component"]],
  validateSearch: decodeSitesWorkspaceSearch,
  component: SitesWorkspaceRoute,
});

function SitesWorkspaceRoute() {
  const { currentOrganizationRole } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/sites-workspace" });
  const shellState = search.shell ?? "unavailable";

  function setShellState(nextShellState: SitesWorkspaceShellState) {
    navigate({
      replace: true,
      search: (current) => ({
        ...current,
        shell: nextShellState === "unavailable" ? undefined : nextShellState,
      }),
    });
  }

  return (
    <SitesWorkspaceRouteContent
      currentOrganizationRole={currentOrganizationRole}
      onShellStateChange={setShellState}
      shellState={shellState}
    />
  );
}
