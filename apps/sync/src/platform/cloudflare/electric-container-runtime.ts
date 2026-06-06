/* eslint-disable promise/avoid-new -- Node child-process exit is event-based and needs a Promise bridge for Effect.promise. */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
const storageBackends = ["local", "r2"] as const;

type StorageBackend = (typeof storageBackends)[number];

interface R2StorageConfig {
  readonly accessKeyId: string;
  readonly accountId: string;
  readonly bucketName: string;
  readonly mountDir: string;
  readonly pollIntervalMs: number;
  readonly secretAccessKey: string;
  readonly startupTimeoutMs: number;
}

function parseEntrypointArgs(value: string | undefined) {
  return (value ?? "start")
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function readRequiredEnv(key: string) {
  const value = process.env[key]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required Electric container env var: ${key}`);
  }

  return value;
}

function readPositiveIntegerEnv(key: string, fallback: number) {
  const raw = process.env[key] ?? String(fallback);
  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}

function readStorageBackend(): StorageBackend {
  const value = process.env.CEIRD_ELECTRIC_STORAGE_BACKEND ?? "r2";

  if (storageBackends.includes(value as StorageBackend)) {
    return value as StorageBackend;
  }

  throw new Error(
    `CEIRD_ELECTRIC_STORAGE_BACKEND must be one of: ${storageBackends.join(", ")}`
  );
}

function readR2StorageConfig(): R2StorageConfig {
  return {
    accessKeyId: readRequiredEnv("AWS_ACCESS_KEY_ID"),
    accountId: readRequiredEnv("R2_ACCOUNT_ID"),
    bucketName: readRequiredEnv("R2_BUCKET_NAME"),
    mountDir: process.env.CEIRD_ELECTRIC_STORAGE_MOUNT ?? "/var/lib/electric",
    pollIntervalMs: readPositiveIntegerEnv(
      "CEIRD_ELECTRIC_STORAGE_MOUNT_READY_POLL_MS",
      250
    ),
    secretAccessKey: readRequiredEnv("AWS_SECRET_ACCESS_KEY"),
    startupTimeoutMs: readPositiveIntegerEnv(
      "CEIRD_ELECTRIC_STORAGE_MOUNT_READY_TIMEOUT_MS",
      30_000
    ),
  };
}

async function startR2StorageMount(config: R2StorageConfig) {
  await mkdir(config.mountDir, { recursive: true });

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const child = spawn(
    "/usr/local/bin/tigrisfs",
    ["--endpoint", endpoint, "-f", config.bucketName, config.mountDir],
    {
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: config.accessKeyId,
        AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
      },
      stdio: "inherit",
    }
  );

  await waitForR2StorageMount(child, config);
  return child;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForR2StorageMount(child: ChildProcess, config: R2StorageConfig) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const deadline = Date.now() + config.startupTimeoutMs;

    void poll();

    function cleanup() {
      child.off("error", onError);
      child.off("exit", onExit);
    }

    function settle(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }

    async function poll() {
      let lastError: unknown;

      while (!settled && Date.now() <= deadline) {
        try {
          await assertUsableR2Mount(config);
          settle();
          return;
        } catch (error) {
          lastError = error;
          await sleep(config.pollIntervalMs);
        }
      }

      settle(
        new Error(
          "R2 FUSE mount did not become usable before startup timeout",
          {
            cause: lastError,
          }
        )
      );
    }

    function onError(error: Error) {
      settle(error);
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      settle(
        new Error(
          `R2 FUSE mount exited during startup with code ${String(code)} and signal ${String(signal)}`
        )
      );
    }

    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function assertUsableR2Mount(config: R2StorageConfig) {
  const mounted = await isMountPoint(config.mountDir);

  if (!mounted) {
    throw new Error(`R2 FUSE mount point is not active at ${config.mountDir}`);
  }

  const probePath = join(
    config.mountDir,
    `.ceird-electric-storage-probe-${process.pid}-${randomUUID()}`
  );
  const probePayload = `ceird-electric-storage-probe:${Date.now()}`;

  try {
    await writeFile(probePath, probePayload, { flag: "wx" });
    const persistedPayload = await readFile(probePath, "utf8");

    if (persistedPayload !== probePayload) {
      throw new Error("R2 FUSE mount probe read did not match probe write");
    }
  } finally {
    await unlink(probePath).catch(() => null);
  }
}

async function isMountPoint(pathname: string) {
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8");

  return mountInfo
    .split("\n")
    .filter((line) => line.length > 0)
    .some((line) => decodeMountInfoPath(line.split(" ")[4] ?? "") === pathname);
}

function decodeMountInfoPath(pathname: string) {
  return pathname
    .replaceAll("\\040", " ")
    .replaceAll("\\011", "\t")
    .replaceAll("\\012", "\n")
    .replaceAll("\\134", "\\");
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
    const storageBackend = readStorageBackend();
    const r2StorageConfig =
      storageBackend === "r2" ? readR2StorageConfig() : undefined;
    const r2Mount =
      r2StorageConfig === undefined
        ? undefined
        : await startR2StorageMount(r2StorageConfig);
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
        r2Mount?.off("error", onMountError);
        r2Mount?.off("exit", onMountExit);
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
        stopProcess(r2Mount, signal);
        shutdownTimer = setTimeout(() => {
          stopProcess(electric, "SIGKILL");
          stopProcess(r2Mount, "SIGKILL");
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
        stopProcess(r2Mount, "SIGTERM");
        reject(error);
      }

      function maybeSettleShutdown() {
        if (
          shutdownSignal !== undefined &&
          !isProcessRunning(electric) &&
          !isProcessRunning(r2Mount)
        ) {
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

      function onMountExit(code: number | null, signal: NodeJS.Signals | null) {
        if (shutdownSignal !== undefined) {
          maybeSettleShutdown();
          return;
        }

        settleWithFailure(
          new Error(
            `R2 FUSE mount exited unexpectedly with code ${String(code)} and signal ${String(signal)}`
          )
        );
      }

      function onMountError(error: Error) {
        if (shutdownSignal !== undefined) {
          maybeSettleShutdown();
          return;
        }

        settleWithFailure(error);
      }

      for (const signal of shutdownSignals) {
        process.once(signal, shutdown);
      }
      r2Mount?.once("exit", onMountExit);
      r2Mount?.once("error", onMountError);

      void startElectric();

      async function startElectric() {
        try {
          if (shutdownSignal !== undefined) {
            maybeSettleShutdown();
            return;
          }

          if (r2StorageConfig !== undefined) {
            if (!isProcessRunning(r2Mount)) {
              throw new Error("R2 FUSE mount exited before Electric startup");
            }

            await assertUsableR2Mount(r2StorageConfig);
          }

          if (shutdownSignal !== undefined) {
            maybeSettleShutdown();
            return;
          }

          electric = spawn(electricEntrypoint, electricArgs, {
            env: process.env,
            stdio: "inherit",
          });
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
