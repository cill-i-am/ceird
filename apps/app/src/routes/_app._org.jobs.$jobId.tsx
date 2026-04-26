import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { WorkItemId } from "@task-tracker/jobs-core";
import type { WorkItemIdType } from "@task-tracker/jobs-core";
import { Schema } from "effect";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { JobsDetailSheet } from "#/features/jobs/jobs-detail-sheet";
import { getCurrentServerJobDetail } from "#/features/jobs/jobs-server";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);
const jobsRouteApi = getRouteApi("/_app/_org/jobs");
const CREATE_JOB_ROUTE_DATA = { kind: "create-job" } as const;

type JobDetailRouteData =
  | Awaited<ReturnType<typeof getCurrentServerJobDetail>>
  | null
  | typeof CREATE_JOB_ROUTE_DATA;

function isCreateJobRouteData(
  data: JobDetailRouteData
): data is typeof CREATE_JOB_ROUTE_DATA {
  return data !== null && "kind" in data && data.kind === "create-job";
}

export function loadJobDetailRouteData(
  workItemId: string | WorkItemIdType,
  organizationAccess?: {
    readonly activeOrganizationSync: ActiveOrganizationSync;
  }
): Promise<JobDetailRouteData> {
  if (workItemId === "new") {
    if (organizationAccess?.activeOrganizationSync.required) {
      return Promise.resolve(CREATE_JOB_ROUTE_DATA);
    }

    return requireOrganizationAdministrationAccess().then(
      () => CREATE_JOB_ROUTE_DATA
    );
  }

  const decodedWorkItemId = decodeWorkItemId(workItemId);

  if (organizationAccess?.activeOrganizationSync.required) {
    return Promise.resolve(null);
  }

  return getCurrentServerJobDetail(decodedWorkItemId);
}

export const Route = createFileRoute("/_app/_org/jobs/$jobId")({
  staticData: {
    breadcrumb: {
      label: "Job",
    },
  },
  loader: ({ context, params }) =>
    loadJobDetailRouteData(params.jobId, context),
  component: JobsDetailRoute,
});

export function JobsDetailRouteContent({
  initialDetail,
  viewer,
}: {
  readonly initialDetail: Exclude<
    JobDetailRouteData,
    null | typeof CREATE_JOB_ROUTE_DATA
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

  if (isCreateJobRouteData(initialDetail)) {
    return <JobsCreateSheet />;
  }

  return (
    <JobsDetailRouteContent initialDetail={initialDetail} viewer={viewer} />
  );
}
