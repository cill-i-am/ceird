# Sandbox Compose Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built sandbox runtime with a compose-backed, Effect-native sandbox flow that validates shared env from the repo, computes sandbox-safe overrides, supports explicit sandbox names, and gives a clearer CLI.

**Architecture:** Keep `app`, `api`, and `postgres` as separate services, but manage them as one Docker Compose project per sandbox. Move sandbox domain logic, env validation, and runtime spec generation into `sandbox-core`, with a browser-safe root export and a Node-only export for env loading. Keep `sandbox-cli` focused on orchestration, state persistence, portless integration, and user-facing CLI output.

**Tech Stack:** TypeScript, Effect, @effect/cli, Docker Compose, pnpm, Turborepo, Vitest

---

## File Structure

### `packages/sandbox-core`

- Create: `packages/sandbox-core/src/domain.ts`
- Create: `packages/sandbox-core/src/errors.ts`
- Create: `packages/sandbox-core/src/naming.ts`
- Create: `packages/sandbox-core/src/runtime-spec.ts`
- Create: `packages/sandbox-core/src/node/env.ts`
- Create: `packages/sandbox-core/src/node/state.ts`
- Create: `packages/sandbox-core/src/node/index.ts`
- Modify: `packages/sandbox-core/src/index.ts`
- Modify: `packages/sandbox-core/package.json`
- Test: `packages/sandbox-core/src/domain.test.ts`
- Test: `packages/sandbox-core/src/runtime-spec.test.ts`
- Test: `packages/sandbox-core/src/node/env.test.ts`
- Test: `packages/sandbox-core/src/node/state.test.ts`

### `packages/sandbox-cli`

- Create: `packages/sandbox-cli/src/compose.ts`
- Create: `packages/sandbox-cli/src/compose.test.ts`
- Create: `packages/sandbox-cli/src/registry.ts`
- Create: `packages/sandbox-cli/src/registry.test.ts`
- Modify: `packages/sandbox-cli/src/cli.ts`
- Modify: `packages/sandbox-cli/src/lifecycle.ts`
- Modify: `packages/sandbox-cli/src/runtime.ts`
- Modify: `packages/sandbox-cli/src/process.ts`
- Modify: `packages/sandbox-cli/src/portless.ts`
- Modify: `packages/sandbox-cli/src/portless.test.ts`
- Modify: `packages/sandbox-cli/src/sandbox-view.ts`
- Modify: `packages/sandbox-cli/src/sandbox-view.test.ts`
- Modify: `packages/sandbox-cli/src/lifecycle.test.ts`
- Modify: `packages/sandbox-cli/src/runtime.test.ts`
- Modify: `packages/sandbox-cli/src/cli.test.ts`

### Docker / Repo Wiring

- Create: `packages/sandbox-cli/docker/sandbox.compose.yaml`
- Modify: `packages/sandbox-cli/docker/sandbox-dev.Dockerfile`
- Modify: `packages/sandbox-cli/docker/sandbox-entrypoint.sh`
- Modify: `turbo.json`

### Files Intentionally Left Alone

- Keep `apps/app/package.json` and `apps/api/package.json` package-local `sandbox:dev` scripts unless the compose integration proves they need only command-string adjustments.
- Keep `scripts/dev.mjs` as the non-sandbox local dev flow.

### Responsibility Split

- `packages/sandbox-core/src/index.ts`: browser-safe shared helpers only
- `packages/sandbox-core/src/node/index.ts`: Node-only env/state helpers for the CLI
- `packages/sandbox-cli/src/compose.ts`: compose command args and generated env-file writing
- `packages/sandbox-cli/src/registry.ts`: persisted sandbox metadata I/O
- `packages/sandbox-cli/src/lifecycle.ts`: compose-backed lifecycle orchestration
- `packages/sandbox-cli/src/cli.ts`: command/option parsing and top-level rendering

### Task 1: Split `sandbox-core` Into Browser-Safe Domain Exports And Runtime Spec Helpers

**Files:**

- Create: `packages/sandbox-core/src/domain.ts`
- Create: `packages/sandbox-core/src/errors.ts`
- Create: `packages/sandbox-core/src/naming.ts`
- Create: `packages/sandbox-core/src/runtime-spec.ts`
- Modify: `packages/sandbox-core/src/index.ts`
- Modify: `packages/sandbox-core/package.json`
- Test: `packages/sandbox-core/src/domain.test.ts`
- Test: `packages/sandbox-core/src/runtime-spec.test.ts`

- [ ] **Step 1: Write the failing domain and runtime-spec tests**

```ts
// packages/sandbox-core/src/runtime-spec.test.ts
import { buildSandboxRuntimeSpec } from "./runtime-spec.js";
import { validateSandboxName } from "./naming.js";

describe("validateSandboxName()", () => {
  it("accepts lowercase kebab-case names", () => {
    expect(validateSandboxName("agent-one")).toBe("agent-one");
  });

  it("rejects names with spaces or uppercase characters", () => {
    expect(() => validateSandboxName("Agent One")).toThrowError(
      /Sandbox names must use lowercase letters, numbers, and hyphens/
    );
  });
});

describe("buildSandboxRuntimeSpec()", () => {
  it("builds a compose project name, urls, and overrides from an explicit name", () => {
    expect(
      buildSandboxRuntimeSpec({
        repoRoot: "/Users/me/ceird",
        worktreePath: "/Users/me/ceird/.worktrees/feature-sandbox",
        sandboxName: "agent-one",
        takenNames: new Set(["other-sandbox"]),
        ports: {
          app: 4300,
          api: 4301,
          postgres: 5439,
        },
        betterAuthSecret: "0123456789abcdef0123456789abcdef",
        aliasesHealthy: true,
        proxyPort: 1355,
      })
    ).toMatchObject({
      sandboxName: "agent-one",
      composeProjectName: "ceird-sbx-agent-one",
      hostnameSlug: "agent-one",
      urls: {
        app: "https://agent-one.app.ceird.localhost:1355",
        api: "https://agent-one.api.ceird.localhost:1355",
      },
      overrides: {
        SANDBOX_ID: expect.any(String),
        CEIRD_SANDBOX: "1",
        BETTER_AUTH_BASE_URL: "https://agent-one.api.ceird.localhost:1355",
      },
    });
  });
});
```

