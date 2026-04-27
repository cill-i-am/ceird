/* oxlint-disable eslint/max-classes-per-file */

import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  buildSandboxUrls,
  reconcileSandboxRecord,
} from "@task-tracker/sandbox-core";
import type {
  SandboxDockerVolumeNameType as SandboxDockerVolumeName,
  MissingSandboxResource,
  SandboxNameType as SandboxName,
  SandboxPorts,
  SandboxRecord,
  SandboxRuntimeAssetsShape as SandboxRuntimeAssets,
  SandboxRuntimeSpec,
  SandboxUrls,
} from "@task-tracker/sandbox-core";
import {
  loadSandboxSharedEnvironment,
  SANDBOX_REGISTRY_ERROR_TAG,
  SandboxEnvironmentError,
} from "@task-tracker/sandbox-core/node";
import type {
  SandboxRegistryError,
  SandboxRegistryRecord,
} from "@task-tracker/sandbox-core/node";
import { Effect, Layer, Schema } from "effect";

import {
  buildComposeCommandArgs,
  renderComposeEnvironmentFile,
} from "./compose.js";
import type { SandboxFileSystem } from "./filesystem.js";
import { SandboxFileSystemService } from "./filesystem.js";
import type { SandboxHttpHealth } from "./http-health.js";
import { SandboxHttpHealthService } from "./http-health.js";
import { bringSandboxUp } from "./lifecycle.js";
import type { SandboxUpResult } from "./lifecycle.js";
import { makePortlessAliasCommands } from "./portless.js";
import type { SandboxProcess } from "./process.js";
import { SandboxProcessService } from "./process.js";
import {
  ensureSandboxStateDir,
  getComposeEnvFilePath,
  getSandboxStateRoot,
  readRegistry,
  writeSandboxStateFile,
  writeRegistry,
} from "./registry.js";
import { resolveSandboxRuntimeAssets } from "./runtime-assets.js";
import {
  SANDBOX_NOT_FOUND_ERROR_TAG,
  SandboxNotFoundError,
} from "./sandbox-not-found-error.js";
import {
  SANDBOX_PREFLIGHT_ERROR_TAG,
  SandboxPreflightError,
  toSandboxPreflightError,
} from "./sandbox-preflight-error.js";
import { formatSandboxStartupTimeoutLines } from "./sandbox-view.js";
import {
  noopSandboxStartupProgressReporter,
  sandboxStartupReadinessEquals,
} from "./startup-progress.js";
import type {
  SandboxHealthProgressListener,
  SandboxStartupProgressReporter,
  SandboxStartupReadiness,
} from "./startup-progress.js";

const SANDBOX_PROXY_PORT = 1355;
const SANDBOX_READY_POLL_INTERVAL_MS = 1000;
const SANDBOX_READY_TIMEOUT_MS = 180_000;
const SANDBOX_STOP_TIMEOUT_SECONDS = 2;
const AUTH_EMAIL_SHARED_ENV_KEYS = [
  "AUTH_EMAIL_FROM",
  "AUTH_EMAIL_FROM_NAME",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const;
const AUTH_EMAIL_REQUIRED_ENV_KEYS = [
  "AUTH_EMAIL_FROM",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
] as const;
const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

const authEmailSharedEnvironmentFields = {
  AUTH_EMAIL_FROM: Schema.String.pipe(
    Schema.filter((value: string) => isValidEmailAddress(value)),
    Schema.annotations({
      message: () => "AUTH_EMAIL_FROM must be a valid email address",
    })
  ),
  AUTH_EMAIL_FROM_NAME: Schema.optionalWith(Schema.String, {
    default: () => "Task Tracker",
  }),
  CLOUDFLARE_ACCOUNT_ID: Schema.String.pipe(
    Schema.filter((value: string) => value.trim().length > 0),
    Schema.annotations({
      message: () => "CLOUDFLARE_ACCOUNT_ID must not be empty",
    })
  ),
  CLOUDFLARE_API_TOKEN: Schema.String.pipe(
    Schema.filter((value: string) => value.trim().length > 0),
    Schema.annotations({
      message: () => "CLOUDFLARE_API_TOKEN must not be empty",
    })
  ),
};
export const AuthEmailSharedEnvironment = Schema.Struct(
  authEmailSharedEnvironmentFields
);
type AuthEmailSharedEnvironment = Schema.Schema.Type<
  typeof AuthEmailSharedEnvironment
>;
type AuthEmailSharedEnvironmentOverrides = {
  readonly [K in keyof AuthEmailSharedEnvironment]: string;
};
const SANDBOX_COMPOSE_FILE = path.join(
  fileURLToPath(new URL("../docker", import.meta.url)),
  "sandbox.compose.yaml"
);
const DEFAULT_PORTS: SandboxPorts = {
  app: 4300,
  api: 4301,
  postgres: 5439,
};

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

export interface SandboxCommandOptions {
  readonly explicitSandboxName?: SandboxName;
}

export interface SandboxUpCommandOptions extends SandboxCommandOptions {
  readonly reportProgress?: SandboxStartupProgressReporter;
}

export interface SandboxLogsOptions extends SandboxCommandOptions {
  readonly service?: MissingSandboxResource;
}

type SandboxPreflightEffect<A> = Effect.Effect<A, SandboxPreflightError, never>;
type SandboxRegistryEffect<A> = Effect.Effect<A, SandboxRegistryError, never>;
type SandboxRuntimeError =
  | SandboxNotFoundError
  | SandboxPreflightError
  | SandboxRegistryError;
type SandboxRuntimeEffect<A> = Effect.Effect<A, SandboxRuntimeError, never>;

export interface WorktreeResolver {
  readonly resolveCurrent: () => SandboxPreflightEffect<WorktreeContext>;
}

export interface SandboxRegistry {
  readonly list: () => SandboxRegistryEffect<SandboxRegistryRecord[]>;
  readonly findByWorktree: (
    worktreePath: string
  ) => SandboxRegistryEffect<SandboxRegistryRecord | undefined>;
  readonly findByName: (
    sandboxName: SandboxName
  ) => SandboxRegistryEffect<SandboxRegistryRecord | undefined>;
  readonly upsert: (
    record: SandboxRegistryRecord
  ) => SandboxRegistryEffect<void>;
  readonly remove: (sandboxName: SandboxName) => SandboxRegistryEffect<void>;
}

export interface ComposeEngine {
  readonly ensureAvailable: () => SandboxPreflightEffect<void>;
  readonly startStack: (record: SandboxRecord) => SandboxPreflightEffect<void>;
  readonly stopStack: (record: SandboxRecord) => SandboxPreflightEffect<void>;
  readonly runningServices: (
    record: SandboxRecord
  ) => SandboxPreflightEffect<Set<MissingSandboxResource>>;
  readonly collectLogs: (
    record: SandboxRecord,
    service?: MissingSandboxResource
  ) => SandboxPreflightEffect<string>;
}

export interface PortAllocator {
  readonly allocate: (
    existing: SandboxPorts | undefined,
    reservedPorts: ReadonlySet<number>
  ) => SandboxPreflightEffect<SandboxPorts>;
}

export interface PortlessService {
  readonly ensureProxyRunning: () => SandboxPreflightEffect<void>;
  readonly registerAliases: (
    sandboxName: SandboxName,
    ports: SandboxPorts
  ) => SandboxPreflightEffect<void>;
  readonly removeAliases: (
    sandboxName: SandboxName,
    ports: SandboxPorts
  ) => SandboxPreflightEffect<void>;
}

export interface HealthChecker {
  readonly waitForReady: (
    record: SandboxRecord,
    listener: SandboxHealthProgressListener
  ) => SandboxPreflightEffect<void>;
}

export interface SandboxLifecycle {
  readonly up: (
    options?: SandboxUpCommandOptions
  ) => SandboxRuntimeEffect<SandboxUpResult>;
  readonly down: (
    options?: SandboxCommandOptions
  ) => SandboxRuntimeEffect<SandboxRecord>;
  readonly status: (
    options?: SandboxCommandOptions
  ) => SandboxRuntimeEffect<SandboxStatusResult>;
  readonly list: () => SandboxRuntimeEffect<SandboxListResult>;
  readonly logs: (
    options?: SandboxLogsOptions
  ) => SandboxRuntimeEffect<SandboxLogResult>;
  readonly url: (
    options?: SandboxCommandOptions
  ) => SandboxRuntimeEffect<SandboxStatusResult>;
}

export interface SandboxRuntime {
  readonly worktreeResolver: WorktreeResolver;
  readonly sandboxRegistry: SandboxRegistry;
  readonly composeEngine: ComposeEngine;
  readonly portAllocator: PortAllocator;
  readonly portlessService: PortlessService;
  readonly healthChecker: HealthChecker;
  readonly lifecycle: SandboxLifecycle;
}

interface RegisteredAliases {
  readonly sandboxName: SandboxName;
  readonly ports: SandboxPorts;
}

export class SandboxWorktreeResolverService extends Effect.Service<SandboxWorktreeResolverService>()(
  "@task-tracker/sandbox-cli/SandboxWorktreeResolverService",
  {
    accessors: true,
    dependencies: [SandboxProcessService.Default],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      return makeWorktreeResolver(sandboxProcess);
    }),
  }
) {}

