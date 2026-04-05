import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  buildSandboxUrls,
  deriveSandboxIdentity,
  makeSandboxResourceNames,
  reconcileSandboxRecord,
} from "@task-tracker/sandbox-core";
import type {
  SandboxPorts,
  SandboxRecord,
  SandboxUrls,
} from "@task-tracker/sandbox-core";
import { Effect } from "effect";

import { bringSandboxUp } from "./lifecycle.js";
import type { SandboxUpResult } from "./lifecycle.js";
import {
  buildPortlessAliasAddCommands,
  buildPortlessAliasRemoveCommands,
} from "./portless.js";
import { isPortAvailable, isPortOpen, runCommand } from "./process.js";
import { SandboxNotFoundError } from "./sandbox-not-found-error.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";
import { formatSandboxStartupTimeoutLines } from "./sandbox-view.js";

const SANDBOX_PROXY_PORT = 1355;
const SANDBOX_DEV_IMAGE = "task-tracker-sandbox-dev:latest";
const SANDBOX_READY_POLL_INTERVAL_MS = 1000;
const SANDBOX_READY_TIMEOUT_MS = 180_000;
const SANDBOX_DOCKERFILE = path.join(
  "packages",
  "sandbox-cli",
  "docker",
  "sandbox-dev.Dockerfile"
);
const SANDBOX_WORKSPACE_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);
const SANDBOX_DEFAULT_DB = "task_tracker";
const SANDBOX_POSTGRES_PASSWORD = "postgres";
const SANDBOX_POSTGRES_USER = "postgres";
const DEFAULT_AUTH_EMAIL_FROM = "auth@task-tracker.localhost";
const DEFAULT_AUTH_EMAIL_FROM_NAME = "Task Tracker";
const DEFAULT_RESEND_API_KEY = "re_test_placeholder";
const DEFAULT_PORTS: SandboxPorts = {
  app: 4300,
  api: 4301,
  postgres: 5439,
};

interface RegistryPayload {
  readonly sandboxes: readonly SandboxRecord[];
}

export interface WorktreeContext {
  readonly repoRoot: string;
  readonly worktreePath: string;
}

export interface SandboxStatusResult {
  readonly record: SandboxRecord;
  readonly urls: SandboxUrls;
}

export interface SandboxListResult {
  readonly entries: readonly SandboxStatusResult[];
}

export interface SandboxLogResult {
  readonly content: string;
}

export interface WorktreeResolver {
  readonly resolveCurrent: () => Promise<WorktreeContext>;
}

export interface SandboxIdResolver {
  readonly resolve: (
    repoRoot: string,
    worktreePath: string,
    takenSlugs: ReadonlySet<string>
  ) => ReturnType<typeof deriveSandboxIdentity>;
}

export interface SandboxRegistry {
  readonly list: () => Promise<SandboxRecord[]>;
  readonly findByWorktree: (
    worktreePath: string
  ) => Promise<SandboxRecord | undefined>;
  readonly upsert: (record: SandboxRecord) => Promise<void>;
  readonly removeByWorktree: (worktreePath: string) => Promise<void>;
}

export interface DockerEngine {
  readonly ensureAvailable: () => Promise<void>;
  readonly ensureDevImage: () => Promise<string>;
  readonly startStack: (
    record: SandboxRecord,
    aliasesHealthy: boolean
  ) => Promise<void>;
  readonly stopStack: (record: SandboxRecord) => Promise<void>;
  readonly runningContainerNames: () => Promise<Set<string>>;
  readonly collectLogs: (record: SandboxRecord) => Promise<string>;
}

export interface PortAllocator {
  readonly allocate: (
    existing: SandboxPorts | undefined,
    reservedPorts: ReadonlySet<number>
  ) => Promise<SandboxPorts>;
}