```ts
// packages/sandbox-core/src/domain.test.ts
import { makeHealthPayload, reconcileSandboxRecord } from "./domain.js";

describe("reconcileSandboxRecord()", () => {
  it("marks a compose-backed sandbox degraded when a service is missing", () => {
    expect(
      reconcileSandboxRecord(
        {
          sandboxId: "abc123def456",
          sandboxName: "agent-one",
          composeProjectName: "ceird-sbx-agent-one",
          worktreePath: "/Users/me/ceird/.worktrees/agent-one",
          repoRoot: "/Users/me/ceird",
          hostnameSlug: "agent-one",
          status: "ready",
          ports: { app: 4300, api: 4301, postgres: 5439 },
          timestamps: {
            createdAt: "2026-04-05T09:00:00.000Z",
            updatedAt: "2026-04-05T09:00:00.000Z",
          },
        },
        {
          servicesPresent: new Set(["postgres", "api"]),
          portsInUse: new Set([4301, 5439]),
          now: "2026-04-05T09:05:00.000Z",
        }
      )
    ).toMatchObject({
      status: "degraded",
      missingResources: ["app"],
    });
  });
});

describe("makeHealthPayload()", () => {
  it("keeps the shared app/api health contract unchanged", () => {
    expect(makeHealthPayload("api", "abc123def456")).toStrictEqual({
      ok: true,
      service: "api",
      sandboxId: "abc123def456",
    });
  });
});
```

- [ ] **Step 2: Run the new `sandbox-core` tests to verify they fail for missing exports and types**

Run: `pnpm --filter @ceird/sandbox-core test`
Expected: FAIL with missing-module, missing-export, or type errors for `runtime-spec.ts`, `domain.ts`, and the new record shape.

- [ ] **Step 3: Implement the browser-safe domain modules and runtime-spec helpers**

```ts
// packages/sandbox-core/src/errors.ts
import { Schema } from "effect";

export class SandboxNameError extends Schema.TaggedError<SandboxNameError>()(
  "SandboxNameError",
  {
    message: Schema.String,
    sandboxName: Schema.String,
  }
) {}
```

```ts
// packages/sandbox-core/src/naming.ts
import { SandboxNameError } from "./errors.js";

export function validateSandboxName(name: string): string {
  const normalized = name.trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new SandboxNameError({
      message:
        "Sandbox names must use lowercase letters, numbers, and hyphens.",
      sandboxName: name,
    });
  }

  return normalized;
}

export function makeComposeProjectName(sandboxName: string): string {
  return `ceird-sbx-${validateSandboxName(sandboxName)}`;
}
```

```ts
// packages/sandbox-core/src/runtime-spec.ts
import { buildSandboxUrls } from "./domain.js";
import { makeComposeProjectName, validateSandboxName } from "./naming.js";

export interface SandboxRuntimeSpec {
  readonly sandboxId: string;
  readonly sandboxName: string;
  readonly composeProjectName: string;
  readonly hostnameSlug: string;
  readonly ports: {
    readonly app: number;
    readonly api: number;
    readonly postgres: number;
  };
  readonly urls: ReturnType<typeof buildSandboxUrls>;
  readonly overrides: Record<string, string>;
}

export function buildSandboxRuntimeSpec(input: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly sandboxName: string;
  readonly takenNames: ReadonlySet<string>;
  readonly ports: {
    readonly app: number;
    readonly api: number;
    readonly postgres: number;
  };
  readonly betterAuthSecret: string;
  readonly aliasesHealthy: boolean;
  readonly proxyPort: number;
}): SandboxRuntimeSpec {
  const sandboxName = validateSandboxName(input.sandboxName);

  if (input.takenNames.has(sandboxName)) {
    throw new Error(`Sandbox name ${sandboxName} is already in use.`);
  }

  const sandboxId = hashSandboxSeed(
    `${input.repoRoot}::${input.worktreePath}::${sandboxName}`
  );
  const composeProjectName = makeComposeProjectName(sandboxName);
  const urls = buildSandboxUrls(
    {
      hostnameSlug: sandboxName,
      ports: input.ports,
    },
    {
      aliasesHealthy: input.aliasesHealthy,
      proxyPort: input.proxyPort,
    }
  );

  return {
    sandboxId,
    sandboxName,
    composeProjectName,
    hostnameSlug: sandboxName,
    ports: input.ports,
    urls,
    overrides: {
      SANDBOX_ID: sandboxId,
      CEIRD_SANDBOX: "1",
      HOST: "0.0.0.0",
      APP_PORT: String(input.ports.app),
      API_PORT: String(input.ports.api),
      POSTGRES_PORT: String(input.ports.postgres),
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/ceird",
      BETTER_AUTH_SECRET: input.betterAuthSecret,
      BETTER_AUTH_BASE_URL: urls.api,
      AUTH_ORIGIN: `http://api:${input.ports.api}`,
      VITE_AUTH_ORIGIN: urls.api,
    },
  };
}