export class SandboxRegistryService extends Effect.Service<SandboxRegistryService>()(
  "@task-tracker/sandbox-cli/SandboxRegistryService",
  {
    accessors: true,
    effect: Effect.succeed(makeSandboxRegistryService()),
  }
) {}

export class SandboxPortAllocatorService extends Effect.Service<SandboxPortAllocatorService>()(
  "@task-tracker/sandbox-cli/SandboxPortAllocatorService",
  {
    accessors: true,
    dependencies: [SandboxProcessService.Default],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      return makePortAllocator(sandboxProcess);
    }),
  }
) {}

export class SandboxComposeEngineService extends Effect.Service<SandboxComposeEngineService>()(
  "@task-tracker/sandbox-cli/SandboxComposeEngineService",
  {
    accessors: true,
    dependencies: [
      SandboxProcessService.Default,
      SandboxFileSystemService.Default,
    ],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      const sandboxFileSystem = yield* SandboxFileSystemService;
      return makeComposeEngine(sandboxProcess, sandboxFileSystem);
    }),
  }
) {}

export class SandboxPortlessService extends Effect.Service<SandboxPortlessService>()(
  "@task-tracker/sandbox-cli/SandboxPortlessService",
  {
    accessors: true,
    dependencies: [SandboxProcessService.Default],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      return makePortlessService(sandboxProcess);
    }),
  }
) {}

export class SandboxHealthCheckerService extends Effect.Service<SandboxHealthCheckerService>()(
  "@task-tracker/sandbox-cli/SandboxHealthCheckerService",
  {
    accessors: true,
    dependencies: [
      SandboxProcessService.Default,
      SandboxHttpHealthService.Default,
    ],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      const sandboxHttpHealth = yield* SandboxHttpHealthService;
      return makeHealthChecker(sandboxProcess, sandboxHttpHealth);
    }),
  }
) {}

export class SandboxLifecycleService extends Effect.Service<SandboxLifecycleService>()(
  "@task-tracker/sandbox-cli/SandboxLifecycleService",
  {
    accessors: true,
    dependencies: [
      SandboxWorktreeResolverService.Default,
      SandboxRegistryService.Default,
      SandboxPortAllocatorService.Default,
      SandboxComposeEngineService.Default,
      SandboxPortlessService.Default,
      SandboxHealthCheckerService.Default,
    ],
    effect: Effect.gen(function* () {
      const sandboxProcess = yield* SandboxProcessService;
      const worktreeResolver = yield* SandboxWorktreeResolverService;
      const sandboxRegistry = yield* SandboxRegistryService;
      const portAllocator = yield* SandboxPortAllocatorService;
      const composeEngine = yield* SandboxComposeEngineService;
      const portlessService = yield* SandboxPortlessService;
      const healthChecker = yield* SandboxHealthCheckerService;

      return makeSandboxLifecycle({
        sandboxProcess,
        worktreeResolver,
        sandboxRegistry,
        composeEngine,
        portAllocator,
        portlessService,
        healthChecker,
      });
    }),
  }
) {}

export const SandboxCliLive = Layer.mergeAll(
  SandboxProcessService.Default,
  SandboxFileSystemService.Default,
  SandboxHttpHealthService.Default,
  SandboxLifecycleService.Default
);

