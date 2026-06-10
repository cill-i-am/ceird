#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import * as RpcProviderProxy from "alchemy/Local/RpcProviderProxy";
import * as RpcSpawner from "alchemy/Local/RpcSpawner";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import * as Effect from "effect/Effect";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultEnvFile = ".env.local";
const defaultAlchemyProfile = "ceird-env";
const node26ModuleRegisterWarningOption = "--disable-warning=DEP0205";
const portlessLocalBaseName = "ceird";
const portlessLocalTld = "localhost";
const portlessServices = ["agent", "api", "app", "mcp", "sync"];
const portlessOriginEnvKeys = {
  agent: "CEIRD_LOCAL_AGENT_ORIGIN",
  api: "CEIRD_LOCAL_API_ORIGIN",
  app: "CEIRD_LOCAL_APP_ORIGIN",
  mcp: "CEIRD_LOCAL_MCP_ORIGIN",
  sync: "CEIRD_LOCAL_SYNC_ORIGIN",
};

function makeStageSlug(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
  const base = slug.length > 0 ? slug : "stage";

  if (base.length <= 40) {
    return base;
  }

  // Keep long explicit stages DNS-safe while preserving stable uniqueness.
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const prefix = base.slice(0, 31).replaceAll(/-+$/g, "");
  return `${prefix}-${hash}`;
}

export function makePortlessLocalServiceName(service, stage) {
  return `${service}.${makeStageSlug(stage)}.${portlessLocalBaseName}`;
}

export function makeDefaultPortlessLocalServiceOrigin(service, stage) {
  return `https://${makePortlessLocalServiceName(service, stage)}.${portlessLocalTld}`;
}

export function makePortlessOriginEnvKey(service) {
  return portlessOriginEnvKeys[service];
}

export function makePortlessAliasCommand({
  portlessBin = "portless",
  service,
  stage,
  targetPort,
}) {
  return [
    portlessBin,
    "alias",
    makePortlessLocalServiceName(service, stage),
    targetPort,
    "--force",
  ];
}

export function readAlchemyLocalServiceUrlFromLine(line) {
  const match =
    /^\s*["']?(?<service>agent|api|app|mcp|sync)["']?\s*[:=]\s*["']?(?<url>https?:\/\/[^"'\s,]+)/u.exec(
      line
    );

  if (!match?.groups) {
    return;
  }

  const { service, url: rawUrl } = match.groups;

  if (!URL.canParse(rawUrl)) {
    return;
  }

  const url = new URL(rawUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  if (
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "[::1]" &&
    url.hostname !== "::1"
  ) {
    return;
  }

  if (!url.port) {
    return;
  }

  return {
    port: url.port,
    service,
    targetOrigin: url.origin,
  };
}

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

function isPortlessDisabled(env) {
  return env.PORTLESS === "0" || env.PORTLESS === "false";
}

function runPortlessCommand(args, { env, timeout = 10_000 } = {}) {
  return spawnSync("portless", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    timeout,
  });
}

function formatCommandFailure(result) {
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();

  if (stderr) {
    return stderr;
  }

  if (stdout) {
    return stdout;
  }

  if (result.error) {
    return result.error.message;
  }

  return `exit status ${result.status ?? "unknown"}`;
}

function isUnsupportedPortlessPruneFailureMessage(failure) {
  return (
    failure.includes("No command provided") ||
    failure.includes("Unknown command") ||
    failure.includes('Unknown flag "--help"')
  );
}

export function makePortlessPruneFailureWarning(result) {
  const failure = formatCommandFailure(result);

  if (isUnsupportedPortlessPruneFailureMessage(failure)) {
    return "[ceird dev] Installed Portless does not support prune; stage aliases will still be overwritten with --force after Alchemy starts.";
  }

  return `[ceird dev] Portless prune failed; stale aliases may remain. Details: ${failure}`;
}

function readPortlessPublicOrigin({ env, service, stage }) {
  const name = makePortlessLocalServiceName(service, stage);
  const result = runPortlessCommand(["get", "--no-worktree", name], { env });

  if (result.status !== 0) {
    return {
      origin: makeDefaultPortlessLocalServiceOrigin(service, stage),
      warning: `portless get failed for ${name}: ${formatCommandFailure(result)}`,
    };
  }

  const rawUrl = result.stdout.trim();

  if (!URL.canParse(rawUrl)) {
    return {
      origin: makeDefaultPortlessLocalServiceOrigin(service, stage),
      warning: `portless get returned an invalid URL for ${name}: ${rawUrl}`,
    };
  }

  const url = new URL(rawUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      origin: makeDefaultPortlessLocalServiceOrigin(service, stage),
      warning: `portless get returned a non-HTTP URL for ${name}: ${rawUrl}`,
    };
  }

  return { origin: url.origin };
}