export interface PortlessService {
  readonly ensureProxyRunning: () => Promise<void>;
  readonly registerAliases: (record: SandboxRecord) => Promise<void>;
  readonly removeAliases: (record: SandboxRecord) => Promise<void>;
  readonly removeAliasesBySlug: (hostnameSlug: string) => Promise<void>;
}

export interface HealthChecker {
  readonly waitForReady: (record: SandboxRecord) => Promise<void>;
}

export interface SandboxLifecycle {
  readonly up: () => Promise<SandboxUpResult>;
  readonly down: () => Promise<SandboxRecord>;
  readonly status: () => Promise<SandboxStatusResult>;
  readonly list: () => Promise<SandboxListResult>;
  readonly logs: () => Promise<SandboxLogResult>;
  readonly url: () => Promise<SandboxStatusResult>;
}

export interface SandboxRuntime {
  readonly worktreeResolver: WorktreeResolver;
  readonly sandboxIdResolver: SandboxIdResolver;
  readonly sandboxRegistry: SandboxRegistry;
  readonly dockerEngine: DockerEngine;
  readonly portAllocator: PortAllocator;
  readonly portlessService: PortlessService;
  readonly healthChecker: HealthChecker;
  readonly lifecycle: SandboxLifecycle;
}

export function makeSandboxRuntime(): SandboxRuntime {
  const worktreeResolver: WorktreeResolver = {
    resolveCurrent: async () => {
      const worktreeResult = await exec(
        runCommand("git", ["rev-parse", "--show-toplevel"], {
          cwd: process.cwd(),
        })
      );
      const commonDirResult = await exec(
        runCommand("git", ["rev-parse", "--git-common-dir"], {
          cwd: process.cwd(),
        })
      );
      const worktreePath = worktreeResult.stdout.trim();
      const gitCommonDir = commonDirResult.stdout.trim();
      const resolvedCommonDir = path.resolve(worktreePath, gitCommonDir);
      const repoRoot =
        path.basename(resolvedCommonDir) === ".git"
          ? path.dirname(resolvedCommonDir)
          : resolvedCommonDir;

      return {
        repoRoot,
        worktreePath,
      };
    },
  };

  const sandboxIdResolver: SandboxIdResolver = {
    resolve: (repoRoot, worktreePath, takenSlugs) =>
      deriveSandboxIdentity({
        repoRoot,
        worktreePath,
        takenSlugs,
      }),
  };

  const sandboxRegistry: SandboxRegistry = {
    list: async () => {
      const registryPath = getRegistryPath();
      await fs.mkdir(path.dirname(registryPath), { recursive: true });

      try {
        const raw = await fs.readFile(registryPath, "utf8");
        if (raw.trim().length === 0) {
          return [];
        }

        const payload = JSON.parse(raw) as RegistryPayload;
        return [...(payload.sandboxes ?? [])];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw toPreflightError(error, "Failed to read sandbox registry");
      }
    },
    findByWorktree: async (worktreePath) => {
      const records = await sandboxRegistry.list();
      return records.find((record) => record.worktreePath === worktreePath);
    },
    upsert: async (record) => {
      const records = await sandboxRegistry.list();
      const next = [
        ...records.filter(
          (entry) => entry.worktreePath !== record.worktreePath
        ),
        record,
      ];
      await writeRegistryFile(next);
    },
    removeByWorktree: async (worktreePath) => {
      const records = await sandboxRegistry.list();
      await writeRegistryFile(
        records.filter((entry) => entry.worktreePath !== worktreePath)
      );
    },
  };

  const portAllocator: PortAllocator = {
    allocate: async (existing, reservedPorts) => {
      const allocated = new Set<number>();

      const app = await allocateRuntimePort(
        "app",
        existing,
        reservedPorts,
        allocated
      );
      const api = await allocateRuntimePort(
        "api",
        existing,
        reservedPorts,
        allocated
      );
      const postgres = await allocateRuntimePort(
        "postgres",
        existing,
        reservedPorts,
        allocated
      );

      return {
        app,
        api,
        postgres,
      };
    },
  };

  const dockerEngine: DockerEngine = {
    ensureAvailable: async () => {
      await exec(runCommand("docker", ["info"]));
    },
    ensureDevImage: async () => {
      await exec(
        runCommand(
          "docker",
          ["build", "-f", SANDBOX_DOCKERFILE, "-t", SANDBOX_DEV_IMAGE, "."],
          {
            cwd: SANDBOX_WORKSPACE_ROOT,
          }
        )
      );

      return SANDBOX_DEV_IMAGE;
    },
    startStack: async (record, aliasesHealthy) => {
      const resourceNames = makeSandboxResourceNames(record.sandboxId);
      const image = await dockerEngine.ensureDevImage();
      const authOrigin = makeSandboxAuthOrigin({
        hostnameSlug: record.hostnameSlug,
        publishedPort: record.ports.api,
        aliasesHealthy,
      });
      const serverAuthOrigin = makeSandboxServerAuthOrigin({
        apiContainerName: resourceNames.apiContainer,
        publishedPort: record.ports.api,
      });

      await ensureDockerNetwork(resourceNames.network);
      await ensureDockerVolume(resourceNames.postgresVolume);
      await ensureDockerVolume(resourceNames.appNodeModulesVolume);
      await ensureDockerVolume(resourceNames.apiNodeModulesVolume);
      await ensureDockerVolume(resourceNames.pnpmStoreVolume);

      const internalDatabaseUrl =
        `postgresql://${SANDBOX_POSTGRES_USER}:${SANDBOX_POSTGRES_PASSWORD}` +
        `@${resourceNames.postgresContainer}:5432/${SANDBOX_DEFAULT_DB}`;

      await ensurePostgresContainer(record, resourceNames);
      await recreateNodeServiceContainer({
        containerName: resourceNames.apiContainer,
        network: resourceNames.network,
        publishedPort: record.ports.api,
        image,
        worktreePath: record.worktreePath,
        nodeModulesVolume: resourceNames.apiNodeModulesVolume,
        pnpmStoreVolume: resourceNames.pnpmStoreVolume,
        authOrigin,
        serverAuthOrigin,
        filter: "api",
        sandboxId: record.sandboxId,
        databaseUrl: internalDatabaseUrl,
        betterAuthSecret: record.betterAuthSecret,
      });
      await recreateNodeServiceContainer({
        containerName: resourceNames.appContainer,
        network: resourceNames.network,
        publishedPort: record.ports.app,
        image,
        worktreePath: record.worktreePath,
        nodeModulesVolume: resourceNames.appNodeModulesVolume,
        pnpmStoreVolume: resourceNames.pnpmStoreVolume,
        authOrigin,
        serverAuthOrigin,
        filter: "app",
        sandboxId: record.sandboxId,
        databaseUrl: internalDatabaseUrl,
      });
    },
    stopStack: async (record) => {
      const resourceNames = makeSandboxResourceNames(record.sandboxId);
      await removeContainer(resourceNames.appContainer);
      await removeContainer(resourceNames.apiContainer);
      await removeContainer(resourceNames.postgresContainer);
      await exec(
        runCommand("docker", ["network", "rm", resourceNames.network], {
          allowNonZero: true,
        })
      );
    },
    runningContainerNames: async () => {
      const result = await exec(
        runCommand("docker", ["ps", "--format", "{{.Names}}"])
      );
      return new Set(
        result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      );
    },
    collectLogs: async (record) => {
      const sections = await Promise.all([
        collectContainerLogs("app", record.containers.app),
        collectContainerLogs("api", record.containers.api),
        collectContainerLogs("postgres", record.containers.postgres),
      ]);

      return sections.join("\n\n");
    },
  };

  const portlessService: PortlessService = {
    ensureProxyRunning: async () => {
      await exec(
        runCommand("portless", [
          "proxy",
          "start",
          "-p",
          String(SANDBOX_PROXY_PORT),
        ])
      );
    },
    registerAliases: async (record) => {
      const commands = buildPortlessAliasAddCommands({
        hostnameSlug: record.hostnameSlug,
        ports: record.ports,
      });

      for (const [command, ...args] of commands) {
        await exec(runCommand(command, args));
      }
    },
    removeAliases: async (record) => {
      for (const [command, ...args] of buildPortlessAliasRemoveCommands(
        record.hostnameSlug
      )) {
        await exec(runCommand(command, args, { allowNonZero: true }));
      }
    },
    removeAliasesBySlug: async (hostnameSlug) => {
      for (const [command, ...args] of buildPortlessAliasRemoveCommands(
        hostnameSlug
      )) {
        await exec(runCommand(command, args, { allowNonZero: true }));
      }
    },
  };

  const healthChecker: HealthChecker = {
    waitForReady: async (record) => {
      await waitForSandboxServicesReady({
        timeoutMs: SANDBOX_READY_TIMEOUT_MS,
        intervalMs: SANDBOX_READY_POLL_INTERVAL_MS,
        wait: (durationMs) => delay(durationMs),
        createTimeoutError: (readiness) =>
          new SandboxPreflightError({
            message: formatSandboxStartupTimeoutLines({
              hostnameSlug: record.hostnameSlug,
              timeoutMs: SANDBOX_READY_TIMEOUT_MS,
              readiness,
              containers: record.containers,
              urls: buildSandboxUrls(
                {
                  hostnameSlug: record.hostnameSlug,
                  ports: record.ports,
                },
                {
                  aliasesHealthy: false,
                  proxyPort: SANDBOX_PROXY_PORT,
                }
              ),
            }).join("\n"),
          }),
        checkPostgres: async () => {
          const postgresReady = await exec(
            runCommand(
              "docker",
              [
                "exec",
                record.containers.postgres,
                "pg_isready",
                "-U",
                SANDBOX_POSTGRES_USER,
                "-d",
                SANDBOX_DEFAULT_DB,
              ],
              { allowNonZero: true }
            )
          );

          return postgresReady.exitCode === 0;
        },
        checkApi: () =>
          checkHttpHealth(record.ports.api, "api", record.sandboxId),
        checkApp: () =>
          checkHttpHealth(record.ports.app, "app", record.sandboxId),
      });
    },
  };

  const lifecycle: SandboxLifecycle = {
    up: async () => {
      const context = await worktreeResolver.resolveCurrent();
      const records = await sandboxRegistry.list();
      const existingRecord = records.find(
        (record) => record.worktreePath === context.worktreePath
      );
      const takenSlugs = new Set(
        records
          .filter((record) => record.worktreePath !== context.worktreePath)
          .map((record) => record.hostnameSlug)
      );
      const reservedPorts = new Set(
        records
          .filter((record) => record.worktreePath !== context.worktreePath)
          .flatMap((record) => [
            record.ports.app,
            record.ports.api,
            record.ports.postgres,
          ])
      );

      return bringSandboxUp({
        repoRoot: context.repoRoot,
        worktreePath: context.worktreePath,
        now: new Date().toISOString(),
        takenSlugs,
        existingRecord,
        ensurePrerequisites: async () => {
          await dockerEngine.ensureAvailable();
          await portlessService.ensureProxyRunning();
        },
        allocatePorts: () =>
          portAllocator.allocate(existingRecord?.ports, reservedPorts),
        determineAliasesHealthy: async (record) => {
          try {
            await portlessService.registerAliases(record);
            return true;
          } catch {
            await portlessService.removeAliases(record);
            return false;
          }
        },
        startStack: (record, aliasesHealthy) =>
          dockerEngine.startStack(record, aliasesHealthy),
        waitForHealth: (record) => healthChecker.waitForReady(record),
        persist: (record) => sandboxRegistry.upsert(record),
        generateBetterAuthSecret: makeSandboxBetterAuthSecret,
      });
    },
    down: async () => {
      const context = await worktreeResolver.resolveCurrent();
      const record = await sandboxRegistry.findByWorktree(context.worktreePath);
      if (!record) {
        const identity = sandboxIdResolver.resolve(
          context.repoRoot,
          context.worktreePath,
          new Set()
        );
        await portlessService.removeAliasesBySlug(identity.hostnameSlug);
        await stopSandboxResources(identity.sandboxId);

        return makeEphemeralSandboxRecord({
          sandboxId: identity.sandboxId,
          repoRoot: context.repoRoot,
          worktreePath: context.worktreePath,
          hostnameSlug: identity.hostnameSlug,
          status: "stopped",
        });
      }

      await portlessService.removeAliases(record);
      await dockerEngine.stopStack(record);
      await sandboxRegistry.removeByWorktree(context.worktreePath);

      return record;
    },
    status: async () => {
      const context = await worktreeResolver.resolveCurrent();
      const record = await sandboxRegistry.findByWorktree(context.worktreePath);
      if (!record) {
        throw new SandboxNotFoundError({
          worktreePath: context.worktreePath,
          message: "No sandbox is registered for this worktree",
        });
      }

      const containerNames = await dockerEngine.runningContainerNames();
      const portsInUse = new Set<number>();
      if (await isPortOpen(record.ports.app)) {
        portsInUse.add(record.ports.app);
      }
      if (await isPortOpen(record.ports.api)) {
        portsInUse.add(record.ports.api);
      }
      if (await isPortOpen(record.ports.postgres)) {
        portsInUse.add(record.ports.postgres);
      }

      const reconciled = reconcileSandboxRecord(record, {
        containersPresent: containerNames,
        portsInUse,
        now: new Date().toISOString(),
      });
      await sandboxRegistry.upsert(reconciled);

      return {
        record: reconciled,
        urls: buildSandboxUrls(
          {
            hostnameSlug: reconciled.hostnameSlug,
            ports: reconciled.ports,
          },
          {
            aliasesHealthy: true,
            proxyPort: SANDBOX_PROXY_PORT,
          }
        ),
      };
    },
    list: async () => {
      const records = await sandboxRegistry.list();
      return {
        entries: records.map((record) => ({
          record,
          urls: buildSandboxUrls(
            {
              hostnameSlug: record.hostnameSlug,
              ports: record.ports,
            },
            {
              aliasesHealthy: true,
              proxyPort: SANDBOX_PROXY_PORT,
            }
          ),
        })),
      };
    },
    logs: async () => {
      const context = await worktreeResolver.resolveCurrent();
      const record = await sandboxRegistry.findByWorktree(context.worktreePath);
      if (!record) {
        throw new SandboxNotFoundError({
          worktreePath: context.worktreePath,
          message: "No sandbox is registered for this worktree",
        });
      }

      return {
        content: await dockerEngine.collectLogs(record),
      };
    },
    url: () => lifecycle.status(),
  };

  return {
    worktreeResolver,
    sandboxIdResolver,
    sandboxRegistry,
    dockerEngine,
    portAllocator,
    portlessService,
    healthChecker,
    lifecycle,
  };
}

