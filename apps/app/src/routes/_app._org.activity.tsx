import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { OrganizationId } from "@task-tracker/identity-core";
import type {
  JobOptionsResponse,
  OrganizationActivityListResponse,
} from "@task-tracker/jobs-core";

import {
  decodeActivitySearch,
  toOrganizationActivityQuery,
} from "#/features/activity/activity-search";
import type { ActivitySearch } from "#/features/activity/activity-search";
import { OrganizationActivityPage } from "#/features/activity/organization-activity-page";
import {
  getCurrentServerJobOptions,
  listCurrentServerOrganizationActivity,
} from "#/features/jobs/jobs-server";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import {
  assertOrganizationAdministrationRole,
  getCurrentOrganizationMemberRole,
} from "#/features/organizations/organization-access";

export { decodeActivitySearch };

const EMPTY_ACTIVITY: OrganizationActivityListResponse = {
  items: [],
  nextCursor: undefined,
};

const EMPTY_OPTIONS: JobOptionsResponse = {
  contacts: [],
  members: [],
  regions: [],
  sites: [],
};

interface ActivityRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
}

export async function loadActivityRouteData(
  context: ActivityRouteOrganizationAccess,
  search: ActivitySearch
) {
  if (context.activeOrganizationSync.required) {
    return {
      activity: EMPTY_ACTIVITY,
      options: EMPTY_OPTIONS,
    };
  }

  const role = await getCurrentOrganizationMemberRole(
    context.activeOrganizationId
  );

  assertOrganizationAdministrationRole(role);

  const [activity, options] = await Promise.all([
    listCurrentServerOrganizationActivity(toOrganizationActivityQuery(search)),
    getCurrentServerJobOptions(),
  ]);

  return {
    activity,
    options,
  };
}

export function getActivityRouteLoaderDeps(search: ActivitySearch) {
  return {
    actorUserId: search.actorUserId,
    eventType: search.eventType,
    fromDate: search.fromDate,
    jobTitle: search.jobTitle,
    toDate: search.toDate,
  } satisfies ActivitySearch;
}

export const Route = createFileRoute("/_app/_org/activity")({
  staticData: {
    breadcrumb: {
      label: "Activity",
      to: "/activity",
    },
  },
  validateSearch: decodeActivitySearch,
  loaderDeps: ({ search }) => getActivityRouteLoaderDeps(search),
  loader: ({ context, deps }) => loadActivityRouteData(context, deps),
  component: ActivityRoute,
});

function ActivityRoute() {
  const { activity, options } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/activity" });

  return (
    <OrganizationActivityPage
      activity={activity}
      options={options}
      search={search}
      onSearchChange={(nextSearch) => {
        navigate({
          search: omitEmptyActivitySearch(nextSearch),
        });
      }}
    />
  );
}

function omitEmptyActivitySearch(search: ActivitySearch) {
  return {
    actorUserId: search.actorUserId || undefined,
    eventType: search.eventType || undefined,
    fromDate: search.fromDate || undefined,
    jobTitle: search.jobTitle?.trim() || undefined,
    toDate: search.toDate || undefined,
  } satisfies ActivitySearch;
}
