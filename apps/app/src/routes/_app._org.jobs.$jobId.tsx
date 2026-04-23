import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { WorkItemId } from "@task-tracker/jobs-core";
import type { WorkItemIdType } from "@task-tracker/jobs-core";
import { Schema } from "effect";

import { JobsDetailSheet } from "#/features/jobs/jobs-detail-sheet";
import { getCurrentServerJobDetail } from "#/features/jobs/jobs-server";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);
const jobsRouteApi = getRouteApi("/_app/_org/jobs");

export function loadJobDetailRouteData(
  workItemId: string | WorkItemIdType,
  organizationAccess?: {
    readonly activeOrganizationSync: ActiveOrganizationSync;
  }
) {
  const decodedWorkItemId = decodeWorkItemId(workItemId);

  if (organizationAccess?.activeOrganizationSync.required) {
    return Promise.resolve(null);
  }

  return getCurrentServerJobDetail(decodedWorkItemId);
}

export const Route = createFileRoute("/_app/_org/jobs/$jobId")({
  loader: ({ context, params }) =>
    loadJobDetailRouteData(params.jobId, context),
  component: JobsDetailRoute,
});

export function JobsDetailRouteContent({
  initialDetail,
  viewer,
}: {
  readonly initialDetail: NonNullable<
    Awaited<ReturnType<typeof loadJobDetailRouteData>>
  >;
  readonly viewer: JobsViewer;
}) {
  return <JobsDetailSheet initialDetail={initialDetail} viewer={viewer} />;
}

function JobsDetailRoute() {
  const initialDetail = Route.useLoaderData();
  const { viewer } = jobsRouteApi.useLoaderData();

  if (initialDetail === null) {
    return null;
  }

  return (
    <JobsDetailRouteContent initialDetail={initialDetail} viewer={viewer} />
  );
}