async function exec<A>(
  effect: Effect.Effect<A, SandboxPreflightError | Error | unknown, never>
): Promise<A> {
  try {
    return await Effect.runPromise(effect);
  } catch (error) {
    throw error instanceof Error
      ? error
      : toPreflightError(error, "Sandbox command failed");
  }
}

function getRegistryPath(): string {
  return path.join(os.homedir(), ".task-tracker", "sandboxes", "registry.json");
}

async function writeRegistryFile(
  records: readonly SandboxRecord[]
): Promise<void> {
  const registryPath = getRegistryPath();
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(
    registryPath,
    `${JSON.stringify({ sandboxes: records }, null, 2)}\n`,
    "utf8"
  );
}

async function allocateRuntimePort(
  service: keyof SandboxPorts,
  existing: SandboxPorts | undefined,
  reservedPorts: ReadonlySet<number>,
  allocated: Set<number>
): Promise<number> {
  const existingPort = existing?.[service];
  if (
    existingPort !== undefined &&
    !reservedPorts.has(existingPort) &&
    !allocated.has(existingPort)
  ) {
    allocated.add(existingPort);
    return existingPort;
  }

  const protectedExistingPorts = new Set<number>();
  for (const [otherService, port] of Object.entries(existing ?? {})) {
    if (
      otherService !== service &&
      port !== undefined &&
      !reservedPorts.has(port)
    ) {
      protectedExistingPorts.add(port);
    }
  }

  let port = DEFAULT_PORTS[service];
  while (
    reservedPorts.has(port) ||
    protectedExistingPorts.has(port) ||
    allocated.has(port) ||
    !(await isPortAvailable(port))
  ) {
    port += 1;
    if (port > DEFAULT_PORTS[service] + 100) {
      throw new SandboxPreflightError({
        message: `Could not allocate a free ${service} port in the sandbox range`,
      });
    }
  }

  allocated.add(port);
  return port;
}

