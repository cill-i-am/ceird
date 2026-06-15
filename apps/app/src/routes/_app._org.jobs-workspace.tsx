import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

import { shouldEnableJobsWorkspaceHotkeys } from "#/features/jobs-workspace/jobs-workspace-route-hotkeys";
import { JobsWorkspaceRouteShell } from "#/features/jobs-workspace/jobs-workspace-route-shell";
import { decodeJobsWorkspaceSearch } from "#/features/jobs-workspace/jobs-workspace-search";
import type {
  JobsWorkspaceStatus,
  JobsWorkspaceView,
} from "#/features/jobs-workspace/jobs-workspace-search";

export const Route = createFileRoute("/_app/_org/jobs-workspace")({
  staticData: {
    breadcrumb: {
      label: "Jobs Workspace",
      to: "/jobs-workspace",
    },
  },
  validateSearch: decodeJobsWorkspaceSearch,
  component: JobsWorkspaceRoute,
});

function JobsWorkspaceRoute() {
  const { currentOrganizationRole } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/jobs-workspace" });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <JobsWorkspaceRouteShell
      currentOrganizationRole={currentOrganizationRole}
      hotkeysEnabled={shouldEnableJobsWorkspaceHotkeys({ pathname })}
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
      status={search.status}
      view={search.view ?? "list"}
    />
  );
}
