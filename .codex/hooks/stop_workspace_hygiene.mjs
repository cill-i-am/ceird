#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

function gitOutput(...args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function isIgnored(targetPath) {
  const result = spawnSync("git", ["check-ignore", targetPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return result.status === 0;
}

function main() {
  const repoRoot = gitOutput("rev-parse", "--show-toplevel");
  if (!repoRoot) {
    return 0;
  }

  const warnings = [];

  const compileCachePath = path.join(repoRoot, "node-compile-cache");
  if (existsSync(compileCachePath) && !isIgnored(compileCachePath)) {
    warnings.push(
      "Workspace hygiene: node-compile-cache/ exists at repo root and is not ignored."
    );
  }

  const gitLockPath = path.join(repoRoot, ".git", "index.lock");
  if (existsSync(gitLockPath)) {
    warnings.push(
      "Git hygiene: .git/index.lock still exists. If Git commands start failing, it may be stale."
    );
  }

  if (warnings.length === 0) {
    return 0;
  }

  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      systemMessage: warnings.join(" "),
    })}\n`
  );

  return 0;
}

process.exit(main());