async function ensureDockerNetwork(name: string): Promise<void> {
  const inspect = await exec(
    runCommand("docker", ["network", "inspect", name], { allowNonZero: true })
  );
  if (inspect.exitCode !== 0) {
    await exec(runCommand("docker", ["network", "create", name]));
  }
}

async function ensureDockerVolume(name: string): Promise<void> {
  await exec(runCommand("docker", ["volume", "create", name]));
}

async function ensurePostgresContainer(
  record: SandboxRecord,
  resourceNames: ReturnType<typeof makeSandboxResourceNames>
): Promise<void> {
  const inspect = await exec(
    runCommand(
      "docker",
      ["container", "inspect", resourceNames.postgresContainer],
      { allowNonZero: true }
    )
  );
  if (inspect.exitCode === 0) {
    const [container] = JSON.parse(inspect.stdout) as readonly {
      readonly HostConfig?: {
        readonly PortBindings?: Record<
          string,
          readonly { readonly HostPort?: string }[] | null
        >;
      };
      readonly NetworkSettings?: {
        readonly Networks?: Record<string, unknown>;
      };
    }[];

    const hostPort =
      container?.HostConfig?.PortBindings?.["5432/tcp"]?.[0]?.HostPort;
    const attachedToSandboxNetwork = Boolean(
      container?.NetworkSettings?.Networks?.[resourceNames.network]
    );

    if (
      hostPort === String(record.ports.postgres) &&
      attachedToSandboxNetwork
    ) {
      await exec(
        runCommand("docker", ["start", resourceNames.postgresContainer], {
          allowNonZero: true,
        })
      );
      return;
    }

    await removeContainer(resourceNames.postgresContainer);
  }

  await exec(
    runCommand("docker", [
      "run",
      "-d",
      "--name",
      resourceNames.postgresContainer,
      "--network",
      resourceNames.network,
      "-p",
      `127.0.0.1:${record.ports.postgres}:5432`,
      "-e",
      `POSTGRES_DB=${SANDBOX_DEFAULT_DB}`,
      "-e",
      `POSTGRES_PASSWORD=${SANDBOX_POSTGRES_PASSWORD}`,
      "-e",
      `POSTGRES_USER=${SANDBOX_POSTGRES_USER}`,
      "-v",
      `${resourceNames.postgresVolume}:/var/lib/postgresql/data`,
      "postgres:16-alpine",
    ])
  );
}

