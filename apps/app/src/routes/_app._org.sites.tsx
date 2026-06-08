import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SitesRouteContent } from "#/features/sites/sites-route-content";
import { loadSitesRouteData } from "#/features/sites/sites-route-loader";
import { decodeSitesSearch } from "#/features/sites/sites-search";

export const Route = createFileRoute("/_app/_org/sites")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  validateSearch: decodeSitesSearch,
  loader: ({ context }) => loadSitesRouteData(context),
  component: SitesRoute,
});

function SitesRoute() {
  const { activeOrganizationId, queryClient } = Route.useRouteContext();
  const { dataPlaneSeeds, options, routeProximityLocationEnabled, viewer } =
    Route.useLoaderData();
  const navigate = useNavigate({ from: "/sites" });
  const search = Route.useSearch();
  const stack = search.sheets ?? [];

  return (
    <SitesRouteContent
      activeOrganizationId={activeOrganizationId}
      dataPlaneSeeds={dataPlaneSeeds}
      nearMeEnabled={search.near ?? false}
      onViewModeChange={(viewMode) => {
        navigate({
          search: (current) => ({
            ...current,
            view: viewMode === "list" ? undefined : viewMode,
          }),
        });
      }}
      onNearMeChange={(near) => {
        navigate({
          search: (current) => ({
            ...current,
            near: near ? true : undefined,
          }),
        });
      }}
      onRouteLimitChange={(routeLimit) => {
        const nextRouteLimit = decodeSitesSearch({ routeLimit }).routeLimit;

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