function makeWorktreeResolver(
  sandboxProcess: SandboxProcess
): WorktreeResolver {
  return {
    resolveCurrent: Effect.fn("SandboxRuntime.resolveCurrent")(function* () {
      const cwd = yield* sandboxProcess.cwd();
      const worktreeResult = yield* exec(
        sandboxProcess.runCommand("git", ["rev-parse", "--show-toplevel"], {
          cwd,
        })
      );
      const commonDirResult = yield* exec(
        sandboxProcess.runCommand("git", ["rev-parse", "--git-common-dir"], {
          cwd,
        })
      );
      const worktreePath = worktreeResult.stdout.trim();
      const gitCommonDir = commonDirResult.stdout.trim();
      const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
        ? gitCommonDir
        : path.resolve(cwd, gitCommonDir);
      const repoRoot = resolveRepoRootFromGitPaths(
        worktreePath,
        absoluteGitCommonDir
      );

      return {
        repoRoot,
        worktreePath,
      };
    }),
  };
}

function makeSandboxRegistryService(): SandboxRegistry {
  return {
    list: () => readRegistry().pipe(Effect.map((records) => [...records])),
    findByWorktree: (worktreePath) =>
      Effect.gen(function* () {
        const records = yield* readRegistry();
        return records.find((record) => record.worktreePath === worktreePath);
      }),
    findByName: (sandboxName) =>
      Effect.gen(function* () {
        const records = yield* readRegistry();
        return records.find((record) => record.sandboxName === sandboxName);
      }),
    upsert: (record) =>
      Effect.gen(function* () {
        const records = yield* readRegistry();
        yield* writeRegistry([
          ...records.filter(
            (entry) => entry.sandboxName !== record.sandboxName
          ),
          record,
        ]);
      }),
    remove: (sandboxName) =>
      Effect.gen(function* () {
        const records = yield* readRegistry();
        yield* writeRegistry(
          records.filter((entry) => entry.sandboxName !== sandboxName)
        );
      }),
  };
}

function makePortAllocator(sandboxProcess: SandboxProcess): PortAllocator {
  return {
    allocate: Effect.fn("SandboxRuntime.allocatePorts")(
      function* (existing, reservedPorts) {
        const allocated = new Set<number>();
        const app = yield* allocateRuntimePort(
          "app",
          sandboxProcess,
          existing,
          reservedPorts,
          allocated
        );
        const api = yield* allocateRuntimePort(
          "api",
          sandboxProcess,
          existing,
          reservedPorts,
          allocated
        );
        const postgres = yield* allocateRuntimePort(
          "postgres",
          sandboxProcess,
          existing,
          reservedPorts,
          allocated
        );

        return { app, api, postgres };
      }
    ),
  };
}

function makeComposeEngine(
  sandboxProcess: SandboxProcess,
  sandboxFileSystem: SandboxFileSystem
): ComposeEngine {
  return {
    ensureAvailable: Effect.fn("SandboxRuntime.ensureComposeAvailable")(
      function* () {
        yield* exec(sandboxProcess.runCommand("docker", ["info"]));
        yield* exec(
          sandboxProcess.runCommand("docker", ["compose", "version"])
        );
      }
    ),
    startStack: Effect.fn("SandboxRuntime.startComposeStack")(
      function* (record) {
        const imageReady = yield* ensureSandboxDevImage(
          sandboxProcess,
          sandboxFileSystem,
          record
        );
        yield* Effect.all(
          [
            ensureSandboxSharedVolumes(
              sandboxProcess,
              sandboxFileSystem,
              record.runtimeAssets
            ),
            ensureComposeEnvironmentFile(sandboxFileSystem, record),
          ],
          { concurrency: "unbounded" }
        );
        const startCompose = () =>
          exec(
            sandboxProcess.runCommand(
              "docker",
              composeArgs(record, ["up", "-d"])
            )
          );

        yield* startCompose().pipe(
          Effect.catchIf(
            (error) => imageReady === "marker" && isMissingImageError(error),
            () =>
              ensureSandboxDevImage(sandboxProcess, sandboxFileSystem, record, {
                forceInspect: true,
              }).pipe(Effect.zipRight(startCompose()))
          )
        );
      }
    ),
    stopStack: Effect.fn("SandboxRuntime.stopComposeStack")(function* (record) {
      yield* ensureComposeEnvironmentFile(sandboxFileSystem, record);
      yield* exec(
        sandboxProcess.runCommand(
          "docker",
          composeArgs(record, [
            "down",
            "--timeout",
            String(SANDBOX_STOP_TIMEOUT_SECONDS),
          ]),
          { allowNonZero: true }
        )
      );
      yield* sandboxFileSystem
        .removeTree(path.dirname(getComposeEnvFilePath(record.sandboxName)))
        .pipe(
          Effect.mapError((error) =>
            toPreflightError(
              error,
              `Failed to remove sandbox state for ${record.sandboxName}`
            )
          )
        );
    }),
    runningServices: Effect.fn("SandboxRuntime.runningComposeServices")(
      function* (record) {
        yield* ensureComposeEnvironmentFile(sandboxFileSystem, record);
        const result = yield* exec(
          sandboxProcess.runCommand(
            "docker",
            composeArgs(record, ["ps", "--services", "--status", "running"]),
            { allowNonZero: true }
          )
        );

        return new Set(
          result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(
              (line): line is MissingSandboxResource =>
                line === "app" || line === "api" || line === "postgres"
            )
        );
      }
    ),
    collectLogs: Effect.fn("SandboxRuntime.collectComposeLogs")(
      function* (record, service) {
        yield* ensureComposeEnvironmentFile(sandboxFileSystem, record);
        const result = yield* exec(
          sandboxProcess.runCommand(
            "docker",
            composeArgs(record, [
              "logs",
              "--tail",
              "200",
              ...(service ? [service] : []),
            ]),
            { allowNonZero: true }
          )
        );

        return [result.stdout.trim(), result.stderr.trim()]
          .filter(Boolean)
          .join("\n");
      }
    ),
  };
}

function makePortlessService(sandboxProcess: SandboxProcess): PortlessService {
  return {
    ensureProxyRunning: Effect.fn("SandboxRuntime.ensurePortlessProxy")(
      function* () {
        yield* exec(
          sandboxProcess.runCommand("pnpm", [
            "exec",
            "portless",
            "proxy",
            "start",
            "-p",
            String(SANDBOX_PROXY_PORT),
          ])
        );
      }
    ),
    registerAliases: Effect.fn("SandboxRuntime.registerPortlessAliases")(
      function* (sandboxName, ports) {
        const commands = makePortlessAliasCommands({ sandboxName, ports });
        yield* Effect.forEach(
          commands.add,
          ([command, ...args]) =>
            exec(sandboxProcess.runCommand(command, args)),
          {
            concurrency: "unbounded",
            discard: true,
          }
        );
      }
    ),
    removeAliases: Effect.fn("SandboxRuntime.removePortlessAliases")(
      function* (sandboxName, ports) {
        const commands = makePortlessAliasCommands({ sandboxName, ports });
        yield* Effect.forEach(
          commands.remove,
          ([command, ...args]) =>
            exec(
              sandboxProcess.runCommand(command, args, { allowNonZero: true })
            ),
          {
            concurrency: "unbounded",
            discard: true,
          }
        );
      }
    ),
  };
}

