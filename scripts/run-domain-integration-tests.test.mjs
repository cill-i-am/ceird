import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDomainIntegrationTestRun,
  readAlchemyStageDatabaseUrl,
  resolveConfiguredDatabaseUrl,
} from "./run-domain-integration-tests.mjs";

test("uses an explicit test database env and enables strict integration mode", () => {
  const run = buildDomainIntegrationTestRun({
    env: {
      API_TEST_DATABASE_URL:
        "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require",
      PATH: "/usr/bin",
    },
  });

  assert.equal(run.command, "pnpm");
  assert.deepEqual(run.args.slice(0, 4), ["--filter", "domain", "test", "--"]);
  assert.deepEqual(run.args.slice(4), [
    "src/domains/http.integration.test.ts",
    "src/domains/persistence.integration.test.ts",
    "src/domains/identity/connected-apps.test.ts",
    "src/domains/identity/authentication/authentication.integration.test.ts",
  ]);
  assert.equal(run.env.CEIRD_REQUIRE_TEST_DATABASE, "1");
  assert.equal(
    run.env.AUTH_TEST_DATABASE_URL,
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
  );
});

test("passes extra Vitest args after the focused integration test files", () => {
  const run = buildDomainIntegrationTestRun({
    args: ["--", "-t", "organization"],
    env: {
      TEST_DATABASE_URL:
        "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require",
    },
  });

  assert.deepEqual(run.args.slice(-2), ["-t", "organization"]);
  assert.equal(
    run.env.API_TEST_DATABASE_URL,
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
  );
  assert.equal(
    run.env.AUTH_TEST_DATABASE_URL,
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
  );
});

test("requires either direct database env or an explicit Alchemy stage", () => {
  assert.throws(
    () => resolveConfiguredDatabaseUrl({ env: {} }),
    /Set API_TEST_DATABASE_URL, TEST_DATABASE_URL, AUTH_TEST_DATABASE_URL, or pass --stage <stage>/
  );
});

test("rejects missing option values before running Alchemy or Vitest", () => {
  assert.throws(
    () => buildDomainIntegrationTestRun({ args: ["--stage"], env: {} }),
    /--stage requires a non-empty value/
  );
});

test("reads the database URL from Alchemy PostgresBranch state for a stage", () => {
  const calls = [];
  const databaseUrl =
    "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require";
  const result = readAlchemyStageDatabaseUrl({
    env: { PATH: "/usr/bin" },
    envFile: ".env.test",
    execFileSync: (command, args, options) => {
      calls.push({ args, command, options });
      return JSON.stringify({
        attr: {
          connectionUri: { __redacted__: databaseUrl },
        },
      });
    },
    stage: "codex-domain-integration",
  });

  assert.equal(result, databaseUrl);
  assert.equal(calls[0].command, "pnpm");
  assert.deepEqual(calls[0].args, [
    "--silent",
    "alchemy",
    "state",
    "get",
    "ceird",
    "codex-domain-integration",
    "PostgresBranch",
    "--env-file",
    ".env.test",
    "--stage",
    "codex-domain-integration",
  ]);
  assert.equal(calls[0].options.env.CEIRD_CLOUDFLARE, "1");
});
