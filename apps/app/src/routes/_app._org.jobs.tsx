import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";
import type {
  JobListResponse,
  JobOptionsResponse,
  UserIdType,
} from "@task-tracker/jobs-core";

import { JobsRouteContent } from "#/features/jobs/jobs-route-content";
import { decodeJobsSearch } from "#/features/jobs/jobs-search";
import {
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import { decodeJobsViewerUserId } from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  ensureActiveOrganizationId,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";

export { decodeJobsSearch };

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
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly currentUserId: UserIdType;
}

function toJobsRouteOrganizationAccess(
  organizationAccess: Awaited<ReturnType<typeof ensureActiveOrganizationId>>
): JobsRouteOrganizationAccess {
  return {
    activeOrganizationId: organizationAccess.activeOrganizationId,
    activeOrganizationSync: organizationAccess.activeOrganizationSync,
    currentUserId: decodeJobsViewerUserId(organizationAccess.session.user.id),
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
    resolveJobsRouteOrganizationRole(resolvedOrganizationAccess),
    listAllCurrentServerJobs({}),
    getCurrentServerJobOptions(),
  ]);

  return {
    list,
    options,
    viewer: {
      role: activeRole,
      userId: resolvedOrganizationAccess.currentUserId,
    } satisfies JobsViewer,
  };
}

async function resolveJobsRouteOrganizationRole(
  organizationAccess: JobsRouteOrganizationAccess
) {
  if (organizationAccess.currentOrganizationRole !== undefined) {
    return organizationAccess.currentOrganizationRole;
  }

  const role = await getCurrentOrganizationMemberRole(
    organizationAccess.activeOrganizationId
  );

  return role.role;
}

export const Route = createFileRoute("/_app/_org/jobs")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  validateSearch: decodeJobsSearch,
  loader: ({ context }) => loadJobsRouteData(context),
  component: JobsRoute,
});

function JobsRoute() {
  const { activeOrganization, activeOrganizationId } = useRouteContext({
    from: "/_app/_org",
  });
  const { list, options, viewer } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/jobs" });
  const search = Route.useSearch();
  const listHotkeysEnabled = useRouterState({
    select: (state) => state.location.pathname === "/jobs",
  });

  return (
    <JobsRouteContent
      activeOrganizationName={activeOrganization.name}
      activeOrganizationId={activeOrganizationId}
      listHotkeysEnabled={listHotkeysEnabled}
      list={list}
      onViewModeChange={(viewMode) => {
        navigate({
          search: (current) => ({
            ...current,
            view: viewMode === "list" ? undefined : viewMode,
          }),
        });
      }}
      options={options}
      viewMode={search.view ?? "list"}
      viewer={viewer}
    >
      <Outlet />
    </JobsRouteContent>
  );
}
