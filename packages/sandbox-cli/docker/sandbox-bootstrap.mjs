import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const DEFAULT_INSTALL_LOCK_TIMEOUT_MS = 300_000;
const SANDBOX_TARGETS = {
  api: {
    cwd: "/workspace/apps/api",
    command: "pnpm",
    args: ["sandbox:dev"],
  },
  app: {
    cwd: "/workspace/apps/app",
    command: "pnpm",
    args: ["sandbox:dev"],
  },
};

export function getInstallLockTimeoutMs(env) {
  const rawValue = env.CEIRD_SANDBOX_INSTALL_LOCK_TIMEOUT_SECONDS;

  if (rawValue === undefined) {
    return DEFAULT_INSTALL_LOCK_TIMEOUT_MS;
  }

  const timeoutSeconds = Number.parseInt(rawValue, 10);

  return Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? timeoutSeconds * 1000
    : DEFAULT_INSTALL_LOCK_TIMEOUT_MS;
}

export async function acquireInstallLock(options) {
  const deadline = options.now() + options.timeoutMs;

  for (;;) {
    try {
      await options.mkdir(options.installLock);
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        if (options.now() >= deadline) {
          throw new Error(
            `Timed out waiting for sandbox install lock at ${options.installLock}. If no other sandbox is installing dependencies, remove the lock directory and retry.`,
            { cause: error }
          );
        }

        await options.sleep(1000);
        continue;
      }

      throw error;
    }
  }
}

async function releaseInstallLock(installLock) {
  await fs.rmdir(installLock).catch(() => null);
}

async function ensureDependenciesInstalled() {
  const lockHash = createHash("sha256")
    .update(await fs.readFile("/workspace/pnpm-lock.yaml"))
    .digest("hex");
  const cacheFile = "/workspace/node_modules/.sandbox-lock.sha256";
  const installLock = "/workspace/node_modules/.ceird-sandbox-install.lock";

  await fs.mkdir("/workspace/node_modules", { recursive: true });

  if (await isInstallCacheCurrent(cacheFile, lockHash)) {
    return;
  }

  await acquireInstallLock({
    installLock,
    timeoutMs: getInstallLockTimeoutMs(process.env),
    mkdir: (target) => fs.mkdir(target),
    sleep: (durationMs) => sleep(durationMs),
    now: () => Date.now(),
  });

  try {
    if (await isInstallCacheCurrent(cacheFile, lockHash)) {
      return;
    }

    await runCommand("pnpm", ["install", "--frozen-lockfile"], {
      env: {
        ...process.env,
        CI: "true",
      },
    });
    await fs.writeFile(cacheFile, lockHash, {
      encoding: "utf8",
      mode: 0o600,
    });
  } finally {
    await releaseInstallLock(installLock);
  }
}

async function isInstallCacheCurrent(cacheFile, lockHash) {
  try {
    await fs.access("/workspace/node_modules/.pnpm");
    const currentHash = await fs.readFile(cacheFile, "utf8");
    return currentHash === lockHash;
  } catch {
    return false;
  }
}

async function main() {
  const filter = process.argv.at(2);
  const target = resolveSandboxTarget(filter);

  if (!target) {
    console.error(
      "sandbox-bootstrap.mjs requires a package filter argument (app or api)."
    );
    process.exitCode = 1;
    return;
  }

  await ensureDependenciesInstalled();
  await runCommand(target.command, target.args, {
    cwd: target.cwd,
  });
}

export function resolveSandboxTarget(filter) {
  if (!filter) {
    return;
  }

  return SANDBOX_TARGETS[filter];
}

function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options,
  });

  const errorPromise = (async () => {
    const [error] = await once(child, "error");
    throw error;
  })();
  const exitPromise = (async () => {
    const [code, signal] = await once(child, "exit");
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if (code === 0) {
      return;
    }

    throw new Error(
      `${command} ${args.join(" ")} exited with code ${code ?? 1}`
    );
  })();

  return Promise.race([errorPromise, exitPromise]);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