function hashSandboxSeed(seed: string): string {
  let hash = 5381;

  for (const character of seed) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }

  return Math.abs(hash).toString(16).padStart(12, "0").slice(0, 12);
}
```

```ts
// packages/sandbox-core/src/index.ts
export * from "./domain.js";
export * from "./errors.js";
export * from "./naming.js";
export * from "./runtime-spec.js";
```

```json
// packages/sandbox-core/package.json
{
  "exports": {
    ".": "./src/index.ts",
    "./node": "./src/node/index.ts"
  }
}
```

- [ ] **Step 4: Re-run the `sandbox-core` test suite and verify the new modules pass**

Run: `pnpm --filter @ceird/sandbox-core test`
Expected: PASS with the existing health/url tests still green and the new runtime-spec tests passing.

- [ ] **Step 5: Commit the `sandbox-core` browser-safe split**

```bash
git add \
  packages/sandbox-core/package.json \
  packages/sandbox-core/src/domain.ts \
  packages/sandbox-core/src/errors.ts \
  packages/sandbox-core/src/index.ts \
  packages/sandbox-core/src/naming.ts \
  packages/sandbox-core/src/runtime-spec.ts \
  packages/sandbox-core/src/domain.test.ts \
  packages/sandbox-core/src/runtime-spec.test.ts
git commit -m "refactor(sandbox-core): split sandbox domain helpers"
```

### Task 2: Add Node-Only Env Loading, Validation, And Persisted State Codecs In `sandbox-core`

**Files:**

- Create: `packages/sandbox-core/src/node/env.ts`
- Create: `packages/sandbox-core/src/node/state.ts`
- Create: `packages/sandbox-core/src/node/index.ts`
- Test: `packages/sandbox-core/src/node/env.test.ts`
- Test: `packages/sandbox-core/src/node/state.test.ts`

- [ ] **Step 1: Write failing tests for env loading, override precedence, and state round-tripping**

```ts
// packages/sandbox-core/src/node/env.test.ts
import { Effect, Exit } from "effect";

import { loadSandboxSharedEnvironment } from "./env.js";

describe("loadSandboxSharedEnvironment()", () => {
  it("fails fast when required shared env is missing", async () => {
    const exit = await Effect.runPromiseExit(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {},
        readFile: async () => "",
      })
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toMatch(/AUTH_EMAIL_FROM/);
    expect(JSON.stringify(exit)).toMatch(/RESEND_API_KEY/);
  });

  it("merges repo .env values and lets process env override them", async () => {
    const result = await Effect.runPromise(
      loadSandboxSharedEnvironment({
        repoRoot: "/repo",
        processEnv: {
          AUTH_EMAIL_FROM_NAME: "Override Sender",
        },
        readFile: async (filePath) => {
          if (filePath.endsWith(".env")) {
            return [
              "AUTH_EMAIL_FROM=auth@example.com",
              "AUTH_EMAIL_FROM_NAME=Ceird",
              "RESEND_API_KEY=re_live_123",
            ].join("\n");
          }

          return "";
        },
      })
    );

    expect(result).toStrictEqual({
      AUTH_EMAIL_FROM: "auth@example.com",
      AUTH_EMAIL_FROM_NAME: "Override Sender",
      RESEND_API_KEY: "re_live_123",
    });
  });
});
```

```ts
// packages/sandbox-core/src/node/state.test.ts
import { Schema } from "effect";

import { SandboxRegistryRecord } from "./state.js";

describe("SandboxRegistryRecord", () => {
  it("round-trips a compose-backed sandbox record", () => {
    const value = Schema.decodeUnknownSync(SandboxRegistryRecord)({
      sandboxId: "abc123def456",
      sandboxName: "agent-one",
      composeProjectName: "ceird-sbx-agent-one",
      hostnameSlug: "agent-one",
      repoRoot: "/Users/me/ceird",
      worktreePath: "/Users/me/ceird/.worktrees/agent-one",
      betterAuthSecret: "0123456789abcdef0123456789abcdef",
      ports: { app: 4300, api: 4301, postgres: 5439 },
      status: "ready",
      timestamps: {
        createdAt: "2026-04-05T09:00:00.000Z",
        updatedAt: "2026-04-05T09:05:00.000Z",
      },
    });

    expect(value.composeProjectName).toBe("ceird-sbx-agent-one");
  });
});
```

- [ ] **Step 2: Run the `sandbox-core` test suite again to verify the new Node-only tests fail**

Run: `pnpm --filter @ceird/sandbox-core test`
Expected: FAIL because `./node/env.ts`, `./node/state.ts`, and `./node/index.ts` do not exist yet.

- [ ] **Step 3: Implement the Node-only env/state modules under the new `./node` export**

```ts
// packages/sandbox-core/src/node/state.ts
import { Schema } from "effect";

