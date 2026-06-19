import type { OrganizationId } from "@ceird/identity-core";
import type { JobListResponse, JobOptionsResponse } from "@ceird/jobs-core";
import type { QueryClient } from "@tanstack/query-core";
import type { ComponentProps } from "react";

import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import { useApplyDataPlaneSeeds } from "#/data-plane/session";
import type {
  JobsCollectionSyncOptions,
  JobsListScope,
} from "#/features/jobs/jobs-data-plane";
import { JobsPage } from "#/features/jobs/jobs-page";
import type { JobsListFilters } from "#/features/jobs/jobs-state";
import { JobsStateProvider } from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { RouteProximityLocationPreferenceStatus } from "#/features/settings/route-proximity-location-preference";
import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

const EMPTY_WORKSPACE_SHEET_STACK: readonly WorkspaceSheet[] = [];
const EMPTY_DATA_PLANE_SEEDS: readonly DataPlaneSeed<unknown>[] = [];

export function JobsRouteContent({
  activeOrganizationId,
  dataPlaneSeeds = EMPTY_DATA_PLANE_SEEDS,
  listHotkeysEnabled,
  list,
  listFilters,
  nearMeEnabled,
  onListFiltersChange,
  onNearMeChange,
  onRouteLimitChange,
  onViewModeChange,
  options,
  listScope,
  queryClient,
  routeLimit,
  routeProximityLocationPreferenceStatus,
  stack = EMPTY_WORKSPACE_SHEET_STACK,
  sync,
  viewMode,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly dataPlaneSeeds?: readonly DataPlaneSeed<unknown>[] | undefined;
  readonly listHotkeysEnabled?: ComponentProps<
    typeof JobsPage
  >["listHotkeysEnabled"];
  readonly list: JobListResponse;
  readonly listFilters?: JobsListFilters | undefined;
  readonly nearMeEnabled?: ComponentProps<typeof JobsPage>["nearMeEnabled"];
  readonly onListFiltersChange?: ComponentProps<
    typeof JobsPage
  >["onFiltersChange"];
  readonly onNearMeChange?: ComponentProps<typeof JobsPage>["onNearMeChange"];
  readonly onRouteLimitChange?: ComponentProps<
    typeof JobsPage
  >["onRouteLimitChange"];
  readonly onViewModeChange?: ComponentProps<
    typeof JobsPage
  >["onViewModeChange"];
  readonly options: JobOptionsResponse;
  readonly listScope?: JobsListScope | undefined;
  readonly queryClient?: QueryClient | undefined;
  readonly routeLimit?: ComponentProps<typeof JobsPage>["routeLimit"];
  readonly routeProximityLocationPreferenceStatus: RouteProximityLocationPreferenceStatus;
  readonly stack?: readonly WorkspaceSheet[] | undefined;
  readonly sync?: JobsCollectionSyncOptions | undefined;
  readonly viewMode?: ComponentProps<typeof JobsPage>["viewMode"];
  readonly viewer: JobsViewer;
}) {
  useApplyDataPlaneSeeds(dataPlaneSeeds);
  const dataPlaneScopeKey = `${activeOrganizationId}:${viewer.userId}:${viewer.role}:${routeListScopeKey(listScope)}`;

  return (
    <JobsStateProvider
      key={dataPlaneScopeKey}
      activeOrganizationId={activeOrganizationId}
      list={list}
      listScope={listScope}
      options={options}
      queryClient={queryClient}
      sync={sync}
      viewer={viewer}
    >
      <JobsPage
        listHotkeysEnabled={listHotkeysEnabled}
        filters={listFilters}
        nearMeEnabled={nearMeEnabled}
        onFiltersChange={onListFiltersChange}
        onNearMeChange={onNearMeChange}
        onRouteLimitChange={onRouteLimitChange}
        onViewModeChange={onViewModeChange}
        routeLimit={routeLimit}
        routeProximityLocationPreferenceStatus={
          routeProximityLocationPreferenceStatus
        }
        viewMode={viewMode}
        viewer={viewer}
      />
      <WorkspaceSheetStack stack={stack} />
    </JobsStateProvider>
  );
}

function routeListScopeKey(listScope: JobsListScope | undefined) {
  if (listScope === undefined) {
    return "default";
  }

  const { query } = listScope;

  return [
    "cursor",
    query.cursor ?? "initial",
    "limit",
    query.limit ?? 50,
    "status",
    query.status ?? "all",
    "assignee",
    query.assigneeId ?? "all",
    "coordinator",
    query.coordinatorId ?? "all",
    "priority",
    query.priority ?? "all",
    "label",
    query.labelId ?? "all",
    "site",
    query.siteId ?? "all",
    "search",
    query.query ?? "",
    "sort",
    "updated-desc",
  ].join(":");
}
