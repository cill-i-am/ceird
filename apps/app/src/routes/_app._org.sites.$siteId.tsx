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
  loader: ({ context, params }) =>
    loadSiteDetailRouteData(params.siteId, context),
  component: SitesDetailRoute,
});

function SitesDetailRoute() {
  const { hasMoreRelatedJobs, relatedJobs, siteId } = Route.useLoaderData();
  const { options, viewer } = sitesRouteApi.useLoaderData();
  const initialSite = options.sites.find((site) => site.id === siteId) ?? null;

  return (
    <SitesDetailSheet
      hasMoreRelatedJobs={hasMoreRelatedJobs}
      initialSite={initialSite}
      relatedJobs={relatedJobs}
      siteId={siteId}
      viewer={viewer}
    />
  );
}
