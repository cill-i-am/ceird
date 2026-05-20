import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
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

test("setup copies .env.local from LOCAL_ENV_SOURCE", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const sourceFile = path.join(fixture.tempDir, "source.env.local");
  await writeFile(sourceFile, "AUTH_EMAIL_FROM=auth@example.com\n", "utf8");
  await writeOpensrcCache(fixture.tempDir, "local-env-source");

  const result = runScript(setupScript, fixture, {
    LOCAL_ENV_SOURCE: sourceFile,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(fixture.repoDir, ".env.local"), "utf8"),
    "AUTH_EMAIL_FROM=auth@example.com\n"
  );
  assert.equal(await fileMode(path.join(fixture.repoDir, ".env.local")), 0o600);
  assert.equal(
    await readFile(path.join(fixture.repoDir, "opensrc/sources.json"), "utf8"),
    "local-env-source\n"
  );
  assert.equal(
    await realpath(await readlink(path.join(fixture.repoDir, "opensrc"))),
    await realpath(path.join(fixture.tempDir, "opensrc"))
  );
  assert.equal(
    await readFile(fixture.callLog, "utf8"),
    [
      "corepack enable",
      "env present before install: AUTH_EMAIL_FROM=auth@example.com",
      "opensrc present before install: local-env-source",
      "pnpm install --frozen-lockfile CI=true",
      "",
    ].join("\n")
  );
});

test("setup preserves an existing .env.local", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await writeFile(
    path.join(fixture.repoDir, ".env.local"),
    "AUTH_EMAIL_FROM=existing@example.com\n",
    "utf8"
  );
  const sourceFile = path.join(fixture.tempDir, "source.env.local");
  await writeFile(sourceFile, "AUTH_EMAIL_FROM=source@example.com\n", "utf8");

  const result = runScript(setupScript, fixture, {
    LOCAL_ENV_SOURCE: sourceFile,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(fixture.repoDir, ".env.local"), "utf8"),
    "AUTH_EMAIL_FROM=existing@example.com\n"
  );
});

test("setup copies .env.local from the primary git worktree", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const targetWorktree = path.join(fixture.tempDir, "target-worktree");

  run("git", ["add", "."], { cwd: fixture.repoDir });
  run("git", ["commit", "-m", "initial"], { cwd: fixture.repoDir });
  await writeFile(
    path.join(fixture.repoDir, ".env.local"),
    "AUTH_EMAIL_FROM=primary@example.com\n",
    "utf8"
  );
  await writeOpensrcCache(fixture.repoDir, "primary-worktree");
  run("git", ["worktree", "add", "--detach", targetWorktree], {
    cwd: fixture.repoDir,
  });

  const result = runScript(setupScript, fixture, {}, targetWorktree);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(targetWorktree, ".env.local"), "utf8"),
    "AUTH_EMAIL_FROM=primary@example.com\n"
  );
  assert.equal(await fileMode(path.join(targetWorktree, ".env.local")), 0o600);
  assert.equal(
    await readFile(path.join(targetWorktree, "opensrc/sources.json"), "utf8"),
    "primary-worktree\n"
  );
  assert.equal(
    await realpath(await readlink(path.join(targetWorktree, "opensrc"))),
    await realpath(path.join(fixture.repoDir, "opensrc"))
  );
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    true
  );
});

test("setup allows pnpm to refresh opensrc when no cache source exists", async (t) => {
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

test("setup replaces a partial opensrc directory with a cache link", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const sourceDir = path.join(fixture.tempDir, "source");
  await mkdir(sourceDir);
  await writeFile(
    path.join(sourceDir, ".env.local"),
    "AUTH_EMAIL_FROM=source@example.com\n",
    "utf8"
  );
  await writeOpensrcCache(sourceDir, "source-cache");
  await mkdir(path.join(fixture.repoDir, "opensrc"), { recursive: true });
  await writeFile(
    path.join(fixture.repoDir, "opensrc/partial.txt"),
    "left by interrupted setup\n",
    "utf8"
  );

  const result = runScript(setupScript, fixture, {
    LOCAL_ENV_SOURCE: sourceDir,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await realpath(await readlink(path.join(fixture.repoDir, "opensrc"))),
    await realpath(path.join(sourceDir, "opensrc"))
  );
  assert.equal(
    await readFile(path.join(fixture.repoDir, "opensrc/sources.json"), "utf8"),
    "source-cache\n"
  );
});

test("setup fails when no existing .env.local or LOCAL_ENV_SOURCE is available", async (t) => {
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
    /Missing \.env\.local\. Create one at the repo root or set LOCAL_ENV_SOURCE/
  );
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    false
  );
  assert.equal(await readFile(fixture.callLog, "utf8"), "");
});

test("setup fails when no env source exists", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(setupScript, fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.match(
    result.stderr,
    /Missing \.env\.local\. Create one at the repo root or set LOCAL_ENV_SOURCE/
  );
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    false
  );
  assert.equal(await readFile(fixture.callLog, "utf8"), "");
});

test("setup preserves .env.local before installing dependencies", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  await writeFile(
    path.join(fixture.repoDir, ".env.local"),
    "AUTH_EMAIL_FROM=existing@example.com\n",
    "utf8"
  );
  await writeOpensrcCache(fixture.repoDir, "existing-cache");

  const result = runScript(setupScript, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(fixture.callLog, "utf8"),
    [
      "corepack enable",
      "env present before install: AUTH_EMAIL_FROM=existing@example.com",
      "opensrc present before install: existing-cache",
      "pnpm install --frozen-lockfile CI=true",
      "",
    ].join("\n")
  );
});

test("setup does not leave a partial .env.local when fallback generation fails", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const fixtureScriptDir = path.join(fixture.repoDir, "scripts");
  const copiedSetupScript = path.join(
    fixtureScriptDir,
    "setup-local-environment.sh"
  );
  await mkdir(fixtureScriptDir);
  await writeFile(copiedSetupScript, await readFile(setupScript, "utf8"));

  const result = runScript(copiedSetupScript, fixture);

  assert.notEqual(result.status, 0, result.stderr);
  assert.equal(
    await pathExists(path.join(fixture.repoDir, ".env.local")),
    false
  );
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
    /CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file \.env\.local --stage <stage>/
  );
  assert.doesNotMatch(
    result.stdout,
    /(?<!CEIRD_CLOUDFLARE=1 )pnpm alchemy destroy --env-file \.env\.local --stage <stage>/
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
      'printf "pnpm %s CI=%s\\n" "$*" "$CI" >> "$LOCAL_ENV_CALL_LOG"',
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

async function writeOpensrcCache(rootDir, label) {
  const opensrcDir = path.join(rootDir, "opensrc");
  await mkdir(path.join(opensrcDir, "repos/example"), { recursive: true });
  await writeFile(path.join(opensrcDir, "sources.json"), `${label}\n`, "utf8");
  await writeFile(
    path.join(opensrcDir, "repos/example/source.ts"),
    `export const source = ${JSON.stringify(label)};\n`,
    "utf8"
  );
}

async function writeExecutable(filePath, content) {
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}

async function fileMode(filePath) {
  const fileStat = await stat(filePath);
  return fileStat.mode % 0o1000;
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
