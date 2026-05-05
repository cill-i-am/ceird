import { Either, Schema } from "effect";

import {
  SandboxId as SandboxIdSchema,
  ensureUniqueSlug,
  hashSandboxSeed,
  SANDBOX_ID_LENGTH,
  sanitizeForHostname,
  validateSandboxId,
} from "./naming.js";
import type {
  ComposeProjectName,
  HostnameSlug,
  SandboxId,
  SandboxName,
} from "./naming.js";
import type { SandboxRuntimeAssets } from "./runtime-spec.js";

export const SandboxService = Schema.Literal("app", "api");
export type SandboxService = Schema.Schema.Type<typeof SandboxService>;

export const SandboxStatus = Schema.Literal(
  "provisioning",
  "ready",
  "degraded",
  "stopped"
);
export type SandboxStatus = Schema.Schema.Type<typeof SandboxStatus>;

export const MissingSandboxResource = Schema.Literal("app", "api", "postgres");
export type MissingSandboxResource = Schema.Schema.Type<
  typeof MissingSandboxResource
>;

export interface SandboxIdentity {
  readonly sandboxId: SandboxId;
  readonly worktreeName: string;
  readonly hostnameSlug: HostnameSlug;
}

export interface DeriveSandboxIdentityOptions {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly preferredName?: string;
  readonly takenSlugs?: ReadonlySet<HostnameSlug>;
}

export interface SandboxPorts {
  readonly app: number;
  readonly api: number;
  readonly postgres: number;
}

export interface SandboxTimestamps {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SandboxRecord {
  readonly sandboxId: SandboxId;
  readonly sandboxName: SandboxName;
  readonly composeProjectName: ComposeProjectName;
  readonly worktreePath: string;
  readonly repoRoot: string;
  readonly hostnameSlug: HostnameSlug;
  readonly betterAuthSecret: string;
  readonly runtimeAssets: SandboxRuntimeAssets;
  readonly aliasesHealthy: boolean;
  readonly status: SandboxStatus;
  readonly ports: SandboxPorts;
  readonly timestamps: SandboxTimestamps;
  readonly missingResources?: readonly MissingSandboxResource[];
}

export interface ReconcileSandboxRecordOptions {
  readonly servicesPresent: ReadonlySet<MissingSandboxResource>;
  readonly portsInUse: ReadonlySet<number>;
  readonly now: string;
}

export const HealthPayload = Schema.Struct({
  ok: Schema.Literal(true),
  service: SandboxService,
  sandboxId: SandboxIdSchema,
});
export type HealthPayload = Schema.Schema.Type<typeof HealthPayload>;

export interface AllocateSandboxPortsOptions {
  readonly existing?: SandboxPorts;
  readonly inUsePorts: ReadonlySet<number>;
}

export interface BuildSandboxUrlsInput {
  readonly hostnameSlug: HostnameSlug;
  readonly ports: SandboxPorts;
}

export interface BuildSandboxUrlsOptions {
  readonly aliasesHealthy: boolean;
  readonly proxyPort: number;
}

export const SandboxHttpUrl = Schema.String.pipe(
  Schema.pattern(/^https?:\/\//),
  Schema.brand("@ceird/SandboxHttpUrl")
);
export type SandboxHttpUrl = Schema.Schema.Type<typeof SandboxHttpUrl>;

export const SandboxPostgresUrl = Schema.String.pipe(
  Schema.pattern(/^postgresql:\/\//),
  Schema.brand("@ceird/SandboxPostgresUrl")
);
export type SandboxPostgresUrl = Schema.Schema.Type<typeof SandboxPostgresUrl>;

export interface SandboxUrls {
  readonly app: SandboxHttpUrl;
  readonly api: SandboxHttpUrl;
  readonly postgres: SandboxPostgresUrl;
  readonly fallbackApp: SandboxHttpUrl;
  readonly fallbackApi: SandboxHttpUrl;
}

const DEFAULT_PORTS: SandboxPorts = {
  app: 4300,
  api: 4301,
  postgres: 5439,
};
const DEFAULT_SANDBOX_ID = validateSandboxId("000000000000");

export function deriveSandboxIdentity(
  options: DeriveSandboxIdentityOptions
): SandboxIdentity {
  const worktreeSegments = options.worktreePath.split(/[/\\]/).filter(Boolean);
  const worktreeName = worktreeSegments.at(-1) ?? "sandbox";
  const preferredName = options.preferredName ?? worktreeName;
  const sandboxId = hashSandboxSeed(
    `${options.repoRoot}::${options.worktreePath}`,
    SANDBOX_ID_LENGTH
  );
  const validatedSandboxId = validateSandboxId(sandboxId);
  const preferredSlug =
    sanitizeForHostname(preferredName) ||
    `sandbox-${validatedSandboxId.slice(0, 6)}`;
  const hostnameSlug = ensureUniqueSlug(
    preferredSlug,
    validatedSandboxId,
    options.takenSlugs
  );

  return {
    sandboxId: validatedSandboxId,
    worktreeName,
    hostnameSlug,
  };
}

export function reconcileSandboxRecord(
  record: SandboxRecord,
  options: ReconcileSandboxRecordOptions
): SandboxRecord {
  const missingResources = collectMissingResources(record, options);

  return {
    ...record,
    status:
      missingResources.length === 0 && record.aliasesHealthy
        ? "ready"
        : "degraded",
    missingResources,
    timestamps: {
      ...record.timestamps,
      updatedAt: options.now,
    },
  };
}

function collectMissingResources(
  record: SandboxRecord,
  options: ReconcileSandboxRecordOptions
): readonly MissingSandboxResource[] {
  return (["app", "api", "postgres"] as const).filter(
    (resource) =>
      !options.servicesPresent.has(resource) ||
      !options.portsInUse.has(record.ports[resource])
  );
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

export function makeHealthPayloadFromSandboxIdInput(
  service: SandboxService,
  sandboxId: unknown
): HealthPayload {
  const parsedSandboxId =
    Schema.decodeUnknownEither(SandboxIdSchema)(sandboxId);
  return makeHealthPayload(
    service,
    Either.getOrElse(parsedSandboxId, () => DEFAULT_SANDBOX_ID)
  );
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
  const fallbackApp = Schema.decodeUnknownSync(SandboxHttpUrl)(
    `http://127.0.0.1:${input.ports.app}`
  );
  const fallbackApi = Schema.decodeUnknownSync(SandboxHttpUrl)(
    `http://127.0.0.1:${input.ports.api}`
  );
  const preferredApp = Schema.decodeUnknownSync(SandboxHttpUrl)(
    `https://${input.hostnameSlug}.app.ceird.localhost:${options.proxyPort}`
  );
  const preferredApi = Schema.decodeUnknownSync(SandboxHttpUrl)(
    `https://${input.hostnameSlug}.api.ceird.localhost:${options.proxyPort}`
  );
  const postgres = Schema.decodeUnknownSync(SandboxPostgresUrl)(
    `postgresql://postgres:postgres@127.0.0.1:${input.ports.postgres}/ceird`
  );

  return {
    app: options.aliasesHealthy ? preferredApp : fallbackApp,
    api: options.aliasesHealthy ? preferredApi : fallbackApi,
    postgres,
    fallbackApp,
    fallbackApi,
  };
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
