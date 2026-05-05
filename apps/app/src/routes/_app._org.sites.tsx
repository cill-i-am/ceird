import type {
  OrganizationId,
  OrganizationRole,
  UserId as UserIdType,
} from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";

import { getCurrentServerSiteOptions } from "#/features/api/app-api-server";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  assertOrganizationInternalRole,
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";
import { decodeOrganizationViewerUserId } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesRouteContent } from "#/features/sites/sites-route-content";

const EMPTY_SITE_OPTIONS: SitesOptionsResponse = {
  serviceAreas: [],
  sites: [],
};

interface SitesRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly currentUserId: UserIdType;
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

  const siteOptions = await getCurrentServerSiteOptions();

  return {
    options: siteOptions,
    viewer: {
      role: activeRole,
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies OrganizationViewer,
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

export const Route = createFileRoute("/_app/_org/sites")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  loader: ({ context }) => loadSitesRouteData(context),
  component: SitesRoute,
});

function SitesRoute() {
  const { activeOrganizationId } = useRouteContext({
    from: "/_app/_org",
  });
  const { options, viewer } = Route.useLoaderData();

  return (
    <SitesRouteContent
      activeOrganizationId={activeOrganizationId}
      options={options}
      viewer={viewer}
    >
      <Outlet />
    </SitesRouteContent>
  );
}
