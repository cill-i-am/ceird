import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import {
  getCurrentServerServiceAreas,
  listAllCurrentServerSites,
} from "#/features/api/app-api-server";
import {
  assertOrganizationInternalRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { OrganizationProductRouteContext } from "#/features/organizations/organization-route-access";
import {
  decodeOrganizationViewerUserId,
  hasOrganizationElevatedAccess,
} from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { deriveServiceAreasFromSites } from "#/features/sites/sites-options";
import { seedRouteQueryData } from "#/lib/tanstack-db-query";

import { organizationSitesQueryKey } from "./sites-query-keys";

const EMPTY_SITE_OPTIONS: SitesOptionsResponse = {
  serviceAreas: [],
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
  const [sites, serviceAreas] = await Promise.all([
    listAllCurrentServerSites(),
    hasOrganizationElevatedAccess(activeRole)
      ? getCurrentServerServiceAreas()
      : Promise.resolve({ items: [] }),
  ]);
  const siteOptions = {
    serviceAreas: hasOrganizationElevatedAccess(activeRole)
      ? serviceAreas.items.map(({ id, name }) => ({ id, name }))
      : deriveServiceAreasFromSites(sites.items),
    sites: sites.items,
  } satisfies SitesOptionsResponse;
  const viewer = {
    role: activeRole,
    userId: decodeOrganizationViewerUserId(organizationAccess.currentUserId),
  } satisfies OrganizationViewer;

  if (organizationAccess.queryClient) {
    const seededSites = seedRouteQueryData(
      organizationAccess.queryClient,
      organizationSitesQueryKey({
        organizationId: organizationAccess.activeOrganizationId,
        role: viewer.role,
        userId: viewer.userId,
      }),
      siteOptions.sites,
      {
        requestStartedAt: sitesRequestStartedAt,
      }
    );

    return {
      options: {
        ...siteOptions,
        sites: seededSites,
      },
      viewer,
    };
  }

  return {
    options: siteOptions,
    viewer,
  };
}