function preparePortlessDevOrigins({ baseEnv, stage }) {
  if (isPortlessDisabled(baseEnv)) {
    console.warn(
      "[ceird dev] PORTLESS=0 is set. Alchemy will run, but browser auth requires the stage-scoped Portless app URL."
    );
    return { enabled: false, env: {} };
  }

  const versionResult = runPortlessCommand(["--version"], { env: baseEnv });

  if (versionResult.status !== 0) {
    console.warn(
      `[ceird dev] Portless was not found. Run pnpm install to install the root dev dependency, or set PORTLESS=0 to acknowledge raw Alchemy debug mode. Details: ${formatCommandFailure(versionResult)}`
    );
    return { enabled: false, env: {} };
  }

  const startResult = runPortlessCommand(["proxy", "start"], {
    env: baseEnv,
    timeout: 20_000,
  });

  if (startResult.status !== 0) {
    console.warn(
      `[ceird dev] Portless proxy did not start automatically. Browser auth may not work until the proxy is running. Details: ${formatCommandFailure(startResult)}`
    );
  }

  const pruneResult = runPortlessCommand(["prune"], { env: baseEnv });

  if (pruneResult.status !== 0) {
    console.warn(makePortlessPruneFailureWarning(pruneResult));
  }

  const env = {};

  for (const service of portlessServices) {
    const { origin, warning } = readPortlessPublicOrigin({
      env: baseEnv,
      service,
      stage,
    });

    if (warning) {
      console.warn(`[ceird dev] ${warning}`);
    }

    env[makePortlessOriginEnvKey(service)] = origin;
  }

  console.log(
    `[ceird dev] Portless browser origins are stage-scoped under ${makeStageSlug(stage)}.ceird.localhost.`
  );
  console.log(`[ceird dev] App: ${env.CEIRD_LOCAL_APP_ORIGIN}`);

  return { enabled: true, env };
}

function createPortlessAliasManager({ env, stage }) {
  const registeredPorts = new Map();
  let pending = "";

  function registerServiceTarget(target) {
    if (registeredPorts.get(target.service) === target.port) {
      return;
    }

    const [command, ...args] = makePortlessAliasCommand({
      service: target.service,
      stage,
      targetPort: target.port,
    });
    const result = spawnSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    });

    if (result.status !== 0) {
      console.warn(
        `[ceird dev] Failed to register Portless alias for ${target.service}: ${formatCommandFailure(result)}`
      );
      return;
    }

    registeredPorts.set(target.service, target.port);
    console.log(
      `[ceird dev] Portless alias ${makePortlessLocalServiceName(
        target.service,
        stage
      )} -> ${target.targetOrigin}`
    );
  }

  function observeLine(line) {
    const target = readAlchemyLocalServiceUrlFromLine(line);

    if (target) {
      registerServiceTarget(target);
    }
  }

  return {
    flush() {
      if (pending.length > 0) {
        observeLine(pending);
        pending = "";
      }
    },
    observe(chunk) {
      pending += chunk;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";

      for (const line of lines) {
        observeLine(line);
      }
    },
  };
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

function runAlchemyExec({
  env,
  execPath,
  options,
  portlessAliasManager,
  spawnerUrl,
}) {
  return Effect.callback((resume) => {
    const stdio =
      portlessAliasManager === undefined
        ? "inherit"
        : ["inherit", "pipe", "pipe"];
    const child = spawn(
      process.execPath,
      [...makeAlchemyNodeExecArgv(), execPath],
      {
        cwd: repoRoot,
        env: {
          ...env,
          ALCHEMY_EXEC_OPTIONS: JSON.stringify(options),
          [RpcProviderProxy.SPAWNER_URL_ENV_KEY]: spawnerUrl,
        },
        stdio,
      }
    );

    if (portlessAliasManager !== undefined) {
      child.stdout?.on("data", (chunk) => {
        process.stdout.write(chunk);
        portlessAliasManager.observe(chunk.toString("utf8"));
      });
      child.stderr?.on("data", (chunk) => {
        process.stderr.write(chunk);
        portlessAliasManager.observe(chunk.toString("utf8"));
      });
    }

    child.on("error", (error) => {
      resume(Effect.fail(error));
    });
    child.on("exit", (code, signal) => {
      portlessAliasManager?.flush();

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
  const portless = preparePortlessDevOrigins({
    baseEnv: {
      ...process.env,
      ...envFileValues,
    },
    stage: initialOptions.stage,
  });
  const env = makeAlchemyDevEnvironment({
    baseEnv: process.env,
    defaultProfile: defaultAlchemyProfile,
    envFileValues: {
      ...envFileValues,
      ...portless.env,
    },
  });
  const options = makeAlchemyExecOptions({
    args: process.argv.slice(2),
    defaultProfile: env.ALCHEMY_PROFILE,
    envFile: initialOptions.envFile,
    fallbackStage,
  });
  const portlessAliasManager = portless.enabled
    ? createPortlessAliasManager({
        env,
        stage: options.stage,
      })
    : undefined;

  if (env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = env.NODE_OPTIONS;
  }
  const exitCode = await Effect.runPromise(
    Effect.gen(function* () {
      const spawner = yield* RpcSpawner.RpcSpawner;

      return yield* runAlchemyExec({
        env,
        execPath,
        options,
        portlessAliasManager,
        spawnerUrl: spawner.url,
      });
    }).pipe(
      Effect.provide(
        RpcSpawner.layerServer({
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
