#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { extractPostgresConnectionUri } from "./export-playwright-database-url.mjs";

export const domainIntegrationTestFiles = [
  "src/domains/http.integration.test.ts",
  "src/domains/persistence.integration.test.ts",
  "src/domains/identity/authentication/authentication.integration.test.ts",
];

function parseArgs(args = process.argv.slice(2)) {
  const parsed = {
    envFile: ".env.local",
    stage: undefined,
    vitestArgs: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      parsed.vitestArgs = args.slice(index + 1);
      return parsed;
    }

    if (arg === "--env-file") {
      parsed.envFile = readOptionValue(args, index, "--env-file");
      index += 1;
      continue;
    }

    if (arg === "--stage") {
      parsed.stage = readOptionValue(args, index, "--stage");
      index += 1;
      continue;
    }

    throw new Error(
      `Unknown option "${arg}". Use --stage <stage>, --env-file <path>, or -- before extra Vitest args.`
    );
  }

  if (typeof parsed.stage === "string" && parsed.stage.trim().length === 0) {
    throw new Error("--stage requires a non-empty stage name");
  }

  if (
    typeof parsed.envFile !== "string" ||
    parsed.envFile.trim().length === 0
  ) {
    throw new Error("--env-file requires a non-empty path");
  }

  return parsed;
}

function readOptionValue(args, index, optionName) {
  const value = args[index + 1];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${optionName} requires a non-empty value`);
  }

  return value;
}

function nonEmptyEnvValue(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function directDatabaseUrlFromEnv(env) {
  return (
    nonEmptyEnvValue(env.API_TEST_DATABASE_URL) ??
    nonEmptyEnvValue(env.TEST_DATABASE_URL) ??
    nonEmptyEnvValue(env.AUTH_TEST_DATABASE_URL)
  );
}

export function readAlchemyStageDatabaseUrl({
  env = process.env,
  envFile = ".env.local",
  execFileSync: run = execFileSync,
  stage,
}) {
  if (typeof stage !== "string" || stage.trim().length === 0) {
    throw new Error("--stage requires a non-empty stage name");
  }

  const output = run(
    "pnpm",
    [
      "--silent",
      "alchemy",
      "state",
      "get",
      "ceird",
      stage,
      "PostgresBranch",
      "--env-file",
      envFile,
      "--stage",
      stage,
    ],
    {
      encoding: "utf8",
      env: {
        ...env,
        CEIRD_CLOUDFLARE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  return extractPostgresConnectionUri(JSON.parse(output));
}

export function resolveConfiguredDatabaseUrl({
  args = [],
  env = process.env,
  execFileSync: run = execFileSync,
} = {}) {
  const parsed = parseArgs(args);

  if (parsed.stage !== undefined) {
    return readAlchemyStageDatabaseUrl({
      env,
      envFile: parsed.envFile,
      execFileSync: run,
      stage: parsed.stage,
    });
  }

  const databaseUrl = directDatabaseUrlFromEnv(env);
  if (databaseUrl !== undefined) {
    return databaseUrl;
  }

  throw new Error(
    "Set API_TEST_DATABASE_URL, TEST_DATABASE_URL, AUTH_TEST_DATABASE_URL, or pass --stage <stage>."
  );
}

export function buildDomainIntegrationTestRun({
  args = [],
  env = process.env,
  execFileSync: run = execFileSync,
} = {}) {
  const parsed = parseArgs(args);
  const databaseUrl =
    parsed.stage === undefined
      ? resolveConfiguredDatabaseUrl({ args, env, execFileSync: run })
      : readAlchemyStageDatabaseUrl({
          env,
          envFile: parsed.envFile,
          execFileSync: run,
          stage: parsed.stage,
        });

  return {
    args: [
      "--filter",
      "domain",
      "test",
      "--",
      ...domainIntegrationTestFiles,
      ...parsed.vitestArgs,
    ],
    command: "pnpm",
    env: {
      ...env,
      API_TEST_DATABASE_URL: env.API_TEST_DATABASE_URL ?? databaseUrl,
      AUTH_TEST_DATABASE_URL: env.AUTH_TEST_DATABASE_URL ?? databaseUrl,
      CEIRD_REQUIRE_TEST_DATABASE: "1",
      TEST_DATABASE_URL: env.TEST_DATABASE_URL ?? databaseUrl,
    },
  };
}

export function runCli({
  args = process.argv.slice(2),
  env = process.env,
  spawnSync: spawn = spawnSync,
} = {}) {
  const run = buildDomainIntegrationTestRun({ args, env });
  const result = spawn(run.command, run.args, {
    env: run.env,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