function makeHealthChecker(
  sandboxProcess: SandboxProcess,
  sandboxHttpHealth: SandboxHttpHealth
): HealthChecker {
  return {
    waitForReady: Effect.fn("SandboxRuntime.waitForReady")(
      function* (record, listener) {
        yield* Effect.annotateCurrentSpan("sandboxName", record.sandboxName);
        yield* Effect.annotateCurrentSpan(
          "composeProjectName",
          record.composeProjectName
        );
        yield* waitForSandboxServicesReady({
          timeoutMs: SANDBOX_READY_TIMEOUT_MS,
          intervalMs: SANDBOX_READY_POLL_INTERVAL_MS,
          wait: (durationMs) =>
            tryPromisePreflight("Sandbox readiness polling failed", () =>
              delay(durationMs)
            ),
          onReadinessChanged: listener.onReadinessChanged,
          createTimeoutError: (readiness) =>
            new SandboxPreflightError({
              message: formatSandboxStartupTimeoutLines({
                sandboxName: record.sandboxName,
                composeProjectName: record.composeProjectName,
                timeoutMs: SANDBOX_READY_TIMEOUT_MS,
                readiness,
                urls: buildRecordUrls(record),
              }).join("\n"),
            }),
          checkPostgres: () =>
            checkLocalPortOpen(sandboxProcess, record.ports.postgres),
          checkApi: () =>
            sandboxHttpHealth.check(record.ports.api, "api", record.sandboxId),
          checkApp: () =>
            sandboxHttpHealth.check(record.ports.app, "app", record.sandboxId),
        });
      }
    ),
  };
}

function makeSandboxLifecycle(input: {
  readonly sandboxProcess: SandboxProcess;
  readonly worktreeResolver: WorktreeResolver;
  readonly sandboxRegistry: SandboxRegistry;
  readonly composeEngine: ComposeEngine;
  readonly portAllocator: PortAllocator;
  readonly portlessService: PortlessService;
  readonly healthChecker: HealthChecker;
}): SandboxLifecycle {
  const resolveSandboxRecord = (
    options: SandboxCommandOptions
  ): SandboxRuntimeEffect<SandboxRegistryRecord> =>
    resolveSandboxRecordFromOptions({
      options,
      sandboxProcess: input.sandboxProcess,
      sandboxRegistry: input.sandboxRegistry,
      worktreeResolver: input.worktreeResolver,
    });

  const lifecycle: SandboxLifecycle = {
    up: Effect.fn("SandboxRuntime.up")(function* (
      options: SandboxUpCommandOptions = {}
    ) {
      const context = yield* input.worktreeResolver.resolveCurrent();
      yield* Effect.annotateCurrentSpan("worktreePath", context.worktreePath);
      yield* Effect.annotateCurrentSpan("repoRoot", context.repoRoot);
      if (options.explicitSandboxName) {
        yield* Effect.annotateCurrentSpan(
          "sandboxName",
          options.explicitSandboxName
        );
      }
      const records = yield* input.sandboxRegistry.list();
      const conflictingNameRecord = options.explicitSandboxName
        ? records.find(
            (record) =>
              record.sandboxName === options.explicitSandboxName &&
              record.worktreePath !== context.worktreePath
          )
        : undefined;
      const existingRecord = records.find(
        (record) => record.worktreePath === context.worktreePath
      );
      const isRenamingSandbox =
        existingRecord !== undefined &&
        options.explicitSandboxName !== undefined &&
        existingRecord.sandboxName !== options.explicitSandboxName;

      if (conflictingNameRecord) {
        yield* Effect.fail(
          new SandboxPreflightError({
            message: `Sandbox name ${options.explicitSandboxName} is already in use by another worktree.`,
            sandboxName: options.explicitSandboxName,
          })
        );
      }

      const takenNames = new Set(
        records
          .filter((record) => record.worktreePath !== context.worktreePath)
          .map((record) => record.sandboxName)
      );
      const reservedPorts = new Set(
        records
          .filter(
            (record) =>
              record.worktreePath !== context.worktreePath || isRenamingSandbox
          )
          .flatMap((record) => [
            record.ports.app,
            record.ports.api,
            record.ports.postgres,
          ])
      );

      const sharedEnvironment = yield* loadSandboxEnvironmentOrThrow(
        input.sandboxProcess,
        context.repoRoot
      );
      const runtimeAssets = yield* resolveSandboxRuntimeAssets({
        repoRoot: context.repoRoot,
        worktreePath: context.worktreePath,
      });
      yield* input.composeEngine.ensureAvailable();
      const proxyHealthy = yield* ensureSandboxProxyHealthy({
        portlessService: input.portlessService,
      });

      let startedRecord: SandboxRecord | undefined;
      let registeredAliases: RegisteredAliases | undefined;
      const handleUpFailure = <E extends SandboxRuntimeError>(error: E) =>
        cleanupFailedSandboxUp({
          error,
          startedRecord,
          registeredAliases,
          composeEngine: input.composeEngine,
          portlessService: input.portlessService,
          sandboxRegistry: input.sandboxRegistry,
        }).pipe(Effect.zipRight(Effect.fail(error)));

      return yield* bringSandboxUp({
        repoRoot: context.repoRoot,
        worktreePath: context.worktreePath,
        explicitSandboxName: options.explicitSandboxName,
        now: new Date().toISOString(),
        takenNames,
        existingRecord,
        loadSharedEnvironment: () => Effect.succeed(sharedEnvironment),
        resolveRuntimeAssets: () => Effect.succeed(runtimeAssets),
        generateBetterAuthSecret: makeSandboxBetterAuthSecret,
        allocatePorts: () =>
          input.portAllocator.allocate(existingRecord?.ports, reservedPorts),
        determineAliasesHealthy: ({ sandboxName, ports }) =>
          proxyHealthy === false
            ? Effect.succeed(false)
            : input.portlessService.registerAliases(sandboxName, ports).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    registeredAliases = { sandboxName, ports };
                  })
                ),
                Effect.as(true),
                Effect.tap(() =>
                  Effect.annotateCurrentSpan("aliasesHealthy", "true")
                ),
                Effect.tapError(() =>
                  input.portlessService
                    .removeAliases(sandboxName, ports)
                    .pipe(Effect.ignore)
                ),
                Effect.orElseSucceed(() => false)
              ),
        startComposeProject: (spec) => {
          const record = toSandboxRecord(spec, context, existingRecord);
          startedRecord = record;
          return Effect.gen(function* () {
            yield* writeComposeEnvironmentFileFromSpec(spec, context);
            yield* input.composeEngine.startStack(record);
          });
        },
        waitForHealth: (spec, listener) =>
          input.healthChecker.waitForReady(
            toSandboxRecord(spec, context, existingRecord),
            listener
          ),
        persist: (record) => input.sandboxRegistry.upsert(record),
        reportProgress:
          options.reportProgress ?? noopSandboxStartupProgressReporter,
      }).pipe(
        Effect.tap(() =>
          isRenamingSandbox && existingRecord
            ? finalizeSandboxRename({
                previousRecord: existingRecord,
                composeEngine: input.composeEngine,
                portlessService: input.portlessService,
                sandboxRegistry: input.sandboxRegistry,
              })
            : Effect.void
        ),
        Effect.catchTags({
          [SANDBOX_NOT_FOUND_ERROR_TAG]: handleUpFailure,
          [SANDBOX_PREFLIGHT_ERROR_TAG]: handleUpFailure,
          [SANDBOX_REGISTRY_ERROR_TAG]: handleUpFailure,
        })
      );
    }),
    down: Effect.fn("SandboxRuntime.down")(function* (
      options: SandboxCommandOptions = {}
    ) {
      const record = yield* resolveSandboxRecord(options);

      yield* input.composeEngine.stopStack(record);
      yield* removeAliasesBestEffort({
        sandboxName: record.sandboxName,
        ports: record.ports,
        portlessService: input.portlessService,
        operation: "sandbox shutdown",
      });
      yield* input.sandboxRegistry.remove(record.sandboxName);

      return {
        ...record,
        status: "stopped" as const,
      };
    }),
    status: Effect.fn("SandboxRuntime.status")(function* (
      options: SandboxCommandOptions = {}
    ) {
      const record = yield* resolveSandboxRecord(options);
      const servicesPresent =
        yield* input.composeEngine.runningServices(record);
      const [appOpen, apiOpen, postgresOpen] = yield* Effect.all(
        [
          checkLocalPortOpen(input.sandboxProcess, record.ports.app),
          checkLocalPortOpen(input.sandboxProcess, record.ports.api),
          checkLocalPortOpen(input.sandboxProcess, record.ports.postgres),
        ],
        { concurrency: "unbounded" }
      );
      const portsInUse = new Set<number>();

      if (appOpen) {
        portsInUse.add(record.ports.app);
      }
      if (apiOpen) {
        portsInUse.add(record.ports.api);
      }
      if (postgresOpen) {
        portsInUse.add(record.ports.postgres);
      }

      const reconciled = reconcileSandboxRecord(record, {
        servicesPresent,
        portsInUse,
        now: new Date().toISOString(),
      });
      yield* input.sandboxRegistry.upsert(reconciled);

      return {
        record: reconciled,
        urls: buildRecordUrls(reconciled),
      };
    }),
    list: Effect.fn("SandboxRuntime.list")(function* () {
      const records = yield* input.sandboxRegistry.list();
      return {
        entries: records.map((record) => ({
          record,
          urls: buildRecordUrls(record),
        })),
      };
    }),
    logs: Effect.fn("SandboxRuntime.logs")(function* (
      options: SandboxLogsOptions = {}
    ) {
      const record = yield* resolveSandboxRecord(options);
      return {
        content: yield* input.composeEngine.collectLogs(
          record,
          options.service
        ),
      };
    }),
    url: (options = {}) => lifecycle.status(options),
  };

  return lifecycle;
}