export const SandboxRegistryRecord = Schema.Struct({
  sandboxId: Schema.String,
  sandboxName: Schema.String,
  composeProjectName: Schema.String,
  hostnameSlug: Schema.String,
  repoRoot: Schema.String,
  worktreePath: Schema.String,
  betterAuthSecret: Schema.String,
  ports: Schema.Struct({
    app: Schema.Number,
    api: Schema.Number,
    postgres: Schema.Number,
  }),
  status: Schema.Literal("provisioning", "ready", "degraded", "stopped"),
  timestamps: Schema.Struct({
    createdAt: Schema.String,
    updatedAt: Schema.String,
  }),
});

export type SandboxRegistryRecord = Schema.Schema.Type<
  typeof SandboxRegistryRecord
>;
```

```ts
// packages/sandbox-core/src/node/env.ts
import path from "node:path";

import { Config, Effect, Schema } from "effect";

export class SandboxConfigError extends Schema.TaggedError<SandboxConfigError>()(
  "SandboxConfigError",
  {
    message: Schema.String,
    variable: Schema.optional(Schema.String),
  }
) {}

const SharedSandboxEnvironment = Schema.Struct({
  AUTH_EMAIL_FROM: Schema.NonEmptyString,
  AUTH_EMAIL_FROM_NAME: Schema.NonEmptyString,
  RESEND_API_KEY: Schema.NonEmptyString,
});

export type SharedSandboxEnvironment = Schema.Schema.Type<
  typeof SharedSandboxEnvironment
>;

const ENV_FILES = [".env", ".env.local"] as const;

export const loadSandboxSharedEnvironment = (input: {
  readonly repoRoot: string;
  readonly processEnv: Record<string, string | undefined>;
  readonly readFile: (filePath: string) => Promise<string>;
}) =>
  Effect.gen(function* () {
    let fileEnv: Record<string, string> = {};

    for (const relativePath of ENV_FILES) {
      const next = yield* Effect.tryPromise({
        try: () => input.readFile(path.join(input.repoRoot, relativePath)),
        catch: () => "",
      });

      fileEnv = {
        ...fileEnv,
        ...Object.fromEntries(
          next
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("#"))
            .map((line) => {
              const [key, ...value] = line.split("=");
              return [key, value.join("=")];
            })
        ),
      };
    }

    const merged = {
      ...fileEnv,
      ...Object.fromEntries(
        Object.entries(input.processEnv).filter(
          ([, value]) => typeof value === "string"
        )
      ),
    };

    return yield* Schema.decodeUnknown(SharedSandboxEnvironment)(merged).pipe(
      Effect.mapError(
        (error) =>
          new SandboxConfigError({
            message: `Sandbox shared env is incomplete: ${error.message}`,
          })
      )
    );
  });
```

```ts
// packages/sandbox-core/src/node/index.ts
export * from "./env.js";
export * from "./state.js";
```

- [ ] **Step 4: Re-run the `sandbox-core` tests and type-check the package**

Run: `pnpm --filter @ceird/sandbox-core test`
Expected: PASS with the new `env` and `state` tests green.

Run: `pnpm --filter @ceird/sandbox-core check-types`
Expected: PASS with no Node-import leakage through the root `@ceird/sandbox-core` export.

- [ ] **Step 5: Commit the Node-only `sandbox-core` env/state layer**

```bash
git add \
  packages/sandbox-core/src/node/env.ts \
  packages/sandbox-core/src/node/index.ts \
  packages/sandbox-core/src/node/state.ts \
  packages/sandbox-core/src/node/env.test.ts \
  packages/sandbox-core/src/node/state.test.ts
git commit -m "feat(sandbox-core): add sandbox env and state contracts"
```

### Task 3: Add The Checked-In Compose Stack And Generated Compose Env Flow

**Files:**

- Create: `packages/sandbox-cli/docker/sandbox.compose.yaml`
- Create: `packages/sandbox-cli/src/compose.ts`
- Create: `packages/sandbox-cli/src/compose.test.ts`
- Modify: `packages/sandbox-cli/docker/sandbox-dev.Dockerfile`
- Modify: `packages/sandbox-cli/docker/sandbox-entrypoint.sh`
- Modify: `packages/sandbox-cli/src/process.ts`

- [ ] **Step 1: Write failing tests for compose arg generation and generated env-file content**

```ts
// packages/sandbox-cli/src/compose.test.ts
import {
  buildComposeCommandArgs,
  renderComposeEnvironmentFile,
} from "./compose.js";

describe("buildComposeCommandArgs()", () => {
  it("builds docker compose args for a named sandbox project", () => {
    expect(
      buildComposeCommandArgs({
        composeFile: "/repo/packages/sandbox-cli/docker/sandbox.compose.yaml",
        composeEnvFile: "/Users/me/.ceird/sandboxes/agent-one/compose.env",
        composeProjectName: "ceird-sbx-agent-one",
        subcommand: ["up", "-d", "--wait"],
      })
    ).toStrictEqual([
      "compose",
      "--file",
      "/repo/packages/sandbox-cli/docker/sandbox.compose.yaml",
      "--project-name",
      "ceird-sbx-agent-one",
      "--env-file",
      "/Users/me/.ceird/sandboxes/agent-one/compose.env",
      "up",
      "-d",
      "--wait",
    ]);
  });
});

