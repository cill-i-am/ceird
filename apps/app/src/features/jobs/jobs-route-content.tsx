import { RegistryProvider } from "@effect-atom/atom-react";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
} from "@task-tracker/jobs-core";
import type { ReactNode } from "react";

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
  list,
  options,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationName: string;
  readonly children?: ReactNode;
  readonly list: JobListResponse;
  readonly options: JobOptionsResponse;
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
      <JobsPage activeOrganizationName={activeOrganizationName} viewer={viewer}>
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
