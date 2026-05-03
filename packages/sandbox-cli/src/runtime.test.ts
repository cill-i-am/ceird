import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateSandboxName } from "@task-tracker/sandbox-core";
import {
  SandboxRegistryError,
  SandboxRegistryRecord,
} from "@task-tracker/sandbox-core/node";
import { Effect, Either, Exit, Schema } from "effect";

import type { SandboxProcess } from "./process.js";
import {
  AuthEmailSharedEnvironment,
  buildComposeFallbackEnvironmentOverrides,
  cleanupFailedSandboxUp,
  ensureSandboxProxyHealthy,
  finalizeSandboxRename,
  removeAliasesBestEffort,
  loadSandboxEnvironmentOrThrow,
  refreshSandboxAliases,
  resolveRepoRootFromGitPaths,
  selectSandboxRecord,
  waitForSandboxServicesReady,
} from "./runtime.js";
import { SandboxNotFoundError } from "./sandbox-not-found-error.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";

const baseRecord = Schema.decodeUnknownSync(SandboxRegistryRecord)({
  sandboxId: "abc123def456",
  sandboxName: "alpha",
  composeProjectName: "tt-sbx-alpha",
  hostnameSlug: "alpha",
  repoRoot: "/repo",
  worktreePath: "/repo/.worktrees/alpha",
  betterAuthSecret: "secret-alpha",
  runtimeAssets: {
    devImage: "tt-sbx-task-tracker-dev:123456789abc",
    nodeModulesVolume: "tt-sbx-node-modules-123456789abc-def456789abc",
    pnpmStoreVolume: "tt-sbx-pnpm-store",
  },
  aliasesHealthy: true,
  ports: {
    app: 4300,
    api: 4301,
    postgres: 5439,
  },
  status: "ready" as const,
  timestamps: {
    createdAt: "2026-04-05T10:00:00.000Z",
    updatedAt: "2026-04-05T10:00:00.000Z",
  },
  missingResources: [],
});

describe("resolveRepoRootFromGitPaths()", () => {
  it("keeps the worktree path when git-common-dir resolves to the local .git folder", () => {
    expect(resolveRepoRootFromGitPaths("/repo/worktree", ".git")).toBe(
      "/repo/worktree"
    );
  }, 10_000);

  it("resolves the shared repository root for linked worktrees", () => {
    expect(resolveRepoRootFromGitPaths("/repo/feature-x", "/repo/.git")).toBe(
      "/repo"
    );
  }, 10_000);
});

