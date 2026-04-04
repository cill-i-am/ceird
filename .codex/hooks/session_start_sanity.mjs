#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

function gitOutput(...args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  })

  if (result.status !== 0) {
    return ""
  }

  return result.stdout.trim()
}

function isIgnored(targetPath) {
  const result = spawnSync("git", ["check-ignore", targetPath], {
    cwd: process.cwd(),
    encoding: "utf8",
  })

  return result.status === 0
}

function main() {
  const repoRoot = gitOutput("rev-parse", "--show-toplevel")
  if (!repoRoot) {
    return 0
  }

  const messages = []

  const userName = gitOutput("config", "user.name")
  const userEmail = gitOutput("config", "user.email")
  if (!userName || !userEmail) {
    messages.push(
      "Git identity is not fully configured in this repo. If the user asks you to commit, warn that Git may fall back to an auto-detected name and email."
    )
  }

  const compileCachePath = path.join(repoRoot, "node-compile-cache")
  if (existsSync(compileCachePath) && !isIgnored(compileCachePath)) {
    messages.push(
      "Workspace hygiene: node-compile-cache/ exists at repo root and is not ignored. Treat it as a generated artifact and avoid committing it."
    )
  }

  const gitLockPath = path.join(repoRoot, ".git", "index.lock")
  if (existsSync(gitLockPath)) {
    messages.push(
      "Git hygiene: .git/index.lock exists. If Git commands fail, check whether a stale lock needs to be cleared."
    )
  }

  if (messages.length === 0) {
    return 0
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: messages.join(" "),
      },
    })}\n`
  )

  return 0
}

process.exit(main())
