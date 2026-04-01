import { spawn, spawnSync } from "node:child_process";

import { repairPortlessRoutesFile } from "./portless-state.mjs";

const proxyPort = process.env.PORTLESS_PORT ?? "1355";
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

repairPortlessRoutesFile();

const startProxy = spawnSync(
  command,
  ["exec", "portless", "proxy", "start", "-p", proxyPort],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PORTLESS_PORT: proxyPort,
    },
  }
);

if (startProxy.status !== 0) {
  process.exit(startProxy.status ?? 1);
}

const devProcess = spawn(command, ["exec", "turbo", "run", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORTLESS_PORT: proxyPort,
  },
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