interface RecreateNodeServiceContainerOptions {
  readonly containerName: string;
  readonly network: string;
  readonly publishedPort: number;
  readonly image: string;
  readonly worktreePath: string;
  readonly nodeModulesVolume: string;
  readonly pnpmStoreVolume: string;
  readonly authOrigin: string;
  readonly serverAuthOrigin: string;
  readonly filter: "app" | "api";
  readonly sandboxId: string;
  readonly databaseUrl: string;
  readonly betterAuthSecret?: string;
}

export function makeNodeServiceEnvironmentEntries(options: {
  readonly authOrigin: string;
  readonly databaseUrl: string;
  readonly filter: "app" | "api";
  readonly publishedPort: number;
  readonly serverAuthOrigin: string;
  readonly sandboxId: string;
  readonly betterAuthSecret?: string;
}): string[] {
  const authEmailFrom = process.env.AUTH_EMAIL_FROM ?? DEFAULT_AUTH_EMAIL_FROM;
  const authEmailFromName =
    process.env.AUTH_EMAIL_FROM_NAME ?? DEFAULT_AUTH_EMAIL_FROM_NAME;
  const resendApiKey = process.env.RESEND_API_KEY ?? DEFAULT_RESEND_API_KEY;

  return [
    "HOST=0.0.0.0",
    `PORT=${options.publishedPort}`,
    `SANDBOX_ID=${options.sandboxId}`,
    "TASK_TRACKER_SANDBOX=1",
    `DATABASE_URL=${options.databaseUrl}`,
    ...(options.filter === "app"
      ? [
          `AUTH_ORIGIN=${options.serverAuthOrigin}`,
          `VITE_AUTH_ORIGIN=${options.authOrigin}`,
        ]
      : []),
    ...(options.filter === "api"
      ? [
          `AUTH_EMAIL_FROM=${authEmailFrom}`,
          `AUTH_EMAIL_FROM_NAME=${authEmailFromName}`,
          ...(options.betterAuthSecret
            ? [`BETTER_AUTH_SECRET=${options.betterAuthSecret}`]
            : []),
          `BETTER_AUTH_BASE_URL=${options.authOrigin}`,
          `RESEND_API_KEY=${resendApiKey}`,
        ]
      : []),
    "PNPM_STORE_DIR=/pnpm/store",
  ];
}

