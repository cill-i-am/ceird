import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  makeComposeProjectName,
  validateSandboxName,
} from "@ceird/sandbox-core";
import {
  SandboxRegistryError,
  SandboxRegistryRecord,
} from "@ceird/sandbox-core/node";
import { Effect, Either, Schema } from "effect";

import {
  ensureSandboxStateDir,
  getComposeEnvFilePath,
  getRegistryPath,
  getSandboxStateDir,
  readRegistry,
  writeSandboxStateFile,
  writeRegistry,
} from "./registry.js";

describe("registry paths", () => {
  it("places compose env files under the sandbox state directory", () => {
    const sandboxName = validateSandboxName("agent-one");

    expect(getSandboxStateDir(sandboxName)).toMatch(
      /\.ceird\/sandboxes\/agent-one$/
    );
    expect(getComposeEnvFilePath(sandboxName)).toMatch(
      /\.ceird\/sandboxes\/agent-one\/compose\.env$/
    );
    expect(getRegistryPath()).toMatch(/\.ceird\/sandboxes\/registry\.json$/);
  }, 10_000);
});

describe("readRegistry()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty registry when the file does not exist", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-registry-test-")
    );
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    await expect(Effect.runPromise(readRegistry())).resolves.toStrictEqual([]);
  }, 10_000);

  it("fails with a typed error when the registry file is invalid", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-registry-test-")
    );
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const registryPath = path.join(
      tempHome,
      ".ceird",
      "sandboxes",
      "registry.json"
    );
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    await fs.writeFile(registryPath, "{not-json", "utf8");

    const result = await Effect.runPromise(readRegistry().pipe(Effect.either));

    // eslint-disable-next-line vitest/prefer-strict-boolean-matchers, vitest/prefer-to-be-truthy
    expect(Either.isLeft(result)).toBe(true);
    if (Either.isRight(result)) {
      throw new Error("Expected registry loading to fail");
    }
    expect(result.left).toBeInstanceOf(SandboxRegistryError);
    expect(result.left.message).toMatch(/invalid/);
  }, 10_000);

  it("round-trips persisted registry records", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-registry-test-")
    );
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const record = Schema.decodeUnknownSync(SandboxRegistryRecord)({
      sandboxId: "abc123def456",
      sandboxName: "agent-one",
      composeProjectName: makeComposeProjectName(
        validateSandboxName("agent-one")
      ),
      hostnameSlug: "agent-one",
      repoRoot: "/repo",
      worktreePath: "/repo/.worktrees/agent-one",
      betterAuthSecret: "secret-alpha",
      runtimeAssets: {
        devImage: "ceird-sbx-ceird-dev:123456789abc",
        nodeModulesVolume: "ceird-sbx-node-modules-123456789abc-def456789abc",
        pnpmStoreVolume: "ceird-sbx-pnpm-store",
      },
      aliasesHealthy: true,
      ports: { app: 4300, api: 4301, postgres: 5439 },
      status: "ready",
      timestamps: {
        createdAt: "2026-04-05T10:00:00.000Z",
        updatedAt: "2026-04-05T10:00:00.000Z",
      },
      missingResources: [],
    });

    await Effect.runPromise(writeRegistry([record]));

    await expect(Effect.runPromise(readRegistry())).resolves.toStrictEqual([
      record,
    ]);
  }, 10_000);
});

describe("sandbox state permissions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates sandbox state directories with owner-only permissions", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-registry-test-")
    );
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const stateDir = getSandboxStateDir(validateSandboxName("agent-one"));

    await Effect.runPromise(ensureSandboxStateDir(stateDir));

    const stats = await fs.stat(stateDir);
    expect(stats.mode.toString(8).slice(-3)).toBe("700");
  }, 10_000);

  it("writes sandbox state files with owner-only permissions", async () => {
    const tempHome = await fs.mkdtemp(
      path.join(os.tmpdir(), "sandbox-registry-test-")
    );
    vi.spyOn(os, "homedir").mockReturnValue(tempHome);

    const stateFile = getComposeEnvFilePath(validateSandboxName("agent-one"));

    await Effect.runPromise(writeSandboxStateFile(stateFile, "secret=value\n"));

    const stats = await fs.stat(stateFile);
    expect(stats.mode.toString(8).slice(-3)).toBe("600");
  }, 10_000);
});
