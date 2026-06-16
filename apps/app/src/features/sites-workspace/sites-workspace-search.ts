export const SITES_WORKSPACE_SHELL_STATES = [
  "ready",
  "loading",
  "empty",
  "unavailable",
] as const;

export type SitesWorkspaceShellState =
  (typeof SITES_WORKSPACE_SHELL_STATES)[number];

export const SITES_WORKSPACE_FILTERS = [
  "all",
  "with-active-jobs",
  "needs-location",
] as const;
export const SITES_WORKSPACE_SORTS = [
  "name",
  "active-jobs",
  "updated",
] as const;

export type SitesWorkspaceFilter = (typeof SITES_WORKSPACE_FILTERS)[number];
export type SitesWorkspaceSort = (typeof SITES_WORKSPACE_SORTS)[number];

export interface SitesWorkspaceSearch {
  readonly filter?: SitesWorkspaceFilter | undefined;
  readonly query?: string | undefined;
  readonly selectedSiteId?: string | undefined;
  readonly shell?: SitesWorkspaceShellState | undefined;
  readonly sort?: SitesWorkspaceSort | undefined;
}

export function decodeSitesWorkspaceSearch(
  search: Record<string, unknown>
): SitesWorkspaceSearch {
  const shell =
    typeof search.shell === "string" && isSitesWorkspaceShellState(search.shell)
      ? search.shell
      : undefined;
  const query =
    typeof search.query === "string" && search.query.trim().length > 0
      ? search.query
      : undefined;
  const filter =
    typeof search.filter === "string" && isSitesWorkspaceFilter(search.filter)
      ? search.filter
      : undefined;
  const sort =
    typeof search.sort === "string" && isSitesWorkspaceSort(search.sort)
      ? search.sort
      : undefined;
  const selectedSiteId =
    typeof search.selectedSiteId === "string" &&
    search.selectedSiteId.trim().length > 0
      ? search.selectedSiteId
      : undefined;

  return { filter, query, selectedSiteId, shell, sort };
}

function isSitesWorkspaceShellState(
  value: string
): value is SitesWorkspaceShellState {
  return SITES_WORKSPACE_SHELL_STATES.includes(
    value as SitesWorkspaceShellState
  );
}

function isSitesWorkspaceFilter(value: string): value is SitesWorkspaceFilter {
  return SITES_WORKSPACE_FILTERS.includes(value as SitesWorkspaceFilter);
}

function isSitesWorkspaceSort(value: string): value is SitesWorkspaceSort {
  return SITES_WORKSPACE_SORTS.includes(value as SitesWorkspaceSort);
}
