import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const setupScript = path.join(repoRoot, "scripts/setup-local-environment.sh");
const teardownScript = path.join(
  repoRoot,
  "scripts/teardown-local-environment.sh"
);
const worktreeInclude = path.join(repoRoot, ".worktreeinclude");

test(".worktreeinclude includes ignored local env files", async () => {
  const worktreeIncludeText = await readFile(worktreeInclude, "utf8");
  const patterns = new Set(
    worktreeIncludeText.split(/\r?\n/u).filter((line) => line.trim().length > 0)
  );

  assert.equal(patterns.has(".env"), true);
  assert.equal(patterns.has(".env.local"), true);
  assert.equal(patterns.has(".env.*.local"), true);
});

test("setup uses an existing .env.local before installing dependencies", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await writeFile(
    path.join(fixture.repoDir, ".env.local"),
    "AUTH_EMAIL_FROM=existing@example.com\n",
    "utf8"
  );

  const result = runScript(setupScript, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(fixture.repoDir, ".env.local"), "utf8"),
    "AUTH_EMAIL_FROM=existing@example.com\n"
  );
  assert.match(result.stdout, /Using existing \.env\.local/);
  assert.match(result.stdout, /Using opensrc global cache at /);
  assert.equal(await pathExists(path.join(fixture.repoDir, "opensrc")), false);
  assert.equal(
    await readFile(fixture.callLog, "utf8"),
    [
      "corepack enable",
      "env present before install: AUTH_EMAIL_FROM=existing@example.com",
      "opensrc missing before install",
      "pnpm install --frozen-lockfile CI=",
      "",
    ].join("\n")
  );
});

test("setup leaves existing opensrc directories alone because opensrc uses a global cache", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await writeFile(
    path.join(fixture.repoDir, ".env.local"),
    "AUTH_EMAIL_FROM=existing@example.com\n",
    "utf8"
  );
  await mkdir(path.join(fixture.repoDir, "opensrc"), { recursive: true });
  await writeFile(
    path.join(fixture.repoDir, "opensrc/partial.txt"),
    "left by interrupted setup\n",
    "utf8"
  );

  const result = runScript(setupScript, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(fixture.repoDir, "opensrc/partial.txt"), "utf8"),
    "left by interrupted setup\n"
  );
});

test("setup fails when .env.local was not included into the worktree", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const sourceWorktree = path.join(fixture.tempDir, "source-worktree");

  run("git", ["add", "."], { cwd: fixture.repoDir });
  run("git", ["commit", "-m", "initial"], { cwd: fixture.repoDir });
  run("git", ["worktree", "add", sourceWorktree], { cwd: fixture.repoDir });
  await writeFile(
    path.join(sourceWorktree, ".env.local"),
    "AUTH_EMAIL_FROM=worktree@example.com\n",
    "utf8"
  );

  const result = runScript(setupScript, fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /Missing \.env\.local\. Codex-managed worktrees copy ignored env files listed in \.worktreeinclude/
  );
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    false
  );
  assert.equal(await readFile(fixture.callLog, "utf8"), "");
});

test("setup fails when no .env.local exists", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(setupScript, fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /Missing \.env\.local\. Codex-managed worktrees copy ignored env files listed in \.worktreeinclude/
  );
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    false
  );
  assert.equal(await readFile(fixture.callLog, "utf8"), "");
});

test("teardown is a no-op for Alchemy-native local environments", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(teardownScript, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No local teardown is required/);
  assert.match(result.stdout, /Alchemy stages are managed explicitly/);
  assert.match(
    result.stdout,
    /CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --profile ceird-env --env-file \.env\.local --stage <stage>/
  );
  assert.doesNotMatch(
    result.stdout,
    /(?<!CEIRD_CLOUDFLARE=1 )pnpm alchemy destroy --profile ceird-env --env-file \.env\.local --stage <stage>/
  );
  assert.doesNotMatch(result.stdout, /pnpm alchemy destroy\.$/m);
  assert.doesNotMatch(result.stdout, /Docker/);
  assert.equal(await readFile(fixture.callLog, "utf8"), "");
});

async function createFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ceird-local-env-"));
  const repoDir = path.join(tempDir, "repo");
  const binDir = path.join(tempDir, "bin");
  const callLog = path.join(tempDir, "calls.log");

  await mkdir(repoDir);
  await mkdir(binDir);
  await writeFile(callLog, "", "utf8");
  run("git", ["init"], { cwd: repoDir });
  run("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  run("git", ["config", "user.name", "Test User"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "README.md"), "# Fixture\n", "utf8");

  await writeExecutable(
    path.join(binDir, "corepack"),
    [
      "#!/usr/bin/env bash",
      'printf "corepack %s\\n" "$*" >> "$LOCAL_ENV_CALL_LOG"',
      "",
    ].join("\n")
  );

  await writeExecutable(
    path.join(binDir, "pnpm"),
    [
      "#!/usr/bin/env bash",
      "if [[ ! -f .env.local ]]; then",
      '  printf "env missing before install\\n" >> "$LOCAL_ENV_CALL_LOG"',
      "else",
      '  printf "env present before install: %s\\n" "$(sed -n "1p" .env.local)" >> "$LOCAL_ENV_CALL_LOG"',
      "fi",
      "if [[ ! -f opensrc/sources.json ]]; then",
      '  printf "opensrc missing before install\\n" >> "$LOCAL_ENV_CALL_LOG"',
      "else",
      '  printf "opensrc present before install: %s\\n" "$(sed -n "1p" opensrc/sources.json)" >> "$LOCAL_ENV_CALL_LOG"',
      "fi",
      `printf "pnpm %s CI=%s\\n" "$*" "\${CI:-}" >> "$LOCAL_ENV_CALL_LOG"`,
      "",
    ].join("\n")
  );

  return {
    binDir,
    callLog,
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    repoDir,
    tempDir,
  };
}

function runScript(scriptPath, fixture, env = {}, cwd = fixture.repoDir) {
  return run("bash", [scriptPath], {
    cwd,
    env: {
      CI: "",
      LOCAL_ENV_CALL_LOG: fixture.callLog,
      PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      ...env,
    },
  });
}

function run(command, args, options) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

async function writeExecutable(filePath, content) {
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      return error.code !== "ENOENT";
    }

    throw error;
  }
}
