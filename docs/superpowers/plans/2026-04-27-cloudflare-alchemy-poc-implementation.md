# Cloudflare Alchemy POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated Alchemy IaC package and use it to deploy the Ceird app Worker, API Worker, PlanetScale Postgres Hyperdrive binding, and durable auth email queues as a proof of concept.

**Architecture:** Keep runtime application ownership in `apps/app` and `apps/api`, and put Cloudflare infrastructure ownership in a new `packages/infra` workspace. The API keeps Postgres as the source of truth and connects to a new PlanetScale Postgres database through Hyperdrive. Auth email background work moves from process-local scheduling to Cloudflare Queues.

**Tech Stack:** Alchemy, Cloudflare Workers, Cloudflare Hyperdrive, Cloudflare Queues, PlanetScale Postgres, TanStack Start, Effect, Better Auth, Drizzle, Vitest, Turbo, pnpm

---

## 2026-04-30 Alchemy v2 Beta Revision

The implementation now targets Alchemy v2 beta instead of the v1 API shown in
some of the original task snippets below.

Current infra decisions:

- `packages/infra` pins `alchemy@2.0.0-beta.28` and Effect 4 beta dependencies
  in isolation from runtime packages.
- The stack entrypoint is `export default Alchemy.Stack(...)`.
- Cloudflare resources import from `alchemy/Cloudflare`.
- Worker resources use `main`, `compatibility`, `env`, `domain`, and
  `observability` v2 props.
- The TanStack Start app is deployed with `Cloudflare.Vite`.
- Queue consumption uses `Cloudflare.QueueConsumer`.
- Alchemy state uses `Cloudflare.state({ workerName:
"ceird-alchemy-state" })`.
- CI deploys pin Alchemy's CLI stage to `main` through
  `ALCHEMY_STAGE`/`CEIRD_ALCHEMY_STAGE`; this is separate from the
  historical POC resource naming stage in `CEIRD_INFRA_STAGE`.
- No Wrangler config is introduced.

PlanetScale and Hyperdrive are not first-class Alchemy v2 resources in the beta
package inspected on 2026-05-01. The POC uses small custom Alchemy resources
backed by focused provider operations instead:

- `@distilled.cloud/planetscale` creates the PlanetScale Postgres database and
  app/migration roles.
- a custom Cloudflare Hyperdrive resource uses Alchemy's Cloudflare provider
  credentials and the Cloudflare REST API to create and update the Hyperdrive
  config.

Required deploy inputs now include:

- Cloudflare OAuth credentials from `alchemy login` and the bootstrapped
  Cloudflare state store
- `PLANETSCALE_ORGANIZATION`
- `PLANETSCALE_API_TOKEN_ID`
- `PLANETSCALE_API_TOKEN`
- `CEIRD_ZONE_NAME`
- `AUTH_EMAIL_FROM`

Optional/defaulted deploy inputs:

- `CEIRD_INFRA_STAGE`
- `CEIRD_APP_HOSTNAME`
- `CEIRD_API_HOSTNAME`
- `CEIRD_PLANETSCALE_DATABASE_NAME`
- `CEIRD_PLANETSCALE_DEFAULT_BRANCH`
- `CEIRD_PLANETSCALE_REGION` defaults to `eu-west` for Dublin
- `CEIRD_PLANETSCALE_CLUSTER_SIZE` defaults to the cheapest Postgres
  size, `PS-5`
- `APPLY_MIGRATIONS`

`APPLY_MIGRATIONS=true` runs Drizzle's programmatic migrator from the Alchemy
deployment process through a custom `Drizzle.Migrations` resource with the
Alchemy-created PlanetScale migration role. The Worker never runs migrations.

The original code blocks below are retained as historical planning context; the
checked-in package files are the source of truth for the v2 implementation.

CI notes live in `docs/architecture/cloudflare-ci.md`. The workflow is a
single mainline deploy, not per-PR preview infrastructure. The first CI deploy
should be run manually with `adopt=true` because the initial local POC state was
created under Alchemy's default local `dev_cillianbarron` CLI stage before the
shared `main` stage was pinned.

---

## File Structure

**Create:**

- `packages/infra/package.json` - package scripts and pinned Alchemy/Effect 4 dependencies
- `packages/infra/tsconfig.json` - TypeScript config isolated from app/runtime packages
- `packages/infra/src/globals.d.ts` - infra-only beta type shim for Alchemy
  source typings
- `packages/infra/src/stages.ts` - stage config schema and naming helpers
- `packages/infra/src/planet-scale.ts` - Alchemy-managed PlanetScale Postgres database and role resources
- `packages/infra/src/cloudflare-hyperdrive.ts` - Distilled-backed custom
  Alchemy Hyperdrive resource until Alchemy v2 exposes a native resource
