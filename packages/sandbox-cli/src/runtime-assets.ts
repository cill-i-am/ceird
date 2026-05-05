import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SandboxRuntimeAssets } from "@ceird/sandbox-core";
import type { SandboxRuntimeAssetsShape as SandboxRuntimeAssetsType } from "@ceird/sandbox-core";
import { Effect, Schema } from "effect";

import type { SandboxPreflightError } from "./sandbox-preflight-error.js";
import { toSandboxPreflightError } from "./sandbox-preflight-error.js";

const SANDBOX_DEV_IMAGE_INPUTS = [
  path.join("packages", "sandbox-cli", "docker", "sandbox-dev.Dockerfile"),
  path.join("packages", "sandbox-cli", "docker", "sandbox-entrypoint.sh"),
  path.join("packages", "sandbox-cli", "docker", "sandbox-bootstrap.mjs"),
] as const;

const HASH_PREFIX_LENGTH = 12;

export interface ResolveSandboxRuntimeAssetsOptions {
  readonly repoRoot: string;
  readonly worktreePath: string;
}

export const resolveSandboxRuntimeAssets = Effect.fn(
  "SandboxRuntimeAssets.resolve"
)(function* (options: ResolveSandboxRuntimeAssetsOptions) {
  const assetHash = yield* hashSandboxDevImageInputs(options.worktreePath);
  const lockfileHash = yield* hashWorktreeLockfile(options.worktreePath);
  const repositorySlug = toDockerNameSegment(path.basename(options.repoRoot));

  return buildSandboxRuntimeAssets({
    repositorySlug,
    assetHash,
    lockfileHash,
  });
});

export function buildSandboxRuntimeAssets(input: {
  readonly repositorySlug: string;
  readonly assetHash: string;
  readonly lockfileHash: string;
}): SandboxRuntimeAssetsType {
  const assetSuffix = input.assetHash.slice(0, HASH_PREFIX_LENGTH);
  const lockfileSuffix = input.lockfileHash.slice(0, HASH_PREFIX_LENGTH);

  return Schema.decodeUnknownSync(SandboxRuntimeAssets)({
    devImage: `ceird-sbx-${input.repositorySlug}-dev:${assetSuffix}`,
    nodeModulesVolume: `ceird-sbx-node-modules-${assetSuffix}-${lockfileSuffix}`,
    pnpmStoreVolume: "ceird-sbx-pnpm-store",
  });
}

export function toDockerNameSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized === "" ? "sandbox" : normalized;
}

function hashSandboxDevImageInputs(
  worktreePath: string
): Effect.Effect<string, SandboxPreflightError, never> {
  return hashFiles(
    SANDBOX_DEV_IMAGE_INPUTS.map((relativePath) => ({
      filePath: path.join(worktreePath, relativePath),
      hashLabel: relativePath,
    })),
    `Failed to hash sandbox dev image inputs under ${worktreePath}`
  );
}

function hashWorktreeLockfile(
  worktreePath: string
): Effect.Effect<string, SandboxPreflightError, never> {
  return hashFiles(
    [
      {
        filePath: path.join(worktreePath, "pnpm-lock.yaml"),
        hashLabel: "pnpm-lock.yaml",
      },
    ],
    `Failed to hash pnpm lockfile for ${worktreePath}`
  );
}

function hashFiles(
  files: readonly {
    readonly filePath: string;
    readonly hashLabel: string;
  }[],
  failureMessage: string
): Effect.Effect<string, SandboxPreflightError, never> {
  return Effect.tryPromise({
    try: async () => {
      const hash = createHash("sha256");

      for (const file of files) {
        hash.update(file.hashLabel);
        hash.update(await fs.readFile(file.filePath));
      }

      return hash.digest("hex");
    },
    catch: (error) =>
      toSandboxPreflightError(error, {
        message: failureMessage,
      }),
  });
}
