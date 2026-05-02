import { validateSandboxName } from "@task-tracker/sandbox-core";
import { Effect, Either } from "effect";

import { bringSandboxUp } from "./lifecycle.js";
import { buildSandboxRuntimeAssets } from "./runtime-assets.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";

const runtimeAssets = buildSandboxRuntimeAssets({
  repositorySlug: "task-tracker",
  assetHash: "123456789abc123456789abc12345678",
  lockfileHash: "def456789abc123456789abc12345678",
});

describe("bringSandboxUp()", () => {
  it("reports startup progress with clear step transitions", async () => {
    const progressEvents: string[] = [];

    await Effect.runPromise(
      bringSandboxUp({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        explicitSandboxName: validateSandboxName("agent-one"),
        now: "2026-04-01T12:00:00.000Z",
        takenNames: new Set(),
        existingRecord: undefined,
        loadSharedEnvironment: () =>
          Effect.succeed({
            AUTH_EMAIL_FROM: "auth@example.com",
            AUTH_EMAIL_FROM_NAME: "Task Tracker",
            CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
            CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
          }),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        allocatePorts: () =>
          Effect.succeed({
            app: 4300,
            api: 4301,
            postgres: 5439,
          }),
        determineAliasesHealthy: () => Effect.succeed(true),
        startComposeProject: () => Effect.void,
        migrateDatabase: () => Effect.void,
        waitForHealth: (_, options) =>
          Effect.forEach(
            [
              {
                postgres: false,
                api: false,
                app: false,
              },
              {
                postgres: true,
                api: false,
                app: false,
              },
              {
                postgres: true,
                api: true,
                app: false,
              },
              {
                postgres: true,
                api: true,
                app: true,
              },
            ],
            (readiness) => options.onReadinessChanged(readiness),
            { discard: true }
          ),
        persist: () => Effect.void,
        reportProgress: (event) =>
          Effect.sync(() => {
            progressEvents.push(`${event.status}:${event.step}`);
          }),
        generateBetterAuthSecret: () => "generated-secret",
      })
    );

    expect(progressEvents).toStrictEqual([
      "running:preflight",
      "done:preflight",
      "running:ports",
      "done:ports",
      "running:portless",
      "done:portless",
      "running:compose",
      "done:compose",
      "running:migrations",
      "done:migrations",
      "running:postgres",
      "running:api",
      "running:app",
      "done:postgres",
      "done:api",
      "done:app",
    ]);
  }, 10_000);

  it("persists a Better Auth secret and reuses an existing one", async () => {
    const first = await Effect.runPromise(
      bringSandboxUp({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        explicitSandboxName: undefined,
        now: "2026-04-01T12:00:00.000Z",
        takenNames: new Set(),
        existingRecord: undefined,
        loadSharedEnvironment: () =>
          Effect.succeed({
            AUTH_EMAIL_FROM: "auth@example.com",
            AUTH_EMAIL_FROM_NAME: "Task Tracker",
            CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
            CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
          }),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        allocatePorts: () =>
          Effect.succeed({
            app: 4300,
            api: 4301,
            postgres: 5439,
          }),
        determineAliasesHealthy: () => Effect.succeed(true),
        startComposeProject: () => Effect.void,
        migrateDatabase: () => Effect.void,
        waitForHealth: (_, options) =>
          options.onReadinessChanged({
            postgres: true,
            api: true,
            app: true,
          }),
        persist: () => Effect.void,
        reportProgress: () => Effect.void,
        generateBetterAuthSecret: () => "generated-secret",
      })
    );

    expect(first.record.betterAuthSecret).toBe("generated-secret");

    const second = await Effect.runPromise(
      bringSandboxUp({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        explicitSandboxName: undefined,
        now: "2026-04-01T12:05:00.000Z",
        takenNames: new Set(),
        existingRecord: first.record,
        loadSharedEnvironment: () =>
          Effect.succeed({
            AUTH_EMAIL_FROM: "auth@example.com",
            AUTH_EMAIL_FROM_NAME: "Task Tracker",
            CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
            CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
          }),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        allocatePorts: () =>
          Effect.succeed({
            app: 4300,
            api: 4301,
            postgres: 5439,
          }),
        determineAliasesHealthy: () => Effect.succeed(true),
        startComposeProject: () => Effect.void,
        migrateDatabase: () => Effect.void,
        waitForHealth: (_, options) =>
          options.onReadinessChanged({
            postgres: true,
            api: true,
            app: true,
          }),
        persist: () => Effect.void,
        reportProgress: () => Effect.void,
        generateBetterAuthSecret: () => "new-secret",
      })
    );

    expect(second.record.betterAuthSecret).toBe("generated-secret");
  }, 10_000);

  it("falls back to loopback URLs when alias registration fails", async () => {
    const events: string[] = [];
    let persistedStatus = "unknown";

    const result = await Effect.runPromise(
      bringSandboxUp({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        explicitSandboxName: validateSandboxName("agent-one"),
        now: "2026-04-01T12:00:00.000Z",
        takenNames: new Set(),
        existingRecord: undefined,
        loadSharedEnvironment: () =>
          Effect.succeed({
            AUTH_EMAIL_FROM: "auth@example.com",
            AUTH_EMAIL_FROM_NAME: "Task Tracker",
            CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
            CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
          }),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        allocatePorts: () =>
          Effect.succeed({
            app: 4300,
            api: 4301,
            postgres: 5439,
          }),
        determineAliasesHealthy: () =>
          Effect.sync(() => {
            events.push("aliases");
            return false;
          }),
        startComposeProject: () =>
          Effect.sync(() => {
            events.push("start:fallback");
            events.push("start");
          }),
        migrateDatabase: () =>
          Effect.sync(() => {
            events.push("migrate");
          }),
        waitForHealth: (_, options) =>
          Effect.sync(() => {
            events.push("health");
          }).pipe(
            Effect.zipRight(
              options.onReadinessChanged({
                postgres: true,
                api: true,
                app: true,
              })
            )
          ),
        persist: (record) =>
          Effect.sync(() => {
            persistedStatus = record.status;
            events.push(`persist:${record.status}`);
          }),
        reportProgress: () => Effect.void,
        generateBetterAuthSecret: () => "generated-secret",
      })
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-falsy
    expect(result.aliasesHealthy).toBe(false);
    expect(result.urls.app).toBe("http://127.0.0.1:4300");
    expect(result.urls.api).toBe("http://127.0.0.1:4301");
    expect(result.record.status).toBe("degraded");
    expect(result.record.betterAuthSecret).toBe("generated-secret");
    expect(result.record.sandboxName).toBe("agent-one");
    expect(result.record.composeProjectName).toBe("tt-sbx-agent-one");
    expect(persistedStatus).toBe("degraded");
    expect(events).toStrictEqual([
      "aliases",
      "persist:provisioning",
      "start:fallback",
      "start",
      "migrate",
      "health",
      "persist:degraded",
    ]);
  }, 10_000);

  it("persists a provisioning record before startup so failed health checks remain addressable", async () => {
    const events: string[] = [];

    await expect(
      Effect.runPromise(
        bringSandboxUp({
          repoRoot: "/Users/me/task-tracker",
          worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
          explicitSandboxName: validateSandboxName("agent-one"),
          now: "2026-04-01T12:00:00.000Z",
          takenNames: new Set(),
          existingRecord: undefined,
          loadSharedEnvironment: () =>
            Effect.succeed({
              AUTH_EMAIL_FROM: "auth@example.com",
              AUTH_EMAIL_FROM_NAME: "Task Tracker",
              CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
              CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
            }),
          resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
          allocatePorts: () =>
            Effect.succeed({
              app: 4300,
              api: 4301,
              postgres: 5439,
            }),
          determineAliasesHealthy: () => Effect.succeed(true),
          startComposeProject: () =>
            Effect.sync(() => {
              events.push("start");
            }),
          migrateDatabase: () =>
            Effect.sync(() => {
              events.push("migrate");
            }),
          waitForHealth: (_, options) =>
            Effect.sync(() => {
              events.push("health");
            }).pipe(
              Effect.zipRight(
                options.onReadinessChanged({
                  postgres: true,
                  api: true,
                  app: false,
                })
              ),
              Effect.zipRight(
                Effect.fail(
                  new SandboxPreflightError({
                    message: "health timeout",
                  })
                )
              )
            ),
          persist: (record) =>
            Effect.sync(() => {
              events.push(`persist:${record.status}`);
            }),
          reportProgress: () => Effect.void,
          generateBetterAuthSecret: () => "generated-secret",
        })
      )
    ).rejects.toThrow("health timeout");

    expect(events).toStrictEqual([
      "persist:provisioning",
      "start",
      "migrate",
      "health",
    ]);
  }, 10_000);

  it("fails before persisting or starting when shared env loading fails", async () => {
    const events: string[] = [];

    await expect(
      Effect.runPromise(
        bringSandboxUp({
          repoRoot: "/Users/me/task-tracker",
          worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
          explicitSandboxName: validateSandboxName("agent-one"),
          now: "2026-04-01T12:00:00.000Z",
          takenNames: new Set(),
          existingRecord: undefined,
          loadSharedEnvironment: () =>
            Effect.fail(
              new SandboxPreflightError({
                message: "missing shared env",
              })
            ),
          resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
          allocatePorts: () =>
            Effect.succeed({
              app: 4300,
              api: 4301,
              postgres: 5439,
            }),
          determineAliasesHealthy: () =>
            Effect.sync(() => {
              events.push("aliases");
              return true;
            }),
          startComposeProject: () =>
            Effect.sync(() => {
              events.push("start");
            }),
          migrateDatabase: () =>
            Effect.sync(() => {
              events.push("migrate");
            }),
          waitForHealth: () =>
            Effect.sync(() => {
              events.push("health");
            }),
          persist: () =>
            Effect.sync(() => {
              events.push("persist");
            }),
          reportProgress: () => Effect.void,
          generateBetterAuthSecret: () => "generated-secret",
        })
      )
    ).rejects.toThrow("missing shared env");

    expect(events).toStrictEqual([]);
  }, 10_000);

  it("preserves sandbox conflict context when the requested name is already taken", async () => {
    const result = await Effect.runPromise(
      bringSandboxUp({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/agent-one",
        explicitSandboxName: validateSandboxName("agent-one"),
        now: "2026-04-01T12:00:00.000Z",
        takenNames: new Set([validateSandboxName("agent-one")]),
        existingRecord: undefined,
        loadSharedEnvironment: () =>
          Effect.succeed({
            AUTH_EMAIL_FROM: "auth@example.com",
            AUTH_EMAIL_FROM_NAME: "Task Tracker",
            CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
            CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
          }),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        allocatePorts: () =>
          Effect.succeed({
            app: 4300,
            api: 4301,
            postgres: 5439,
          }),
        determineAliasesHealthy: () => Effect.succeed(true),
        startComposeProject: () => Effect.void,
        migrateDatabase: () => Effect.void,
        waitForHealth: () => Effect.void,
        persist: () => Effect.void,
        reportProgress: () => Effect.void,
        generateBetterAuthSecret: () => "generated-secret",
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox name conflict to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxPreflightError);
    if (!(result.left instanceof SandboxPreflightError)) {
      throw new Error("Expected a sandbox preflight error");
    }
    expect(result.left.message).toMatch(/already in use/);
    expect(result.left.causeTag).toMatch(/SandboxNameConflictError/);
    expect(result.left.sandboxName).toBe("agent-one");
  }, 10_000);
});