function resolveSandboxRecordFromOptions(input: {
  readonly options: SandboxCommandOptions;
  readonly sandboxProcess: SandboxProcess;
  readonly sandboxRegistry: Pick<SandboxRegistry, "list">;
  readonly worktreeResolver: Pick<WorktreeResolver, "resolveCurrent">;
}): SandboxRuntimeEffect<SandboxRegistryRecord> {
  if (input.options.explicitSandboxName) {
    return input.sandboxProcess.cwd().pipe(
      Effect.flatMap((cwd) =>
        input.sandboxRegistry.list().pipe(
          Effect.flatMap((records) =>
            selectSandboxRecord({
              explicitSandboxName: input.options.explicitSandboxName,
              worktreePath: cwd,
              records,
            })
          )
        )
      )
    );
  }

  return Effect.gen(function* () {
    const context = yield* input.worktreeResolver.resolveCurrent();
    return yield* selectSandboxRecord({
      explicitSandboxName: input.options.explicitSandboxName,
      worktreePath: context.worktreePath,
      records: yield* input.sandboxRegistry.list(),
    });
  });
}

export function selectSandboxRecord(input: {
  readonly explicitSandboxName?: SandboxName;
  readonly worktreePath: string;
  readonly records: readonly SandboxRegistryRecord[];
}): Effect.Effect<SandboxRegistryRecord, SandboxNotFoundError, never> {
  if (input.explicitSandboxName) {
    const byName = input.records.find(
      (record) => record.sandboxName === input.explicitSandboxName
    );

    return byName
      ? Effect.succeed(byName)
      : Effect.fail(
          new SandboxNotFoundError({
            worktreePath: input.worktreePath,
            message: `No sandbox is registered for name ${input.explicitSandboxName}`,
          })
        );
  }

  const byWorktree = input.records
    .filter((record) => record.worktreePath === input.worktreePath)
    .toSorted((left, right) =>
      right.timestamps.updatedAt.localeCompare(left.timestamps.updatedAt)
    )
    .at(0);

  return byWorktree
    ? Effect.succeed(byWorktree)
    : Effect.fail(
        new SandboxNotFoundError({
          worktreePath: input.worktreePath,
          message: "No sandbox is registered for this worktree",
        })
      );
}

