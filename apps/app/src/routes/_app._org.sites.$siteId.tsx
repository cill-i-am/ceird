import type { SiteIdType } from "@ceird/sites-core";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { loadSiteDetailRouteData } from "#/features/sites/sites-detail-route-loader";
import { SitesDetailSheet } from "#/features/sites/sites-detail-sheet";

const sitesRouteApi = getRouteApi("/_app/_org/sites");

export const Route = createFileRoute("/_app/_org/sites/$siteId")({
  staticData: {
    breadcrumb: {
      label: "Site",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  loader: ({ params }): SiteIdType => loadSiteDetailRouteData(params.siteId),
  component: SitesDetailRoute,
});

function SitesDetailRoute() {
  const siteId = loadSiteDetailRouteData(Route.useLoaderData());
  const { options, viewer } = sitesRouteApi.useLoaderData();
  const initialSite = options.sites.find((site) => site.id === siteId) ?? null;

  return (
    <SitesDetailSheet
      initialSite={initialSite}
      siteId={siteId}
      viewer={viewer}
    />
  );
}
