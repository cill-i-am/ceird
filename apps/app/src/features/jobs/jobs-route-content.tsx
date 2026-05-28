import type { OrganizationId } from "@ceird/identity-core";
import type { JobListResponse, JobOptionsResponse } from "@ceird/jobs-core";
import type { QueryClient } from "@tanstack/query-core";
import type { ComponentProps } from "react";

import { JobsPage } from "#/features/jobs/jobs-page";
import { JobsStateProvider } from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

export function JobsRouteContent({
  activeOrganizationId,
  listHotkeysEnabled,
  list,
  onViewModeChange,
  options,
  queryClient,
  stack = [],
  viewMode,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly listHotkeysEnabled?: ComponentProps<
    typeof JobsPage
  >["listHotkeysEnabled"];
  readonly list: JobListResponse;
  readonly onViewModeChange?: ComponentProps<
    typeof JobsPage
  >["onViewModeChange"];
  readonly options: JobOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly stack?: readonly WorkspaceSheet[] | undefined;
  readonly viewMode?: ComponentProps<typeof JobsPage>["viewMode"];
  readonly viewer: JobsViewer;
}) {
  return (
    <JobsStateProvider
      key={activeOrganizationId}
      activeOrganizationId={activeOrganizationId}
      list={list}
      options={options}
      queryClient={queryClient}
      viewer={viewer}
    >
      <JobsPage
        listHotkeysEnabled={listHotkeysEnabled}
        onViewModeChange={onViewModeChange}
        viewMode={viewMode}
        viewer={viewer}
      />
      <WorkspaceSheetStack stack={stack} />
    </JobsStateProvider>
  );
}