- `packages/infra/src/drizzle-migrations.ts` - programmatic Drizzle migration runner for Alchemy deploys
- `packages/infra/src/cloudflare-stack.ts` - Alchemy resource declarations for Workers, Hyperdrive, Queues, and routes
- `packages/infra/alchemy.run.ts` - Alchemy stack entrypoint
- `apps/api/src/worker.ts` - Cloudflare Worker entrypoint for HTTP and queue events
- `apps/api/src/platform/cloudflare/env.ts` - Worker environment type and binding helpers
- `apps/api/src/platform/database/database-url.ts` - shared database URL resolution for Node and Worker runtimes
- `apps/api/src/domains/identity/authentication/auth-email-queue.ts` - queue message schema and enqueue/consume service
- `apps/api/src/domains/identity/authentication/auth-email-queue.test.ts` - queue payload and scheduling tests
- `apps/api/src/worker.test.ts` - Worker handler smoke tests
- `apps/app/src/cloudflare-env.d.ts` - app Worker binding type bridge if needed by TanStack Start/Alchemy

**Modify:**

- `package.json` - add infra scripts
- `pnpm-workspace.yaml` - already includes `packages/*`; verify no change is needed
- `turbo.json` - add infra deploy task only if useful
- `apps/app/package.json` - add Cloudflare build/deploy helper scripts if Alchemy requires package-local build commands
- `apps/app/vite.config.ts` - add Cloudflare/TanStack Start target changes behind the deployment path
- `apps/api/package.json` - add Worker build/test dependencies if needed
- `apps/api/src/server.ts` - separate Node serving from web handler construction
- `apps/api/src/index.ts` - keep Node entrypoint for sandbox development
- `apps/api/src/platform/database/database.ts` - use shared database URL resolution
- `apps/api/src/domains/identity/authentication/auth.ts` - replace process-local background scheduling with queue enqueueing in Worker runtime
- `apps/api/src/domains/identity/authentication/auth-email-promise-bridge.ts` - keep direct send path available for queue consumers
- `docs/architecture/auth.md` - document Queue-backed auth email scheduling
- `docs/architecture/data-layer.md` - document PlanetScale + Hyperdrive POC path
- `.github/workflows/build.yml` - optionally add a non-deploying infra typecheck job

**Do not create:**

- `wrangler.jsonc`
- `wrangler.toml`
- a second non-Alchemy IaC stack

## Task 1: Create The Isolated Infra Package

**Files:**

- Create: `packages/infra/package.json`
- Create: `packages/infra/tsconfig.json`
- Create: `packages/infra/src/stages.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the package manifest**

Create `packages/infra/package.json`:

```json
{
  "name": "@ceird/infra",
  "private": true,
  "type": "module",
  "scripts": {
    "check-types": "tsc --noEmit -p tsconfig.json",
    "deploy": "alchemy deploy ./alchemy.run.ts",
    "destroy": "alchemy destroy ./alchemy.run.ts",
    "dev": "alchemy dev ./alchemy.run.ts"
  },
  "dependencies": {
    "alchemy": "0.93.2",
    "drizzle-orm": "0.45.2",
    "pg": "8.20.0",
    "effect": "^3.21.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250805.0",
    "@effect/language-service": "^0.84.2",
    "@types/node": "^25.5.0",
    "@types/pg": "8.15.6",
    "typescript": "^5.9.3"
  }
}
```

Expected: `packages/infra` owns Alchemy and Effect 4; app/runtime packages stay on their current Effect version.

- [ ] **Step 2: Add the infra TypeScript config**

Create `packages/infra/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["alchemy.run.ts", "src/**/*.ts"]
}
```

Expected: infra typechecking is isolated and does not require Worker types to be global across the repo.

- [ ] **Step 3: Add root scripts**

Modify the root `package.json` scripts:

```json
{
  "scripts": {
    "infra:check-types": "pnpm --filter @ceird/infra check-types",
    "infra:deploy": "pnpm --filter @ceird/infra deploy",
    "infra:destroy": "pnpm --filter @ceird/infra destroy",
    "infra:dev": "pnpm --filter @ceird/infra dev"
  }
}
```

Keep the existing scripts. Add only the four new script entries.

Expected: operators can run the POC through root-level commands without learning package paths.

- [ ] **Step 4: Write stage helpers**

Create `packages/infra/src/stages.ts`:

```ts
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const InfraStage = Schema.Literal("preview", "production");
export type InfraStage = typeof InfraStage.Type;

export const DomainName = Schema.NonEmptyString.pipe(
  Schema.pattern(/^[a-z0-9.-]+$/)
);
export type DomainName = typeof DomainName.Type;

export interface InfraStageConfig {
  readonly appName: string;
  readonly stage: InfraStage;
  readonly zoneName: DomainName;
  readonly appHostname: DomainName;
  readonly apiHostname: DomainName;
  readonly planetScaleOrganization: string;
  readonly planetScaleDatabaseName: string;
  readonly planetScaleDefaultBranch: string;
  readonly planetScaleRegionSlug: string;
  readonly planetScaleClusterSize: string;
  readonly applyMigrations: boolean;
}

const decodeStage = Schema.decodeUnknownSync(InfraStage);
const decodeDomainName = Schema.decodeUnknownSync(DomainName);

