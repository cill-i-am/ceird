import { createHash } from "node:crypto";
import path from "node:path";

export type SandboxId = string;
export type SandboxService = "app" | "api";
export type SandboxStatus = "provisioning" | "ready" | "degraded" | "stopped";
export type MissingSandboxResource = SandboxService | "postgres";

export interface SandboxIdentity {
  readonly sandboxId: SandboxId;
  readonly worktreeName: string;
  readonly hostnameSlug: string;
}

export interface DeriveSandboxIdentityOptions {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly takenSlugs?: ReadonlySet<string>;
}

export interface SandboxResourceNames {
  readonly containerPrefix: string;
  readonly network: string;
  readonly postgresVolume: string;
  readonly appContainer: string;
  readonly apiContainer: string;
  readonly postgresContainer: string;
  readonly appNodeModulesVolume: string;
  readonly apiNodeModulesVolume: string;
  readonly pnpmStoreVolume: string;
}

export interface SandboxPorts {
  readonly app: number;
  readonly api: number;
  readonly postgres: number;
}

export interface SandboxHostnames {
  readonly app: string;
  readonly api: string;
}

export interface SandboxContainers {
  readonly app: string;
  readonly api: string;
  readonly postgres: string;
}

export interface SandboxTimestamps {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SandboxRecord {
  readonly sandboxId: SandboxId;
  readonly worktreePath: string;
  readonly repoRoot: string;
  readonly hostnameSlug: string;
  readonly betterAuthSecret?: string;
  readonly status: SandboxStatus;
  readonly containers: SandboxContainers;
  readonly ports: SandboxPorts;
  readonly hostnames: SandboxHostnames;
  readonly timestamps: SandboxTimestamps;
  readonly missingResources?: readonly MissingSandboxResource[];
}

export interface ReconcileSandboxRecordOptions {
  readonly containersPresent: ReadonlySet<string>;
  readonly portsInUse: ReadonlySet<number>;
  readonly now: string;
}

export interface HealthPayload {
  readonly ok: true;
  readonly service: SandboxService;
  readonly sandboxId: SandboxId;
}

export interface AllocateSandboxPortsOptions {
  readonly existing?: SandboxPorts;
  readonly inUsePorts: ReadonlySet<number>;
}

export interface BuildSandboxUrlsInput {
  readonly hostnameSlug: string;
  readonly ports: SandboxPorts;
}

export interface BuildSandboxUrlsOptions {
  readonly aliasesHealthy: boolean;
  readonly proxyPort: number;
}

export interface SandboxUrls {
  readonly app: string;
  readonly api: string;
  readonly postgres: string;
  readonly fallbackApp: string;
  readonly fallbackApi: string;
}

const SANDBOX_ID_LENGTH = 12;
const COLLISION_HASH_LENGTH = 6;
const DEFAULT_PORTS: SandboxPorts = {
  app: 4300,
  api: 4301,
  postgres: 5439,
};

export function deriveSandboxIdentity(
  options: DeriveSandboxIdentityOptions
): SandboxIdentity {
  const worktreeName = path.basename(options.worktreePath);
  const sandboxId = hashText(
    `${options.repoRoot}::${options.worktreePath}`,
    SANDBOX_ID_LENGTH
  );
  const preferredSlug =
    sanitizeForHostname(worktreeName) ||
    `sandbox-${sandboxId.slice(0, COLLISION_HASH_LENGTH)}`;
  const hostnameSlug = ensureUniqueSlug(
    preferredSlug,
    sandboxId,
    options.takenSlugs
  );

  return {
    sandboxId,
    worktreeName,
    hostnameSlug,
  };
}

export function makeSandboxResourceNames(
  sandboxId: SandboxId
): SandboxResourceNames {
  const containerPrefix = `tt-sbx-${sandboxId}`;

  return {
    containerPrefix,
    network: containerPrefix,
    postgresVolume: `${containerPrefix}-pg`,
    appContainer: `${containerPrefix}-app`,
    apiContainer: `${containerPrefix}-api`,
    postgresContainer: `${containerPrefix}-postgres`,
    appNodeModulesVolume: `${containerPrefix}-app-node-modules`,
    apiNodeModulesVolume: `${containerPrefix}-api-node-modules`,
    pnpmStoreVolume: "tt-sbx-pnpm-store",
  };
}

export function reconcileSandboxRecord(
  record: SandboxRecord,
  options: ReconcileSandboxRecordOptions
): SandboxRecord {
  const missingResources: MissingSandboxResource[] = [];

  if (
    !options.containersPresent.has(record.containers.app) ||
    !options.portsInUse.has(record.ports.app)
  ) {
    missingResources.push("app");
  }

  if (
    !options.containersPresent.has(record.containers.api) ||
    !options.portsInUse.has(record.ports.api)
  ) {
    missingResources.push("api");
  }

  if (
    !options.containersPresent.has(record.containers.postgres) ||
    !options.portsInUse.has(record.ports.postgres)
  ) {
    missingResources.push("postgres");
  }

  const status: SandboxStatus =
    missingResources.length === 0 ? "ready" : "degraded";

  return {
    ...record,
    status,
    missingResources,
    timestamps: {
      ...record.timestamps,
      updatedAt: options.now,
    },
  };
}

export function makeHealthPayload(
  service: SandboxService,
  sandboxId: SandboxId
): HealthPayload {
  return {
    ok: true,
    service,
    sandboxId,
  };
}

export function allocateSandboxPorts(
  options: AllocateSandboxPortsOptions
): SandboxPorts {
  const allocated = new Set<number>();

  const app = allocatePort("app", options, allocated);
  const api = allocatePort("api", options, allocated);
  const postgres = allocatePort("postgres", options, allocated);

  return {
    app,
    api,
    postgres,
  };
}

export function buildSandboxUrls(
  input: BuildSandboxUrlsInput,
  options: BuildSandboxUrlsOptions
): SandboxUrls {
  const fallbackApp = `http://127.0.0.1:${input.ports.app}`;
  const fallbackApi = `http://127.0.0.1:${input.ports.api}`;
  const preferredApp = `https://${input.hostnameSlug}.app.task-tracker.localhost:${options.proxyPort}`;
  const preferredApi = `https://${input.hostnameSlug}.api.task-tracker.localhost:${options.proxyPort}`;

  return {
    app: options.aliasesHealthy ? preferredApp : fallbackApp,
    api: options.aliasesHealthy ? preferredApi : fallbackApi,
    postgres: `postgresql://127.0.0.1:${input.ports.postgres}/task_tracker`,
    fallbackApp,
    fallbackApi,
  };
}

export function sanitizeForHostname(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function ensureUniqueSlug(
  preferredSlug: string,
  sandboxId: SandboxId,
  takenSlugs: ReadonlySet<string> | undefined
): string {
  if (!takenSlugs || !takenSlugs.has(preferredSlug)) {
    return preferredSlug;
  }

  return `${preferredSlug}-${sandboxId.slice(0, COLLISION_HASH_LENGTH)}`;
}

function hashText(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function allocatePort(
  service: keyof SandboxPorts,
  options: AllocateSandboxPortsOptions,
  allocated: Set<number>
): number {
  const existingPort = options.existing?.[service];
  const startingPort = DEFAULT_PORTS[service];

  if (
    existingPort !== undefined &&
    !options.inUsePorts.has(existingPort) &&
    !allocated.has(existingPort)
  ) {
    allocated.add(existingPort);
    return existingPort;
  }

  const protectedExistingPorts = new Set<number>();
  for (const [otherService, port] of Object.entries(options.existing ?? {})) {
    if (
      otherService !== service &&
      port !== undefined &&
      !options.inUsePorts.has(port)
    ) {
      protectedExistingPorts.add(port);
    }
  }

  let port = startingPort;
  while (
    options.inUsePorts.has(port) ||
    protectedExistingPorts.has(port) ||
    allocated.has(port)
  ) {
    port += 1;
  }

  allocated.add(port);
  return port;
}
