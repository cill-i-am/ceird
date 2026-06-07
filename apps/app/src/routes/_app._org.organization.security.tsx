import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { OrganizationSecurityActivityPage } from "#/features/organization-security/organization-security-activity-page";
import { loadOrganizationSecurityActivityRouteData } from "#/features/organization-security/organization-security-route-loader";
import { decodeOrganizationSecurityActivitySearch } from "#/features/organization-security/organization-security-search";
import type { OrganizationSecurityActivitySearch } from "#/features/organization-security/organization-security-search";
import type { WorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";

export { decodeOrganizationSecurityActivitySearch };

export function getOrganizationSecurityActivityRouteLoaderDeps(
  search: OrganizationSecurityActivitySearch
) {
  return {
    actorUserId: search.actorUserId,
    cursor: search.cursor,
    eventType: search.eventType,
    fromDate: search.fromDate,
    targetSearch: search.targetSearch,
    targetType: search.targetType,
    toDate: search.toDate,
  } satisfies OrganizationSecurityActivitySearch;
}

export const Route = createFileRoute("/_app/_org/organization/security")({
  staticData: {
    breadcrumb: {
      label: "Security activity",
      to: "/organization/security",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  validateSearch: decodeOrganizationSecurityActivitySearch,
  loaderDeps: ({ search }) =>
    getOrganizationSecurityActivityRouteLoaderDeps(search),
  loader: ({ context, deps }) =>
    loadOrganizationSecurityActivityRouteData(context, deps),
  component: OrganizationSecurityActivityRoute,
});

function OrganizationSecurityActivityRoute() {
  const { activity } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/organization/security" });

  return (
    <OrganizationSecurityActivityPage
      activity={activity}
      search={search}
      onSearchChange={(nextSearch) => {
        navigate({
          search: (current) =>
            mergeOrganizationSecurityActivitySearch(current, nextSearch),
        });
      }}
    />
  );
}

export function mergeOrganizationSecurityActivitySearch(
  current: OrganizationSecurityActivitySearch & WorkspaceSheetSearch,
  next: OrganizationSecurityActivitySearch
) {
  const nextSecuritySearch = omitEmptyOrganizationSecurityActivitySearch(next);

  return {
    ...current,
    actorUserId: nextSecuritySearch.actorUserId,
    cursor: nextSecuritySearch.cursor,
    eventType: nextSecuritySearch.eventType,
    fromDate: nextSecuritySearch.fromDate,
    targetSearch: nextSecuritySearch.targetSearch,
    targetType: nextSecuritySearch.targetType,
    toDate: nextSecuritySearch.toDate,
  } satisfies OrganizationSecurityActivitySearch & WorkspaceSheetSearch;
}

export function omitEmptyOrganizationSecurityActivitySearch(
  search: OrganizationSecurityActivitySearch
) {
  return {
    actorUserId: search.actorUserId || undefined,
    cursor: search.cursor || undefined,
    eventType: search.eventType || undefined,
    fromDate: search.fromDate || undefined,
    targetSearch: search.targetSearch?.trim() || undefined,
    targetType: search.targetType || undefined,
    toDate: search.toDate || undefined,
  } satisfies OrganizationSecurityActivitySearch;
}
