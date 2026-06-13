import type { JobListItem } from "@ceird/jobs-core";
import { SiteId } from "@ceird/sites-core";
import type { SiteIdType } from "@ceird/sites-core";
import { Schema } from "effect";

import { listCurrentServerJobs } from "#/features/api/app-api-server";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

import { SITE_RELATED_JOBS_PAGE_LIMIT } from "./sites-data-plane";

const decodeSiteId: (siteId: unknown) => SiteIdType =
  Schema.decodeUnknownSync(SiteId);

export interface SiteDetailRouteData {
  readonly hasMoreRelatedJobs: boolean;
  readonly relatedJobs: readonly JobListItem[];
  readonly siteId: SiteIdType;
}

export async function loadSiteDetailRouteData(
  siteId: unknown,
  context: {
    readonly activeOrganizationSync: ActiveOrganizationSync;
  }
): Promise<SiteDetailRouteData> {
  const decodedSiteId = decodeSiteId(siteId);

  if (context.activeOrganizationSync.required) {
    return {
      hasMoreRelatedJobs: false,
      relatedJobs: [],
      siteId: decodedSiteId,
    };
  }

  const relatedJobs = await listCurrentServerJobs({
    limit: SITE_RELATED_JOBS_PAGE_LIMIT,
    siteId: decodedSiteId,
  });

  return {
    hasMoreRelatedJobs: Boolean(relatedJobs.nextCursor),
    relatedJobs: relatedJobs.items,
    siteId: decodedSiteId,
  };
}
