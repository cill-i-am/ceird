import type {
  SandboxNameType as SandboxName,
  SandboxPorts,
} from "@ceird/sandbox-core";

export interface PortlessAliasCommands {
  readonly add: readonly (readonly [string, ...string[]])[];
  readonly remove: readonly (readonly [string, ...string[]])[];
}

export function makePortlessAliasCommands(input: {
  readonly sandboxName: SandboxName;
  readonly ports: SandboxPorts;
}): PortlessAliasCommands {
  const appName = `${input.sandboxName}.app.ceird`;
  const apiName = `${input.sandboxName}.api.ceird`;

  return {
    add: [
      [
        "pnpm",
        "exec",
        "portless",
        "alias",
        appName,
        String(input.ports.app),
        "--force",
      ],
      [
        "pnpm",
        "exec",
        "portless",
        "alias",
        apiName,
        String(input.ports.api),
        "--force",
      ],
    ],
    remove: [
      ["pnpm", "exec", "portless", "alias", "--remove", appName],
      ["pnpm", "exec", "portless", "alias", "--remove", apiName],
    ],
  };
}
