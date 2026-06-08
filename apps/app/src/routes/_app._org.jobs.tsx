import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

import { JobsRouteContent } from "#/features/jobs/jobs-route-content";
import { shouldEnableJobsListHotkeys } from "#/features/jobs/jobs-route-hotkeys";
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
  const {
    dataPlaneSeeds,
    list,
    options,
    routeProximityLocationEnabled,
    viewer,
  } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/jobs" });
  const search = Route.useSearch();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const stack = search.sheets ?? [];
  const listHotkeysEnabled = shouldEnableJobsListHotkeys({
    pathname,
    stack,
  });

  return (
    <JobsRouteContent
      activeOrganizationId={activeOrganizationId}
      dataPlaneSeeds={dataPlaneSeeds}
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
      nearMeEnabled={search.near ?? false}
      onNearMeChange={(near) => {
        navigate({
          search: (current) => ({
            ...current,
            near: near ? true : undefined,
          }),
        });
      }}
      onRouteLimitChange={(routeLimit) => {
        const nextRouteLimit = decodeJobsSearch({ routeLimit }).routeLimit;

        navigate({
          search: (current) => ({
            ...current,
            routeLimit:
              nextRouteLimit === undefined || nextRouteLimit === 10
                ? undefined
                : nextRouteLimit,
          }),
        });
      }}
      options={options}
      queryClient={queryClient}
      routeLimit={search.routeLimit ?? 10}
      routeProximityLocationEnabled={routeProximityLocationEnabled}
      stack={stack}
      viewMode={search.view ?? "list"}
      viewer={viewer}
    />
  );
}