describe("renderComposeEnvironmentFile()", () => {
  it("writes both compose substitution variables and service env overrides", () => {
    expect(
      renderComposeEnvironmentFile({
        repoRoot: "/repo",
        worktreePath: "/repo/.worktrees/agent-one",
        proxyPort: 1355,
        overrides: {
          APP_PORT: "4300",
          API_PORT: "4301",
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Ceird",
          BETTER_AUTH_BASE_URL: "https://agent-one.api.ceird.localhost:1355",
          RESEND_API_KEY: "re_live_123",
        },
      })
    ).toContain("SANDBOX_WORKTREE_PATH=/repo/.worktrees/agent-one");
  });
});
```

- [ ] **Step 2: Run the `sandbox-cli` tests to verify the compose helper tests fail**

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: FAIL with missing-module errors for `compose.ts` and missing compose helper exports.

- [ ] **Step 3: Implement the compose file, env-file renderer, and docker helper changes**

```yaml
# packages/sandbox-cli/docker/sandbox.compose.yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ceird
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
    ports:
      - "127.0.0.1:${POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ceird"]
      interval: 2s
      timeout: 2s
      retries: 60

  api:
    build:
      context: ${SANDBOX_REPO_ROOT}
      dockerfile: packages/sandbox-cli/docker/sandbox-dev.Dockerfile
    working_dir: /workspace
    command: ["sandbox-entrypoint.sh", "api"]
    environment:
      HOST: 0.0.0.0
      PORT: ${API_PORT}
      SANDBOX_ID: ${SANDBOX_ID}
      CEIRD_SANDBOX: ${CEIRD_SANDBOX}
      DATABASE_URL: ${DATABASE_URL}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_BASE_URL: ${BETTER_AUTH_BASE_URL}
      AUTH_EMAIL_FROM: ${AUTH_EMAIL_FROM}
      AUTH_EMAIL_FROM_NAME: ${AUTH_EMAIL_FROM_NAME}
      RESEND_API_KEY: ${RESEND_API_KEY}
      PNPM_STORE_DIR: /pnpm/store
    volumes:
      - ${SANDBOX_WORKTREE_PATH}:/workspace
      - pnpm-store:/pnpm/store
      - root-node-modules:/workspace/node_modules
    ports:
      - "127.0.0.1:${API_PORT}:${API_PORT}"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:${API_PORT}/health"]
      interval: 2s
      timeout: 2s
      retries: 60

  app:
    build:
      context: ${SANDBOX_REPO_ROOT}
      dockerfile: packages/sandbox-cli/docker/sandbox-dev.Dockerfile
    working_dir: /workspace
    command: ["sandbox-entrypoint.sh", "app"]
    environment:
      HOST: 0.0.0.0
      PORT: ${APP_PORT}
      SANDBOX_ID: ${SANDBOX_ID}
      CEIRD_SANDBOX: ${CEIRD_SANDBOX}
      AUTH_ORIGIN: ${AUTH_ORIGIN}
      VITE_AUTH_ORIGIN: ${VITE_AUTH_ORIGIN}
      PNPM_STORE_DIR: /pnpm/store
    volumes:
      - ${SANDBOX_WORKTREE_PATH}:/workspace
      - pnpm-store:/pnpm/store
      - root-node-modules:/workspace/node_modules
    ports:
      - "127.0.0.1:${APP_PORT}:${APP_PORT}"
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:${APP_PORT}/health"]
      interval: 2s
      timeout: 2s
      retries: 60

volumes:
  pnpm-store:
  root-node-modules:
```

```ts
// packages/sandbox-cli/src/compose.ts
export function buildComposeCommandArgs(input: {
  readonly composeFile: string;
  readonly composeEnvFile: string;
  readonly composeProjectName: string;
  readonly subcommand: readonly string[];
}): string[] {
  return [
    "compose",
    "--file",
    input.composeFile,
    "--project-name",
    input.composeProjectName,
    "--env-file",
    input.composeEnvFile,
    ...input.subcommand,
  ];
}

