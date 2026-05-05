import type { ComposeProjectNameType as ComposeProjectName } from "@ceird/sandbox-core";

export function buildComposeCommandArgs(input: {
  readonly composeFile: string;
  readonly composeEnvFile: string;
  readonly composeProjectName: ComposeProjectName;
  readonly subcommand: readonly string[];
}): string[] {
  return [
    "compose",
    "--file",
    input.composeFile,
    "--project-name",
    input.composeProjectName,
    "--env-file",
    input.composeEnvFile,
    ...input.subcommand,
  ];
}

export function renderComposeEnvironmentFile(input: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly proxyPort: number;
  readonly overrides: Record<string, string>;
}): string {
  return [
    `SANDBOX_REPO_ROOT=${input.repoRoot}`,
    `SANDBOX_WORKTREE_PATH=${input.worktreePath}`,
    `SANDBOX_PROXY_PORT=${input.proxyPort}`,
    ...Object.entries(input.overrides)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}
