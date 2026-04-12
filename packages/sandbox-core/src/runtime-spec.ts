import { Effect, Schema } from "effect";

import {
  SandboxHttpUrl,
  SandboxPostgresUrl,
  buildSandboxUrls,
} from "./domain.js";
import type { SandboxPorts, SandboxUrls } from "./domain.js";
import { SandboxNameConflictError } from "./name-conflict-error.js";
import {
  ComposeProjectName as ComposeProjectNameSchema,
  HostnameSlug as HostnameSlugSchema,
  SandboxId as SandboxIdSchema,
  SandboxName as SandboxNameSchema,
  hashSandboxSeed,
  makeComposeProjectName,
  validateSandboxId,
} from "./naming.js";
import type {
  ComposeProjectName,
  HostnameSlug,
  SandboxId,
  SandboxName,
} from "./naming.js";

export interface SandboxRuntimeSpec {
  readonly sandboxId: SandboxId;
  readonly sandboxName: SandboxName;
  readonly composeProjectName: ComposeProjectName;
  readonly hostnameSlug: HostnameSlug;
  readonly ports: SandboxPorts;
  readonly urls: SandboxUrls;
  readonly runtimeAssets: SandboxRuntimeAssets;
  readonly overrides: SandboxRuntimeOverrides;
}

export const SandboxDockerImageReference = Schema.NonEmptyString.pipe(
  Schema.brand("@task-tracker/SandboxDockerImageReference")
);
export type SandboxDockerImageReference = Schema.Schema.Type<
  typeof SandboxDockerImageReference
>;

export const SandboxDockerVolumeName = Schema.NonEmptyString.pipe(
  Schema.brand("@task-tracker/SandboxDockerVolumeName")
);
export type SandboxDockerVolumeName = Schema.Schema.Type<
  typeof SandboxDockerVolumeName
>;

export const SandboxRuntimeAssets = Schema.Struct({
  devImage: SandboxDockerImageReference,
  nodeModulesVolume: SandboxDockerVolumeName,
  pnpmStoreVolume: SandboxDockerVolumeName,
});
export type SandboxRuntimeAssets = Schema.Schema.Type<
  typeof SandboxRuntimeAssets
>;

export interface SharedSandboxEnvironment {
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME: string;
  readonly RESEND_API_KEY: string;
}

export const SharedSandboxEnvironment = Schema.Struct({
  AUTH_EMAIL_FROM: Schema.NonEmptyString,
  AUTH_EMAIL_FROM_NAME: Schema.NonEmptyString,
  RESEND_API_KEY: Schema.NonEmptyString,
});

export const SandboxRuntimeOverrides = Schema.Struct({
  API_HOST_PORT: Schema.String,
  APP_HOST_PORT: Schema.String,
  AUTH_APP_ORIGIN: SandboxHttpUrl,
  AUTH_EMAIL_FROM: Schema.NonEmptyString,
  AUTH_EMAIL_FROM_NAME: Schema.NonEmptyString,
  AUTH_ORIGIN: SandboxHttpUrl,
  BETTER_AUTH_BASE_URL: SandboxHttpUrl,
  BETTER_AUTH_SECRET: Schema.NonEmptyString,
  DATABASE_URL: SandboxPostgresUrl,
  HOST: Schema.String,
  PORT: Schema.String,
  POSTGRES_HOST_PORT: Schema.String,
  RESEND_API_KEY: Schema.NonEmptyString,
  SANDBOX_ID: SandboxIdSchema,
  SANDBOX_DEV_IMAGE: SandboxDockerImageReference,
  SANDBOX_NODE_MODULES_VOLUME: SandboxDockerVolumeName,
  SANDBOX_NAME: SandboxNameSchema,
  SANDBOX_PNPM_STORE_VOLUME: SandboxDockerVolumeName,
  TASK_TRACKER_SANDBOX: Schema.Literal("1"),
  VITE_AUTH_ORIGIN: SandboxHttpUrl,
});

export type SandboxRuntimeOverrides = Schema.Schema.Type<
  typeof SandboxRuntimeOverrides
>;

