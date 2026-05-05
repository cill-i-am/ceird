import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
const scriptPath = path.join(repoRoot, "scripts/test-with-sandbox.mjs");
const defaultSandboxUrlOutput =
  '{"urls":{"postgres":"postgresql://postgres:postgres@127.0.0.1:5442/ceird"}}\n';

test("runs all tests with the current sandbox Postgres URL", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(fixture.callLog, "utf8"),
    [
      "pnpm sandbox:up",
      "pnpm --silent sandbox:url -- --format json",
      "pnpm test",
      "API_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5442/ceird",
      "",
    ].join("\n")
  );
});

test("runs filtered API tests with extra Vitest arguments", async (t) => {
  const fixture = await createFixture();
  t.after(fixture.cleanup);

  const result = runScript(fixture, [
    "--api",
    "--",
    "src/domains/jobs/http.integration.test.ts",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(fixture.callLog, "utf8"),
    [
      "pnpm sandbox:up",
      "pnpm --silent sandbox:url -- --format json",
      "pnpm --filter api test -- src/domains/jobs/http.integration.test.ts",
      "API_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5442/ceird",
      "",
    ].join("\n")
  );
});

test("fails clearly when sandbox URL output is not valid JSON", async (t) => {
  const fixture = await createFixture({
    sandboxUrlOutput: "not-json",
  });
  t.after(fixture.cleanup);

  const result = runScript(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to parse sandbox:url JSON output/);
  assert.doesNotMatch(result.stderr, /at parsePostgresUrl/);
});

for (const [name, failCommand, args] of [
  ["sandbox startup", "sandbox:up", []],
  ["sandbox URL lookup", "--silent sandbox:url -- --format json", []],
  ["delegated test command", "test", []],
  [
    "delegated API test command",
    "--filter api test -- src/domains/jobs/http.integration.test.ts",
    ["--api", "--", "src/domains/jobs/http.integration.test.ts"],
  ],
]) {
  test(`propagates ${name} failures`, async (t) => {
    const fixture = await createFixture({ failCommand });
    t.after(fixture.cleanup);

    const result = runScript(fixture, args);

    assert.equal(result.status, 42);
  });
}

async function createFixture(options) {
  const sandboxUrlOutput = options?.sandboxUrlOutput ?? defaultSandboxUrlOutput;
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "ceird-test-with-sandbox-")
  );
  const binDir = path.join(tempDir, "bin");
  const callLog = path.join(tempDir, "calls.log");

  await mkdir(binDir);
  await writeFile(callLog, "", "utf8");
  await writeExecutable(
    path.join(binDir, "pnpm"),
    [
      "#!/usr/bin/env bash",
      'printf "pnpm %s\\n" "$*" >> "$TEST_WITH_SANDBOX_CALL_LOG"',
      'if [[ "$TEST_WITH_SANDBOX_FAIL_COMMAND" == "$*" ]]; then',
      "  exit 42",
      "fi",
      'if [[ "$*" == "--silent sandbox:url -- --format json" ]]; then',
      '  printf "%s" "$TEST_WITH_SANDBOX_URL_OUTPUT"',
      "fi",
      'if [[ "$*" == test || "$*" == --filter\\ api\\ test* ]]; then',
      '  printf "API_TEST_DATABASE_URL=%s\\n" "$API_TEST_DATABASE_URL" >> "$TEST_WITH_SANDBOX_CALL_LOG"',
      "fi",
      "",
    ].join("\n")
  );

  return {
    binDir,
    callLog,
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    failCommand: options?.failCommand,
    sandboxUrlOutput,
  };
}

function runScript(fixture, args = []) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      TEST_WITH_SANDBOX_CALL_LOG: fixture.callLog,
      TEST_WITH_SANDBOX_FAIL_COMMAND: fixture.failCommand ?? "",
      TEST_WITH_SANDBOX_URL_OUTPUT: fixture.sandboxUrlOutput,
    },
  });
}

async function writeExecutable(filePath, content) {
  await writeFile(filePath, content, "utf8");
  await chmod(filePath, 0o755);
}
