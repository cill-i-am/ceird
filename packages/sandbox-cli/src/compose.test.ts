import fs from "node:fs/promises";
import path from "node:path";

import {
  makeComposeProjectName,
  validateSandboxName,
} from "@task-tracker/sandbox-core";

import {
  buildComposeCommandArgs,
  renderComposeEnvironmentFile,
} from "./compose.js";

describe("buildComposeCommandArgs()", () => {
  it("builds docker compose args for a named sandbox project", () => {
    expect(
      buildComposeCommandArgs({
        composeFile: "/repo/packages/sandbox-cli/docker/sandbox.compose.yaml",
        composeEnvFile:
          "/Users/me/.task-tracker/sandboxes/agent-one/compose.env",
        composeProjectName: makeComposeProjectName(
          validateSandboxName("agent-one")
        ),
        subcommand: ["up", "-d"],
      })
    ).toStrictEqual([
      "compose",
      "--file",
      "/repo/packages/sandbox-cli/docker/sandbox.compose.yaml",
      "--project-name",
      "tt-sbx-agent-one",
      "--env-file",
      "/Users/me/.task-tracker/sandboxes/agent-one/compose.env",
      "up",
      "-d",
    ]);
  }, 10_000);
});

describe("renderComposeEnvironmentFile()", () => {
  it("writes both compose substitution variables and service env overrides", () => {
    expect(
      renderComposeEnvironmentFile({
        repoRoot: "/repo",
        worktreePath: "/repo/.worktrees/agent-one",
        proxyPort: 1355,
        overrides: {
          API_HOST_PORT: "4301",
          APP_HOST_PORT: "4300",
          AUTH_APP_ORIGIN: "http://127.0.0.1:4300",
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Task Tracker",
          BETTER_AUTH_BASE_URL: "http://127.0.0.1:4301",
          DATABASE_URL:
            "postgresql://postgres:postgres@postgres:5432/task_tracker",
          RESEND_API_KEY: "re_live_123",
          SANDBOX_DEV_IMAGE: "tt-sbx-task-tracker-dev:123456789abc",
          SANDBOX_NODE_MODULES_VOLUME:
            "tt-sbx-node-modules-123456789abc-def456789abc",
          SANDBOX_PNPM_STORE_VOLUME: "tt-sbx-pnpm-store",
        },
      })
    ).toBe(
      [
        "SANDBOX_REPO_ROOT=/repo",
        "SANDBOX_WORKTREE_PATH=/repo/.worktrees/agent-one",
        "SANDBOX_PROXY_PORT=1355",
        "API_HOST_PORT=4301",
        "APP_HOST_PORT=4300",
        "AUTH_APP_ORIGIN=http://127.0.0.1:4300",
        "AUTH_EMAIL_FROM=auth@example.com",
        "AUTH_EMAIL_FROM_NAME=Task Tracker",
        "BETTER_AUTH_BASE_URL=http://127.0.0.1:4301",
        "DATABASE_URL=postgresql://postgres:postgres@postgres:5432/task_tracker",
        "RESEND_API_KEY=re_live_123",
        "SANDBOX_DEV_IMAGE=tt-sbx-task-tracker-dev:123456789abc",
        "SANDBOX_NODE_MODULES_VOLUME=tt-sbx-node-modules-123456789abc-def456789abc",
        "SANDBOX_PNPM_STORE_VOLUME=tt-sbx-pnpm-store",
        "",
      ].join("\n")
    );
  }, 10_000);
});

describe("sandbox.compose.yaml", () => {
  it("uses the shared dev image and passes the service name to the shared sandbox entrypoint", async () => {
    const composeFile = await fs.readFile(
      path.join(import.meta.dirname, "..", "docker", "sandbox.compose.yaml"),
      "utf8"
    );
    const sandboxDevImageVariable = ["${", "SANDBOX_DEV_IMAGE", "}"].join("");
    const pnpmStoreVolumeVariable = [
      "${",
      "SANDBOX_PNPM_STORE_VOLUME",
      "}",
    ].join("");
    const nodeModulesVolumeVariable = [
      "${",
      "SANDBOX_NODE_MODULES_VOLUME",
      "}",
    ].join("");

    expect(composeFile).toContain(`image: ${sandboxDevImageVariable}`);
    expect(composeFile).toContain('command: ["api"]');
    expect(composeFile).toContain('command: ["app"]');
    expect(composeFile).toContain(`name: ${pnpmStoreVolumeVariable}`);
    expect(composeFile).toContain(`name: ${nodeModulesVolumeVariable}`);
  }, 10_000);
});
