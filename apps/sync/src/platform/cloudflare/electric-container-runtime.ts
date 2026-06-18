/* eslint-disable promise/avoid-new -- Node child-process exit is event-based and needs a Promise bridge for Effect.tryPromise. */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { Effect } from "effect";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
const supportedStorageBackend = "local";

function parseEntrypointArgs(value: string | undefined) {
  return (value ?? "start")
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function readStorageBackend() {
  const value =
    process.env.CEIRD_ELECTRIC_STORAGE_BACKEND ?? supportedStorageBackend;

  if (value !== supportedStorageBackend) {
    throw new Error(
      `CEIRD_ELECTRIC_STORAGE_BACKEND must be ${supportedStorageBackend}`
    );
  }
}

async function prepareElectricStorageDirectory() {
  readStorageBackend();
  await mkdir(process.env.ELECTRIC_STORAGE_DIR ?? "/var/lib/electric", {
    recursive: true,
  });
}

function readSensitiveLogValues() {
  return [process.env.DATABASE_URL, process.env.ELECTRIC_SECRET]
    .map((value) => value?.trim())
    .filter(
      (value): value is string => value !== undefined && value.length > 0
    );
}

function redactContainerLogLine(
  line: string,
  sensitiveValues: readonly string[]
) {
  let redacted = line;

  for (const value of sensitiveValues) {
    redacted = redacted.replaceAll(value, "[redacted]");
  }

  return redacted;
}

function forwardRedactedProcessOutput(
  child: ChildProcess,
  sensitiveValues: readonly string[]
) {
  forwardRedactedReadable(child.stdout, process.stdout, sensitiveValues);
  forwardRedactedReadable(child.stderr, process.stderr, sensitiveValues);
}

function forwardRedactedReadable(
  input: NodeJS.ReadableStream | null,
  output: NodeJS.WritableStream,
  sensitiveValues: readonly string[]
) {
  if (input === null) {
    return;
  }

  input.setEncoding("utf8");

  let pending = "";
  input.on("data", (chunk) => {
    pending += String(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      output.write(`${redactContainerLogLine(line, sensitiveValues)}\n`);
    }
  });
  input.on("end", () => {
    if (pending.length > 0) {
      output.write(redactContainerLogLine(pending, sensitiveValues));
      pending = "";
    }
  });
}

function stopProcess(child: ChildProcess | undefined, signal: NodeJS.Signals) {
  if (child !== undefined && child.exitCode === null && !child.killed) {
    child.kill(signal);
  }
}

function isProcessRunning(child: ChildProcess | undefined) {
  return (
    child !== undefined && child.exitCode === null && child.signalCode === null
  );
}

function toError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error("Electric container runtime failed", { cause: error });
}

const runContainer = Effect.tryPromise({
  catch: (cause) =>
    cause instanceof Error
      ? cause
      : new Error("Electric exited unexpectedly", { cause }),
  try: async () => {
    await prepareElectricStorageDirectory();

    const electricEntrypoint =
      process.env.ELECTRIC_ENTRYPOINT ?? "/app/bin/entrypoint";
    const electricArgs = parseEntrypointArgs(
      process.env.ELECTRIC_ENTRYPOINT_ARGS
    );

    return await new Promise<null>((resolve, reject) => {
      let electric: ChildProcess | undefined;
      let settled = false;
      let shutdownSignal: NodeJS.Signals | undefined;
      let shutdownTimer: NodeJS.Timeout | undefined;

      function cleanup() {
        electric?.off("error", onElectricError);
        electric?.off("exit", onElectricExit);
        if (shutdownTimer !== undefined) {
          clearTimeout(shutdownTimer);
        }
        for (const signal of shutdownSignals) {
          process.off(signal, shutdown);
        }
      }

      function shutdown(signal: NodeJS.Signals) {
        shutdownSignal = signal;
        stopProcess(electric, signal);
        shutdownTimer = setTimeout(() => {
          stopProcess(electric, "SIGKILL");
          settleWithSuccess();
        }, 8000);
      }

      function settleWithSuccess() {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(null);
      }

      function settleWithFailure(error: Error) {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        stopProcess(electric, "SIGTERM");
        reject(error);
      }

      function maybeSettleShutdown() {
        if (shutdownSignal !== undefined && !isProcessRunning(electric)) {
          settleWithSuccess();
        }
      }

      function onElectricExit(
        code: number | null,
        signal: NodeJS.Signals | null
      ) {
        if (settled) {
          return;
        }

        if (shutdownSignal !== undefined) {
          maybeSettleShutdown();
          return;
        }

        settleWithFailure(
          new Error(
            `Electric exited unexpectedly with code ${String(code)} and signal ${String(signal)}`
          )
        );
      }

      function onElectricError(error: Error) {
        settleWithFailure(error);
      }

      for (const signal of shutdownSignals) {
        process.once(signal, shutdown);
      }

      startElectric();

      function startElectric() {
        try {
          if (shutdownSignal !== undefined) {
            maybeSettleShutdown();
            return;
          }

          electric = spawn(electricEntrypoint, electricArgs, {
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          });
          forwardRedactedProcessOutput(electric, readSensitiveLogValues());
          electric.once("exit", onElectricExit);
          electric.once("error", onElectricError);
        } catch (error) {
          settleWithFailure(toError(error));
        }
      }
    });
  },
}).pipe(
  Effect.tapError((error) =>
    Effect.logError("Electric container runtime failed").pipe(
      Effect.annotateLogs({
        "electric.error": error.message,
      })
    )
  ),
  Effect.asVoid,
  Effect.orDie
);

await Effect.runPromise(
  Effect.logInfo("Starting Electric container runtime").pipe(
    Effect.andThen(runContainer)
  )
);
