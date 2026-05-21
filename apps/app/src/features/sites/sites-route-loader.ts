import type {
  OrganizationId,
  OrganizationRole,
  UserId as UserIdType,
} from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import {
  getCurrentServerServiceAreas,
  listAllCurrentServerSites,
} from "#/features/api/app-api-server";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  assertOrganizationInternalRole,
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";
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

interface SitesRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly currentUserId: UserIdType;
  readonly queryClient?: QueryClient | undefined;
}

function toSitesRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): SitesRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: decodeOrganizationViewerUserId(
      organizationAccess.session.user.id
    ),
  };
}

export async function loadSitesRouteData(
  organizationAccess?: SitesRouteOrganizationAccess
) {
  const resolvedOrganizationAccess =
    organizationAccess ??
    toSitesRouteOrganizationAccess(await ensureActiveOrganizationId());

  if (resolvedOrganizationAccess.activeOrganizationSync.required) {
    return {
      options: EMPTY_SITE_OPTIONS,
      viewer: {
        role: "member",
        userId: resolvedOrganizationAccess.currentUserId,
      } satisfies OrganizationViewer,
    };
  }

  const activeRole = await resolveSitesRouteOrganizationRole(
    resolvedOrganizationAccess
  );

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
    userId: resolvedOrganizationAccess.currentUserId,
  } satisfies OrganizationViewer;

  if (resolvedOrganizationAccess.queryClient) {
    const seededSites = seedRouteQueryData(
      resolvedOrganizationAccess.queryClient,
      organizationSitesQueryKey({
        organizationId: resolvedOrganizationAccess.activeOrganizationId,
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

async function resolveSitesRouteOrganizationRole(
  organizationAccess: SitesRouteOrganizationAccess
) {
  if (organizationAccess.currentOrganizationRole !== undefined) {
    return organizationAccess.currentOrganizationRole;
  }

  const role = await getCurrentOrganizationMemberRole(
    organizationAccess.activeOrganizationId
  );

  return role.role;
}