export function finalizeSandboxRename(input: {
  readonly previousRecord: SandboxRegistryRecord;
  readonly composeEngine: Pick<ComposeEngine, "stopStack">;
  readonly portlessService: Pick<PortlessService, "removeAliases">;
  readonly sandboxRegistry: Pick<SandboxRegistry, "remove">;
}): SandboxRuntimeEffect<void> {
  return Effect.gen(function* () {
    yield* removeAliasesBestEffort({
      sandboxName: input.previousRecord.sandboxName,
      ports: input.previousRecord.ports,
      portlessService: input.portlessService,
      operation: "sandbox rename cleanup",
    });
    yield* input.composeEngine.stopStack(input.previousRecord);
    yield* input.sandboxRegistry.remove(input.previousRecord.sandboxName);
  });
}

export function cleanupFailedSandboxUp(input: {
  readonly error:
    | SandboxNotFoundError
    | SandboxPreflightError
    | SandboxRegistryError;
  readonly startedRecord?: SandboxRecord;
  readonly registeredAliases?: RegisteredAliases;
  readonly composeEngine: Pick<ComposeEngine, "stopStack">;
  readonly portlessService: Pick<PortlessService, "removeAliases">;
  readonly sandboxRegistry: Pick<SandboxRegistry, "remove">;
}): SandboxPreflightEffect<void> {
  const cleanupSteps: SandboxPreflightEffect<void>[] = [];

  if (input.startedRecord) {
    const { startedRecord } = input;
    cleanupSteps.push(input.composeEngine.stopStack(startedRecord));
    cleanupSteps.push(
      input.sandboxRegistry
        .remove(startedRecord.sandboxName)
        .pipe(
          Effect.catchTag(SANDBOX_REGISTRY_ERROR_TAG, (error) =>
            Effect.fail(
              toSandboxPreflightError(error, { preserveMessage: true })
            )
          )
        )
    );
  }

  if (input.registeredAliases) {
    const { registeredAliases } = input;
    cleanupSteps.unshift(
      removeAliasesBestEffort({
        sandboxName: registeredAliases.sandboxName,
        ports: registeredAliases.ports,
        portlessService: input.portlessService,
        operation: "failed sandbox cleanup",
      })
    );
  }

  return Effect.gen(function* () {
    const cleanupErrors = yield* Effect.forEach(
      cleanupSteps,
      (step) =>
        step.pipe(
          Effect.match({
            onFailure: (cleanupError) =>
              toSandboxPreflightError(cleanupError, {
                preserveMessage: true,
              }).message,
            onSuccess: () => null,
          })
        ),
      { concurrency: "unbounded" }
    );
    const failures = cleanupErrors.filter(
      (message): message is string => message !== undefined
    );

    if (failures.length > 0) {
      yield* Effect.fail(
        new SandboxPreflightError({
          message: [
            input.error.message,
            "Cleanup also failed:",
            ...failures.map((message) => `- ${message}`),
          ].join("\n"),
        })
      );
    }
  });
}

function exec<A>(
  effect: Effect.Effect<A, SandboxPreflightError | Error | unknown, never>
): SandboxPreflightEffect<A> {
  return effect.pipe(
    Effect.mapError((error) =>
      toPreflightError(error, "Sandbox command failed")
    )
  );
}

export function loadSandboxEnvironmentOrThrow(
  sandboxProcess: SandboxProcess,
  repoRoot: string
): SandboxPreflightEffect<AuthEmailSharedEnvironment>;
export function loadSandboxEnvironmentOrThrow(
  sandboxProcess: SandboxProcess,
  repoRoot: string
): SandboxPreflightEffect<AuthEmailSharedEnvironment> {
  return sandboxProcess.env().pipe(
    Effect.flatMap((processEnv) =>
      loadSandboxSharedEnvironment({
        repoRoot,
        requiredKeys: AUTH_EMAIL_REQUIRED_ENV_KEYS,
        optionalKeys: ["AUTH_EMAIL_FROM_NAME"],
        processEnv,
      })
    ),
    Effect.mapError((error) =>
      error instanceof SandboxEnvironmentError
        ? toSandboxPreflightError(error, { preserveMessage: true })
        : toPreflightError(error, "Sandbox shared environment is invalid")
    ),
    Effect.flatMap((environment) =>
      Effect.try({
        try: () =>
          Schema.decodeUnknownSync(AuthEmailSharedEnvironment)(environment),
        catch: (error) => error,
      }).pipe(
        Effect.mapError((error) =>
          toPreflightError(error, "Sandbox auth email environment is invalid")
        )
      )
    )
  );
}

export function ensureSandboxProxyHealthy(input: {
  readonly portlessService: Pick<PortlessService, "ensureProxyRunning">;
}): SandboxPreflightEffect<boolean> {
  return input.portlessService.ensureProxyRunning().pipe(
    Effect.as(true),
    Effect.tapError((error) =>
      Effect.logWarning("Sandbox portless proxy unavailable").pipe(
        Effect.annotateLogs({
          causeTag: error._tag,
          message: error.message,
        })
      )
    ),
    Effect.orElseSucceed(() => false)
  );
}

export function removeAliasesBestEffort(input: {
  readonly sandboxName: SandboxName;
  readonly ports: SandboxPorts;
  readonly portlessService: Pick<PortlessService, "removeAliases">;
  readonly operation: string;
}): Effect.Effect<void, never, never> {
  return input.portlessService
    .removeAliases(input.sandboxName, input.ports)
    .pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Sandbox alias cleanup failed").pipe(
          Effect.annotateLogs({
            sandboxName: input.sandboxName,
            operation: input.operation,
            causeTag: error._tag,
            message: error.message,
          })
        )
      ),
      Effect.ignore
    );
}

function allocateRuntimePort(
  service: keyof SandboxPorts,
  sandboxProcess: SandboxProcess,
  existing: SandboxPorts | undefined,
  reservedPorts: ReadonlySet<number>,
  allocated: Set<number>
): SandboxPreflightEffect<number> {
  return Effect.gen(function* () {
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
      !(yield* checkLocalPortAvailable(sandboxProcess, port))
    ) {
      port += 1;
      if (port > DEFAULT_PORTS[service] + 100) {
        yield* Effect.fail(
          new SandboxPreflightError({
            message: `Could not allocate a free ${service} port in the sandbox range`,
          })
        );
      }
    }

    allocated.add(port);
    return port;
  });
}

