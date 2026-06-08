import type { OrganizationId } from "@ceird/identity-core";
import type { JobListResponse, JobOptionsResponse } from "@ceird/jobs-core";
import type { QueryClient } from "@tanstack/query-core";
import type { ComponentProps } from "react";

import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import { useApplyDataPlaneSeeds } from "#/data-plane/session";
import { JobsPage } from "#/features/jobs/jobs-page";
import { JobsStateProvider } from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

const EMPTY_WORKSPACE_SHEET_STACK: readonly WorkspaceSheet[] = [];
const EMPTY_DATA_PLANE_SEEDS: readonly DataPlaneSeed<unknown>[] = [];

export function JobsRouteContent({
  activeOrganizationId,
  dataPlaneSeeds = EMPTY_DATA_PLANE_SEEDS,
  listHotkeysEnabled,
  list,
  nearMeEnabled,
  onNearMeChange,
  onRouteLimitChange,
  onViewModeChange,
  options,
  queryClient,
  routeLimit,
  routeProximityLocationEnabled,
  stack = EMPTY_WORKSPACE_SHEET_STACK,
  viewMode,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly dataPlaneSeeds?: readonly DataPlaneSeed<unknown>[] | undefined;
  readonly listHotkeysEnabled?: ComponentProps<
    typeof JobsPage
  >["listHotkeysEnabled"];
  readonly list: JobListResponse;
  readonly nearMeEnabled?: ComponentProps<typeof JobsPage>["nearMeEnabled"];
  readonly onNearMeChange?: ComponentProps<typeof JobsPage>["onNearMeChange"];
  readonly onRouteLimitChange?: ComponentProps<
    typeof JobsPage
  >["onRouteLimitChange"];
  readonly onViewModeChange?: ComponentProps<
    typeof JobsPage
  >["onViewModeChange"];
  readonly options: JobOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly routeLimit?: ComponentProps<typeof JobsPage>["routeLimit"];
  readonly routeProximityLocationEnabled?: ComponentProps<
    typeof JobsPage
  >["routeProximityLocationEnabled"];
  readonly stack?: readonly WorkspaceSheet[] | undefined;
  readonly viewMode?: ComponentProps<typeof JobsPage>["viewMode"];
  readonly viewer: JobsViewer;
}) {
  useApplyDataPlaneSeeds(dataPlaneSeeds);
  const dataPlaneScopeKey = `${activeOrganizationId}:${viewer.userId}:${viewer.role}`;

  return (
    <JobsStateProvider
      key={dataPlaneScopeKey}
      activeOrganizationId={activeOrganizationId}
      list={list}
      options={options}
      queryClient={queryClient}
      viewer={viewer}
    >
      <JobsPage
        listHotkeysEnabled={listHotkeysEnabled}
        nearMeEnabled={nearMeEnabled}
        onNearMeChange={onNearMeChange}
        onRouteLimitChange={onRouteLimitChange}
        onViewModeChange={onViewModeChange}
        routeLimit={routeLimit}
        routeProximityLocationEnabled={routeProximityLocationEnabled}
        viewMode={viewMode}
        viewer={viewer}
      />
      <WorkspaceSheetStack stack={stack} />
    </JobsStateProvider>
  );
}
