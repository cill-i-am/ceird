import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { repairPortlessRoutesFile } from "./portless-state.mjs";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const DEFAULT_AUTH_EMAIL_FROM = "auth@ceird.localhost";
const DEFAULT_AUTH_EMAIL_FROM_NAME = "Ceird";
const DEFAULT_SITE_GEOCODER_MODE = "stub";

export function createDevEnvironment(baseEnvironment = process.env) {
  const proxyPort = baseEnvironment.PORTLESS_PORT ?? "1355";
  const authEmailTransport = baseEnvironment.AUTH_EMAIL_TRANSPORT ?? "noop";

  return {
    ...baseEnvironment,
    API_ORIGIN:
      baseEnvironment.API_ORIGIN ?? `https://api.ceird.localhost:${proxyPort}`,
    AUTH_APP_ORIGIN:
      baseEnvironment.AUTH_APP_ORIGIN ??
      `https://app.ceird.localhost:${proxyPort}`,
    AUTH_EMAIL_FROM: baseEnvironment.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME:
      baseEnvironment.AUTH_EMAIL_FROM_NAME ?? DEFAULT_AUTH_EMAIL_FROM_NAME,
    AUTH_EMAIL_TRANSPORT: authEmailTransport,
    BETTER_AUTH_BASE_URL:
      baseEnvironment.BETTER_AUTH_BASE_URL ??
      `https://api.ceird.localhost:${proxyPort}`,
    PORTLESS_PORT: proxyPort,
    SITE_GEOCODER_MODE:
      baseEnvironment.SITE_GEOCODER_MODE ?? DEFAULT_SITE_GEOCODER_MODE,
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
