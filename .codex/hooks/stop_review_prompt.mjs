#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const MAX_LISTED_FILES = 12;
const MAX_HASHED_UNTRACKED_BYTES = 2 * 1024 * 1024;
const MARKER_LIMIT = 24;

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}

function lines(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(items)].toSorted();
}

function firstExistingRef(refs) {
  for (const ref of refs) {
    if (git(["rev-parse", "--verify", "--quiet", ref])) {
      return ref;
    }
  }

  return "";
}

function diffScope() {
  const unstaged = lines(git(["diff", "--name-only"]));
  const staged = lines(git(["diff", "--cached", "--name-only"]));
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
  const workingTreeFiles = unique([...unstaged, ...staged, ...untracked]);

  if (workingTreeFiles.length > 0) {
    return {
      mode: "working-tree",
      files: workingTreeFiles,
      diffText: [
        git(["diff", "--binary"]),
        git(["diff", "--cached", "--binary"]),
        untrackedHashInput(untracked),
      ].join("\n"),
    };
  }

  const branch = git(["branch", "--show-current"]);
  if (!branch || branch === "main" || branch === "master") {
    return { mode: "none", files: [], diffText: "" };
  }

  const baseRef = firstExistingRef([
    "origin/main",
    "main",
    "origin/master",
    "master",
  ]);
  if (!baseRef) {
    return { mode: "none", files: [], diffText: "" };
  }

  const mergeBase = git(["merge-base", "HEAD", baseRef]);
  if (!mergeBase) {
    return { mode: "none", files: [], diffText: "" };
  }

  const files = lines(git(["diff", "--name-only", `${mergeBase}...HEAD`]));

  return {
    mode: `${baseRef}...HEAD`,
    files,
    diffText: git(["diff", "--binary", `${mergeBase}...HEAD`]),
  };
}

function untrackedHashInput(files) {
  return files
    .map((file) => {
      const absolutePath = path.join(process.cwd(), file);
      try {
        const contents = readFileSync(absolutePath);
        if (contents.byteLength > MAX_HASHED_UNTRACKED_BYTES) {
          return `untracked:${file}:too-large:${contents.byteLength}`;
        }

        return `untracked:${file}:${contents.toString("base64")}`;
      } catch {
        return `untracked:${file}:unreadable`;
      }
    })
    .join("\n");
}

function isReviewInfra(file) {
  return (
    file.startsWith(".agents/") ||
    file.startsWith(".codex/") ||
    file === "AGENTS.md" ||
    file.endsWith("/AGENTS.md") ||
    file === "skills-lock.json"
  );
}

function isSharedCore(file) {
  return /^packages\/(identity-core|jobs-core|labels-core|sites-core)\//.test(
    file
  );
}

function isBackendFile(file) {
  return (
    file === "alchemy.run.ts" ||
    file === "tsconfig.infra.json" ||
    file.startsWith("apps/api/") ||
    file.startsWith("infra/") ||
    isSharedCore(file)
  );
}

function isFrontendFile(file) {
  return file.startsWith("apps/app/") || isSharedCore(file);
}

function relevantFiles(files, predicate) {
  return files.filter((file) => !isReviewInfra(file) && predicate(file));
}

function hashScope(scope, backendFiles, frontendFiles) {
  return createHash("sha256")
    .update(scope.mode)
    .update("\n")
    .update(scope.files.join("\n"))
    .update("\nbackend\n")
    .update(backendFiles.join("\n"))
    .update("\nfrontend\n")
    .update(frontendFiles.join("\n"))
    .update("\ndiff\n")
    .update(scope.diffText)
    .digest("hex");
}

function markerDirectory() {
  const hookPath = git(["rev-parse", "--git-path", "codex-review-hook"]);
  if (!hookPath) {
    return "";
  }

  return path.isAbsolute(hookPath)
    ? hookPath
    : path.join(process.cwd(), hookPath);
}

function markerExists(markerDir, hash) {
  return existsSync(path.join(markerDir, `${hash}.json`));
}

function writeMarker(markerDir, hash, payload) {
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(
    path.join(markerDir, `${hash}.json`),
    `${JSON.stringify({ ...payload, createdAt: new Date().toISOString() }, null, 2)}\n`
  );
  pruneMarkers(markerDir);
}

function pruneMarkers(markerDir) {
  const markers = readdirSync(markerDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const fullPath = path.join(markerDir, entry.name);
      return { name: entry.name, fullPath, mtimeMs: readMarkerMtime(fullPath) };
    })
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs);

  for (const marker of markers.slice(MARKER_LIMIT)) {
    rmSync(marker.fullPath, { force: true });
  }
}

function readMarkerMtime(fullPath) {
  try {
    return JSON.parse(readFileSync(fullPath, "utf8")).createdAt
      ? Date.parse(JSON.parse(readFileSync(fullPath, "utf8")).createdAt)
      : 0;
  } catch {
    return 0;
  }
}

function summarize(files) {
  const shown = files.slice(0, MAX_LISTED_FILES).map((file) => `- ${file}`);
  const hiddenCount = files.length - shown.length;

  if (hiddenCount > 0) {
    shown.push(`- ...and ${hiddenCount} more`);
  }

  return shown.join("\n");
}

function buildMessage(scope, backendFiles, frontendFiles) {
  const sections = [
    `Automated Ceird review reminder for ${scope.mode} changes.`,
    "Before finalizing, run the applicable project review skill(s), load the required subordinate skills named inside them, fix material issues, and verify the fix.",
  ];

  if (backendFiles.length > 0) {
    sections.push(
      [
        "Backend/API review required: load `.agents/skills/ceird-backend-review/SKILL.md` (skill `ceird-backend-review`).",
        summarize(backendFiles),
      ].join("\n")
    );
  }

  if (frontendFiles.length > 0) {
    sections.push(
      [
        "Frontend/app review required: load `.agents/skills/ceird-frontend-review/SKILL.md` (skill `ceird-frontend-review`).",
        summarize(frontendFiles),
      ].join("\n")
    );
  }

  sections.push(
    "If the current user explicitly requested Review Swarm or parallel review, use read-only sub-agents with explicit reasoning effort; otherwise apply the same review checklist locally."
  );

  return sections.join("\n\n");
}

function main() {
  if (process.env.CEIRD_SKIP_REVIEW_HOOK === "1") {
    return 0;
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  if (!repoRoot) {
    return 0;
  }

  const scope = diffScope();
  if (scope.files.length === 0) {
    return 0;
  }

  const backendFiles = relevantFiles(scope.files, isBackendFile);
  const frontendFiles = relevantFiles(scope.files, isFrontendFile);

  if (backendFiles.length === 0 && frontendFiles.length === 0) {
    return 0;
  }

  const hash = hashScope(scope, backendFiles, frontendFiles);
  const markerDir = markerDirectory();
  if (!markerDir) {
    return 0;
  }

  if (markerExists(markerDir, hash)) {
    return 0;
  }

  writeMarker(markerDir, hash, {
    mode: scope.mode,
    backendFiles,
    frontendFiles,
  });

  process.stdout.write(
    `${JSON.stringify({
      continue: true,
      systemMessage: buildMessage(scope, backendFiles, frontendFiles),
    })}\n`
  );

  return 0;
}

process.exit(main());
