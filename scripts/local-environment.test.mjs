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

test("setup copies .env.local from LOCAL_ENV_SOURCE", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);
  const sourceFile = path.join(fixture.tempDir, "source.env.local");
  await writeFile(sourceFile, "AUTH_EMAIL_FROM=auth@example.com\n", "utf8");

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
    await readFile(fixture.callLog, "utf8"),
    "corepack enable\npnpm install --frozen-lockfile\n"
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

test("teardown succeeds when sandbox down has nothing to stop", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(teardownScript, fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(fixture.callLog, "utf8"), "pnpm sandbox:down\n");
});

test("teardown propagates sandbox down failures", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(teardownScript, fixture, {
    PNPM_FAIL_SANDBOX_DOWN: "1",
  });

  assert.equal(result.status, 42, result.stderr);
  assert.equal(await readFile(fixture.callLog, "utf8"), "pnpm sandbox:down\n");
});

async function createFixture() {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "task-tracker-local-env-")
  );
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
      'printf "pnpm %s\\n" "$*" >> "$LOCAL_ENV_CALL_LOG"',
      `if [[ "\${PNPM_FAIL_SANDBOX_DOWN:-}" == "1" && "$*" == "sandbox:down" ]]; then`,
      "  exit 42",
      "fi",
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

function runScript(scriptPath, fixture, env = {}) {
  return run("bash", [scriptPath], {
    cwd: fixture.repoDir,
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
