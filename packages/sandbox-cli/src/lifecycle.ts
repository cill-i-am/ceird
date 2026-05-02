import {
  buildSandboxRuntimeSpec,
  deriveSandboxIdentity,
  validateSandboxName,
} from "@task-tracker/sandbox-core";
import type {
  SandboxNameType as SandboxName,
  SandboxPorts,
  SandboxRecord,
  SandboxRuntimeAssetsShape as SandboxRuntimeAssets,
  SandboxRuntimeSpec,
  SandboxUrls,
} from "@task-tracker/sandbox-core";
import type {
  SandboxRegistryError,
  SharedSandboxEnvironmentInput,
} from "@task-tracker/sandbox-core/node";
import { Effect } from "effect";

import type { SandboxPreflightError } from "./sandbox-preflight-error.js";
import { toSandboxPreflightError } from "./sandbox-preflight-error.js";
import {
  noopSandboxStartupProgressReporter,
  toSandboxStartupProgressEvents,
} from "./startup-progress.js";
import type {
  SandboxHealthProgressListener,
  SandboxStartupProgressEvent,
  SandboxStartupProgressReporter,
  SandboxStartupStep,
} from "./startup-progress.js";

type SandboxLifecycleError = SandboxPreflightError | SandboxRegistryError;
type SandboxLifecycleEffect<A> = Effect.Effect<A, SandboxLifecycleError, never>;

export interface BringSandboxUpOptions {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly explicitSandboxName?: SandboxName;
  readonly now: string;
  readonly takenNames: ReadonlySet<SandboxName>;
  readonly existingRecord: SandboxRecord | undefined;
  readonly loadSharedEnvironment: () => SandboxLifecycleEffect<SharedSandboxEnvironmentInput>;
  readonly resolveRuntimeAssets: () => SandboxLifecycleEffect<SandboxRuntimeAssets>;
  readonly generateBetterAuthSecret: () => string;
  readonly allocatePorts: () => SandboxLifecycleEffect<SandboxPorts>;
  readonly determineAliasesHealthy: (input: {
    readonly sandboxName: SandboxName;
    readonly ports: SandboxPorts;
  }) => SandboxLifecycleEffect<boolean>;
  readonly startComposeProject: (
    spec: SandboxRuntimeSpec
  ) => SandboxLifecycleEffect<void>;
  readonly migrateDatabase: (
    spec: SandboxRuntimeSpec
  ) => SandboxLifecycleEffect<void>;
  readonly waitForHealth: (
    spec: SandboxRuntimeSpec,
    listener: SandboxHealthProgressListener
  ) => SandboxLifecycleEffect<void>;
  readonly persist: (record: SandboxRecord) => SandboxLifecycleEffect<void>;
  readonly reportProgress?: SandboxStartupProgressReporter;
}

export interface SandboxUpResult {
  readonly record: SandboxRecord;
  readonly urls: SandboxUrls;
  readonly aliasesHealthy: boolean;
}

