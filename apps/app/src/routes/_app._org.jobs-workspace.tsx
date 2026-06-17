import { createFileRoute, redirect } from "@tanstack/react-router";

import { decodeJobsWorkspaceSearch } from "#/features/jobs-workspace/jobs-workspace-search";

export const Route = createFileRoute("/_app/_org/jobs-workspace")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  validateSearch: decodeJobsWorkspaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      search,
      to: "/jobs",
    });
  },
});