async function recreateNodeServiceContainer(
  options: RecreateNodeServiceContainerOptions
): Promise<void> {
  const environmentEntries = makeNodeServiceEnvironmentEntries({
    authOrigin: options.authOrigin,
    databaseUrl: options.databaseUrl,
    filter: options.filter,
    publishedPort: options.publishedPort,
    serverAuthOrigin: options.serverAuthOrigin,
    sandboxId: options.sandboxId,
    betterAuthSecret: options.betterAuthSecret,
  });

  await removeContainer(options.containerName);
  await exec(
    runCommand("docker", [
      "run",
      "-d",
      "--name",
      options.containerName,
      "--network",
      options.network,
      "-p",
      `127.0.0.1:${options.publishedPort}:${options.publishedPort}`,
      ...environmentEntries.flatMap((entry) => ["-e", entry]),
      "-v",
      `${options.worktreePath}:/workspace`,
      "-v",
      `${options.nodeModulesVolume}:/workspace/node_modules`,
      "-v",
      `${options.pnpmStoreVolume}:/pnpm/store`,
      "-w",
      "/workspace",
      options.image,
      options.filter,
    ])
  );
}

function makeSandboxBetterAuthSecret(): string {
  return randomBytes(32).toString("hex");
}

function makeSandboxAuthOrigin(options: {
  readonly hostnameSlug: string;
  readonly publishedPort: number;
  readonly aliasesHealthy: boolean;
}): string {
  return options.aliasesHealthy
    ? `https://${options.hostnameSlug}.api.task-tracker.localhost:${SANDBOX_PROXY_PORT}`
    : `http://127.0.0.1:${options.publishedPort}`;
}

