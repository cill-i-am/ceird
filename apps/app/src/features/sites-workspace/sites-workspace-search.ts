export const SITES_WORKSPACE_SHELL_STATES = [
  "ready",
  "loading",
  "empty",
  "unavailable",
] as const;

export type SitesWorkspaceShellState =
  (typeof SITES_WORKSPACE_SHELL_STATES)[number];

export interface SitesWorkspaceSearch {
  readonly shell?: SitesWorkspaceShellState | undefined;
}

export function decodeSitesWorkspaceSearch(
  search: Record<string, unknown>
): SitesWorkspaceSearch {
  const shell =
    typeof search.shell === "string" && isSitesWorkspaceShellState(search.shell)
      ? search.shell
      : undefined;

  return { shell };
}

function isSitesWorkspaceShellState(
  value: string
): value is SitesWorkspaceShellState {
  return SITES_WORKSPACE_SHELL_STATES.includes(
    value as SitesWorkspaceShellState
  );
}