export function buildSandboxRuntimeOverrides(input: {
  readonly ports: SandboxPorts;
  readonly urls: SandboxUrls;
  readonly runtimeAssets: SandboxRuntimeAssets;
  readonly betterAuthSecret: string;
  readonly sandboxId: SandboxId;
  readonly sandboxName: SandboxName;
  readonly sharedEnvironment: SharedSandboxEnvironment;
}): SandboxRuntimeOverrides {
  return Schema.decodeUnknownSync(SandboxRuntimeOverrides)({
    API_HOST_PORT: String(input.ports.api),
    APP_HOST_PORT: String(input.ports.app),
    AUTH_APP_ORIGIN: input.urls.app,
    AUTH_EMAIL_FROM: input.sharedEnvironment.AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME: input.sharedEnvironment.AUTH_EMAIL_FROM_NAME,
    AUTH_ORIGIN: `http://api:${input.ports.api}`,
    BETTER_AUTH_BASE_URL: input.urls.api,
    BETTER_AUTH_SECRET: input.betterAuthSecret,
    DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/task_tracker",
    HOST: "0.0.0.0",
    PORT: String(input.ports.api),
    POSTGRES_HOST_PORT: String(input.ports.postgres),
    RESEND_API_KEY: input.sharedEnvironment.RESEND_API_KEY,
    SANDBOX_ID: input.sandboxId,
    SANDBOX_DEV_IMAGE: input.runtimeAssets.devImage,
    SANDBOX_NODE_MODULES_VOLUME: input.runtimeAssets.nodeModulesVolume,
    SANDBOX_NAME: input.sandboxName,
    SANDBOX_PNPM_STORE_VOLUME: input.runtimeAssets.pnpmStoreVolume,
    TASK_TRACKER_SANDBOX: "1",
    VITE_AUTH_ORIGIN: input.urls.api,
  });
}

export const buildSandboxRuntimeSpec = Effect.fn("SandboxRuntimeSpec.build")(
  function* (input: {
    readonly repoRoot: string;
    readonly worktreePath: string;
    readonly sandboxName: SandboxName;
    readonly takenNames?: ReadonlySet<SandboxName>;
    readonly ports: SandboxPorts;
    readonly runtimeAssets: SandboxRuntimeAssets;
    readonly betterAuthSecret: string;
    readonly aliasesHealthy: boolean;
    readonly proxyPort: number;
    readonly sharedEnvironment: SharedSandboxEnvironment;
  }) {
    yield* Effect.annotateCurrentSpan("sandboxName", input.sandboxName);
    yield* Effect.annotateCurrentSpan("worktreePath", input.worktreePath);
    yield* Effect.annotateCurrentSpan("repoRoot", input.repoRoot);
    const takenNames = input.takenNames ?? new Set<SandboxName>();

    if (takenNames.has(input.sandboxName)) {
      yield* Effect.fail(
        new SandboxNameConflictError({
          message: `Sandbox name ${input.sandboxName} is already in use.`,
          sandboxName: input.sandboxName,
        })
      );
    }

    const sandboxId = validateSandboxId(
      hashSandboxSeed(
        `${input.repoRoot}::${input.worktreePath}::${input.sandboxName}`
      )
    );
    const composeProjectName = makeComposeProjectName(input.sandboxName);
    const hostnameSlug = Schema.decodeUnknownSync(HostnameSlugSchema)(
      input.sandboxName
    );
    const urls = buildSandboxUrls(
      {
        hostnameSlug,
        ports: input.ports,
      },
      {
        aliasesHealthy: input.aliasesHealthy,
        proxyPort: input.proxyPort,
      }
    );

    return {
      sandboxId,
      sandboxName: input.sandboxName,
      composeProjectName: Schema.decodeUnknownSync(ComposeProjectNameSchema)(
        composeProjectName
      ),
      hostnameSlug,
      ports: input.ports,
      urls,
      runtimeAssets: input.runtimeAssets,
      overrides: buildSandboxRuntimeOverrides({
        ports: input.ports,
        urls,
        runtimeAssets: input.runtimeAssets,
        betterAuthSecret: input.betterAuthSecret,
        sandboxId,
        sandboxName: input.sandboxName,
        sharedEnvironment: input.sharedEnvironment,
      }),
    };
  }
);