export function renderComposeEnvironmentFile(input: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly proxyPort: number;
  readonly overrides: Record<string, string>;
}): string {
  return [
    `SANDBOX_REPO_ROOT=${input.repoRoot}`,
    `SANDBOX_WORKTREE_PATH=${input.worktreePath}`,
    `SANDBOX_PROXY_PORT=${input.proxyPort}`,
    ...Object.entries(input.overrides)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}
```

```dockerfile
# packages/sandbox-cli/docker/sandbox-dev.Dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /workspace

COPY packages/sandbox-cli/docker/sandbox-entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh

RUN chmod +x /usr/local/bin/sandbox-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
```

```sh
# packages/sandbox-cli/docker/sandbox-entrypoint.sh
#!/bin/sh
set -eu

filter="${1:-}"

if [ -z "$filter" ]; then
  echo "sandbox-entrypoint.sh requires a package filter argument (app or api)." >&2
  exit 1
fi

lock_hash="$(sha256sum /workspace/pnpm-lock.yaml | awk '{print $1}')"
cache_file="/workspace/node_modules/.sandbox-lock.sha256"

if [ ! -d /workspace/node_modules/.pnpm ] || [ ! -f "$cache_file" ] || [ "$(cat "$cache_file")" != "$lock_hash" ]; then
  CI=true pnpm install --frozen-lockfile
  mkdir -p /workspace/node_modules
  printf '%s' "$lock_hash" > "$cache_file"
fi

exec pnpm exec turbo run sandbox:dev --filter="$filter"
```

- [ ] **Step 4: Re-run the `sandbox-cli` tests that cover compose helpers**

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: PASS for the new `compose.test.ts`, with the existing portless and view tests still green.

- [ ] **Step 5: Commit the compose infrastructure**

```bash
git add \
  packages/sandbox-cli/docker/sandbox.compose.yaml \
  packages/sandbox-cli/docker/sandbox-dev.Dockerfile \
  packages/sandbox-cli/docker/sandbox-entrypoint.sh \
  packages/sandbox-cli/src/compose.ts \
  packages/sandbox-cli/src/compose.test.ts \
  packages/sandbox-cli/src/process.ts
git commit -m "feat(sandbox): add compose-backed sandbox runtime"
```

### Task 4: Refactor The CLI To Use Compose, Strict Env Validation, Explicit `--name`, And Effect Logging

**Files:**

- Create: `packages/sandbox-cli/src/registry.ts`
- Create: `packages/sandbox-cli/src/registry.test.ts`
- Modify: `packages/sandbox-cli/src/cli.ts`
- Modify: `packages/sandbox-cli/src/lifecycle.ts`
- Modify: `packages/sandbox-cli/src/runtime.ts`
- Modify: `packages/sandbox-cli/src/portless.ts`
- Modify: `packages/sandbox-cli/src/portless.test.ts`
- Modify: `packages/sandbox-cli/src/sandbox-view.ts`
- Modify: `packages/sandbox-cli/src/sandbox-view.test.ts`
- Modify: `packages/sandbox-cli/src/lifecycle.test.ts`
- Modify: `packages/sandbox-cli/src/runtime.test.ts`
- Modify: `packages/sandbox-cli/src/cli.test.ts`

- [ ] **Step 1: Write failing tests for `--name`, preflight refusal, compose-backed lookup, and service-specific logs**

```ts
// packages/sandbox-cli/src/cli.test.ts
import { Effect } from "effect";

import { getSandboxPreflightMessage } from "./cli.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";

describe("getSandboxPreflightMessage()", () => {
  it("renders the strict env validation failure", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.fail(
        new SandboxPreflightError({
          message:
            "Missing AUTH_EMAIL_FROM in repo .env or process env. Sandbox startup stopped before compose launch.",
        })
      )
    );

    expect(getSandboxPreflightMessage(exit)).toMatch(/AUTH_EMAIL_FROM/);
  });
});
```

```ts
// packages/sandbox-cli/src/lifecycle.test.ts
import { bringSandboxUp } from "./lifecycle.js";

describe("bringSandboxUp()", () => {
  it("prefers the explicit sandbox name over the worktree-derived one", async () => {
    const result = await bringSandboxUp({
      repoRoot: "/Users/me/ceird",
      worktreePath: "/Users/me/ceird/.worktrees/random-dir",
      explicitSandboxName: "agent-one",
      now: "2026-04-05T10:00:00.000Z",
      existingRecord: undefined,
      loadSharedEnvironment: () =>
        Promise.resolve({
          AUTH_EMAIL_FROM: "auth@example.com",
          AUTH_EMAIL_FROM_NAME: "Ceird",
          RESEND_API_KEY: "re_live_123",
        }),
      generateBetterAuthSecret: () => "0123456789abcdef0123456789abcdef",
      allocatePorts: () =>
        Promise.resolve({ app: 4300, api: 4301, postgres: 5439 }),
      determineAliasesHealthy: () => Promise.resolve(true),
      startComposeProject: () => Promise.resolve(),
      waitForHealth: () => Promise.resolve(),
      persist: () => Promise.resolve(),
    });

    expect(result.record.sandboxName).toBe("agent-one");
    expect(result.record.composeProjectName).toBe("ceird-sbx-agent-one");
  });
});
```

```ts
// packages/sandbox-cli/src/runtime.test.ts
import { makePortlessAliasCommands } from "./portless.js";

describe("makePortlessAliasCommands()", () => {
  it("uses the explicit sandbox name for app and api aliases", () => {
    expect(
      makePortlessAliasCommands({
        sandboxName: "agent-one",
        ports: { app: 4300, api: 4301, postgres: 5439 },
      })
    ).toStrictEqual({
      add: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.app.ceird",
          "4300",
          "--force",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "agent-one.api.ceird",
          "4301",
          "--force",
        ],
      ],
      remove: [
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.app.ceird",
        ],
        [
          "pnpm",
          "exec",
          "portless",
          "alias",
          "--remove",
          "agent-one.api.ceird",
        ],
      ],
    });
  });
});
```

- [ ] **Step 2: Run the `sandbox-cli` test suite and verify the lifecycle/CLI tests fail**

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: FAIL because the lifecycle API does not accept `explicitSandboxName`, the CLI exposes no `--name` option, and portless commands still assume a bare `portless` binary.

- [ ] **Step 3: Implement the compose-backed lifecycle, registry, and CLI option parsing**

```ts
// packages/sandbox-cli/src/registry.ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { SandboxRegistryRecord } from "@ceird/sandbox-core/node";

const RegistryPayload = Schema.Struct({
  sandboxes: Schema.Array(SandboxRegistryRecord),
});

export function getRegistryPath(): string {
  return path.join(os.homedir(), ".ceird", "sandboxes", "registry.json");
}

export async function readRegistry(): Promise<
  readonly SandboxRegistryRecord[]
> {
  try {
    const raw = await fs.readFile(getRegistryPath(), "utf8");
    const payload = Schema.decodeUnknownSync(RegistryPayload)(JSON.parse(raw));
    return payload.sandboxes;
  } catch {
    return [];
  }
}
```

```ts
// packages/sandbox-cli/src/portless.ts
import type { SandboxPorts } from "@ceird/sandbox-core";

