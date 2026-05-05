import { Schema } from "effect";

import { MissingSandboxResource, SandboxStatus } from "../domain.js";
import {
  ComposeProjectName,
  HostnameSlug,
  SandboxId,
  SandboxName,
} from "../naming.js";
import { SandboxRuntimeAssets } from "../runtime-spec.js";

export const SANDBOX_REGISTRY_ERROR_TAG =
  "@ceird/sandbox-core/SandboxRegistryError" as const;

export class SandboxRegistryError extends Schema.TaggedError<SandboxRegistryError>()(
  SANDBOX_REGISTRY_ERROR_TAG,
  {
    message: Schema.String,
    registryPath: Schema.String,
  }
) {}

export const SandboxRegistryRecord = Schema.Struct({
  sandboxId: SandboxId,
  sandboxName: SandboxName,
  composeProjectName: ComposeProjectName,
  hostnameSlug: HostnameSlug,
  repoRoot: Schema.String,
  worktreePath: Schema.String,
  betterAuthSecret: Schema.String,
  runtimeAssets: SandboxRuntimeAssets,
  aliasesHealthy: Schema.Boolean,
  ports: Schema.Struct({
    app: Schema.Number,
    api: Schema.Number,
    postgres: Schema.Number,
  }),
  status: SandboxStatus,
  timestamps: Schema.Struct({
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
  missingResources: Schema.optional(Schema.Array(MissingSandboxResource)),
});

export type SandboxRegistryRecord = Schema.Schema.Type<
  typeof SandboxRegistryRecord
>;

export const SandboxRegistryPayload = Schema.Struct({
  sandboxes: Schema.Array(SandboxRegistryRecord),
});

export type SandboxRegistryPayload = Schema.Schema.Type<
  typeof SandboxRegistryPayload
>;
