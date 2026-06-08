import type {
  JobProximityInput,
  JobRoutePreviewInput,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type {
  ProximityOriginAutocompleteInput,
  ProximityOriginPlaceDetailsInput,
} from "@ceird/proximity-core";
import type {
  SiteIdType,
  SiteProximityInput,
  SiteRoutePreviewInput,
} from "@ceird/sites-core";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

export function rankNearbyJobs(input: JobProximityInput) {
  return runBrowserAppApiRequest("ProximityBrowser.rankNearbyJobs", (client) =>
    client.jobs.rankNearbyJobs({ payload: input })
  );
}

export function rankNearbySites(input: SiteProximityInput) {
  return runBrowserAppApiRequest("ProximityBrowser.rankNearbySites", (client) =>
    client.sites.rankNearbySites({ payload: input })
  );
}

export function getJobRoutePreview(
  workItemId: WorkItemIdType,
  input: JobRoutePreviewInput
) {
  return runBrowserAppApiRequest(
    "ProximityBrowser.getJobRoutePreview",
    (client) =>
      client.jobs.getJobRoutePreview({
        params: { workItemId },
        payload: input,
      })
  );
}

export function getSiteRoutePreview(
  siteId: SiteIdType,
  input: SiteRoutePreviewInput
) {
  return runBrowserAppApiRequest(
    "ProximityBrowser.getSiteRoutePreview",
    (client) =>
      client.sites.getSiteRoutePreview({
        params: { siteId },
        payload: input,
      })
  );
}

export function autocompleteProximityOrigin(
  input: ProximityOriginAutocompleteInput
) {
  return runBrowserAppApiRequest(
    "ProximityBrowser.autocompleteOrigin",
    (client) => client.proximity.autocompleteOrigin({ payload: input })
  );
}

export function resolveProximityOriginPlace(
  input: ProximityOriginPlaceDetailsInput
) {
  return runBrowserAppApiRequest(
    "ProximityBrowser.getOriginPlaceDetails",
    (client) => client.proximity.getOriginPlaceDetails({ payload: input })
  );
}
