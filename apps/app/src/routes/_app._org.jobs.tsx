import { RegistryProvider } from "@effect-atom/atom-react";
import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  JobListResponse,
  JobOptionsResponse,
} from "@task-tracker/jobs-core";
import * as React from "react";

import { JobsPage } from "#/features/jobs/jobs-page";
import {
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  jobsListStateAtom,
  jobsOptionsStateAtom,
  seedJobsListState,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [],
  sites: [],
};

const EMPTY_JOBS_LIST: JobListResponse = {
  items: [],
  nextCursor: undefined,
};

interface JobsRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentUserId: string;
}

function toJobsRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): JobsRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: organizationAccess.session.user.id,
  };
}

export async function loadJobsRouteData(
  organizationAccess?: JobsRouteOrganizationAccess
) {
  const resolvedOrganizationAccess =
    organizationAccess ??
    toJobsRouteOrganizationAccess(await ensureActiveOrganizationId());

  if (resolvedOrganizationAccess.activeOrganizationSync.required) {
    return {
      list: EMPTY_JOBS_LIST,
      options: EMPTY_JOBS_OPTIONS,
      viewer: {
        role: "member",
        userId: resolvedOrganizationAccess.currentUserId,
      } satisfies JobsViewer,
    };
  }

  const [activeRole, list, options] = await Promise.all([
    getCurrentOrganizationMemberRole(
      resolvedOrganizationAccess.activeOrganizationId
    ),
    listAllCurrentServerJobs({}),
    getCurrentServerJobOptions(),
  ]);

  return {
    list,
    options,
    viewer: {
      role: activeRole.role,
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies JobsViewer,
  };
}

export const Route = createFileRoute("/_app/_org/jobs")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  loader: ({ context }) => loadJobsRouteData(context),
  component: JobsRoute,
});

export function JobsRouteContent({
  activeOrganizationId,
  activeOrganizationName,
  children,
  list,
  options,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationName: string;
  readonly children?: React.ReactNode;
  readonly list: JobListResponse;
  readonly options: JobOptionsResponse;
  readonly viewer: JobsViewer;
}) {
  return (
    <RegistryProvider
      key={activeOrganizationId}
      initialValues={[
        [jobsListStateAtom, seedJobsListState(activeOrganizationId, list)],
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(activeOrganizationId, options),
        ],
      ]}
    >
      <JobsPage activeOrganizationName={activeOrganizationName} viewer={viewer}>
        {children}
      </JobsPage>
    </RegistryProvider>
  );
}

function JobsRoute() {
  const { activeOrganization, activeOrganizationId } = useRouteContext({
    from: "/_app/_org",
  });
  const { list, options, viewer } = Route.useLoaderData();

  return (
    <JobsRouteContent
      activeOrganizationName={activeOrganization.name}
      activeOrganizationId={activeOrganizationId}
      list={list}
      options={options}
      viewer={viewer}
    >
      <Outlet />
    </JobsRouteContent>
  );
}