function makeSandboxServerAuthOrigin(options: {
  readonly apiContainerName: string;
  readonly publishedPort: number;
}): string {
  return `http://${options.apiContainerName}:${options.publishedPort}`;
}

async function removeContainer(name: string): Promise<void> {
  await exec(runCommand("docker", ["rm", "-f", name], { allowNonZero: true }));
}

async function stopSandboxResources(sandboxId: string): Promise<void> {
  const resourceNames = makeSandboxResourceNames(sandboxId);
  await removeContainer(resourceNames.appContainer);
  await removeContainer(resourceNames.apiContainer);
  await removeContainer(resourceNames.postgresContainer);
  await exec(
    runCommand("docker", ["network", "rm", resourceNames.network], {
      allowNonZero: true,
    })
  );
}

async function collectContainerLogs(
  label: string,
  containerName: string
): Promise<string> {
  const result = await exec(
    runCommand("docker", ["logs", "--tail", "200", containerName], {
      allowNonZero: true,
    })
  );
  const content = [result.stdout.trim(), result.stderr.trim()]
    .filter(Boolean)
    .join("\n");
  return `## ${label}\n${content || "(no logs available)"}`;
}

export async function waitForSandboxServicesReady(options: {
  readonly timeoutMs: number;
  readonly intervalMs: number;
  readonly wait: (durationMs: number) => Promise<void>;
  readonly createTimeoutError?: (
    readiness: SandboxServiceReadiness
  ) => SandboxPreflightError;
  readonly checkPostgres: () => Promise<boolean>;
  readonly checkApi: () => Promise<boolean>;
  readonly checkApp: () => Promise<boolean>;
}): Promise<void> {
  let remainingMs = options.timeoutMs;
  let readiness: SandboxServiceReadiness = {
    postgres: false,
    api: false,
    app: false,
  };

  while (remainingMs > 0) {
    const [postgresReady, apiReady, appReady] = await Promise.all([
      options.checkPostgres(),
      options.checkApi(),
      options.checkApp(),
    ]);

    readiness = {
      postgres: postgresReady,
      api: apiReady,
      app: appReady,
    };

    if (postgresReady && apiReady && appReady) {
      return;
    }

    remainingMs -= options.intervalMs;
    if (remainingMs <= 0) {
      break;
    }

    await options.wait(options.intervalMs);
  }

  throw (
    options.createTimeoutError?.(readiness) ??
    new SandboxPreflightError({
      message:
        "Sandbox containers started but did not become healthy within 180 seconds",
    })
  );
}