export function makePortlessAliasCommands(input: {
  readonly sandboxName: string;
  readonly ports: SandboxPorts;
}) {
  const appName = `${input.sandboxName}.app.ceird`;
  const apiName = `${input.sandboxName}.api.ceird`;

  return {
    add: [
      [
        "pnpm",
        "exec",
        "portless",
        "alias",
        appName,
        String(input.ports.app),
        "--force",
      ],
      [
        "pnpm",
        "exec",
        "portless",
        "alias",
        apiName,
        String(input.ports.api),
        "--force",
      ],
    ] as const,
    remove: [
      ["pnpm", "exec", "portless", "alias", "--remove", appName],
      ["pnpm", "exec", "portless", "alias", "--remove", apiName],
    ] as const,
  };
}
```

```ts
// packages/sandbox-cli/src/cli.ts
import { Command, Options } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Console, Effect, Exit, Option } from "effect";

const name = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.optional
);

const upCommand = Command.make("up", { name }, ({ name }) =>
  Effect.tryPromise({
    try: () =>
      runtime.lifecycle.up({
        explicitSandboxName: Option.getOrUndefined(name),
      }),
    catch: (error) => toCliError(error),
  }).pipe(
    Effect.tap(({ record }) =>
      Effect.logInfo("Sandbox compose project started", {
        composeProjectName: record.composeProjectName,
        sandboxName: record.sandboxName,
      })
    ),
    Effect.flatMap((result) =>
      printSandboxView("Sandbox ready", result.record, result.urls)
    )
  )
);

const logsService = Options.text("service").pipe(Options.optional);

const logsCommand = Command.make(
  "logs",
  { name, service: logsService },
  ({ name, service }) =>
    Effect.tryPromise({
      try: () =>
        runtime.lifecycle.logs({
          explicitSandboxName: Option.getOrUndefined(name),
          service: Option.getOrUndefined(service),
        }),
      catch: (error) => toCliError(error),
    }).pipe(Effect.flatMap((result) => Console.log(result.content)))
);
```

```ts
// packages/sandbox-cli/src/lifecycle.ts
import {
  buildSandboxRuntimeSpec,
  deriveSandboxIdentity,
} from "@ceird/sandbox-core";
import {
  loadSandboxSharedEnvironment,
  type SandboxRegistryRecord,
} from "@ceird/sandbox-core/node";

export async function bringSandboxUp(options: {
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly explicitSandboxName?: string;
  readonly now: string;
  readonly existingRecord: SandboxRegistryRecord | undefined;
  readonly loadSharedEnvironment: () => Promise<{
    AUTH_EMAIL_FROM: string;
    AUTH_EMAIL_FROM_NAME: string;
    RESEND_API_KEY: string;
  }>;
  readonly generateBetterAuthSecret: () => string;
  readonly allocatePorts: () => Promise<{
    app: number;
    api: number;
    postgres: number;
  }>;
  readonly determineAliasesHealthy: () => Promise<boolean>;
  readonly startComposeProject: (
    spec: ReturnType<typeof buildSandboxRuntimeSpec>
  ) => Promise<void>;
  readonly waitForHealth: (
    spec: ReturnType<typeof buildSandboxRuntimeSpec>
  ) => Promise<void>;
  readonly persist: (record: SandboxRegistryRecord) => Promise<void>;
}) {
  const sharedEnvironment = await options.loadSharedEnvironment();
  const sandboxName =
    options.explicitSandboxName ??
    deriveSandboxIdentity({
      repoRoot: options.repoRoot,
      worktreePath: options.worktreePath,
    }).hostnameSlug;
  const aliasesHealthy = await options.determineAliasesHealthy();
  const ports = await options.allocatePorts();
  const spec = buildSandboxRuntimeSpec({
    repoRoot: options.repoRoot,
    worktreePath: options.worktreePath,
    sandboxName,
    takenNames: new Set(),
    ports,
    betterAuthSecret:
      options.existingRecord?.betterAuthSecret ??
      options.generateBetterAuthSecret(),
    aliasesHealthy,
    proxyPort: 1355,
  });

  await options.startComposeProject(spec);
  await options.waitForHealth(spec);

  const record: SandboxRegistryRecord = {
    sandboxId: spec.sandboxId,
    sandboxName: spec.sandboxName,
    composeProjectName: spec.composeProjectName,
    hostnameSlug: spec.hostnameSlug,
    repoRoot: options.repoRoot,
    worktreePath: options.worktreePath,
    betterAuthSecret: spec.overrides.BETTER_AUTH_SECRET,
    ports: spec.ports,
    status: aliasesHealthy ? "ready" : "degraded",
    timestamps: {
      createdAt: options.existingRecord?.timestamps.createdAt ?? options.now,
      updatedAt: options.now,
    },
  };

  void sharedEnvironment;
  await options.persist(record);

  return { record, urls: spec.urls, aliasesHealthy };
}
```

- [ ] **Step 4: Re-run the `sandbox-cli` tests and targeted type-checking**

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: PASS for the new CLI option, registry, and lifecycle tests.

Run: `pnpm --filter @ceird/sandbox-cli check-types`
Expected: PASS with the CLI importing env/state only from `@ceird/sandbox-core/node`.

- [ ] **Step 5: Commit the CLI and lifecycle refactor**

```bash
git add \
  packages/sandbox-cli/src/cli.ts \
  packages/sandbox-cli/src/lifecycle.ts \
  packages/sandbox-cli/src/runtime.ts \
  packages/sandbox-cli/src/registry.ts \
  packages/sandbox-cli/src/registry.test.ts \
  packages/sandbox-cli/src/portless.ts \
  packages/sandbox-cli/src/portless.test.ts \
  packages/sandbox-cli/src/sandbox-view.ts \
  packages/sandbox-cli/src/sandbox-view.test.ts \
  packages/sandbox-cli/src/cli.test.ts \
  packages/sandbox-cli/src/lifecycle.test.ts \
  packages/sandbox-cli/src/runtime.test.ts
