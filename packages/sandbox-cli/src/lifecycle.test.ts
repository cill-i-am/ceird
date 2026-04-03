import { bringSandboxUp } from "./lifecycle.js";

describe("bringSandboxUp()", () => {
  it("persists a Better Auth secret and reuses an existing one", async () => {
    const first = await bringSandboxUp({
      repoRoot: "/Users/me/task-tracker",
      worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
      now: "2026-04-01T12:00:00.000Z",
      takenSlugs: new Set(),
      existingRecord: undefined,
      ensurePrerequisites: () => Promise.resolve(),
      allocatePorts: () =>
        Promise.resolve({
          app: 4300,
          api: 4301,
          postgres: 5439,
        }),
      startStack: () => Promise.resolve(),
      waitForHealth: () => Promise.resolve(),
      registerAliases: () => Promise.resolve(),
      persist: () => Promise.resolve(),
      generateBetterAuthSecret: () => "generated-secret",
    });

    expect(first.record.betterAuthSecret).toBe("generated-secret");

    const second = await bringSandboxUp({
      repoRoot: "/Users/me/task-tracker",
      worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
      now: "2026-04-01T12:05:00.000Z",
      takenSlugs: new Set(),
      existingRecord: first.record,
      ensurePrerequisites: () => Promise.resolve(),
      allocatePorts: () =>
        Promise.resolve({
          app: 4300,
          api: 4301,
          postgres: 5439,
        }),
      startStack: () => Promise.resolve(),
      waitForHealth: () => Promise.resolve(),
      registerAliases: () => Promise.resolve(),
      persist: () => Promise.resolve(),
      generateBetterAuthSecret: () => "new-secret",
    });

    expect(second.record.betterAuthSecret).toBe("generated-secret");
  }, 10_000);

  it("falls back to loopback URLs when alias registration fails", async () => {
    const events: string[] = [];
    let persistedStatus = "unknown";

    const result = await bringSandboxUp({
      repoRoot: "/Users/me/task-tracker",
      worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
      now: "2026-04-01T12:00:00.000Z",
      takenSlugs: new Set(),
      existingRecord: undefined,
      ensurePrerequisites: () => {
        events.push("preflight");
        return Promise.resolve();
      },
      allocatePorts: () =>
        Promise.resolve({
          app: 4300,
          api: 4301,
          postgres: 5439,
        }),
      startStack: () => {
        events.push("start");
        return Promise.resolve();
      },
      waitForHealth: () => {
        events.push("health");
        return Promise.resolve();
      },
      registerAliases: () => {
        events.push("aliases");
        return Promise.reject(new Error("portless unavailable"));
      },
      persist: (record) => {
        persistedStatus = record.status;
        events.push(`persist:${record.status}`);
        return Promise.resolve();
      },
      generateBetterAuthSecret: () => "generated-secret",
    });

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-falsy
    expect(result.aliasesHealthy).toBe(false);
    expect(result.urls.app).toBe("http://127.0.0.1:4300");
    expect(result.urls.api).toBe("http://127.0.0.1:4301");
    expect(result.record.status).toBe("ready");
    expect(result.record.betterAuthSecret).toBe("generated-secret");
    expect(persistedStatus).toBe("ready");
    expect(events).toStrictEqual([
      "preflight",
      "start",
      "health",
      "aliases",
      "persist:ready",
    ]);
  }, 10_000);
});
