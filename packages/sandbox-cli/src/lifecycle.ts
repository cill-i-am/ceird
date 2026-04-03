import {
  buildSandboxUrls,
  deriveSandboxIdentity,
  makeSandboxResourceNames,
} from "@task-tracker/sandbox-core";
import type {
  SandboxPorts,
  SandboxRecord,
  SandboxUrls,
} from "@task-tracker/sandbox-core";

export interface BringSandboxUpOptions {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly now: string;
  readonly takenSlugs: ReadonlySet<string>;
  readonly existingRecord: SandboxRecord | undefined;
  readonly generateBetterAuthSecret: () => string;
  readonly ensurePrerequisites: () => Promise<void>;
  readonly allocatePorts: () => Promise<SandboxPorts>;
  readonly startStack: (record: SandboxRecord) => Promise<void>;
  readonly waitForHealth: (record: SandboxRecord) => Promise<void>;
  readonly registerAliases: (record: SandboxRecord) => Promise<void>;
  readonly persist: (record: SandboxRecord) => Promise<void>;
}

export interface SandboxUpResult {
  readonly record: SandboxRecord;
  readonly urls: SandboxUrls;
  readonly aliasesHealthy: boolean;
}

export async function bringSandboxUp(
  options: BringSandboxUpOptions
): Promise<SandboxUpResult> {
  const identity = deriveSandboxIdentity({
    repoRoot: options.repoRoot,
    worktreePath: options.worktreePath,
    takenSlugs: options.takenSlugs,
  });
  const ports = await options.allocatePorts();
  const resourceNames = makeSandboxResourceNames(identity.sandboxId);

  const record: SandboxRecord = {
    sandboxId: identity.sandboxId,
    repoRoot: options.repoRoot,
    worktreePath: options.worktreePath,
    hostnameSlug: identity.hostnameSlug,
    betterAuthSecret:
      options.existingRecord?.betterAuthSecret ??
      options.generateBetterAuthSecret(),
    status: "ready",
    containers: {
      app: resourceNames.appContainer,
      api: resourceNames.apiContainer,
      postgres: resourceNames.postgresContainer,
    },
    ports,
    hostnames: {
      app: `${identity.hostnameSlug}.app.task-tracker.localhost`,
      api: `${identity.hostnameSlug}.api.task-tracker.localhost`,
    },
    timestamps: {
      createdAt: options.existingRecord?.timestamps.createdAt ?? options.now,
      updatedAt: options.now,
    },
    missingResources: [],
  };

  await options.ensurePrerequisites();
  await options.startStack(record);
  await options.waitForHealth(record);

  let aliasesHealthy = true;
  try {
    await options.registerAliases(record);
  } catch {
    aliasesHealthy = false;
  }

  await options.persist(record);

  return {
    record,
    urls: buildSandboxUrls(
      {
        hostnameSlug: identity.hostnameSlug,
        ports,
      },
      {
        aliasesHealthy,
        proxyPort: 1355,
      }
    ),
    aliasesHealthy,
  };
}
