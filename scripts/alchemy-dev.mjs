#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import {
  RpcSpawner,
  layerServer as rpcSpawnerLayerServer,
} from "alchemy/Local/RpcSpawner";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import * as Effect from "effect/Effect";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultEnvFile = ".env.local";
const defaultAlchemyProfile = "ceird-env";
const node26ModuleRegisterWarningOption = "--disable-warning=DEP0205";

export function normalizeAlchemyDevArgs(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

export function makeAlchemyNodeExecArgv({
  execArgv = process.execArgv,
  nodeVersion = process.version,
} = {}) {
  const major = Number(nodeVersion.replace(/^v/u, "").split(".")[0] ?? "0");
  return [
    ...execArgv,
    ...(major >= 26 ? [] : ["--experimental-transform-types"]),
    // Alchemy v2 beta still uses module.register() in its loader path.
    ...(major >= 26 ? [node26ModuleRegisterWarningOption] : []),
    "--watch",
    "--watch-preserve-output",
  ];
}

function appendNodeOption(nodeOptions, option) {
  const currentOptions = nodeOptions?.trim();

  if (!currentOptions) {
    return option;
  }

  return currentOptions.split(/\s+/u).includes(option)
    ? currentOptions
    : `${currentOptions} ${option}`;
}

export function makeAlchemyExecOptions({
  args,
  defaultProfile,
  envFile,
  fallbackStage,
}) {
  const normalizedArgs = normalizeAlchemyDevArgs(args);
  const options = {
    dev: true,
    envFile,
    main: "alchemy.run.ts",
    profile: defaultProfile,
    stage: fallbackStage,
    yes: false,
  };

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    const next = normalizedArgs[index + 1];

    if (arg === "--stage" && next) {
      options.stage = next;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--stage=")) {
      options.stage = arg.slice("--stage=".length);
      continue;
    }

    if (arg === "--profile" && next) {
      options.profile = next;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--profile=")) {
      options.profile = arg.slice("--profile=".length);
      continue;
    }

    if (arg === "--env-file" && next) {
      options.envFile = next;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg && !arg.startsWith("-")) {
      options.main = arg;
    }
  }

  return options;
}

export function readExplicitAlchemyStageArg(args) {
  const normalizedArgs = normalizeAlchemyDevArgs(args);

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    const next = normalizedArgs[index + 1];

    if (arg === "--stage" && next) {
      return next;
    }

    if (arg?.startsWith("--stage=")) {
      return arg.slice("--stage=".length);
    }
  }
}

export function makeAlchemyDevEnvironment({
  baseEnv = process.env,
  defaultProfile,
  envFileValues,
  nodeVersion = process.version,
}) {
  const major = Number(nodeVersion.replace(/^v/u, "").split(".")[0] ?? "0");
  const nodeOptions = envFileValues.NODE_OPTIONS ?? baseEnv.NODE_OPTIONS;

  return {
    ...baseEnv,
    ...envFileValues,
    ALCHEMY_NO_TUI: baseEnv.ALCHEMY_NO_TUI ?? "1",
    ALCHEMY_PROFILE: baseEnv.ALCHEMY_PROFILE ?? defaultProfile,
    CEIRD_CLOUDFLARE: "1",
    ...(major >= 26
      ? {
          NODE_OPTIONS: appendNodeOption(
            nodeOptions,
            node26ModuleRegisterWarningOption
          ),
        }
      : {}),
  };
}

function readEnvFileValues(envFile) {
  const envFilePath = resolve(repoRoot, envFile);

  if (!existsSync(envFilePath)) {
    return {};
  }

  return parseEnv(readFileSync(envFilePath, "utf8"));
}

export function makeFallbackStage({
  branch = readGitBranch(),
  user = process.env.USER ?? process.env.USERNAME ?? "unknown",
} = {}) {
  if (!branch) {
    throw new Error(
      "Cannot derive an Alchemy stage from a detached worktree. Pass --stage <stage>."
    );
  }

  if (branch === "main" || branch === "master") {
    return `dev_${user}`;
  }

  return branch
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
}

function readGitBranch() {
  const gitHead = resolve(repoRoot, ".git");

  if (!existsSync(gitHead)) {
    return null;
  }

  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

function runAlchemyExec({ env, execPath, options, spawnerUrl }) {
  return Effect.callback((resume) => {
    const child = spawn(
      process.execPath,
      [...makeAlchemyNodeExecArgv(), execPath],
      {
        cwd: repoRoot,
        env: {
          ...env,
          ALCHEMY_EXEC_OPTIONS: JSON.stringify(options),
          ALCHEMY_RPC_SPAWNER_URL: spawnerUrl,
        },
        stdio: "inherit",
      }
    );

    child.on("error", (error) => {
      resume(Effect.fail(error));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resume(Effect.succeed(code ?? 0));
    });
  });
}

async function main() {
  const execPath = fileURLToPath(import.meta.resolve("alchemy/bin/exec.js"));
  const args = process.argv.slice(2);
  const fallbackStage =
    readExplicitAlchemyStageArg(args) ?? makeFallbackStage();
  const initialOptions = makeAlchemyExecOptions({
    args,
    defaultProfile: process.env.ALCHEMY_PROFILE ?? defaultAlchemyProfile,
    envFile: defaultEnvFile,
    fallbackStage,
  });
  const envFileValues = readEnvFileValues(initialOptions.envFile);
  const env = makeAlchemyDevEnvironment({
    baseEnv: process.env,
    defaultProfile: defaultAlchemyProfile,
    envFileValues,
  });
  const options = makeAlchemyExecOptions({
    args: process.argv.slice(2),
    defaultProfile: env.ALCHEMY_PROFILE,
    envFile: initialOptions.envFile,
    fallbackStage,
  });

  if (env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = env.NODE_OPTIONS;
  }
  const exitCode = await Effect.runPromise(
    Effect.gen(function* () {
      const spawner = yield* RpcSpawner;

      return yield* runAlchemyExec({
        env,
        execPath,
        options,
        spawnerUrl: spawner.url,
      });
    }).pipe(
      Effect.provide(
        rpcSpawnerLayerServer({
          envFile: options.envFile,
          profile: options.profile,
        })
      ),
      Effect.provide(PlatformServices)
    )
  );

  process.exit(exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
