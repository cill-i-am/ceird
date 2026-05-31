import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import { applyDataPlaneSeed } from "#/data-plane/bootstrap";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { listAllCurrentServerSites } from "#/features/api/app-api-server";
import {
  assertOrganizationInternalRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { OrganizationProductRouteContext } from "#/features/organizations/organization-route-access";
import { decodeOrganizationViewerUserId } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";

import { createSitesListSeed } from "./sites-data-plane";

const EMPTY_SITE_OPTIONS: SitesOptionsResponse = {
  sites: [],
};

interface SitesRouteOrganizationAccess extends OrganizationProductRouteContext {
  readonly queryClient?: QueryClient | undefined;
}

export async function loadSitesRouteData(
  organizationAccess: SitesRouteOrganizationAccess
) {
  if (organizationAccess.activeOrganizationSync.required) {
    return {
      dataPlaneSeeds: [],
      options: EMPTY_SITE_OPTIONS,
      viewer: {
        role: "member",
        userId: decodeOrganizationViewerUserId(
          organizationAccess.currentUserId
        ),
      } satisfies OrganizationViewer,
    };
  }

  const activeRole = requireOrganizationRouteContextRole(organizationAccess);

  assertOrganizationInternalRole({ role: activeRole });

  const sitesRequestStartedAt = Date.now();
  const sites = await listAllCurrentServerSites();
  const siteOptions = {
    sites: sites.items,
  } satisfies SitesOptionsResponse;
  const viewer = {
    role: activeRole,
    userId: decodeOrganizationViewerUserId(organizationAccess.currentUserId),
  } satisfies OrganizationViewer;
  const sitesSeed = createSitesListSeed(
    createOrganizationDataScope({
      organizationId: organizationAccess.activeOrganizationId,
      role: viewer.role,
      userId: viewer.userId,
    }),
    sites,
    sitesRequestStartedAt
  );

  if (organizationAccess.queryClient) {
    const seededSites = applyDataPlaneSeed(
      organizationAccess.queryClient,
      sitesSeed
    );

    return {
      dataPlaneSeeds: [sitesSeed],
      options: {
        ...siteOptions,
        sites: seededSites,
      },
      viewer,
    };
  }

  return {
    dataPlaneSeeds: [sitesSeed],
    options: siteOptions,
    viewer,
  };
}