describe("selectSandboxRecord()", () => {
  const records = [baseRecord];

  it("does not fall back to the current worktree when an explicit sandbox name is missing", async () => {
    const result = await Effect.runPromise(
      selectSandboxRecord({
        explicitSandboxName: validateSandboxName("missing"),
        worktreePath: "/repo/.worktrees/alpha",
        records,
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox selection to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxNotFoundError);
    expect(result.left.message).toMatch(/missing/);
  }, 10_000);

  it("returns the current worktree sandbox when no explicit name is provided", async () => {
    await expect(
      Effect.runPromise(
        selectSandboxRecord({
          worktreePath: "/repo/.worktrees/alpha",
          records,
        })
      )
    ).resolves.toStrictEqual(records[0]);
  }, 10_000);

  it("prefers the most recently updated record for the current worktree", async () => {
    const newerRecord = {
      ...records[0],
      timestamps: {
        ...records[0].timestamps,
        updatedAt: "2026-04-05T12:00:00.000Z",
      },
    };

    await expect(
      Effect.runPromise(
        selectSandboxRecord({
          worktreePath: "/repo/.worktrees/alpha",
          records: [records[0], newerRecord],
        })
      )
    ).resolves.toStrictEqual(newerRecord);
  }, 10_000);
});

describe("waitForSandboxServicesReady()", () => {
  it("allows cold-start services to become healthy before the timeout expires", async () => {
    let attempts = 0;

    await expect(
      Effect.runPromise(
        waitForSandboxServicesReady({
          timeoutMs: 120_000,
          intervalMs: 1000,
          wait: () => Effect.void,
          checkPostgres: () =>
            Effect.sync(() => {
              attempts += 1;
              return attempts >= 81;
            }),
          checkApi: () => Effect.succeed(attempts >= 81),
          checkApp: () => Effect.succeed(attempts >= 81),
        })
      )
    ).resolves.toBeUndefined();

    expect(attempts).toBeGreaterThanOrEqual(81);
  }, 10_000);

  it("reports readiness transitions as services come online", async () => {
    let attempts = 0;
    const snapshots: {
      postgres: boolean;
      api: boolean;
      app: boolean;
    }[] = [];

    await expect(
      Effect.runPromise(
        waitForSandboxServicesReady({
          timeoutMs: 10_000,
          intervalMs: 1000,
          wait: () => Effect.void,
          onReadinessChanged: (readiness) =>
            Effect.sync(() => {
              snapshots.push(readiness);
            }),
          checkPostgres: () =>
            Effect.sync(() => {
              attempts += 1;
              return attempts >= 2;
            }),
          checkApi: () => Effect.succeed(attempts >= 3),
          checkApp: () => Effect.succeed(attempts >= 4),
        })
      )
    ).resolves.toBeUndefined();

    expect(snapshots).toStrictEqual([
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
    ]);
  }, 10_000);

  it("suppresses duplicate readiness snapshots while services remain unchanged", async () => {
    let attempts = 0;
    const snapshots: {
      postgres: boolean;
      api: boolean;
      app: boolean;
    }[] = [];

    await expect(
      Effect.runPromise(
        waitForSandboxServicesReady({
          timeoutMs: 5000,
          intervalMs: 1000,
          wait: () => Effect.void,
          onReadinessChanged: (readiness) =>
            Effect.sync(() => {
              snapshots.push(readiness);
            }),
          checkPostgres: () =>
            Effect.sync(() => {
              attempts += 1;
              return attempts >= 3;
            }),
          checkApi: () => Effect.succeed(attempts >= 3),
          checkApp: () => Effect.succeed(attempts >= 3),
        })
      )
    ).resolves.toBeUndefined();

    expect(snapshots).toStrictEqual([
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
        app: true,
      },
    ]);
  }, 10_000);

  it("fails when services never become healthy before the timeout", async () => {
    let attempts = 0;
    let waits = 0;

    const exit = await Effect.runPromiseExit(
      waitForSandboxServicesReady({
        timeoutMs: 3000,
        intervalMs: 1000,
        wait: () =>
          Effect.sync(() => {
            waits += 1;
          }),
        checkPostgres: () =>
          Effect.sync(() => {
            attempts += 1;
            return false;
          }),
        checkApi: () => Effect.succeed(false),
        checkApp: () => Effect.succeed(false),
      })
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Exit.isFailure(exit)).toBe(true);

    expect(attempts).toBe(3);
    expect(waits).toBe(2);
    expect(JSON.stringify(exit)).toMatch(/did not become healthy/);
  }, 10_000);

  it("uses the custom timeout error when readiness never completes", async () => {
    const result = await Effect.runPromise(
      waitForSandboxServicesReady({
        timeoutMs: 1000,
        intervalMs: 1000,
        wait: () => Effect.void,
        createTimeoutError: (readiness) =>
          new SandboxPreflightError({
            message: `timed out waiting for ${readiness.app ? "none" : "app"}`,
          }),
        checkPostgres: () => Effect.succeed(true),
        checkApi: () => Effect.succeed(true),
        checkApp: () => Effect.succeed(false),
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected readiness timeout to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxPreflightError);
    expect(result.left.message).toMatch(/timed out waiting for app/);
  }, 10_000);
});

describe("ensureSandboxProxyHealthy()", () => {
  it("returns true when the proxy is already healthy", async () => {
    await expect(
      Effect.runPromise(
        ensureSandboxProxyHealthy({
          portlessService: {
            ensureProxyRunning: () => Effect.void,
          },
        })
      )
      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    ).resolves.toBe(true);
  }, 10_000);

  it("continues in degraded mode when the proxy cannot be started", async () => {
    await expect(
      Effect.runPromise(
        ensureSandboxProxyHealthy({
          portlessService: {
            ensureProxyRunning: () =>
              Effect.fail(
                new SandboxPreflightError({
                  message: "proxy unavailable",
                })
              ),
          },
        })
      )
      // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-falsy
    ).resolves.toBe(false);
  }, 10_000);
});

describe("refreshSandboxAliases()", () => {
  it("repairs a stale healthy registry record by re-registering aliases", async () => {
    const calls: string[] = [];

    await expect(
      Effect.runPromise(
        refreshSandboxAliases({
          record: baseRecord,
          portlessService: {
            ensureProxyRunning: () =>
              Effect.sync(() => {
                calls.push("proxy");
              }),
            registerAliases: (sandboxName, ports) =>
              Effect.sync(() => {
                calls.push(`${sandboxName}:${ports.app}:${ports.api}`);
              }),
          },
        })
      )
    ).resolves.toStrictEqual(baseRecord);

    expect(calls).toStrictEqual(["proxy", "alpha:4300:4301"]);
  }, 10_000);

  it("downgrades a healthy registry record when alias repair fails", async () => {
    await expect(
      Effect.runPromise(
        refreshSandboxAliases({
          record: baseRecord,
          portlessService: {
            ensureProxyRunning: () => Effect.void,
            registerAliases: () =>
              Effect.fail(
                new SandboxPreflightError({
                  message: "portless aliases unavailable",
                })
              ),
          },
        })
      )
    ).resolves.toMatchObject({
      aliasesHealthy: false,
      status: "degraded",
    });
  }, 10_000);
});

describe("removeAliasesBestEffort()", () => {
  it("returns successfully when alias removal works", async () => {
    await expect(
      Effect.runPromise(
        removeAliasesBestEffort({
          sandboxName: validateSandboxName("agent-one"),
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
          portlessService: {
            removeAliases: () => Effect.void,
          },
          operation: "sandbox shutdown",
        })
      )
    ).resolves.toBeUndefined();
  }, 10_000);

  it("does not fail teardown when alias removal fails", async () => {
    await expect(
      Effect.runPromise(
        removeAliasesBestEffort({
          sandboxName: validateSandboxName("agent-one"),
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
          portlessService: {
            removeAliases: () =>
              Effect.fail(
                new SandboxPreflightError({
                  message: "portless unavailable",
                })
              ),
          },
          operation: "sandbox shutdown",
        })
      )
    ).resolves.toBeUndefined();
  }, 10_000);
});

describe("finalizeSandboxRename()", () => {
  it("removes aliases, stops the old stack, and removes the old registry record", async () => {
    const events: string[] = [];

    await expect(
      Effect.runPromise(
        finalizeSandboxRename({
          previousRecord: baseRecord,
          composeEngine: {
            stopStack: () =>
              Effect.sync(() => {
                events.push("stop");
              }),
          },
          portlessService: {
            removeAliases: () =>
              Effect.sync(() => {
                events.push("aliases");
              }),
          },
          sandboxRegistry: {
            remove: () =>
              Effect.sync(() => {
                events.push("registry");
              }),
          },
        })
      )
    ).resolves.toBeUndefined();

    expect(events).toStrictEqual(["aliases", "stop", "registry"]);
  }, 10_000);
});

describe("cleanupFailedSandboxUp()", () => {
  it("aggregates cleanup failures into a single preflight error", async () => {
    const result = await Effect.runPromise(
      cleanupFailedSandboxUp({
        error: new SandboxPreflightError({
          message: "sandbox startup failed",
        }),
        startedRecord: baseRecord,
        registeredAliases: {
          sandboxName: baseRecord.sandboxName,
          ports: baseRecord.ports,
        },
        composeEngine: {
          stopStack: () =>
            Effect.fail(
              new SandboxPreflightError({
                message: "compose down failed",
              })
            ),
        },
        portlessService: {
          removeAliases: () =>
            Effect.fail(
              new SandboxPreflightError({
                message: "alias removal failed",
              })
            ),
        },
        sandboxRegistry: {
          remove: () =>
            Effect.fail(
              new SandboxRegistryError({
                message: "registry cleanup failed",
                registryPath: "/tmp/registry.json",
              })
            ),
        },
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected failed cleanup to surface as an error");
    }
    expect(result.left.message).toMatch(/Cleanup also failed/);
    expect(result.left.message).toMatch(/compose down failed/);
    expect(result.left.message).toMatch(/registry cleanup failed/);
  }, 10_000);
});

describe("buildComposeFallbackEnvironmentOverrides()", () => {
  it("allows blank shared env values when reconstructing compose env for teardown flows", () => {
    expect(
      buildComposeFallbackEnvironmentOverrides(baseRecord, {
        AUTH_EMAIL_FROM: "",
        AUTH_EMAIL_FROM_NAME: "",
        AUTH_EMAIL_TRANSPORT: "noop",
        CLOUDFLARE_ACCOUNT_ID: "",
        CLOUDFLARE_API_TOKEN: "",
      })
    ).toMatchObject({
      AUTH_EMAIL_FROM: "",
      AUTH_EMAIL_FROM_NAME: "",
      AUTH_EMAIL_TRANSPORT: "noop",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_API_TOKEN: "",
      AUTH_APP_ORIGIN: "https://alpha.app.task-tracker.localhost:1355",
      AUTH_RATE_LIMIT_ENABLED: "false",
      BETTER_AUTH_BASE_URL: "https://alpha.api.task-tracker.localhost:1355",
      VITE_API_ORIGIN: "https://alpha.api.task-tracker.localhost:1355",
      SANDBOX_NAME: "alpha",
    });
  }, 10_000);
});

describe("loadSandboxEnvironmentOrThrow()", () => {
  it("preserves an explicit AUTH_EMAIL_FROM_NAME override from sandbox env files", async () => {
    const repoRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "task-tracker-sandbox-env-")
    );
    const previousEnv = {
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
      AUTH_EMAIL_FROM_NAME: process.env.AUTH_EMAIL_FROM_NAME,
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    };

    try {
      await fs.writeFile(
        path.join(repoRoot, ".env"),
        [
          "AUTH_EMAIL_FROM=auth@example.com",
          "AUTH_EMAIL_FROM_NAME=Task Tracker Auth",
          "AUTH_EMAIL_TRANSPORT=cloudflare-api",
          "CLOUDFLARE_ACCOUNT_ID=account_123",
          "CLOUDFLARE_API_TOKEN=token_123",
        ].join("\n")
      );

      process.env.AUTH_EMAIL_FROM = "auth@example.com";
      delete process.env.AUTH_EMAIL_FROM_NAME;
      process.env.CLOUDFLARE_ACCOUNT_ID = "account_123";
      process.env.CLOUDFLARE_API_TOKEN = "token_123";
      const sandboxProcess: SandboxProcess = {
        argv: () => Effect.succeed([]),
        cwd: () => Effect.succeed(repoRoot),
        env: () => Effect.succeed(process.env),
        isPortAvailable: () => Effect.succeed(true),
        isPortOpen: () => Effect.succeed(false),
        runCommand: () => Effect.die("not used"),
        setExitCode: () => Effect.void,
      };

      await expect(
        Effect.runPromise(
          loadSandboxEnvironmentOrThrow(sandboxProcess, repoRoot)
        )
      ).resolves.toStrictEqual({
        AUTH_EMAIL_FROM: "auth@example.com",
        AUTH_EMAIL_FROM_NAME: "Task Tracker Auth",
        AUTH_EMAIL_TRANSPORT: "cloudflare-api",
        CLOUDFLARE_ACCOUNT_ID: "account_123",
        CLOUDFLARE_API_TOKEN: "token_123",
      });
    } finally {
      if (previousEnv.AUTH_EMAIL_FROM === undefined) {
        delete process.env.AUTH_EMAIL_FROM;
      } else {
        process.env.AUTH_EMAIL_FROM = previousEnv.AUTH_EMAIL_FROM;
      }

      if (previousEnv.AUTH_EMAIL_FROM_NAME === undefined) {
        delete process.env.AUTH_EMAIL_FROM_NAME;
      } else {
        process.env.AUTH_EMAIL_FROM_NAME = previousEnv.AUTH_EMAIL_FROM_NAME;
      }

      if (previousEnv.CLOUDFLARE_ACCOUNT_ID === undefined) {
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
      } else {
        process.env.CLOUDFLARE_ACCOUNT_ID = previousEnv.CLOUDFLARE_ACCOUNT_ID;
      }

      if (previousEnv.CLOUDFLARE_API_TOKEN === undefined) {
        delete process.env.CLOUDFLARE_API_TOKEN;
      } else {
        process.env.CLOUDFLARE_API_TOKEN = previousEnv.CLOUDFLARE_API_TOKEN;
      }

      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  }, 10_000);
});

describe("authEmailSharedEnvironment", () => {
  it("defaults AUTH_EMAIL_FROM_NAME when it is omitted", () => {
    expect(
      Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
        AUTH_EMAIL_FROM: "auth@example.com",
      })
    ).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Task Tracker",
      AUTH_EMAIL_TRANSPORT: "noop",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_API_TOKEN: "",
    });
  }, 10_000);

  it("rejects invalid AUTH_EMAIL_FROM values", () => {
    expect(() =>
      Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
        AUTH_EMAIL_FROM: "not-an-email",
      })
    ).toThrow(/AUTH_EMAIL_FROM/);
    expect(() =>
      Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
        AUTH_EMAIL_FROM: "not-an-email",
      })
    ).toThrow(/valid email address/);
  }, 10_000);

  it("accepts blank Cloudflare API credentials when sandbox email is noop", () => {
    expect(
      Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
        AUTH_EMAIL_FROM: "auth@example.com",
        AUTH_EMAIL_FROM_NAME: "Task Tracker",
        AUTH_EMAIL_TRANSPORT: "noop",
        CLOUDFLARE_ACCOUNT_ID: "   ",
        CLOUDFLARE_API_TOKEN: "\t",
      })
    ).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Task Tracker",
      AUTH_EMAIL_TRANSPORT: "noop",
      CLOUDFLARE_ACCOUNT_ID: "   ",
      CLOUDFLARE_API_TOKEN: "\t",
    });
  }, 10_000);

  it.each(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"] as const)(
    "requires non-empty %s when sandbox email uses the Cloudflare API",
    (key) => {
      expect(() =>
        Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Task Tracker",
          AUTH_EMAIL_TRANSPORT: "cloudflare-api",
          CLOUDFLARE_ACCOUNT_ID:
            key === "CLOUDFLARE_ACCOUNT_ID" ? "   " : "account_123",
          CLOUDFLARE_API_TOKEN:
            key === "CLOUDFLARE_API_TOKEN" ? "\t" : "token_123",
        })
      ).toThrow(key);
      expect(() =>
        Schema.decodeUnknownSync(AuthEmailSharedEnvironment)({
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Task Tracker",
          AUTH_EMAIL_TRANSPORT: "cloudflare-api",
          CLOUDFLARE_ACCOUNT_ID:
            key === "CLOUDFLARE_ACCOUNT_ID" ? "   " : "account_123",
          CLOUDFLARE_API_TOKEN:
            key === "CLOUDFLARE_API_TOKEN" ? "\t" : "token_123",
        })
      ).toThrow(/must be set/);
    },
    10_000
  );
});