export const loadInfraStageConfig = Effect.gen(function* () {
  const stage = yield* Config.string("CEIRD_INFRA_STAGE").pipe(
    Config.withDefault("preview"),
    Config.map(decodeStage)
  );
  const zoneName = yield* Config.string("CEIRD_ZONE_NAME").pipe(
    Config.map(decodeDomainName)
  );
  const appHostname = yield* Config.string("CEIRD_APP_HOSTNAME").pipe(
    Config.withDefault(`app.${zoneName}`),
    Config.map(decodeDomainName)
  );
  const apiHostname = yield* Config.string("CEIRD_API_HOSTNAME").pipe(
    Config.withDefault(`api.${zoneName}`),
    Config.map(decodeDomainName)
  );
  const planetScaleOrganization = yield* Config.string(
    "PLANETSCALE_ORGANIZATION"
  );
  const planetScaleDatabaseName = yield* Config.string(
    "CEIRD_PLANETSCALE_DATABASE_NAME"
  ).pipe(Config.withDefault(`ceird-${stage}`));
  const planetScaleDefaultBranch = yield* Config.string(
    "CEIRD_PLANETSCALE_DEFAULT_BRANCH"
  ).pipe(Config.withDefault("main"));
  const planetScaleRegionSlug = yield* Config.string(
    "CEIRD_PLANETSCALE_REGION"
  ).pipe(Config.withDefault("eu-west"));
  const planetScaleClusterSize = yield* Config.string(
    "CEIRD_PLANETSCALE_CLUSTER_SIZE"
  ).pipe(Config.withDefault("PS-5"));
  const applyMigrations = yield* Config.boolean("APPLY_MIGRATIONS").pipe(
    Config.withDefault(false)
  );

  return {
    appName: "ceird",
    stage,
    zoneName,
    appHostname,
    apiHostname,
    planetScaleOrganization,
    planetScaleDatabaseName,
    planetScaleDefaultBranch,
    planetScaleRegionSlug,
    planetScaleClusterSize,
    applyMigrations,
  } satisfies InfraStageConfig;
});

export function resourceName(config: InfraStageConfig, suffix: string) {
  return `${config.appName}-${config.stage}-${suffix}`;
}
```

Expected: resource names and hostnames are deterministic per stage.

- [ ] **Step 5: Install and typecheck**

Run:

```bash
pnpm install
pnpm infra:check-types
```

Expected: dependency install succeeds and infra typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/infra
git commit -m "infra: add alchemy workspace"
```

## Task 2: Define PlanetScale Postgres Resources In Alchemy

**Files:**

- Create: `packages/infra/src/planet-scale.ts`
- Modify: `docs/architecture/data-layer.md`

- [ ] **Step 1: Add the PlanetScale resource module**

Create `packages/infra/src/planet-scale.ts`:

```ts
import { Database, Role } from "alchemy/planetscale";
import * as Effect from "effect/Effect";

import type { InfraStageConfig } from "./stages.js";

export interface PlanetScalePostgresResources {
  readonly database: Awaited<ReturnType<typeof Database>>;
  readonly appRole: Awaited<ReturnType<typeof Role>>;
  readonly migrationRole: Awaited<ReturnType<typeof Role>>;
  readonly originConnectionString: string;
  readonly migrationConnectionString: string;
}

export const makePlanetScalePostgres = Effect.fn(function* (
  config: InfraStageConfig
) {
  const database = yield* Effect.promise(() =>
    Database("planet-scale-database", {
      name: config.planetScaleDatabaseName,
      organization: config.planetScaleOrganization,
      region: {
        slug: config.planetScaleRegionSlug,
      },
      clusterSize: config.planetScaleClusterSize,
      defaultBranch: config.planetScaleDefaultBranch,
      kind: "postgresql",
      delete: false,
    })
  );

  const appRole = yield* Effect.promise(() =>
    Role("planet-scale-app-role", {
      database,
      branch: database.defaultBranch,
      inheritedRoles: ["pg_read_all_data", "pg_write_all_data"],
    })
  );

  const migrationRole = yield* Effect.promise(() =>
    Role("planet-scale-migration-role", {
      database,
      branch: database.defaultBranch,
      inheritedRoles: ["postgres"],
    })
  );

  return {
    database,
    appRole,
    migrationRole,
    originConnectionString: appRole.connectionUrl,
    migrationConnectionString: migrationRole.connectionUrl,
  } satisfies PlanetScalePostgresResources;
});
```

If Alchemy's PlanetScale API shape differs at implementation time, follow the
current provider types. Preserve the important resource ownership rule:
Alchemy creates the database and roles; operators do not create a POC database
manually.

Expected: `packages/infra` owns the PlanetScale database and role lifecycle as part of the same stack as Cloudflare.

- [ ] **Step 2: Document Alchemy-owned PlanetScale setup**

Append this section to `docs/architecture/data-layer.md`:

