import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SandboxNameType as SandboxName } from "@task-tracker/sandbox-core";
import {
  SandboxRegistryError,
  SandboxRegistryPayload,
} from "@task-tracker/sandbox-core/node";
import type { SandboxRegistryRecord } from "@task-tracker/sandbox-core/node";
import { Effect, Schema } from "effect";

export function getSandboxStateRoot(): string {
  return path.join(os.homedir(), ".task-tracker", "sandboxes");
}

export function getRegistryPath(): string {
  return path.join(getSandboxStateRoot(), "registry.json");
}

export function getSandboxStateDir(sandboxName: SandboxName): string {
  return path.join(getSandboxStateRoot(), sandboxName);
}

export function getComposeEnvFilePath(sandboxName: SandboxName): string {
  return path.join(getSandboxStateDir(sandboxName), "compose.env");
}

export const readRegistry = Effect.fn("SandboxRegistry.read")(function* () {
  const registryPath = getRegistryPath();
  yield* Effect.annotateCurrentSpan("registryPath", registryPath);
  const raw = yield* readOptionalRegistryFile(registryPath);
  if (raw === "") {
    return [];
  }

  return yield* parseRegistryPayload(registryPath, raw);
});

export const writeRegistry = Effect.fn("SandboxRegistry.write")(function* (
  records: readonly SandboxRegistryRecord[]
) {
  const registryPath = getRegistryPath();
  yield* Effect.annotateCurrentSpan("registryPath", registryPath);
  return yield* writeSandboxStateFile(
    registryPath,
    `${JSON.stringify({ sandboxes: records }, null, 2)}\n`
  ).pipe(
    Effect.mapError(
      (error) =>
        new SandboxRegistryError({
          message:
            error instanceof Error
              ? `Failed to write sandbox registry at ${registryPath}: ${error.message}`
              : `Failed to write sandbox registry at ${registryPath}.`,
          registryPath,
        })
    )
  );
});

export const ensureSandboxStateDir = Effect.fn("SandboxRegistry.ensureDir")(
  function* (dirPath: string) {
    yield* Effect.annotateCurrentSpan("dirPath", dirPath);
    yield* Effect.tryPromise({
      try: () => fs.mkdir(dirPath, { recursive: true, mode: 0o700 }),
      catch: (error) =>
        new SandboxRegistryError({
          message:
            error instanceof Error
              ? `Failed to create sandbox state directory at ${dirPath}: ${error.message}`
              : `Failed to create sandbox state directory at ${dirPath}.`,
          registryPath: dirPath,
        }),
    });
    yield* Effect.tryPromise({
      try: () => fs.chmod(dirPath, 0o700),
      catch: (error) =>
        new SandboxRegistryError({
          message:
            error instanceof Error
              ? `Failed to secure sandbox state directory at ${dirPath}: ${error.message}`
              : `Failed to secure sandbox state directory at ${dirPath}.`,
          registryPath: dirPath,
        }),
    });
  }
);

export const writeSandboxStateFile = Effect.fn(
  "SandboxRegistry.writeStateFile"
)(function* (filePath: string, content: string) {
  yield* Effect.annotateCurrentSpan("filePath", filePath);
  yield* ensureSandboxStateDir(path.dirname(filePath));
  yield* Effect.tryPromise({
    try: () =>
      fs.writeFile(filePath, content, {
        encoding: "utf8",
        mode: 0o600,
      }),
    catch: (error) =>
      new SandboxRegistryError({
        message:
          error instanceof Error
            ? `Failed to write sandbox state file at ${filePath}: ${error.message}`
            : `Failed to write sandbox state file at ${filePath}.`,
        registryPath: filePath,
      }),
  });
  yield* Effect.tryPromise({
    try: () => fs.chmod(filePath, 0o600),
    catch: (error) =>
      new SandboxRegistryError({
        message:
          error instanceof Error
            ? `Failed to secure sandbox state file at ${filePath}: ${error.message}`
            : `Failed to secure sandbox state file at ${filePath}.`,
        registryPath: filePath,
      }),
  });
});

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const readOptionalRegistryFile = Effect.fn("SandboxRegistry.readOptionalFile")(
  function* (registryPath: string) {
    return yield* Effect.tryPromise({
      try: () => fs.readFile(registryPath, "utf8"),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        isMissingFileError(error)
          ? Effect.succeed("")
          : Effect.fail(
              new SandboxRegistryError({
                message:
                  error instanceof Error
                    ? `Failed to read sandbox registry at ${registryPath}: ${error.message}`
                    : `Failed to read sandbox registry at ${registryPath}.`,
                registryPath,
              })
            )
      )
    );
  }
);

const parseRegistryPayload = Effect.fn("SandboxRegistry.parsePayload")(
  function* (registryPath: string, raw: string) {
    return yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(SandboxRegistryPayload)(JSON.parse(raw))
          .sandboxes,
      catch: (error) =>
        new SandboxRegistryError({
          message:
            error instanceof Error
              ? `Sandbox registry at ${registryPath} is invalid: ${error.message}`
              : `Sandbox registry at ${registryPath} is invalid. Remove or repair the file, then rerun the sandbox CLI.`,
          registryPath,
        }),
    });
  }
);
