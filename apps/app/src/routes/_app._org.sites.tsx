import { createFileRoute } from "@tanstack/react-router";

import { SitesRouteContent } from "#/features/sites/sites-route-content";
import { loadSitesRouteData } from "#/features/sites/sites-route-loader";

export const Route = createFileRoute("/_app/_org/sites")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  loader: ({ context }) => loadSitesRouteData(context),
  component: SitesRoute,
});

function SitesRoute() {
  const { activeOrganizationId, queryClient } = Route.useRouteContext();
  const { dataPlaneSeeds, options, viewer } = Route.useLoaderData();
  const { sheets } = Route.useSearch();

  return (
    <SitesRouteContent
      activeOrganizationId={activeOrganizationId}
      dataPlaneSeeds={dataPlaneSeeds}
      options={options}
      queryClient={queryClient}
      stack={sheets}
      viewer={viewer}
    />
  );
}
