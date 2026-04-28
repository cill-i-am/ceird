import { RegistryProvider } from "@effect-atom/atom-react";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
} from "@task-tracker/jobs-core";
import type { ComponentProps, ReactNode } from "react";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { JobsDetailSheet } from "#/features/jobs/jobs-detail-sheet";
import { JobsPage } from "#/features/jobs/jobs-page";
import {
  jobsListStateAtom,
  jobsOptionsStateAtom,
  seedJobsListState,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";

export function JobsRouteContent({
  activeOrganizationId,
  activeOrganizationName,
  children,
  listHotkeysEnabled,
  list,
  onViewModeChange,
  options,
  viewMode,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationName: string;
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
    <RegistryProvider
      key={activeOrganizationId}
      initialValues={[
        [jobsListStateAtom, seedJobsListState(activeOrganizationId, list)],
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(activeOrganizationId, options),
        ],
      ]}
    >
      <JobsPage
        activeOrganizationName={activeOrganizationName}
        listHotkeysEnabled={listHotkeysEnabled}
        onViewModeChange={onViewModeChange}
        viewMode={viewMode}
        viewer={viewer}
      >
        {children}
      </JobsPage>
    </RegistryProvider>
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
