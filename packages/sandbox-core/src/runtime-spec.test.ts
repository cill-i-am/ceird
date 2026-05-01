import { Effect, Either, Exit, Schema } from "effect";

import { validateSandboxName } from "./naming.js";
import {
  SandboxRuntimeAssets,
  buildSandboxRuntimeSpec,
} from "./runtime-spec.js";

const runtimeAssets = Schema.decodeUnknownSync(SandboxRuntimeAssets)({
  devImage: "tt-sbx-task-tracker-dev:123456789abc",
  nodeModulesVolume: "tt-sbx-node-modules-123456789abc-def456789abc",
  pnpmStoreVolume: "tt-sbx-pnpm-store",
});
const sharedEnvironment = {
  AUTH_EMAIL_FROM: "auth@example.com",
  AUTH_EMAIL_FROM_NAME: "Task Tracker",
  AUTH_EMAIL_TRANSPORT: "noop",
};
const noopSharedEnvironmentWithBlankCloudflareCredentials = {
  ...sharedEnvironment,
  CLOUDFLARE_ACCOUNT_ID: "",
  CLOUDFLARE_API_TOKEN: "",
};

describe("validateSandboxName()", () => {
  it("accepts lowercase kebab-case names", () => {
    expect(validateSandboxName("agent-one")).toBe("agent-one");
  }, 10_000);

  it("accepts blank Cloudflare API credentials when sandbox email is noop", async () => {
    const result = await Effect.runPromise(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/feature-sandbox",
        sandboxName: validateSandboxName("agent-noop-email"),
        takenNames: new Set(),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        runtimeAssets,
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: true,
        proxyPort: 1355,
        sharedEnvironment: noopSharedEnvironmentWithBlankCloudflareCredentials,
      })
    );

    expect(result.overrides).toMatchObject({
      AUTH_EMAIL_TRANSPORT: "noop",
      CLOUDFLARE_ACCOUNT_ID: "",
      CLOUDFLARE_API_TOKEN: "",
    });
  }, 10_000);

  it("rejects names with spaces or uppercase characters", () => {
    expect(() => validateSandboxName("Agent One")).toThrow(
      /Sandbox names must use lowercase letters, numbers, and hyphens/
    );
  }, 10_000);
});

describe("buildSandboxRuntimeSpec()", () => {
  it("builds a compose project name, urls, and overrides from an explicit name", async () => {
    const result = await Effect.runPromise(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/feature-sandbox",
        sandboxName: validateSandboxName("agent-one"),
        takenNames: new Set([validateSandboxName("other-sandbox")]),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        runtimeAssets,
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: true,
        proxyPort: 1355,
        sharedEnvironment,
      })
    );

    expect(result).toMatchObject({
      sandboxName: "agent-one",
      composeProjectName: "tt-sbx-agent-one",
      hostnameSlug: "agent-one",
      urls: {
        app: "https://agent-one.app.task-tracker.localhost:1355",
        api: "https://agent-one.api.task-tracker.localhost:1355",
      },
      overrides: {
        SANDBOX_ID: expect.any(String),
        SANDBOX_DEV_IMAGE: "tt-sbx-task-tracker-dev:123456789abc",
        SANDBOX_NODE_MODULES_VOLUME:
          "tt-sbx-node-modules-123456789abc-def456789abc",
        SANDBOX_PNPM_STORE_VOLUME: "tt-sbx-pnpm-store",
        SITE_GEOCODER_MODE: "stub",
        TASK_TRACKER_SANDBOX: "1",
        AUTH_APP_ORIGIN: "http://127.0.0.1:4300",
        BETTER_AUTH_BASE_URL: "http://127.0.0.1:4301",
        AUTH_EMAIL_FROM: "auth@example.com",
        AUTH_EMAIL_FROM_NAME: "Task Tracker",
        AUTH_EMAIL_TRANSPORT: "noop",
      },
    });
  }, 10_000);

  it("fails when the requested sandbox name is already taken", async () => {
    const exit = await Effect.runPromiseExit(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/feature-sandbox",
        sandboxName: validateSandboxName("agent-one"),
        takenNames: new Set([validateSandboxName("agent-one")]),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        runtimeAssets,
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: true,
        proxyPort: 1355,
        sharedEnvironment,
      })
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toMatch(/already in use/);
  }, 10_000);

  it("builds loopback-first urls when aliases are unavailable", async () => {
    const result = await Effect.runPromise(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/feature-sandbox",
        sandboxName: validateSandboxName("agent-two"),
        takenNames: new Set(),
        ports: {
          app: 4302,
          api: 4303,
          postgres: 5440,
        },
        runtimeAssets,
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: false,
        proxyPort: 1355,
        sharedEnvironment,
      })
    );

    expect(result.urls).toMatchObject({
      app: "http://127.0.0.1:4302",
      api: "http://127.0.0.1:4303",
      fallbackApp: "http://127.0.0.1:4302",
      fallbackApi: "http://127.0.0.1:4303",
    });
  }, 10_000);

  it("retains typed conflict details when the requested sandbox name is taken", async () => {
    const result = await Effect.runPromise(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/task-tracker",
        worktreePath: "/Users/me/task-tracker/.worktrees/feature-sandbox",
        sandboxName: validateSandboxName("agent-one"),
        takenNames: new Set([validateSandboxName("agent-one")]),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        runtimeAssets,
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: true,
        proxyPort: 1355,
        sharedEnvironment,
      }).pipe(Effect.either)
    );

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected sandbox runtime spec creation to fail");
    }
    expect(result.left.sandboxName).toBe("agent-one");
  }, 10_000);
});
