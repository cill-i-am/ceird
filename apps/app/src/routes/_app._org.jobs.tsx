import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

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
      onRecentSearchCommit={(recentSearch: string | undefined) => {
        navigate({
          replace: true,
          search: (current) => ({
            ...current,
            recentSearch,
          }),
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
      onViewChange={(view: JobsWorkspaceView) => {
        navigate({
          search: (current) => ({
            ...current,
            view: view === "list" ? undefined : view,
          }),
        });
      }}
      query={search.query}
      recentSearch={search.recentSearch}
      sort={search.sort ?? "updated-desc"}
      status={search.status}
      view={search.view ?? "list"}
    />
  );
}
