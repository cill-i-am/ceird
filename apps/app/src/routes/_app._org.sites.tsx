import { RegistryProvider } from "@effect-atom/atom-react";
import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";
import type { JobOptionsResponse } from "@task-tracker/jobs-core";
import * as React from "react";

import { getCurrentServerSiteOptions } from "#/features/jobs/jobs-server";
import {
  jobsOptionsStateAtom,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";
import { SitesPage } from "#/features/sites/sites-page";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [],
  sites: [],
};

interface SitesRouteOrganizationAccess {
  readonly activeOrganizationId: string;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentUserId: string;
}

function toSitesRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): SitesRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: organizationAccess.session.user.id,
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

  const activeRole = await getCurrentOrganizationMemberRole(
    resolvedOrganizationAccess.activeOrganizationId
  );
  const siteOptions = await getCurrentServerSiteOptions();

  return {
    options: {
      contacts: [],
      members: [],
      regions: siteOptions.regions,
      sites: siteOptions.sites,
    },
    viewer: {
      role: normalizeSitesViewerRole(activeRole.role),
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies JobsViewer,
  };
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

export function SitesRouteContent({
  activeOrganizationId,
  children,
  options,
  viewer,
}: {
  readonly activeOrganizationId: string;
  readonly children?: React.ReactNode;
  readonly options: JobOptionsResponse;
  readonly viewer: JobsViewer;
}) {
  return (
    <RegistryProvider
      key={activeOrganizationId}
      initialValues={[
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(activeOrganizationId, options),
        ],
      ]}
    >
      <SitesPage viewer={viewer}>{children}</SitesPage>
    </RegistryProvider>
  );
}

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

function normalizeSitesViewerRole(role: string): JobsViewer["role"] {
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }

  throw new Error("Organization member role is not supported by Sites.");
}
