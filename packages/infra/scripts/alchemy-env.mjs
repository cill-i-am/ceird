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
  typeof process.env.CEIRD_API_HOSTNAME === "string" &&
  process.env.CEIRD_API_HOSTNAME.length > 0
) {
  process.env.API_ORIGIN = `https://${process.env.CEIRD_API_HOSTNAME}`;
}

process.env.VITE_API_ORIGIN ??= process.env.API_ORIGIN;
process.env.CEIRD_CLOUDFLARE ??= "1";

const hasFlag = (flag) =>
  args.includes(flag) || args.some((arg) => arg.startsWith(`${flag}=`));

const resolvedAlchemyProfile =
  process.env.ALCHEMY_PROFILE ?? process.env.CEIRD_ALCHEMY_PROFILE;
const profileArgs =
  resolvedAlchemyProfile || process.env.CI !== "true"
    ? ["--profile", resolvedAlchemyProfile ?? "ceird-bootstrap"]
    : [];
const stageArgs =
  stageAwareCommands.has(command) && !hasFlag("--stage")
    ? [
        "--stage",
        process.env.ALCHEMY_STAGE ??
          process.env.CEIRD_ALCHEMY_STAGE ??
          process.env.CEIRD_INFRA_STAGE ??
          "production",
      ]
    : [];
const yesArgs =
  promptlessCommands.has(command) && !hasFlag("--yes") ? ["--yes"] : [];
const alchemyArgs =
  command === "bootstrap" && args[0] === "cloudflare"
    ? [
        command,
        args[0],
        ...yesArgs,
        ...profileArgs,
        ...stageArgs,
        ...args.slice(1),
      ]
    : [command, ...yesArgs, ...profileArgs, ...stageArgs, ...args];

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

const child = spawn("alchemy", alchemyArgs, {
  cwd: resolve(repoRoot, "packages/infra"),
  env: {
    ...process.env,
    ...(resolvedAlchemyProfile || process.env.CI !== "true"
      ? {
          ALCHEMY_PROFILE: resolvedAlchemyProfile ?? "ceird-bootstrap",
        }
      : {}),
    CI: process.env.CI ?? "false",
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