```markdown
## Cloudflare POC: PlanetScale Postgres And Hyperdrive

The Cloudflare Alchemy POC keeps Postgres as the source of truth.

PlanetScale database infrastructure and the Cloudflare runtime email token are
created by Alchemy, not manually in the dashboards and not through separate CLI
steps. The required operator inputs are bootstrap credentials plus the database
sizing choices:

1. Export `PLANETSCALE_ORGANIZATION`.
2. Export `PLANETSCALE_API_TOKEN_ID`.
3. Export `PLANETSCALE_API_TOKEN`.
4. Export bootstrap `CLOUDFLARE_ACCOUNT_ID`.
5. Export bootstrap `CLOUDFLARE_API_TOKEN`.
6. Set `CEIRD_PLANETSCALE_DATABASE_NAME`.
7. Set `CEIRD_PLANETSCALE_DEFAULT_BRANCH`.
8. Set `CEIRD_PLANETSCALE_REGION`.
9. Set `CEIRD_PLANETSCALE_CLUSTER_SIZE`.
10. Set `AUTH_EMAIL_TRANSPORT=cloudflare`.
11. Set `APPLY_MIGRATIONS=true` only when the deploy should apply Drizzle
    migrations programmatically.
12. Run `CI=true ALCHEMY_PROFILE=ceird-bootstrap pnpm infra:deploy` to
    create the database, roles, Hyperdrive config, Workers, queues, runtime email
    token, and routes.
13. Let the Alchemy deploy run migrations using the Alchemy-created migration
    role connection URL when `APPLY_MIGRATIONS=true`.

The Worker does not run migrations. The Alchemy deployment process applies
migrations from the invoking local or CI environment only when
`APPLY_MIGRATIONS=true`.
```

Expected: the POC setup contract makes the database part of IaC instead of a manual prerequisite.

- [ ] **Step 3: Typecheck**

Run:

```bash
pnpm infra:check-types
```

Expected: typecheck passes.

- [ ] **Step 4: Commit**

```bash
git add packages/infra/src/planet-scale.ts docs/architecture/data-layer.md
git commit -m "infra: manage planetscale postgres with alchemy"
```

## Task 3: Define The Alchemy Cloudflare Stack

**Files:**

- Create: `packages/infra/src/drizzle-migrations.ts`
- Create: `packages/infra/src/cloudflare-stack.ts`
- Create: `packages/infra/alchemy.run.ts`

- [ ] **Step 1: Add the programmatic migration runner**

Create `packages/infra/src/drizzle-migrations.ts`:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import * as Effect from "effect/Effect";
import { Pool } from "pg";

export interface RunDrizzleMigrationsInput {
  readonly databaseUrl: string;
  readonly migrationsFolder?: string;
}

export function runDrizzleMigrations(input: RunDrizzleMigrationsInput) {
  return Effect.acquireUseRelease(
    Effect.sync(
      () =>
        new Pool({
          connectionString: input.databaseUrl,
          max: 1,
        })
    ),
    (pool) =>
      Effect.promise(async () => {
        const db = drizzle(pool);

        await migrate(db, {
          migrationsFolder: input.migrationsFolder ?? "../../apps/api/drizzle",
        });
      }),
    (pool) => Effect.promise(() => pool.end())
  );
}
```

Expected: migrations can be applied from Alchemy's Node deploy process without
shelling out to `drizzle-kit`.

- [ ] **Step 2: Add the stack resource module**

Create `packages/infra/src/cloudflare-stack.ts`:

```ts
import alchemy from "alchemy";
import { Hyperdrive, Queue, TanStackStart, Worker } from "alchemy/cloudflare";
import * as Effect from "effect/Effect";

import type { InfraStageConfig } from "./stages.js";
import { resourceName } from "./stages.js";
import type { PlanetScalePostgresResources } from "./planet-scale.js";

export interface CloudflareStackInput {
  readonly config: InfraStageConfig;
  readonly database: PlanetScalePostgresResources;
}

export const makeCloudflareStack = Effect.fn(function* (
  input: CloudflareStackInput
) {
  const zone = yield* Zone("zone", {
    name: input.config.zoneName,
    type: "full",
    delete: false,
  });

  const authEmailDeadLetterQueue = yield* Queue("auth-email-dlq", {
    name: resourceName(input.config, "auth-email-dlq"),
  });

  const authEmailQueue = yield* Queue("auth-email-queue", {
    name: resourceName(input.config, "auth-email"),
    dlq: authEmailDeadLetterQueue,
  });

  const database = yield* Hyperdrive("database", {
    name: resourceName(input.config, "postgres"),
    origin: input.database.originConnectionString,
  });

  const api = yield* Worker("api", {
    name: resourceName(input.config, "api"),
    entrypoint: "../../apps/api/src/worker.ts",
    compatibility: {
      date: "2026-04-27",
      flags: ["nodejs_compat"],
    },
    bindings: {
      DATABASE: database,
      AUTH_EMAIL_QUEUE: authEmailQueue,
    },
    vars: {
      AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
      BETTER_AUTH_BASE_URL: `https://${input.config.apiHostname}/api/auth`,
      NODE_ENV: "production",
    },
    routes: [
      {
        pattern: `${input.config.apiHostname}/*`,
        zoneId: zone.id,
      },
    ],
    observability: {
      enabled: true,
    },
    eventSources: [
      {
        queue: authEmailQueue,
        settings: {
          batchSize: 10,
          maxRetries: 5,
          maxWaitTimeMs: 2000,
          retryDelay: 30,
          deadLetterQueue: authEmailDeadLetterQueue,
        },
      },
    ],
  });

  const app = yield* TanStackStart("app", {
    name: resourceName(input.config, "app"),
    cwd: "../../apps/app",
    vars: {
      API_ORIGIN: `https://${input.config.apiHostname}`,
      VITE_API_ORIGIN: `https://${input.config.apiHostname}`,
    },
    routes: [
      {
        pattern: `${input.config.appHostname}/*`,
        zoneId: zone.id,
      },
    ],
    observability: {
      enabled: true,
    },
  });

  return {
    api,
    app,
    authEmailDeadLetterQueue,
    authEmailQueue,
    database,
    zone,
  } as const;
});
```

If Alchemy's exact property names differ from this API when implementing, use the
current Alchemy type errors as the source of truth and preserve the same
resource shape.

Expected: the stack declares all POC resources without a Wrangler config file.

- [ ] **Step 3: Add the Alchemy entrypoint**

Create `packages/infra/alchemy.run.ts`:

```ts
import alchemy from "alchemy";
import * as Effect from "effect/Effect";

