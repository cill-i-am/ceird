import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import * as React from "react";

import {
  commitRecentSearch,
  getRecentSearchesForSurface,
  getWorkspacePreferencesForSurface,
  normalizeRecentSearch,
  saveWorkspacePreferences,
  useLocalConvenienceRecords,
} from "#/data-plane/local-convenience-collections";
import { shouldEnableJobsWorkspaceHotkeys } from "#/features/jobs-workspace/jobs-workspace-route-hotkeys";
import { JobsWorkspaceRouteShell } from "#/features/jobs-workspace/jobs-workspace-route-shell";
import { decodeJobsWorkspaceSearch } from "#/features/jobs-workspace/jobs-workspace-search";
import type {
  JobsWorkspaceSort,
  JobsWorkspaceStatus,
  JobsWorkspaceView,
} from "#/features/jobs-workspace/jobs-workspace-search";

export const Route = createFileRoute("/_app/_org/jobs")({
  staticData: {
    breadcrumb: {
      label: "Jobs",
      to: "/jobs",
    },
  },
  validateSearch: decodeJobsWorkspaceSearch,
  component: JobsRoute,
});

function JobsRoute() {
  const { currentOrganizationRole } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/jobs" });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const localConvenience = useLocalConvenienceRecords();
  const localPreferences = getWorkspacePreferencesForSurface(
    localConvenience.records,
    "jobs"
  );
  const localRecentSearches = getRecentSearchesForSurface(
    localConvenience.records,
    "jobs"
  );
  const view = search.view ?? localPreferences?.view ?? "list";
  const recentSearch = search.recentSearch ?? localRecentSearches[0];

  React.useEffect(() => {
    if (search.view !== undefined) {
      return;
    }

    if (localPreferences?.view === undefined) {
      return;
    }

    navigate({
      replace: true,
      search: (current) => ({
        ...current,
        view:
          localPreferences.view === "list" ? undefined : localPreferences.view,
      }),
    });
  }, [localPreferences?.view, navigate, search.view]);

  return (
    <JobsWorkspaceRouteShell
      currentOrganizationRole={currentOrganizationRole}
      detailJobId={search.detailJobId}
      hotkeysEnabled={shouldEnableJobsWorkspaceHotkeys({ pathname })}
      labelId={search.labelId}
      onDetailJobChange={(detailJobId: string | undefined) => {
        navigate({
          search: (current) => ({
            ...current,
            detailJobId,
          }),
        });
      }}
      onLabelChange={(labelId: string | undefined) => {
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            labelId,
          }),
        });
      }}
      onQueryChange={(query: string | undefined) => {
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            query,
          }),
        });
      }}
      onRecentSearchCommit={(nextRecentSearch: string | undefined) => {
        const committedSearch = normalizeRecentSearch(nextRecentSearch);
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            recentSearch: committedSearch,
          }),
        });
        commitRecentSearch({
          collection: localConvenience.collection,
          query: nextRecentSearch,
          surface: "jobs",
        });
      }}
      onSortChange={(sort: JobsWorkspaceSort | undefined) => {
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            sort,
          }),
        });
      }}
      onStatusChange={(status: JobsWorkspaceStatus | undefined) => {
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            status,
          }),
        });
      }}
      onViewChange={(nextView: JobsWorkspaceView) => {
        navigate({
          search: (current) => ({
            ...current,
            view: nextView === "list" ? undefined : nextView,
          }),
        });
        saveWorkspacePreferences({
          collection: localConvenience.collection,
          surface: "jobs",
          view: nextView,
        });
      }}
      query={search.query}
      recentSearch={recentSearch}
      recentSearches={localRecentSearches}
      sort={search.sort ?? "updated-desc"}
      status={search.status}
      view={view}
    />
  );
}
