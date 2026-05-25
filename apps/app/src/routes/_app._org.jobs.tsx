import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

import { JobsRouteContent } from "#/features/jobs/jobs-route-content";
import { loadJobsRouteData } from "#/features/jobs/jobs-route-loader";
import { decodeJobsSearch } from "#/features/jobs/jobs-search";

export const Route = createFileRoute("/_app/_org/jobs")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  validateSearch: decodeJobsSearch,
  loader: ({ context }) => loadJobsRouteData(context),
  component: JobsRoute,
});

function JobsRoute() {
  const { activeOrganizationId, queryClient } = Route.useRouteContext();
  const { list, options, viewer } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/jobs" });
  const search = Route.useSearch();
  const listHotkeysEnabled = useRouterState({
    select: (state) => state.location.pathname === "/jobs",
  });

  return (
    <JobsRouteContent
      activeOrganizationId={activeOrganizationId}
      listHotkeysEnabled={listHotkeysEnabled}
      list={list}
      onViewModeChange={(viewMode) => {
        navigate({
          search: (current) => ({
            ...current,
            view: viewMode === "list" ? undefined : viewMode,
          }),
        });
      }}
      options={options}
      queryClient={queryClient}
      viewMode={search.view ?? "list"}
      viewer={viewer}
    >
      <Outlet />
    </JobsRouteContent>
  );
}