import { makeCloudflareStack } from "./src/cloudflare-stack.js";
import { runDrizzleMigrations } from "./src/drizzle-migrations.js";
import { makePlanetScalePostgres } from "./src/planet-scale.js";
import { loadInfraStageConfig } from "./src/stages.js";

const program = Effect.gen(function* () {
  const config = yield* loadInfraStageConfig;
  const database = yield* makePlanetScalePostgres(config);

  if (config.applyMigrations) {
    yield* runDrizzleMigrations({
      databaseUrl: database.migrationConnectionString,
      migrationsFolder: "../../apps/api/drizzle",
    });
  }

  const stack = yield* makeCloudflareStack({
    config,
    database,
  });

  return {
    ...stack,
    planetScale: database,
  } as const;
});

const app = await alchemy("ceird");
const outputs = await Effect.runPromise(program);

console.log({
  api: outputs.api.url,
  app: outputs.app.url,
  database: outputs.database.id,
  planetScaleDatabase: outputs.planetScale.database.name,
});

await app.finalize();
```

Expected: `alchemy.run.ts` is the only deploy entrypoint for this POC.

- [ ] **Step 4: Typecheck and adapt to Alchemy types**

Run:

```bash
pnpm infra:check-types
```

Expected: if Alchemy API names differ, update only `packages/infra/src/cloudflare-stack.ts` and `packages/infra/alchemy.run.ts` until the typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add packages/infra/src/drizzle-migrations.ts packages/infra/src/cloudflare-stack.ts packages/infra/alchemy.run.ts
git commit -m "infra: define cloudflare poc stack"
```

## Task 4: Add API Worker Runtime Support

**Files:**

- Create: `apps/api/src/platform/cloudflare/env.ts`
- Create: `apps/api/src/platform/database/database-url.ts`
- Create: `apps/api/src/worker.ts`
- Modify: `apps/api/src/platform/database/database.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add Worker environment types**

Create `apps/api/src/platform/cloudflare/env.ts`:

```ts
export interface ApiWorkerEnv {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME?: string;
  readonly AUTH_EMAIL_QUEUE: Queue;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly CLOUDFLARE_ACCOUNT_ID: string;
  readonly CLOUDFLARE_API_TOKEN: string;
  readonly DATABASE: Hyperdrive;
  readonly NODE_ENV?: string;
}

export interface AuthEmailQueueMessage {
  readonly kind:
    | "password-reset"
    | "email-verification"
    | "organization-invitation";
  readonly payload: unknown;
}
```

Expected: Worker-specific binding types live in API platform code, not in domain code.

- [ ] **Step 2: Add database URL resolution**

Create `apps/api/src/platform/database/database-url.ts`:

```ts
import { Config, Effect } from "effect";

import type { ApiWorkerEnv } from "../cloudflare/env.js";
import { DEFAULT_APP_DATABASE_URL } from "./config.js";

export const nodeDatabaseUrl = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL)
);

export function workerDatabaseUrl(env: Pick<ApiWorkerEnv, "DATABASE">) {
  return Effect.succeed(env.DATABASE.connectionString);
}
```

Expected: Node and Worker database URL resolution are explicit.

- [ ] **Step 3: Teach the database layer to accept a URL layer**

Modify `apps/api/src/platform/database/database.ts` by replacing direct use of
`appDatabaseUrlConfig` with an injectable service:

```ts
import { Context } from "effect";
import { nodeDatabaseUrl } from "./database-url.js";

export class AppDatabaseUrl extends Context.Tag(
  "@ceird/platform/database/AppDatabaseUrl"
)<AppDatabaseUrl, string>() {}

export const AppDatabaseUrlLive = Layer.effect(AppDatabaseUrl, nodeDatabaseUrl);
```

Then inside `AppDatabase`:

```ts
const databaseUrl = yield * AppDatabaseUrl;
```

And change the Node runtime layer:

```ts
export const AppDatabaseLive = AppDatabase.Default.pipe(
  Layer.provide(AppDatabaseUrlLive)
);
```

Expected: existing Node runtime behavior remains the same, while Worker runtime can provide the Hyperdrive URL.

- [ ] **Step 4: Add the Worker entrypoint**

Create `apps/api/src/worker.ts`:

```ts
import { Layer } from "effect";

import { makeApiWebHandler } from "./server.js";
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { AppDatabaseUrl } from "./platform/database/database.js";

function makeWorkerApiHandler(env: ApiWorkerEnv) {
  return makeApiWebHandler(
    Layer.succeed(AppDatabaseUrl, env.DATABASE.connectionString)
  );
}

