import { validateSandboxName } from "@ceird/sandbox-core";

import { makePortlessAliasCommands } from "./portless.js";

describe("makePortlessAliasCommands()", () => {
  it("builds deterministic add and remove alias commands for app and api", () => {
    expect(
      makePortlessAliasCommands({
        sandboxName: validateSandboxName("agent-one"),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
      })
    ).toStrictEqual({
      add: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.app.ceird",
          "4300",
          "--force",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.api.ceird",
          "4301",
          "--force",
        ],
      ],
      remove: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.app.ceird",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.api.ceird",
        ],
      ],
    });
  }, 10_000);
});
