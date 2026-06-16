import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useDataPlaneSession } from "#/data-plane/session";
import {
  getOrCreateActivityEventsCollectionState,
  getOrCreateProductActivityActorsCollectionState,
} from "#/features/activity/activity-data-plane";
import { assertActivityRouteAccess } from "#/features/activity/activity-route-loader";
import { decodeActivitySearch } from "#/features/activity/activity-search";
import type { ActivitySearch } from "#/features/activity/activity-search";
import { OrganizationActivityPage } from "#/features/activity/organization-activity-page";

export { decodeActivitySearch };

export function getActivityRouteLoaderDeps(search: ActivitySearch) {
  return {
    eventType: search.eventType,
    status: search.status,
    targetType: search.targetType,
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
  beforeLoad: ({ context }) => assertActivityRouteAccess(context),
  component: ActivityRoute,
});

function ActivityRoute() {
  const dataPlaneSession = useDataPlaneSession();
  const search = Route.useSearch();
  const { currentOrganizationRole } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/activity" });

  return (
    <OrganizationActivityPage
      actorsState={getOrCreateProductActivityActorsCollectionState({
        scope: dataPlaneSession.scope,
        session: dataPlaneSession,
      })}
      currentOrganizationRole={currentOrganizationRole}
      eventsState={getOrCreateActivityEventsCollectionState({
        scope: dataPlaneSession.scope,
        session: dataPlaneSession,
      })}
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
    eventType: search.eventType || undefined,
    status: search.status || undefined,
    targetType: search.targetType || undefined,
  } satisfies ActivitySearch;
}