export default {
  async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
    const { handler } = makeWorkerApiHandler(env);
    return await handler(request);
  },
  async queue(): Promise<void> {
    throw new Error("Auth email queue consumer is wired in a later task.");
  },
};
```

If `makeApiWebHandler` currently does not accept an override Layer, update
`apps/api/src/server.ts` in the next step.

Expected: Worker HTTP handling can be tested independently of Node server startup.

- [ ] **Step 5: Add the API layer override seam**

Modify `apps/api/src/server.ts` so `makeApiWebHandler` accepts an optional
runtime override Layer:

```ts
import { HttpServer } from "@effect/platform";

export const makeApiWebHandler = <Error = never, Requirements = never>(
  runtimeOverride?: Layer.Layer<never, Error, Requirements>
) => {
  const apiLayer =
    runtimeOverride === undefined
      ? Layer.mergeAll(ApiLive, HttpServer.layerContext)
      : Layer.mergeAll(ApiLive, HttpServer.layerContext).pipe(
          Layer.provide(runtimeOverride)
        );

  return HttpApiBuilder.toWebHandler(apiLayer);
};
```

Adjust the exact generic parameters to satisfy TypeScript.

Expected: the Worker entrypoint can provide Hyperdrive-derived database config while Node keeps its existing default.

- [ ] **Step 6: Run API typecheck**

Run:

```bash
pnpm --filter api check-types
```

Expected: typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/platform/cloudflare/env.ts apps/api/src/platform/database/database-url.ts apps/api/src/platform/database/database.ts apps/api/src/server.ts apps/api/src/worker.ts
git commit -m "api: add cloudflare worker entrypoint"
```

## Task 5: Move Auth Email Scheduling To Queues

**Files:**

- Create: `apps/api/src/domains/identity/authentication/auth-email-queue.ts`
- Create: `apps/api/src/domains/identity/authentication/auth-email-queue.test.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `docs/architecture/auth.md`

- [ ] **Step 1: Add the queue message schema**

Create `apps/api/src/domains/identity/authentication/auth-email-queue.ts`:

```ts
import { Context, Effect, Schema } from "effect";

import {
  EmailVerificationEmailInput,
  OrganizationInvitationEmailInput,
  PasswordResetEmailInput,
} from "./auth-email.js";

export const AuthEmailQueueMessage = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("password-reset"),
    payload: PasswordResetEmailInput,
  }),
  Schema.Struct({
    kind: Schema.Literal("email-verification"),
    payload: EmailVerificationEmailInput,
  }),
  Schema.Struct({
    kind: Schema.Literal("organization-invitation"),
    payload: OrganizationInvitationEmailInput,
  })
);

export type AuthEmailQueueMessage = Schema.Schema.Type<
  typeof AuthEmailQueueMessage
>;

const decodeAuthEmailQueueMessage = Schema.decodeUnknownSync(
  AuthEmailQueueMessage
);

export class AuthEmailQueue extends Context.Tag(
  "@ceird/domains/identity/authentication/AuthEmailQueue"
)<
  AuthEmailQueue,
  {
    readonly send: (message: AuthEmailQueueMessage) => Effect.Effect<void>;
  }
>() {}

export function makeCloudflareAuthEmailQueue(queue: Queue) {
  return {
    send: (message: AuthEmailQueueMessage) =>
      Effect.promise(() => queue.send(message)),
  };
}

export function decodeAuthEmailQueueMessageStrict(input: unknown) {
  return decodeAuthEmailQueueMessage(input);
}
```

Expected: queue payloads are schema-checked at both scheduling and consuming boundaries.

- [ ] **Step 2: Write queue tests**

Create `apps/api/src/domains/identity/authentication/auth-email-queue.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decodeAuthEmailQueueMessageStrict } from "./auth-email-queue.js";

describe("auth email queue messages", () => {
  it("decodes password reset messages", () => {
    expect(
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          deliveryKey:
            "password-reset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          recipientEmail: "user@example.com",
          recipientName: "User",
          resetUrl: "https://app.example.com/reset-password?token=abc",
        },
      })
    ).toMatchObject({ kind: "password-reset" });
  });

  it("rejects malformed messages", () => {
    expect(() =>
      decodeAuthEmailQueueMessageStrict({
        kind: "password-reset",
        payload: {
          recipientEmail: "not-an-email",
        },
      })
    ).toThrow();
  });
});
```

Expected: tests fail only if the schema is missing or too loose.

- [ ] **Step 3: Add a queue-backed background task handler**

Modify `apps/api/src/domains/identity/authentication/auth.ts` so
`createAuthentication` receives explicit queue-backed send functions in Worker
runtime rather than relying on `queueMicrotask`.

Add an options path:

```ts
export interface AuthenticationEmailScheduling {
  readonly sendPasswordResetEmail: (
    input: PasswordResetEmailInput
  ) => Promise<void>;
  readonly sendVerificationEmail: (
    input: EmailVerificationEmailInput
  ) => Promise<void>;
  readonly sendOrganizationInvitationEmail: (
    input: OrganizationInvitationEmailInput
  ) => Promise<void>;
}
```

Use this in the Worker-specific layer so each function sends an
`AuthEmailQueueMessage` to `AUTH_EMAIL_QUEUE`.

Expected: Node can keep direct promise bridge behavior while Worker runtime uses Queue scheduling.

- [ ] **Step 4: Implement the queue consumer**

Modify `apps/api/src/worker.ts`:

```ts
import { Effect } from "effect";
import { decodeAuthEmailQueueMessageStrict } from "./domains/identity/authentication/auth-email-queue.js";
import { AuthEmailPromiseBridge } from "./domains/identity/authentication/auth-email-promise-bridge.js";

