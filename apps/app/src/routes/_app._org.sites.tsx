import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";
import type { JobOptionsResponse, UserIdType } from "@task-tracker/jobs-core";

import { getCurrentServerSiteOptions } from "#/features/jobs/jobs-server";
import { decodeJobsViewerUserId } from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";
import { SitesRouteContent } from "#/features/sites/sites-route-content";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [],
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
    currentUserId: decodeJobsViewerUserId(organizationAccess.session.user.id),
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
      options: EMPTY_JOBS_OPTIONS,
      viewer: {
        role: "member",
        userId: resolvedOrganizationAccess.currentUserId,
      } satisfies JobsViewer,
    };
  }

  const [activeRole, siteOptions] = await Promise.all([
    resolveSitesRouteOrganizationRole(resolvedOrganizationAccess),
    getCurrentServerSiteOptions(),
  ]);

  return {
    options: {
      contacts: [],
      members: [],
      regions: siteOptions.regions,
      sites: siteOptions.sites,
    },
    viewer: {
      role: activeRole,
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies JobsViewer,
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
