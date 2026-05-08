import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { isCreateJobRouteData } from "#/features/jobs/jobs-detail-route-data";
import { loadJobDetailRouteData } from "#/features/jobs/jobs-detail-route-loader";
import {
  JobsCreateRouteContent,
  JobsDetailRouteContent,
} from "#/features/jobs/jobs-route-content";

const jobsRouteApi = getRouteApi("/_app/_org/jobs");

export const Route = createFileRoute("/_app/_org/jobs/$jobId")({
  staticData: {
    breadcrumb: {
      label: "Job",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  loader: ({ context, params }) =>
    loadJobDetailRouteData(params.jobId, context),
  component: JobsDetailRoute,
});

function JobsDetailRoute() {
  const initialDetail = Route.useLoaderData();
  const { viewer } = jobsRouteApi.useLoaderData();

  if (initialDetail === null) {
    return null;
  }

  if (isCreateJobRouteData(initialDetail)) {
    return <JobsCreateRouteContent />;
  }

  return (
    <JobsDetailRouteContent initialDetail={initialDetail} viewer={viewer} />
  );
}