export const bringSandboxUp = Effect.fn("SandboxLifecycle.bringSandboxUp")(
  function* (options: BringSandboxUpOptions) {
    const reportProgress =
      options.reportProgress ?? noopSandboxStartupProgressReporter;
    const reportStep = (
      step: SandboxStartupStep,
      status: SandboxStartupProgressEvent["status"],
      detail?: string
    ) => reportProgress({ step, status, detail });
    const sandboxName =
      options.explicitSandboxName ??
      validateSandboxName(
        deriveSandboxIdentity({
          repoRoot: options.repoRoot,
          worktreePath: options.worktreePath,
        }).hostnameSlug
      );
    yield* Effect.annotateCurrentSpan("sandboxName", sandboxName);
    yield* Effect.annotateCurrentSpan("worktreePath", options.worktreePath);
    yield* Effect.annotateCurrentSpan("repoRoot", options.repoRoot);

    yield* reportStep("preflight", "running", "validating environment");
    const sharedEnvironment = yield* options.loadSharedEnvironment();
    const runtimeAssets = yield* options.resolveRuntimeAssets();
    yield* reportStep("preflight", "done");

    yield* reportStep("ports", "running", "allocating local ports");
    const ports = yield* options.allocatePorts();
    yield* Effect.annotateCurrentSpan("appPort", String(ports.app));
    yield* Effect.annotateCurrentSpan("apiPort", String(ports.api));
    yield* Effect.annotateCurrentSpan("postgresPort", String(ports.postgres));
    yield* reportStep(
      "ports",
      "done",
      `app ${ports.app}, api ${ports.api}, postgres ${ports.postgres}`
    );

    yield* reportStep("portless", "running", "registering aliases");
    const aliasesHealthy = yield* options.determineAliasesHealthy({
      sandboxName,
      ports,
    });
    yield* reportStep(
      "portless",
      aliasesHealthy ? "done" : "warning",
      aliasesHealthy
        ? undefined
        : "aliases unavailable, fallback URLs will be used"
    );
    yield* Effect.annotateCurrentSpan("aliasesHealthy", String(aliasesHealthy));

    const betterAuthSecret =
      options.existingRecord?.betterAuthSecret ??
      options.generateBetterAuthSecret();
    const spec = yield* buildSandboxRuntimeSpec({
      repoRoot: options.repoRoot,
      worktreePath: options.worktreePath,
      sandboxName,
      takenNames: options.takenNames,
      ports,
      runtimeAssets,
      betterAuthSecret,
      aliasesHealthy,
      proxyPort: 1355,
      sharedEnvironment,
    }).pipe(
      Effect.mapError((error) =>
        toSandboxPreflightError(error, { preserveMessage: true })
      )
    );
    yield* Effect.annotateCurrentSpan(
      "composeProjectName",
      spec.composeProjectName
    );
    yield* Effect.annotateCurrentSpan("aliasesHealthy", String(aliasesHealthy));
    const provisionalRecord: SandboxRecord = {
      sandboxId: spec.sandboxId,
      sandboxName: spec.sandboxName,
      composeProjectName: spec.composeProjectName,
      repoRoot: options.repoRoot,
      worktreePath: options.worktreePath,
      hostnameSlug: spec.hostnameSlug,
      betterAuthSecret,
      runtimeAssets: spec.runtimeAssets,
      aliasesHealthy,
      status: "provisioning",
      ports,
      timestamps: {
        createdAt: options.existingRecord?.timestamps.createdAt ?? options.now,
        updatedAt: options.now,
      },
      missingResources: [],
    };

    yield* options.persist(provisionalRecord);
    yield* reportStep("compose", "running", "starting docker compose stack");
    yield* options.startComposeProject(spec);
    yield* reportStep("compose", "done");
    yield* reportStep("migrations", "running", "applying database schema");
    yield* options.migrateDatabase(spec);
    yield* reportStep("migrations", "done");

    let previousReadiness:
      | Parameters<SandboxHealthProgressListener["onReadinessChanged"]>[0]
      | undefined;
    yield* options.waitForHealth(spec, {
      onReadinessChanged: (readiness) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            toSandboxStartupProgressEvents(previousReadiness, readiness),
            (event) => reportProgress(event),
            {
              discard: true,
            }
          );
          previousReadiness = readiness;
        }),
    });

    const record: SandboxRecord = {
      sandboxId: spec.sandboxId,
      sandboxName: spec.sandboxName,
      composeProjectName: spec.composeProjectName,
      repoRoot: options.repoRoot,
      worktreePath: options.worktreePath,
      hostnameSlug: spec.hostnameSlug,
      betterAuthSecret,
      runtimeAssets: spec.runtimeAssets,
      aliasesHealthy,
      status: aliasesHealthy ? "ready" : "degraded",
      ports,
      timestamps: {
        createdAt: options.existingRecord?.timestamps.createdAt ?? options.now,
        updatedAt: options.now,
      },
      missingResources: [],
    };

    yield* options.persist(record);

    return {
      record,
      urls: spec.urls,
      aliasesHealthy,
    };
  }
);
