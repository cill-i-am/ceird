import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  HealthPayload,
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
  SharedSandboxEnvironmentInput,
} from "@task-tracker/sandbox-core/node";
import { Effect, Schema } from "effect";

import {
  buildComposeCommandArgs,
  renderComposeEnvironmentFile,
} from "./compose.js";
import { bringSandboxUp } from "./lifecycle.js";
import type { SandboxUpResult } from "./lifecycle.js";
import { makePortlessAliasCommands } from "./portless.js";
import { isPortAvailable, isPortOpen, runCommand } from "./process.js";
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

export function makeSandboxRuntime(): SandboxRuntime {
  const worktreeResolver: WorktreeResolver = {
    resolveCurrent: Effect.fn("SandboxRuntime.resolveCurrent")(function* () {
      const worktreeResult = yield* exec(
        runCommand("git", ["rev-parse", "--show-toplevel"], {
          cwd: process.cwd(),
        })
      );
      const commonDirResult = yield* exec(
        runCommand("git", ["rev-parse", "--git-common-dir"], {
          cwd: process.cwd(),
        })
      );
      const worktreePath = worktreeResult.stdout.trim();
      const gitCommonDir = commonDirResult.stdout.trim();
      const absoluteGitCommonDir = path.isAbsolute(gitCommonDir)
        ? gitCommonDir
        : path.resolve(process.cwd(), gitCommonDir);
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

  const sandboxRegistry: SandboxRegistry = {
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

  const portAllocator: PortAllocator = {
    allocate: Effect.fn("SandboxRuntime.allocatePorts")(
      function* (existing, reservedPorts) {
        const allocated = new Set<number>();
        const app = yield* allocateRuntimePort(
          "app",
          existing,
          reservedPorts,
          allocated
        );
        const api = yield* allocateRuntimePort(
          "api",
          existing,
          reservedPorts,
          allocated
        );
        const postgres = yield* allocateRuntimePort(
          "postgres",
          existing,
          reservedPorts,
          allocated
        );

        return { app, api, postgres };
      }
    ),
  };

  const composeEngine: ComposeEngine = {
    ensureAvailable: Effect.fn("SandboxRuntime.ensureComposeAvailable")(
      function* () {
        yield* exec(runCommand("docker", ["info"]));
        yield* exec(runCommand("docker", ["compose", "version"]));
      }
    ),
    startStack: Effect.fn("SandboxRuntime.startComposeStack")(
      function* (record) {
        const imageReady = yield* ensureSandboxDevImage(record);
        yield* Effect.all(
          [
            ensureSandboxSharedVolumes(record.runtimeAssets),
            ensureComposeEnvironmentFile(record),
          ],
          { concurrency: "unbounded" }
        );
        const startCompose = () =>
          exec(runCommand("docker", composeArgs(record, ["up", "-d"])));

        yield* startCompose().pipe(
          Effect.catchIf(
            (error) => imageReady === "marker" && isMissingImageError(error),
            () =>
              ensureSandboxDevImage(record, { forceInspect: true }).pipe(
                Effect.zipRight(startCompose())
              )
          )
        );
      }
    ),
    stopStack: Effect.fn("SandboxRuntime.stopComposeStack")(function* (record) {
      yield* ensureComposeEnvironmentFile(record);
      yield* exec(
        runCommand(
          "docker",
          composeArgs(record, [
            "down",
            "--timeout",
            String(SANDBOX_STOP_TIMEOUT_SECONDS),
          ]),
          { allowNonZero: true }
        )
      );
      yield* tryPromisePreflight(
        `Failed to remove sandbox state for ${record.sandboxName}`,
        () =>
          fs.rm(path.dirname(getComposeEnvFilePath(record.sandboxName)), {
            recursive: true,
            force: true,
          })
      );
    }),
    runningServices: Effect.fn("SandboxRuntime.runningComposeServices")(
      function* (record) {
        yield* ensureComposeEnvironmentFile(record);
        const result = yield* exec(
          runCommand(
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
        yield* ensureComposeEnvironmentFile(record);
        const result = yield* exec(
          runCommand(
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

  const portlessService: PortlessService = {
    ensureProxyRunning: Effect.fn("SandboxRuntime.ensurePortlessProxy")(
      function* () {
        yield* exec(
          runCommand("pnpm", [
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
          ([command, ...args]) => exec(runCommand(command, args)),
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
            exec(runCommand(command, args, { allowNonZero: true })),
          {
            concurrency: "unbounded",
            discard: true,
          }
        );
      }
    ),
  };

  const healthChecker: HealthChecker = {
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
          checkPostgres: () => checkLocalPortOpen(record.ports.postgres),
          checkApi: () =>
            checkHttpHealth(record.ports.api, "api", record.sandboxId),
          checkApp: () =>
            checkHttpHealth(record.ports.app, "app", record.sandboxId),
        });
      }
    ),
  };

  const lifecycle: SandboxLifecycle = {
    up: Effect.fn("SandboxRuntime.up")(function* (
      options: SandboxUpCommandOptions = {}
    ) {
      const context = yield* worktreeResolver.resolveCurrent();
      yield* Effect.annotateCurrentSpan("worktreePath", context.worktreePath);
      yield* Effect.annotateCurrentSpan("repoRoot", context.repoRoot);
      if (options.explicitSandboxName) {
        yield* Effect.annotateCurrentSpan(
          "sandboxName",
          options.explicitSandboxName
        );
      }
      const records = yield* sandboxRegistry.list();
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
        context.repoRoot
      );
      const runtimeAssets = yield* resolveSandboxRuntimeAssets({
        repoRoot: context.repoRoot,
        worktreePath: context.worktreePath,
      });
      yield* composeEngine.ensureAvailable();
      const proxyHealthy = yield* ensureSandboxProxyHealthy({
        portlessService,
      });

      let startedRecord: SandboxRecord | undefined;
      let registeredAliases: RegisteredAliases | undefined;

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
          portAllocator.allocate(existingRecord?.ports, reservedPorts),
        determineAliasesHealthy: ({ sandboxName, ports }) =>
          proxyHealthy === false
            ? Effect.succeed(false)
            : portlessService.registerAliases(sandboxName, ports).pipe(
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
                  portlessService
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
            yield* composeEngine.startStack(record);
          });
        },
        waitForHealth: (spec, listener) =>
          healthChecker.waitForReady(
            toSandboxRecord(spec, context, existingRecord),
            listener
          ),
        persist: (record) => sandboxRegistry.upsert(record),
        reportProgress:
          options.reportProgress ?? noopSandboxStartupProgressReporter,
      }).pipe(
        Effect.tap(() =>
          isRenamingSandbox && existingRecord
            ? finalizeSandboxRename({
                previousRecord: existingRecord,
                composeEngine,
                portlessService,
                sandboxRegistry,
              })
            : Effect.void
        ),
        Effect.catchTags({
          [SANDBOX_NOT_FOUND_ERROR_TAG]: (error) =>
            cleanupFailedSandboxUp({
              error,
              startedRecord,
              registeredAliases,
              composeEngine,
              portlessService,
              sandboxRegistry,
            }).pipe(Effect.zipRight(Effect.fail(error))),
          [SANDBOX_PREFLIGHT_ERROR_TAG]: (error) =>
            cleanupFailedSandboxUp({
              error,
              startedRecord,
              registeredAliases,
              composeEngine,
              portlessService,
              sandboxRegistry,
            }).pipe(Effect.zipRight(Effect.fail(error))),
          [SANDBOX_REGISTRY_ERROR_TAG]: (error) =>
            cleanupFailedSandboxUp({
              error,
              startedRecord,
              registeredAliases,
              composeEngine,
              portlessService,
              sandboxRegistry,
            }).pipe(Effect.zipRight(Effect.fail(error))),
        })
      );
    }),
    down: Effect.fn("SandboxRuntime.down")(function* (
      options: SandboxCommandOptions = {}
    ) {
      const record = yield* resolveSandboxRecord(options);

      yield* composeEngine.stopStack(record);
      yield* removeAliasesBestEffort({
        sandboxName: record.sandboxName,
        ports: record.ports,
        portlessService,
        operation: "sandbox shutdown",
      });
      yield* sandboxRegistry.remove(record.sandboxName);

      return {
        ...record,
        status: "stopped" as const,
      };
    }),
    status: Effect.fn("SandboxRuntime.status")(function* (
      options: SandboxCommandOptions = {}
    ) {
      const record = yield* resolveSandboxRecord(options);
      const servicesPresent = yield* composeEngine.runningServices(record);
      const [appOpen, apiOpen, postgresOpen] = yield* Effect.all(
        [
          checkLocalPortOpen(record.ports.app),
          checkLocalPortOpen(record.ports.api),
          checkLocalPortOpen(record.ports.postgres),
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
      yield* sandboxRegistry.upsert(reconciled);

      return {
        record: reconciled,
        urls: buildRecordUrls(reconciled),
      };
    }),
    list: Effect.fn("SandboxRuntime.list")(function* () {
      const records = yield* sandboxRegistry.list();
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
        content: yield* composeEngine.collectLogs(record, options.service),
      };
    }),
    url: (options = {}) => lifecycle.status(options),
  };

  return {
    worktreeResolver,
    sandboxRegistry,
    composeEngine,
    portAllocator,
    portlessService,
    healthChecker,
    lifecycle,
  };

  function resolveSandboxRecord(
    options: SandboxCommandOptions
  ): SandboxRuntimeEffect<SandboxRegistryRecord> {
    if (options.explicitSandboxName) {
      return sandboxRegistry.list().pipe(
        Effect.flatMap((records) =>
          selectSandboxRecord({
            explicitSandboxName: options.explicitSandboxName,
            worktreePath: process.cwd(),
            records,
          })
        )
      );
    }

    return Effect.gen(function* () {
      const context = yield* worktreeResolver.resolveCurrent();
      return yield* selectSandboxRecord({
        explicitSandboxName: options.explicitSandboxName,
        worktreePath: context.worktreePath,
        records: yield* sandboxRegistry.list(),
      });
    });
  }
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
          Effect.mapError((error) =>
            toSandboxPreflightError(error, { preserveMessage: true })
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

function loadSandboxEnvironmentOrThrow(
  repoRoot: string
): SandboxPreflightEffect<SharedSandboxEnvironmentInput> {
  return loadSandboxSharedEnvironment({
    repoRoot,
    processEnv: process.env,
  }).pipe(
    Effect.mapError((error) =>
      error instanceof SandboxEnvironmentError
        ? toSandboxPreflightError(error, { preserveMessage: true })
        : toPreflightError(error, "Sandbox shared environment is invalid")
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
      !(yield* checkLocalPortAvailable(port))
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
  port: number
): Effect.Effect<boolean, never, never> {
  return Effect.tryPromise({
    try: () => isPortOpen(port),
    catch: () => false,
  }).pipe(Effect.orElseSucceed(() => false));
}

function checkLocalPortAvailable(
  port: number
): SandboxPreflightEffect<boolean> {
  return tryPromisePreflight(
    `Failed to check whether port ${port} is available`,
    () => isPortAvailable(port)
  );
}

function checkHttpHealth(
  port: number,
  service: "app" | "api",
  sandboxId: SandboxRecord["sandboxId"]
): Effect.Effect<boolean, never, never> {
  return Effect.tryPromise({
    try: () =>
      fetch(`http://127.0.0.1:${port}/health`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(2000),
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catchAll(() => Effect.succeed<Response | false>(false)),
    Effect.flatMap((responseOrFalse) => {
      if (responseOrFalse === false || !responseOrFalse.ok) {
        return Effect.succeed(false);
      }

      return Effect.tryPromise({
        try: () => responseOrFalse.json(),
        catch: () => false,
      }).pipe(
        Effect.flatMap((payloadOrFalse) =>
          payloadOrFalse === false
            ? Effect.succeed(false)
            : Schema.decodeUnknown(HealthPayload)(payloadOrFalse).pipe(
                Effect.map(
                  (payload) =>
                    payload.ok === true &&
                    payload.service === service &&
                    payload.sandboxId === sandboxId
                ),
                Effect.orElseSucceed(() => false)
              )
        )
      );
    }),
    Effect.orElseSucceed(() => false)
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
  record: SandboxRecord
): SandboxPreflightEffect<void> {
  const composeEnvFile = getComposeEnvFilePath(record.sandboxName);
  return Effect.tryPromise({
    try: () => fs.access(composeEnvFile),
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      isMissingFileError(error)
        ? writeComposeEnvironmentFile(record, {
            AUTH_EMAIL_FROM: "",
            AUTH_EMAIL_FROM_NAME: "",
            RESEND_API_KEY: "",
          })
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
  sharedEnvironment: {
    readonly AUTH_EMAIL_FROM: string;
    readonly AUTH_EMAIL_FROM_NAME: string;
    readonly RESEND_API_KEY: string;
  }
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
  sharedEnvironment: {
    readonly AUTH_EMAIL_FROM: string;
    readonly AUTH_EMAIL_FROM_NAME: string;
    readonly RESEND_API_KEY: string;
  }
): Record<string, string> {
  const urls = buildRecordUrls(record);

  return {
    API_HOST_PORT: String(record.ports.api),
    APP_HOST_PORT: String(record.ports.app),
    AUTH_APP_ORIGIN: urls.fallbackApp,
    AUTH_EMAIL_FROM: sharedEnvironment.AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME: sharedEnvironment.AUTH_EMAIL_FROM_NAME,
    AUTH_ORIGIN: `http://api:${record.ports.api}`,
    BETTER_AUTH_BASE_URL: urls.fallbackApi,
    BETTER_AUTH_SECRET: record.betterAuthSecret,
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/task_tracker",
    HOST: "0.0.0.0",
    PORT: String(record.ports.api),
    POSTGRES_HOST_PORT: String(record.ports.postgres),
    RESEND_API_KEY: sharedEnvironment.RESEND_API_KEY,
    SANDBOX_ID: record.sandboxId,
    SANDBOX_DEV_IMAGE: record.runtimeAssets.devImage,
    SANDBOX_NODE_MODULES_VOLUME: record.runtimeAssets.nodeModulesVolume,
    SANDBOX_NAME: record.sandboxName,
    SANDBOX_PNPM_STORE_VOLUME: record.runtimeAssets.pnpmStoreVolume,
    TASK_TRACKER_SANDBOX: "1",
    VITE_AUTH_ORIGIN: urls.fallbackApi,
  };
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
      const markerExists = yield* checkFileExists(markerPath);

      if (markerExists) {
        return "marker" as const;
      }
    }

    const inspectResult = yield* exec(
      runCommand(
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
      runCommand("docker", [
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
  runtimeAssets: Pick<
    SandboxRuntimeAssets,
    "nodeModulesVolume" | "pnpmStoreVolume"
  >
): SandboxPreflightEffect<void> {
  return Effect.all(
    [
      ensureDockerVolume(runtimeAssets.nodeModulesVolume),
      ensureDockerVolume(runtimeAssets.pnpmStoreVolume),
    ],
    {
      concurrency: "unbounded",
      discard: true,
    }
  );
}

function ensureDockerVolume(
  volumeName: SandboxDockerVolumeName
): SandboxPreflightEffect<void> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("dockerVolume", volumeName);

    const inspectResult = yield* exec(
      runCommand("docker", ["volume", "inspect", volumeName], {
        allowNonZero: true,
      })
    );

    if (inspectResult.exitCode === 0) {
      return;
    }

    yield* exec(runCommand("docker", ["volume", "create", volumeName]));
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

function checkFileExists(
  filePath: string
): Effect.Effect<boolean, never, never> {
  return Effect.tryPromise({
    try: () => fs.access(filePath),
    catch: (error) => error,
  }).pipe(
    Effect.map(() => true),
    Effect.catchAll(() => Effect.succeed(false))
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
