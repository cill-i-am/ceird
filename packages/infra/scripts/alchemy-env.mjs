import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const envFile = resolve(repoRoot, ".env.local");
const [command = "deploy", ...args] = process.argv.slice(2);
const stageAwareCommands = new Set(["deploy", "destroy", "dev", "plan"]);
const promptlessCommands = new Set(["deploy", "destroy"]);
const env = (primary, legacy) => process.env[primary] ?? process.env[legacy];

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replaceAll(/^['"]|['"]$/gu, "");
    process.env[key] ??= value;
  }
}

if (
  !process.env.API_ORIGIN &&
  typeof env("CEIRD_API_HOSTNAME", "TASK_TRACKER_API_HOSTNAME") === "string" &&
  env("CEIRD_API_HOSTNAME", "TASK_TRACKER_API_HOSTNAME").length > 0
) {
  process.env.API_ORIGIN = `https://${env(
    "CEIRD_API_HOSTNAME",
    "TASK_TRACKER_API_HOSTNAME"
  )}`;
}

process.env.VITE_API_ORIGIN ??= process.env.API_ORIGIN;
process.env.CEIRD_CLOUDFLARE ??= "1";
process.env.TASK_TRACKER_CLOUDFLARE ??= "1";

const hasFlag = (flag) =>
  args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));

const resolvedAlchemyProfile =
  process.env.ALCHEMY_PROFILE ??
  env("CEIRD_ALCHEMY_PROFILE", "TASK_TRACKER_ALCHEMY_PROFILE");
const profileArgs =
  resolvedAlchemyProfile || process.env.CI !== "true"
    ? ["--profile", resolvedAlchemyProfile ?? "task-tracker-bootstrap"]
    : [];
const stageArgs =
  stageAwareCommands.has(command) && !hasFlag("--stage")
    ? [
        "--stage",
        process.env.ALCHEMY_STAGE ??
          env("CEIRD_ALCHEMY_STAGE", "TASK_TRACKER_ALCHEMY_STAGE") ??
          env("CEIRD_INFRA_STAGE", "TASK_TRACKER_INFRA_STAGE") ??
          "production",
      ]
    : [];
const yesArgs =
  promptlessCommands.has(command) && !hasFlag("--yes") ? ["--yes"] : [];

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  const alchemyProfiles = resolve(homedir(), ".alchemy/profiles.json");
  if (existsSync(alchemyProfiles)) {
    const profiles = JSON.parse(readFileSync(alchemyProfiles, "utf8"));
    const accountId = profiles.profiles?.default?.Cloudflare?.accountId;
    if (typeof accountId === "string" && accountId.length > 0) {
      process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
    }
  }
}

const child = spawn(
  "alchemy",
  [command, ...yesArgs, ...profileArgs, ...stageArgs, ...args],
  {
    cwd: resolve(repoRoot, "packages/infra"),
    env: {
      ...process.env,
      ...(resolvedAlchemyProfile || process.env.CI !== "true"
        ? {
            ALCHEMY_PROFILE: resolvedAlchemyProfile ?? "task-tracker-bootstrap",
          }
        : {}),
      CI: process.env.CI ?? "false",
    },
    stdio: "inherit",
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
