import { Schema } from "effect";

import {
  allocateSandboxPorts,
  buildSandboxUrls,
  deriveSandboxIdentity,
  makeHealthPayloadFromSandboxIdInput,
  makeComposeProjectName,
  makeHealthPayload,
  reconcileSandboxRecord,
  validateHostnameSlug,
  validateSandboxId,
  validateSandboxName,
} from "./index.js";
import { SandboxRuntimeAssets } from "./runtime-spec.js";

const runtimeAssets = Schema.decodeUnknownSync(SandboxRuntimeAssets)({
  devImage: "ceird-sbx-ceird-dev:123456789abc",
  nodeModulesVolume: "ceird-sbx-node-modules-123456789abc-def456789abc",
  pnpmStoreVolume: "ceird-sbx-pnpm-store",
});

describe("deriveSandboxIdentity()", () => {
  it("derives a stable sandbox id and slug from the repo and worktree path", () => {
    const repoRoot = "/Users/me/ceird";
    const worktreePath = "/Users/me/ceird/.worktrees/agent-one";

    const first = deriveSandboxIdentity({ repoRoot, worktreePath });
    const second = deriveSandboxIdentity({ repoRoot, worktreePath });

    expect(first).toStrictEqual(second);
    expect(first.worktreeName).toBe("agent-one");
    expect(first.hostnameSlug).toBe("agent-one");
    expect(first.sandboxId).toMatch(/^[a-f0-9]{12}$/);
  }, 10_000);

  it("adds a hash suffix when the preferred hostname slug is already taken", () => {
    const identity = deriveSandboxIdentity({
      repoRoot: "/Users/me/ceird",
      worktreePath: "/Users/me/ceird/.worktrees/Agent One",
      takenSlugs: new Set([validateHostnameSlug("agent-one")]),
    });

    expect(identity.hostnameSlug).toMatch(/^agent-one-[a-f0-9]{6}$/);
  }, 10_000);

  it("prefers the branch name over the worktree basename when one is available", () => {
    const identity = deriveSandboxIdentity({
      repoRoot: "/Users/me/ceird",
      worktreePath: "/Users/me/.codex/worktrees/1188/ceird",
      preferredName: "codex/add-sandbox-aware-tests",
    });

    expect(identity.worktreeName).toBe("ceird");
    expect(identity.hostnameSlug).toBe("codex-add-sandbox-aware-tests");
  }, 10_000);

  it("falls back to a sandbox-prefixed slug when the worktree name sanitizes to empty", () => {
    const identity = deriveSandboxIdentity({
      repoRoot: "/Users/me/ceird",
      worktreePath: "/Users/me/ceird/.worktrees/!!!",
    });

    expect(identity.hostnameSlug).toMatch(/^sandbox-[a-f0-9]{6}$/);
  }, 10_000);
});

describe("reconcileSandboxRecord()", () => {
  it("marks a previously ready sandbox as degraded when services are missing", () => {
    const record = {
      sandboxId: validateSandboxId("abc123def456"),
      sandboxName: validateSandboxName("agent-one"),
      composeProjectName: makeComposeProjectName(
        validateSandboxName("agent-one")
      ),
      worktreePath: "/Users/me/ceird/.worktrees/agent-one",
      repoRoot: "/Users/me/ceird",
      hostnameSlug: validateHostnameSlug("agent-one"),
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      runtimeAssets,
      aliasesHealthy: true,
      status: "ready" as const,
      ports: {
        app: 4300,
        api: 4301,
        postgres: 5439,
      },
      timestamps: {
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:05:00.000Z",
      },
    };

    const reconciled = reconcileSandboxRecord(record, {
      servicesPresent: new Set(["postgres"]),
      portsInUse: new Set([5439]),
      now: "2026-04-01T10:10:00.000Z",
    });

    expect(reconciled.status).toBe("degraded");
    expect(reconciled.missingResources).toStrictEqual(["app", "api"]);
    expect(reconciled.timestamps.updatedAt).toBe("2026-04-01T10:10:00.000Z");
  }, 10_000);

  it("stays degraded when aliases are unhealthy even if every service is present", () => {
    const record = {
      sandboxId: validateSandboxId("abc123def456"),
      sandboxName: validateSandboxName("agent-one"),
      composeProjectName: makeComposeProjectName(
        validateSandboxName("agent-one")
      ),
      worktreePath: "/Users/me/ceird/.worktrees/agent-one",
      repoRoot: "/Users/me/ceird",
      hostnameSlug: validateHostnameSlug("agent-one"),
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      runtimeAssets,
      aliasesHealthy: false,
      status: "ready" as const,
      ports: {
        app: 4300,
        api: 4301,
        postgres: 5439,
      },
      timestamps: {
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:05:00.000Z",
      },
    };

    const reconciled = reconcileSandboxRecord(record, {
      servicesPresent: new Set(["app", "api", "postgres"]),
      portsInUse: new Set([4300, 4301, 5439]),
      now: "2026-04-01T10:10:00.000Z",
    });

    expect(reconciled.status).toBe("degraded");
    expect(reconciled.missingResources).toStrictEqual([]);
  }, 10_000);
});

describe("makeHealthPayload()", () => {
  it("creates the shared app/api health payload", () => {
    expect(
      makeHealthPayload("app", validateSandboxId("abc123def456"))
    ).toStrictEqual({
      ok: true,
      service: "app",
      sandboxId: "abc123def456",
    });
  }, 10_000);

  it("falls back to the default sandbox id when the input id is invalid", () => {
    expect(
      makeHealthPayloadFromSandboxIdInput("api", "not-a-sandbox-id")
    ).toStrictEqual({
      ok: true,
      service: "api",
      sandboxId: "000000000000",
    });
  }, 10_000);
});

describe("allocateSandboxPorts()", () => {
  it("reuses existing ports when they are still available", () => {
    expect(
      allocateSandboxPorts({
        existing: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        inUsePorts: new Set([9999]),
      })
    ).toStrictEqual({
      app: 4300,
      api: 4301,
      postgres: 5439,
    });
  }, 10_000);

  it("reallocates only the ports that are already taken", () => {
    expect(
      allocateSandboxPorts({
        existing: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        inUsePorts: new Set([4300, 5439]),
      })
    ).toStrictEqual({
      app: 4302,
      api: 4301,
      postgres: 5440,
    });
  }, 10_000);
});

describe("buildSandboxUrls()", () => {
  it("prefers friendly portless hostnames when aliases are healthy", () => {
    expect(
      buildSandboxUrls(
        {
          hostnameSlug: validateHostnameSlug("agent-one"),
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
        },
        {
          aliasesHealthy: true,
          proxyPort: 1355,
        }
      )
    ).toStrictEqual({
      app: "https://agent-one.app.ceird.localhost:1355",
      api: "https://agent-one.api.ceird.localhost:1355",
      postgres: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      fallbackApp: "http://127.0.0.1:4300",
      fallbackApi: "http://127.0.0.1:4301",
    });
  }, 10_000);

  it("falls back to loopback URLs when aliases are unavailable", () => {
    expect(
      buildSandboxUrls(
        {
          hostnameSlug: validateHostnameSlug("agent-one"),
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
        },
        {
          aliasesHealthy: false,
          proxyPort: 1355,
        }
      )
    ).toStrictEqual({
      app: "http://127.0.0.1:4300",
      api: "http://127.0.0.1:4301",
      postgres: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      fallbackApp: "http://127.0.0.1:4300",
      fallbackApi: "http://127.0.0.1:4301",
    });
  }, 10_000);
});