export default {
  async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
    const { handler } = makeWorkerApiHandler(env);
    return await handler(request);
  },
  async queue(batch: MessageBatch, env: ApiWorkerEnv): Promise<void> {
    const runtime = makeWorkerRuntime(env);

    for (const message of batch.messages) {
      const authEmailMessage = decodeAuthEmailQueueMessageStrict(message.body);
      await Effect.runPromise(
        Effect.gen(function* () {
          const bridge = yield* AuthEmailPromiseBridge;

          switch (authEmailMessage.kind) {
            case "password-reset":
              yield* Effect.promise(() =>
                bridge.send(authEmailMessage.payload)
              );
              break;
            case "email-verification":
              yield* Effect.promise(() =>
                bridge.sendEmailVerificationEmail(authEmailMessage.payload)
              );
              break;
            case "organization-invitation":
              yield* Effect.promise(() =>
                bridge.sendOrganizationInvitationEmail(authEmailMessage.payload)
              );
              break;
          }
        }).pipe(Effect.provide(runtime))
      );

      message.ack();
    }
  },
};
```

Create `makeWorkerRuntime(env)` as needed to provide the same Worker database
and auth email config layers used by the fetch handler.

Expected: queue messages are decoded, sent, and acknowledged only after delivery succeeds.

- [ ] **Step 5: Document the auth email runtime**

Append this section to `docs/architecture/auth.md`:

```markdown
### Cloudflare Queue Scheduling

In the Cloudflare POC runtime, auth email delivery is scheduled through
Cloudflare Queues instead of `queueMicrotask`.

The API Worker enqueues validated auth email messages during Better Auth hooks.
The same Worker consumes the queue and sends through the existing
`AuthEmailSender` and Cloudflare transport boundary. Queue retries and the
dead-letter queue own durable failure handling.

The Node sandbox runtime may continue to use direct promise-based delivery until
the sandbox is moved to Workers.
```

Expected: the architecture doc records the runtime split clearly.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter api test -- auth-email-queue
pnpm --filter api check-types
```

Expected: queue tests and API typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domains/identity/authentication/auth-email-queue.ts apps/api/src/domains/identity/authentication/auth-email-queue.test.ts apps/api/src/domains/identity/authentication/auth.ts apps/api/src/worker.ts docs/architecture/auth.md
git commit -m "api: schedule auth email with cloudflare queues"
```

## Task 6: Configure The App For Cloudflare Deployment

**Files:**

- Modify: `apps/app/vite.config.ts`
- Modify: `apps/app/package.json`
- Create: `apps/app/src/cloudflare-env.d.ts`

- [ ] **Step 1: Add Cloudflare env type bridge**

Create `apps/app/src/cloudflare-env.d.ts`:

```ts
declare global {
  interface CloudflareEnv {
    readonly API_ORIGIN: string;
    readonly VITE_API_ORIGIN: string;
  }
}

export {};
```

Expected: app code can grow typed Worker bindings without touching API types.

- [ ] **Step 2: Update Vite config for Cloudflare target**

Modify `apps/app/vite.config.ts` to configure a Cloudflare build path. The
current TanStack Start plugin version no longer accepts the older
`target: "cloudflare-module"` option, so keep `tanstackStart()` unchanged and
let Alchemy's `TanStackStart` resource own platform packaging.

```ts
const isCloudflareBuild = process.env.CEIRD_CLOUDFLARE === "1";

// in Vite build config:
build: isCloudflareBuild
  ? {
      rollupOptions: {
        external: ["cloudflare:workers", "node:async_hooks"],
      },
      target: "esnext",
    }
  : undefined,