async function checkHttpHealth(
  port: number,
  service: "app" | "api",
  sandboxId: string
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as {
      service?: string;
      sandboxId?: string;
      ok?: boolean;
    };
    return (
      body.ok === true &&
      body.service === service &&
      body.sandboxId === sandboxId
    );
  } catch {
    return false;
  }
}

function toPreflightError(
  error: unknown,
  fallback: string
): SandboxPreflightError {
  return new SandboxPreflightError({
    message: error instanceof Error ? error.message : fallback,
  });
}

interface SandboxServiceReadiness {
  readonly postgres: boolean;
  readonly api: boolean;
  readonly app: boolean;
}

function makeEphemeralSandboxRecord(input: {
  readonly sandboxId: string;
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly hostnameSlug: string;
  readonly status: SandboxRecord["status"];
}): SandboxRecord {
  const resourceNames = makeSandboxResourceNames(input.sandboxId);
  const now = new Date().toISOString();

  return {
    sandboxId: input.sandboxId,
    repoRoot: input.repoRoot,
    worktreePath: input.worktreePath,
    hostnameSlug: input.hostnameSlug,
    status: input.status,
    containers: {
      app: resourceNames.appContainer,
      api: resourceNames.apiContainer,
      postgres: resourceNames.postgresContainer,
    },
    ports: DEFAULT_PORTS,
    hostnames: {
      app: `${input.hostnameSlug}.app.task-tracker.localhost`,
      api: `${input.hostnameSlug}.api.task-tracker.localhost`,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
    missingResources: ["app", "api", "postgres"],
  };
}
