import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { buildOpensrcSourceList } from "./opensrc-packages.mjs";

if (process.env.CI === "true") {
  console.log("Skipping opensrc sync because CI=true.");
  process.exit(0);
}

const workspacePackages = [
  "apps/api/package.json",
  "apps/app/package.json",
  "apps/domain/package.json",
  "apps/mcp/package.json",
];
const workspacePackageJsons = [];

for (const packagePath of workspacePackages) {
  const fullPath = path.resolve(packagePath);
  if (!existsSync(fullPath)) {
    continue;
  }

  workspacePackageJsons.push(JSON.parse(readFileSync(fullPath, "utf8")));
}

const sourceList = buildOpensrcSourceList(workspacePackageJsons);

if (sourceList.length === 0) {
  process.exit(0);
}

const result = spawnSync(
  "pnpm",
  ["exec", "opensrc", "fetch", "--cwd", process.cwd(), ...sourceList],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "1",
    },
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
