import type { OrganizationId } from "@ceird/identity-core";
import type {
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
} from "@ceird/jobs-core";
import type { ComponentProps, ReactNode } from "react";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { JobsDetailSheet } from "#/features/jobs/jobs-detail-sheet";
import { JobsPage } from "#/features/jobs/jobs-page";
import { JobsStateProvider } from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";

export function JobsRouteContent({
  activeOrganizationId,
  children,
  listHotkeysEnabled,
  list,
  onViewModeChange,
  options,
  viewMode,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children?: ReactNode;
  readonly listHotkeysEnabled?: ComponentProps<
    typeof JobsPage
  >["listHotkeysEnabled"];
  readonly list: JobListResponse;
  readonly onViewModeChange?: ComponentProps<
    typeof JobsPage
  >["onViewModeChange"];
  readonly options: JobOptionsResponse;
  readonly viewMode?: ComponentProps<typeof JobsPage>["viewMode"];
  readonly viewer: JobsViewer;
}) {
  return (
    <JobsStateProvider
      key={activeOrganizationId}
      activeOrganizationId={activeOrganizationId}
      list={list}
      options={options}
    >
      <JobsPage
        listHotkeysEnabled={listHotkeysEnabled}
        onViewModeChange={onViewModeChange}
        viewMode={viewMode}
        viewer={viewer}
      >
        {children}
      </JobsPage>
    </JobsStateProvider>
  );
}

export function JobsDetailRouteContent({
  initialDetail,
  viewer,
}: {
  readonly initialDetail: JobDetailResponse;
  readonly viewer: JobsViewer;
}) {
  return <JobsDetailSheet initialDetail={initialDetail} viewer={viewer} />;
}

export function JobsCreateRouteContent() {
  return <JobsCreateSheet />;
}
