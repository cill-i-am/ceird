import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { loadActivityRouteData } from "#/features/activity/activity-route-loader";
import { decodeActivitySearch } from "#/features/activity/activity-search";
import type { ActivitySearch } from "#/features/activity/activity-search";
import { OrganizationActivityPage } from "#/features/activity/organization-activity-page";

export { decodeActivitySearch };

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
  codeSplitGroupings: [["loader", "component"]],
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
