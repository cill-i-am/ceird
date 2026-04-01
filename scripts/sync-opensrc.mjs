import { readFileSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const workspacePackages = [
  "apps/api/package.json",
  "apps/app/package.json",
]

const extraPackages = ["portless"]
const skippedPackages = new Set(["react"])
const extraSources = ["github:facebook/react"]

const packages = new Set(extraPackages)

for (const packagePath of workspacePackages) {
  const fullPath = path.resolve(packagePath)
  if (!existsSync(fullPath)) continue

  const packageJson = JSON.parse(readFileSync(fullPath, "utf8"))
  for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
    if (skippedPackages.has(dependency)) continue
    packages.add(dependency)
  }
}

const sourceList = [...packages, ...extraSources].sort()

if (sourceList.length === 0) {
  process.exit(0)
}

const result = spawnSync(
  "pnpm",
  ["exec", "opensrc", ...sourceList, "--modify=false"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "1",
    },
  },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