```

Keep the existing devtools, tsconfig paths, Tailwind, and React plugins.

Expected: existing local Vite development still works, and Cloudflare builds can opt into the correct target.

- [ ] **Step 3: Add package scripts**

Modify `apps/app/package.json` scripts:

```json
{
  "scripts": {
    "build:cloudflare": "CEIRD_CLOUDFLARE=1 vite build"
  }
}
```

Expected: Alchemy can call a stable package-local build command.

- [ ] **Step 4: Run app typecheck and build**

Run:

```bash
pnpm --filter app check-types
pnpm --filter app build:cloudflare
```

Expected: typecheck and Cloudflare-target build pass.

- [ ] **Step 5: Commit**

```bash
git add apps/app/vite.config.ts apps/app/package.json apps/app/src/cloudflare-env.d.ts
git commit -m "app: add cloudflare build target"
```

## Task 7: Wire Deployment Secrets And Deploy The POC

**Files:**

- Modify: `docs/superpowers/plans/2026-04-27-cloudflare-alchemy-poc-implementation.md`

- [ ] **Step 1: Prepare local environment**

Set the required deployment environment locally or in the chosen secure shell:

```bash
export CEIRD_INFRA_STAGE='preview'
export CEIRD_ZONE_NAME='<domain.example>'
export CEIRD_APP_HOSTNAME='app.<domain.example>'
export CEIRD_API_HOSTNAME='api.<domain.example>'
export AUTH_EMAIL_FROM='no-reply@<domain.example>'
export PLANETSCALE_ORGANIZATION='<planetscale-org-name>'
export PLANETSCALE_API_TOKEN_ID='<planetscale-api-token-id>'
export PLANETSCALE_API_TOKEN='<planetscale-api-token-with-database-and-role-scopes>'
export CEIRD_PLANETSCALE_DATABASE_NAME='ceird-preview'
export CEIRD_PLANETSCALE_DEFAULT_BRANCH='main'
export CEIRD_PLANETSCALE_REGION='eu-west'
export CEIRD_PLANETSCALE_CLUSTER_SIZE='PS-5'
export APPLY_MIGRATIONS='true'
export AUTH_EMAIL_TRANSPORT='cloudflare'
export CLOUDFLARE_ACCOUNT_ID='<cloudflare-account-id>'
export CLOUDFLARE_API_TOKEN='<bootstrap-token-with-cloudflare-iac-scopes>'
```

Expected: no secrets are committed to the repo. Cloudflare deploy credentials
come from an Alchemy bootstrap profile or env-backed profile, and Alchemy creates
the narrower runtime Cloudflare API token used by the auth email transport. Use
`APPLY_MIGRATIONS=false` for infra-only deploys and `APPLY_MIGRATIONS=true` when
the deploy should apply Drizzle migrations.

- [ ] **Step 2: Deploy through Alchemy**

Run:

```bash
CI=true ALCHEMY_PROFILE=ceird-bootstrap pnpm infra:deploy
```

Expected: Alchemy creates or updates the PlanetScale Postgres database,
PlanetScale roles, Hyperdrive config, app Worker, API Worker, queues, routes,
and observability settings. If `APPLY_MIGRATIONS=true`, Alchemy also applies
Drizzle migrations programmatically before the Workers are deployed.

If PlanetScale rejects database creation because billing or organization
permissions are missing, stop and fix the account setup. Do not create the POC
database manually as a workaround.

- [ ] **Step 3: Smoke test the public API**

Run:

```bash
curl -fsS "https://${CEIRD_API_HOSTNAME}/health"
```

Expected: JSON health payload for the API Worker.

- [ ] **Step 4: Smoke test the public app**

Run:

```bash
curl -fsS "https://${CEIRD_APP_HOSTNAME}/health"
```

Expected: app health route returns successfully.

- [ ] **Step 5: Smoke test auth/database wiring**

Open the app URL and complete a signup flow using a test email address controlled
by the team.

Expected:

- user row is written to PlanetScale Postgres
- auth email message is enqueued
- queue consumer attempts delivery
- failures retry and eventually appear in the DLQ if credentials/domain setup is incomplete

- [ ] **Step 6: Record deployment notes**

Replace this task section's deployment notes with the actual preview hostnames,
PlanetScale database name, Hyperdrive resource name, and any failures observed
during deploy.

Expected: the plan remains the durable record of what happened during the POC.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-04-27-cloudflare-alchemy-poc-implementation.md
git commit -m "docs: record cloudflare poc deployment notes"
```

## Task 8: Final Verification And POC Review

**Files:**

- Modify: `docs/architecture/data-layer.md`
- Modify: `docs/architecture/auth.md`
- Modify: `docs/superpowers/specs/2026-04-27-cloudflare-alchemy-poc-design.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm check-types
pnpm test
pnpm build
```

Expected: all repo checks pass.

- [ ] **Step 2: Record POC outcome**

Append this section to `docs/superpowers/specs/2026-04-27-cloudflare-alchemy-poc-design.md`:

```markdown
## POC Outcome

Status: pending

Findings:

- App Worker: not evaluated yet
- API Worker: not evaluated yet
- Hyperdrive: not evaluated yet
- PlanetScale Postgres: not evaluated yet
- Auth email Queue: not evaluated yet
- Alchemy DX: not evaluated yet

Decision:

- Continue with Alchemy: not decided yet
- Continue with PlanetScale + Hyperdrive: not decided yet
- Next Cloudflare-native storage experiment: not decided yet
```

Replace each `not evaluated yet` value after deployment.

Expected: the spec records whether the POC should become the real deployment path.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/data-layer.md docs/architecture/auth.md docs/superpowers/specs/2026-04-27-cloudflare-alchemy-poc-design.md
git commit -m "docs: record cloudflare poc outcome"
```

## Self-Review Notes

- Spec coverage: the plan covers the new `infra` package, Alchemy-only IaC, app/API Workers, PlanetScale Postgres setup, Hyperdrive, Queues, no Wrangler config, documentation, and POC verification.
- Known ambiguity: Alchemy beta API names may differ at implementation time. The plan intentionally confines those adaptations to `packages/infra`.
- Deliberate deferral: Durable Objects, D1, R2, Workflows, and MCP implementation are excluded from this POC.
