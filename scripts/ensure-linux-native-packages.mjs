import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageNames = [
  "@rollup/rollup-linux-x64-gnu",
  "lightningcss-linux-x64-gnu",
];

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log("Linux native packages not needed on this platform.");
  process.exit(0);
}

const require = createRequire(import.meta.url);
const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

for (const packageName of packageNames) {
  ensureNativePackage(packageName);
}

function ensureNativePackage(packageName) {
  try {
    const resolved = require.resolve(packageName);
    console.log(`${packageName} already available at ${resolved}.`);
    return;
  } catch {
    // Continue and repair the optional dependency below.
  }

  const version = findLockedVersion(packageName);
  const targetDirectory = join("node_modules", ...packageName.split("/"));
  const tempDirectory = mkdtempSync(join(tmpdir(), "native-package-"));

  try {
    const packOutput = execFileSync(
      "npm",
      [
        "pack",
        `${packageName}@${version}`,
        "--pack-destination",
        tempDirectory,
        "--silent",
      ],
      { encoding: "utf8" }
    );
    const tarballName = packOutput.trim().split(/\r?\n/).at(-1);

    if (!tarballName) {
      throw new Error(
        `npm pack produced no tarball for ${packageName}@${version}.`
      );
    }

    mkdirSync(targetDirectory, { recursive: true });
    execFileSync("tar", [
      "-xzf",
      join(tempDirectory, tarballName),
      "-C",
      targetDirectory,
      "--strip-components=1",
    ]);

    const resolved = execFileSync(
      process.execPath,
      [
        "-e",
        `process.stdout.write(require.resolve(${JSON.stringify(packageName)}))`,
      ],
      { encoding: "utf8" }
    );
    console.log(`Installed ${packageName} at ${resolved}.`);
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
}

function findLockedVersion(packageName) {
  const escapedPackageName = packageName.replaceAll(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const version = lockfile.match(
    new RegExp(`^ {2}'?${escapedPackageName}@([^:'"]+)'?:`, "m")
  )?.[1];

  if (!version) {
    throw new Error(
      `Could not determine ${packageName} version from pnpm-lock.yaml.`
    );
  }

  return version;
}