export function waitForSandboxServicesReady(options: {
  readonly timeoutMs: number;
  readonly intervalMs: number;
  readonly wait: (durationMs: number) => SandboxPreflightEffect<void>;
  readonly onReadinessChanged?: (
    readiness: SandboxStartupReadiness
  ) => Effect.Effect<void, never, never>;
  readonly createTimeoutError?: (readiness: {
    postgres: boolean;
    api: boolean;
    app: boolean;
  }) => SandboxPreflightError;
  readonly checkPostgres: () => Effect.Effect<boolean, never, never>;
  readonly checkApi: () => Effect.Effect<boolean, never, never>;
  readonly checkApp: () => Effect.Effect<boolean, never, never>;
}): SandboxPreflightEffect<void> {
  const poll = (
    remainingMs: number,
    previousReadiness?: SandboxStartupReadiness
  ): SandboxPreflightEffect<{
    readonly postgres: boolean;
    readonly api: boolean;
    readonly app: boolean;
  }> =>
    Effect.gen(function* () {
      const [postgresReady, apiReady, appReady] = yield* Effect.all(
        [options.checkPostgres(), options.checkApi(), options.checkApp()],
        { concurrency: "unbounded" }
      );
      const readiness = {
        postgres: postgresReady,
        api: apiReady,
        app: appReady,
      };

      if (
        options.onReadinessChanged &&
        !sandboxStartupReadinessEquals(previousReadiness, readiness)
      ) {
        yield* options.onReadinessChanged(readiness);
      }

      if (postgresReady && apiReady && appReady) {
        return readiness;
      }

      const nextRemainingMs = remainingMs - options.intervalMs;
      if (nextRemainingMs <= 0) {
        yield* Effect.fail(
          options.createTimeoutError?.(readiness) ??
            new SandboxPreflightError({
              message:
                "Sandbox compose services did not become healthy within 180 seconds",
            })
        );
      }

      yield* options.wait(options.intervalMs);
      return yield* poll(nextRemainingMs, readiness);
    });

  return poll(options.timeoutMs).pipe(Effect.asVoid);
}

export function resolveRepoRootFromGitPaths(
  worktreePath: string,
  gitCommonDir: string
): string {
  const resolvedCommonDir = path.resolve(worktreePath, gitCommonDir);
  return path.basename(resolvedCommonDir) === ".git"
    ? path.dirname(resolvedCommonDir)
    : resolvedCommonDir;
}

function checkLocalPortOpen(
  sandboxProcess: SandboxProcess,
  port: number
): Effect.Effect<boolean, never, never> {
  return sandboxProcess.isPortOpen(port);
}

function checkLocalPortAvailable(
  sandboxProcess: SandboxProcess,
  port: number
): SandboxPreflightEffect<boolean> {
  return sandboxProcess.isPortAvailable(port).pipe(
    Effect.mapError(
      () =>
        new SandboxPreflightError({
          message: `Failed to check whether port ${port} is available`,
        })
    )
  );
}

function toSandboxRecord(
  spec: SandboxRuntimeSpec,
  context: WorktreeContext,
  existingRecord: SandboxRegistryRecord | undefined
): SandboxRecord {
  const aliasesHealthy =
    spec.overrides.BETTER_AUTH_BASE_URL.startsWith("https://");
  const now = new Date().toISOString();

  return {
    sandboxId: spec.sandboxId,
    sandboxName: spec.sandboxName,
    composeProjectName: spec.composeProjectName,
    repoRoot: context.repoRoot,
    worktreePath: context.worktreePath,
    hostnameSlug: spec.hostnameSlug,
    betterAuthSecret: spec.overrides.BETTER_AUTH_SECRET,
    runtimeAssets: spec.runtimeAssets,
    aliasesHealthy,
    status: aliasesHealthy ? "ready" : "degraded",
    ports: spec.ports,
    timestamps: {
      createdAt: existingRecord?.timestamps.createdAt ?? now,
      updatedAt: now,
    },
    missingResources: [],
  };
}

function composeArgs(
  record: Pick<SandboxRecord, "composeProjectName" | "sandboxName">,
  subcommand: readonly string[]
): string[] {
  return buildComposeCommandArgs({
    composeFile: SANDBOX_COMPOSE_FILE,
    composeEnvFile: getComposeEnvFilePath(record.sandboxName),
    composeProjectName: record.composeProjectName,
    subcommand,
  });
}

function ensureComposeEnvironmentFile(
  sandboxFileSystem: SandboxFileSystem,
  record: SandboxRecord
): SandboxPreflightEffect<void> {
  const composeEnvFile = getComposeEnvFilePath(record.sandboxName);
  return sandboxFileSystem.access(composeEnvFile).pipe(
    Effect.catchAll((error) =>
      isMissingFileError(error)
        ? writeComposeEnvironmentFile(
            record,
            makeBlankAuthEmailSharedEnvironmentOverrides()
          )
        : Effect.fail(
            toPreflightError(
              error,
              `Failed to access compose environment file for ${record.sandboxName}`
            )
          )
    ),
    Effect.asVoid
  );
}

function writeComposeEnvironmentFile(
  record: SandboxRecord,
  sharedEnvironment: AuthEmailSharedEnvironmentOverrides
): SandboxPreflightEffect<void> {
  const composeEnvFile = getComposeEnvFilePath(record.sandboxName);
  return Effect.gen(function* () {
    yield* writeSandboxStateFile(
      composeEnvFile,
      renderComposeEnvironmentFile({
        repoRoot: record.repoRoot,
        worktreePath: record.worktreePath,
        proxyPort: SANDBOX_PROXY_PORT,
        overrides: buildComposeFallbackEnvironmentOverrides(
          record,
          sharedEnvironment
        ),
      })
    ).pipe(
      Effect.mapError((error) =>
        toSandboxPreflightError(error, { preserveMessage: true })
      )
    );
  });
}

export function buildComposeFallbackEnvironmentOverrides(
  record: SandboxRecord,
  sharedEnvironment: AuthEmailSharedEnvironmentOverrides
): Record<string, string> {
  const urls = buildRecordUrls(record);

  return {
    ...sharedEnvironment,
    API_HOST_PORT: String(record.ports.api),
    API_ORIGIN: `http://api:${record.ports.api}`,
    APP_HOST_PORT: String(record.ports.app),
    AUTH_APP_ORIGIN: urls.fallbackApp,
    AUTH_EMAIL_FROM: sharedEnvironment.AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME: sharedEnvironment.AUTH_EMAIL_FROM_NAME,
    BETTER_AUTH_BASE_URL: urls.fallbackApi,
    BETTER_AUTH_SECRET: record.betterAuthSecret,
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/task_tracker",
    HOST: "0.0.0.0",
    PORT: String(record.ports.api),
    POSTGRES_HOST_PORT: String(record.ports.postgres),
    SANDBOX_ID: record.sandboxId,
    SANDBOX_DEV_IMAGE: record.runtimeAssets.devImage,
    SANDBOX_NODE_MODULES_VOLUME: record.runtimeAssets.nodeModulesVolume,
    SANDBOX_NAME: record.sandboxName,
    SANDBOX_PNPM_STORE_VOLUME: record.runtimeAssets.pnpmStoreVolume,
    SITE_GEOCODER_MODE: "stub",
    TASK_TRACKER_SANDBOX: "1",
    VITE_API_ORIGIN: urls.fallbackApi,
  };
}