git commit -m "feat(sandbox-cli): add compose-backed sandbox commands"
```

### Task 5: Tighten Turborepo Wiring, Remove Legacy Assumptions, And Run End-To-End Verification

**Files:**

- Modify: `turbo.json`
- Modify: `packages/sandbox-cli/src/runtime.ts`
- Modify: `packages/sandbox-cli/src/sandbox-view.ts`
- Test: `packages/sandbox-cli/src/runtime.test.ts`

- [ ] **Step 1: Write a failing regression test for the final command/rendering contract**

```ts
// packages/sandbox-cli/src/runtime.test.ts
import { formatSandboxViewLines } from "./sandbox-view.js";

describe("formatSandboxViewLines()", () => {
  it("shows compose project information and degraded portless guidance", () => {
    expect(
      formatSandboxViewLines("Sandbox ready", {
        sandboxName: "agent-one",
        composeProjectName: "ceird-sbx-agent-one",
        status: "degraded",
        urls: {
          app: "http://127.0.0.1:4300",
          api: "http://127.0.0.1:4301",
          postgres: "postgresql://127.0.0.1:5439/ceird",
          fallbackApp: "http://127.0.0.1:4300",
          fallbackApi: "http://127.0.0.1:4301",
        },
      })
    ).toContain("compose project: ceird-sbx-agent-one");
  });
});
```

- [ ] **Step 2: Run the `sandbox-cli` tests to verify the final rendering/turbo contract still fails**

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: FAIL because the render helpers still use the old slug-only shape and the final compose project output is missing.

- [ ] **Step 3: Update Turborepo env declarations, final rendering, and remove old docker-run assumptions**

```json
// turbo.json
{
  "tasks": {
    "sandbox:dev": {
      "cache": false,
      "persistent": true,
      "env": [
        "AUTH_EMAIL_FROM",
        "AUTH_EMAIL_FROM_NAME",
        "AUTH_ORIGIN",
        "BETTER_AUTH_BASE_URL",
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "HOST",
        "PNPM_STORE_DIR",
        "PORT",
        "RESEND_API_KEY",
        "SANDBOX_ID",
        "CEIRD_SANDBOX",
        "VITE_AUTH_ORIGIN"
      ]
    }
  }
}
```

```ts
// packages/sandbox-cli/src/sandbox-view.ts
export function formatSandboxViewLines(
  label: string,
  input: {
    readonly sandboxName: string;
    readonly composeProjectName: string;
    readonly status: "ready" | "degraded" | "stopped";
    readonly urls: {
      readonly app: string;
      readonly api: string;
      readonly postgres: string;
      readonly fallbackApp: string;
      readonly fallbackApi: string;
    };
  }
): readonly string[] {
  return [
    label,
    `  sandbox: ${input.sandboxName}`,
    `  compose project: ${input.composeProjectName}`,
    `  status: ${input.status}`,
    `  app url: ${input.urls.app}`,
    `  api url: ${input.urls.api}`,
    `  postgres url: ${input.urls.postgres}`,
    `  app fallback url: ${input.urls.fallbackApp}`,
    `  api fallback url: ${input.urls.fallbackApi}`,
    ...(input.status === "degraded"
      ? [
          "  warning: portless aliases were unavailable; loopback URLs are active",
        ]
      : []),
  ];
}
```

- [ ] **Step 4: Run the full verification sequence, including one real compose-backed sandbox boot**

Run: `pnpm --filter @ceird/sandbox-core test`
Expected: PASS

Run: `pnpm --filter @ceird/sandbox-cli test`
Expected: PASS

Run: `pnpm --filter @ceird/sandbox-core check-types`
Expected: PASS

Run: `pnpm --filter @ceird/sandbox-cli check-types`
Expected: PASS

Run: `pnpm --filter @ceird/sandbox-cli sandbox:up -- --name plan-smoke`
Expected: PASS with output showing `compose project: ceird-sbx-plan-smoke` and app/api URLs.

Run: `pnpm --filter @ceird/sandbox-cli sandbox:status -- --name plan-smoke`
Expected: PASS with `status: ready` or `status: degraded` plus explicit portless guidance.

Run: `pnpm --filter @ceird/sandbox-cli sandbox:logs -- --name plan-smoke api`
Expected: PASS with API service logs only.

Run: `pnpm --filter @ceird/sandbox-cli sandbox:down -- --name plan-smoke`
Expected: PASS with the compose project removed and the registry cleaned up.

- [ ] **Step 5: Commit the verification-ready compose sandbox**

```bash
git add \
  turbo.json \
  packages/sandbox-cli/src/runtime.ts \
  packages/sandbox-cli/src/sandbox-view.ts \
  packages/sandbox-cli/src/runtime.test.ts
git commit -m "chore(sandbox): finalize compose sandbox flow"
```
