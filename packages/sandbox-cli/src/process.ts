import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";

import { Effect } from "effect";

import { SandboxCommandError } from "./sandbox-command-error.js";

interface RunCommandOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly allowNonZero?: boolean;
}

interface RunCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const execFileAsync = promisify(execFile);

export interface SandboxProcess {
  readonly cwd: () => Effect.Effect<string, never, never>;
  readonly env: () => Effect.Effect<NodeJS.ProcessEnv, never, never>;
  readonly argv: () => Effect.Effect<readonly string[], never, never>;
  readonly setExitCode: (code: number) => Effect.Effect<void, never, never>;
  readonly runCommand: (
    command: string,
    args: readonly string[],
    options?: RunCommandOptions
  ) => Effect.Effect<RunCommandResult, SandboxCommandError>;
  readonly isPortOpen: (port: number) => Effect.Effect<boolean, never, never>;
  readonly isPortAvailable: (
    port: number
  ) => Effect.Effect<boolean, never, never>;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {}
): Effect.Effect<RunCommandResult, SandboxCommandError> {
  return Effect.tryPromise({
    try: async () => {
      try {
        const { stdout, stderr } = await execFileAsync(command, [...args], {
          cwd: options.cwd,
          env: options.env,
          encoding: "utf8",
        });

        return { stdout, stderr, exitCode: 0 };
      } catch (error) {
        const commandError = error as NodeJS.ErrnoException & {
          readonly code?: string | number;
          readonly stdout?: string;
          readonly stderr?: string;
        };
        const exitCode =
          typeof commandError.code === "number" ? commandError.code : undefined;

        if (options.allowNonZero) {
          return {
            stdout: commandError.stdout ?? "",
            stderr: commandError.stderr ?? "",
            exitCode: exitCode ?? 1,
          };
        }

        throw new SandboxCommandError({
          command: [command, ...args],
          message: commandError.message,
          stderr: commandError.stderr,
          exitCode,
        });
      }
    },
    catch: (error) =>
      error instanceof SandboxCommandError
        ? error
        : new SandboxCommandError({
            command: [command, ...args],
            message:
              error instanceof Error
                ? error.message
                : "Command execution failed",
          }),
  });
}

export function isPortOpen(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();

  (() => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  })();

  return promise;
}

export function isPortAvailable(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();

  (() => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  })();

  return promise;
}

export class SandboxProcessService extends Effect.Service<SandboxProcessService>()(
  "@task-tracker/sandbox-cli/SandboxProcessService",
  {
    accessors: true,
    effect: Effect.succeed<SandboxProcess>({
      cwd: () => Effect.sync(() => process.cwd()),
      env: () => Effect.sync(() => process.env),
      argv: () => Effect.sync(() => [...process.argv]),
      setExitCode: (code) =>
        Effect.sync(() => {
          process.exitCode = code;
        }),
      runCommand,
      isPortOpen: (port) =>
        Effect.tryPromise({
          try: () => isPortOpen(port),
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false)),
      isPortAvailable: (port) =>
        Effect.tryPromise({
          try: () => isPortAvailable(port),
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false)),
    }),
  }
) {}
