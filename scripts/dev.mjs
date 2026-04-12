import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { repairPortlessRoutesFile } from "./portless-state.mjs";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const DEFAULT_AUTH_EMAIL_FROM = "auth@task-tracker.localhost";
const DEFAULT_AUTH_EMAIL_FROM_NAME = "Task Tracker";
const DEFAULT_RESEND_API_KEY = "re_test_placeholder";

export function createDevEnvironment(baseEnvironment = process.env) {
  const proxyPort = baseEnvironment.PORTLESS_PORT ?? "1355";

  return {
    ...baseEnvironment,
    AUTH_APP_ORIGIN:
      baseEnvironment.AUTH_APP_ORIGIN ??
      `https://app.task-tracker.localhost:${proxyPort}`,
    AUTH_EMAIL_FROM: baseEnvironment.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME:
      baseEnvironment.AUTH_EMAIL_FROM_NAME ?? DEFAULT_AUTH_EMAIL_FROM_NAME,
    BETTER_AUTH_BASE_URL:
      baseEnvironment.BETTER_AUTH_BASE_URL ??
      `https://api.task-tracker.localhost:${proxyPort}`,
    PORTLESS_PORT: proxyPort,
    RESEND_API_KEY: baseEnvironment.RESEND_API_KEY ?? DEFAULT_RESEND_API_KEY,
  };
}

export function runDev() {
  const devEnvironment = createDevEnvironment();
  const proxyPort = devEnvironment.PORTLESS_PORT;

  repairPortlessRoutesFile();

  const startProxy = spawnSync(
    command,
    ["exec", "portless", "proxy", "start", "-p", proxyPort],
    {
      stdio: "inherit",
      env: devEnvironment,
    }
  );

  if (startProxy.status !== 0) {
    process.exit(startProxy.status ?? 1);
  }

  const devProcess = spawn(command, ["exec", "turbo", "run", "dev"], {
    stdio: "inherit",
    env: devEnvironment,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      devProcess.kill(signal);
    });
  }

  devProcess.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDev();
}