function makeBlankAuthEmailSharedEnvironmentOverrides(): AuthEmailSharedEnvironmentOverrides {
  return Object.fromEntries(
    AUTH_EMAIL_SHARED_ENV_KEYS.map((key) => [key, ""])
  ) as AuthEmailSharedEnvironmentOverrides;
}

function writeComposeEnvironmentFileFromSpec(
  spec: Pick<SandboxRuntimeSpec, "sandboxName" | "overrides">,
  context: WorktreeContext
): SandboxPreflightEffect<void> {
  const composeEnvFile = getComposeEnvFilePath(spec.sandboxName);
  return Effect.gen(function* () {
    yield* ensureSandboxStateDir(path.dirname(composeEnvFile)).pipe(
      Effect.mapError((error) =>
        toSandboxPreflightError(error, { preserveMessage: true })
      )
    );
    yield* writeSandboxStateFile(
      composeEnvFile,
      renderComposeEnvironmentFile({
        repoRoot: context.repoRoot,
        worktreePath: context.worktreePath,
        proxyPort: SANDBOX_PROXY_PORT,
        overrides: spec.overrides,
      })
    ).pipe(
      Effect.mapError((error) =>
        toSandboxPreflightError(error, { preserveMessage: true })
      )
    );
  });
}

function buildRecordUrls(
  record: Pick<SandboxRecord, "hostnameSlug" | "ports" | "aliasesHealthy">
): SandboxUrls {
  return buildSandboxUrls(
    {
      hostnameSlug: record.hostnameSlug,
      ports: record.ports,
    },
    {
      aliasesHealthy: record.aliasesHealthy,
      proxyPort: SANDBOX_PROXY_PORT,
    }
  );
}

function ensureSandboxDevImage(
  sandboxProcess: SandboxProcess,
  sandboxFileSystem: SandboxFileSystem,
  record: Pick<SandboxRecord, "runtimeAssets" | "worktreePath">,
  options: {
    readonly forceInspect?: boolean;
  } = {}
): SandboxPreflightEffect<"marker" | "inspect"> {
  const dockerfilePath = path.join(
    record.worktreePath,
    "packages",
    "sandbox-cli",
    "docker",
    "sandbox-dev.Dockerfile"
  );

  return Effect.gen(function* () {
    const markerPath = getSandboxDevImageMarkerPath(
      record.runtimeAssets.devImage
    );

    if (!options.forceInspect) {
      const markerExists = yield* sandboxFileSystem.fileExists(markerPath);

      if (markerExists) {
        return "marker" as const;
      }
    }

    const inspectResult = yield* exec(
      sandboxProcess.runCommand(
        "docker",
        ["image", "inspect", record.runtimeAssets.devImage],
        {
          allowNonZero: true,
        }
      )
    );

    if (inspectResult.exitCode === 0) {
      yield* rememberSandboxDevImage(markerPath, record.runtimeAssets.devImage);
      return "inspect" as const;
    }

    yield* exec(
      sandboxProcess.runCommand("docker", [
        "build",
        "--file",
        dockerfilePath,
        "--tag",
        record.runtimeAssets.devImage,
        record.worktreePath,
      ])
    );
    yield* rememberSandboxDevImage(markerPath, record.runtimeAssets.devImage);
    return "inspect" as const;
  }).pipe(
    Effect.tap(() =>
      Effect.annotateCurrentSpan(
        "sandboxDevImage",
        record.runtimeAssets.devImage
      )
    )
  );
}

function ensureSandboxSharedVolumes(
  sandboxProcess: SandboxProcess,
  sandboxFileSystem: SandboxFileSystem,
  runtimeAssets: Pick<
    SandboxRuntimeAssets,
    "nodeModulesVolume" | "pnpmStoreVolume"
  >
): SandboxPreflightEffect<void> {
  return Effect.all(
    [
      ensureDockerVolume(
        sandboxProcess,
        sandboxFileSystem,
        runtimeAssets.nodeModulesVolume
      ),
      ensureDockerVolume(
        sandboxProcess,
        sandboxFileSystem,
        runtimeAssets.pnpmStoreVolume
      ),
    ],
    {
      concurrency: "unbounded",
      discard: true,
    }
  );
}

function ensureDockerVolume(
  sandboxProcess: SandboxProcess,
  _sandboxFileSystem: SandboxFileSystem,
  volumeName: SandboxDockerVolumeName
): SandboxPreflightEffect<void> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("dockerVolume", volumeName);

    const inspectResult = yield* exec(
      sandboxProcess.runCommand("docker", ["volume", "inspect", volumeName], {
        allowNonZero: true,
      })
    );

    if (inspectResult.exitCode === 0) {
      return;
    }

    yield* exec(
      sandboxProcess.runCommand("docker", ["volume", "create", volumeName])
    );
  });
}

function getSandboxDevImageMarkerPath(devImage: string): string {
  const imageHash = createHash("sha256").update(devImage).digest("hex");

  return path.join(
    getSandboxStateRoot(),
    "runtime-assets",
    "images",
    `${imageHash}.marker`
  );
}

function rememberSandboxDevImage(
  markerPath: string,
  devImage: string
): SandboxPreflightEffect<void> {
  return writeSandboxStateFile(markerPath, `${devImage}\n`).pipe(
    Effect.mapError((error) =>
      toSandboxPreflightError(error, { preserveMessage: true })
    )
  );
}

function isMissingImageError(error: SandboxPreflightError): boolean {
  const commandOutput = [error.message, error.stderr]
    .filter(Boolean)
    .join("\n");

  return /no such image|pull access denied|not found/i.test(commandOutput);
}

function makeSandboxBetterAuthSecret(): string {
  return randomBytes(32).toString("hex");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function tryPromisePreflight<A>(
  message: string,
  tryFn: () => Promise<A>
): SandboxPreflightEffect<A> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (error) => toPreflightError(error, message),
  });
}

function toPreflightError(
  error: unknown,
  message: string
): SandboxPreflightError {
  return toSandboxPreflightError(error, { message });
}
