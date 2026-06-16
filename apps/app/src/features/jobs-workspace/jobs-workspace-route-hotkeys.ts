export function shouldEnableJobsWorkspaceHotkeys({
  pathname,
}: {
  readonly pathname: string;
}) {
  return pathname === "/jobs";
}
