import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { SiteId } from "@task-tracker/jobs-core";
import type { SiteIdType } from "@task-tracker/jobs-core";
import { Schema } from "effect";

import { SitesDetailSheet } from "#/features/sites/sites-detail-sheet";

const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const sitesRouteApi = getRouteApi("/_app/_org/sites");

export function loadSiteDetailRouteData(siteId: string | SiteIdType) {
  return decodeSiteId(siteId);
}

export const Route = createFileRoute("/_app/_org/sites/$siteId")({
  staticData: {
    breadcrumb: {
      label: "Site",
    },
  },
  loader: ({ params }) => loadSiteDetailRouteData(params.siteId),
  component: SitesDetailRoute,
});

function SitesDetailRoute() {
  const siteId = Route.useLoaderData() as SiteIdType;
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
