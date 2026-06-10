#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredEnvKeys = [
  "AUTH_EMAIL_FROM",
  "GOOGLE_MAPS_API_KEY",
  "NEON_API_KEY",
];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function normalizeStage(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
}

export function makeFallbackStage({ branch, user }) {
  if (!branch) {
    return;
  }

  if (branch === "main" || branch === "master") {
    return `dev_${user}`;
  }

  return normalizeStage(branch);
}

function check(name, status, message) {
  return { name, status, message };
}

export function makeAlchemyDoctorReport(input) {
  const fallbackStage = makeFallbackStage({
    branch: input.branch,
    user: input.user,
  });
  const explicitStage = nonBlank(input.explicitStage);
  const stage = explicitStage ?? fallbackStage;
  const missingEnv = requiredEnvKeys.filter(
    (key) => !input.envFileValues[key]?.trim()
  );
  const checks = [
    stage === undefined
      ? check(
          "stage",
          "fail",
          "Cannot derive an Alchemy stage from a detached worktree; pass --stage <stage>."
        )
      : check("stage", "pass", `Using Alchemy stage ${stage}.`),
    input.envFileExists
      ? check("env-file", "pass", "Environment file is present.")
      : check("env-file", "fail", "Environment file is missing."),
    missingEnv.length === 0
      ? check("env", "pass", "Required Alchemy environment values are present.")
      : check(
          "env",
          "fail",
          `Missing required environment values: ${missingEnv.join(", ")}.`
        ),
    input.nodeMajor >= 24
      ? check(
          "node",
          "pass",
          `Node ${input.nodeMajor} satisfies the repo engine.`
        )
      : check("node", "fail", "Node 24 or newer is required."),
    input.packageAlchemyVersion === "2.0.0-beta.44"
      ? check("alchemy", "pass", "Alchemy package matches the audited beta.")
      : check(
          "alchemy",
          "warn",
          `Alchemy package is ${input.packageAlchemyVersion}; re-run the audit after upgrades.`
        ),
  ];
  const ok = checks.every((item) => item.status !== "fail");
  const failedMessages = checks
    .filter((item) => item.status === "fail")
    .map((item) => item.message);

  return {
    checks,
    ok,
    stage,
    summary: ok
      ? "Alchemy local development looks ready."
      : [
          "Alchemy local development needs attention before running provider-backed commands.",
          ...failedMessages,
        ].join(" "),
  };
}

function nonBlank(value) {
  const trimmed = value?.trim() ?? "";

  return trimmed.length === 0 ? undefined : trimmed;
}

function requireValue(name, value) {
  if (value === undefined || value.startsWith("--") || value.length === 0) {
    throw new UsageError(`${name} requires a value.`);
  }

  return value;
}

export function parseAlchemyDoctorArgs(args) {
  const options = {
    envFile: ".env.local",
    json: false,
    stage: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--stage") {
      options.stage = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--stage=")) {
      options.stage = requireValue("--stage", arg.slice("--stage=".length));
      continue;
    }

    if (arg === "--env-file") {
      options.envFile = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--env-file=")) {
      options.envFile = requireValue(
        "--env-file",
        arg.slice("--env-file=".length)
      );
      continue;
    }

    if (arg.startsWith("--")) {
      throw new UsageError(`Unknown option ${arg}.`);
    }

    throw new UsageError(`Unexpected positional argument ${arg}.`);
  }

  return options;
}

function readBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return result.status === 0 ? result.stdout.trim() : "";
}

function readEnvFile(envFile) {
  const envFilePath = resolve(repoRoot, envFile);

  return existsSync(envFilePath)
    ? { exists: true, values: parseEnv(readFileSync(envFilePath, "utf8")) }
    : { exists: false, values: {} };
}

function main() {
  let options;

  try {
    options = parseAlchemyDoctorArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exit(2);
    }

    throw error;
  }
  const envFile = readEnvFile(options.envFile);
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8")
  );
  const nodeMajor = Number(process.version.replace(/^v/u, "").split(".")[0]);
  const report = makeAlchemyDoctorReport({
    branch: readBranch(),
    envFileExists: envFile.exists,
    envFileValues: { ...process.env, ...envFile.values },
    explicitStage: options.stage,
    nodeMajor,
    packageAlchemyVersion: packageJson.devDependencies.alchemy,
    user: process.env.USER ?? process.env.USERNAME ?? "unknown",
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.summary);
    for (const item of report.checks) {
      console.log(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
