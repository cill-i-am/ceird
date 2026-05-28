import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";

export function shouldEnableJobsListHotkeys({
  pathname,
  stack,
}: {
  readonly pathname: string;
  readonly stack: readonly WorkspaceSheet[];
}) {
  return pathname === "/jobs" && stack.length === 0;
}
