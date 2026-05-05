import { SiteId } from "@ceird/sites-core";
import type { SiteIdType } from "@ceird/sites-core";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Schema } from "effect";

import { SitesDetailSheet } from "#/features/sites/sites-detail-sheet";

const decodeSiteId: (siteId: unknown) => SiteIdType =
  Schema.decodeUnknownSync(SiteId);
const sitesRouteApi = getRouteApi("/_app/_org/sites");

export function loadSiteDetailRouteData(siteId: unknown): SiteIdType {
  return decodeSiteId(siteId);
}

export const Route = createFileRoute("/_app/_org/sites/$siteId")({
  staticData: {
    breadcrumb: {
      label: "Site",
    },
  },
  loader: ({ params }) => {
    loadSiteDetailRouteData(params.siteId);
    return params.siteId;
  },
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
