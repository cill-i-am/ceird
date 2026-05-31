import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import { useApplyDataPlaneSeeds } from "#/data-plane/session";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesPage } from "#/features/sites/sites-page";
import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

import { SitesStateProvider } from "./sites-state";

const EMPTY_WORKSPACE_SHEET_STACK: readonly WorkspaceSheet[] = [];
const EMPTY_DATA_PLANE_SEEDS: readonly DataPlaneSeed<unknown>[] = [];

export function SitesRouteContent({
  activeOrganizationId,
  dataPlaneSeeds = EMPTY_DATA_PLANE_SEEDS,
  options,
  queryClient,
  stack = EMPTY_WORKSPACE_SHEET_STACK,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly dataPlaneSeeds?: readonly DataPlaneSeed<unknown>[] | undefined;
  readonly options: SitesOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly stack?: readonly WorkspaceSheet[] | undefined;
  readonly viewer: OrganizationViewer;
}) {
  useApplyDataPlaneSeeds(dataPlaneSeeds);
  const dataPlaneScopeKey = `${activeOrganizationId}:${viewer.userId}:${viewer.role}`;

  return (
    <SitesStateProvider
      key={dataPlaneScopeKey}
      activeOrganizationId={activeOrganizationId}
      options={options}
      queryClient={queryClient}
      viewer={viewer}
    >
      <SitesPage routeHotkeysEnabled={stack.length === 0} viewer={viewer} />
      <WorkspaceSheetStack stack={stack} />
    </SitesStateProvider>
  );
}
