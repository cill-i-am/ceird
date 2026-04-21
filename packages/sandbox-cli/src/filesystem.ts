import fs from "node:fs/promises";

import { Effect } from "effect";

export interface SandboxFileSystem {
  readonly access: (filePath: string) => Effect.Effect<void, unknown, never>;
  readonly removeTree: (
    filePath: string
  ) => Effect.Effect<void, unknown, never>;
  readonly fileExists: (
    filePath: string
  ) => Effect.Effect<boolean, never, never>;
}

export class SandboxFileSystemService extends Effect.Service<SandboxFileSystemService>()(
  "@task-tracker/sandbox-cli/SandboxFileSystemService",
  {
    accessors: true,
    effect: Effect.succeed<SandboxFileSystem>({
      access: (filePath) =>
        Effect.tryPromise({
          try: () => fs.access(filePath),
          catch: (error) => error,
        }),
      removeTree: (filePath) =>
        Effect.tryPromise({
          try: () =>
            fs.rm(filePath, {
              recursive: true,
              force: true,
            }),
          catch: (error) => error,
        }),
      fileExists: (filePath) =>
        Effect.tryPromise({
          try: () => fs.access(filePath),
          catch: () => false,
        }).pipe(
          Effect.map((result) => result === undefined),
          Effect.orElseSucceed(() => false)
        ),
    }),
  }
) {}
