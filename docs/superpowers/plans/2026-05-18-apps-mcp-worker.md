# Apps MCP Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `apps/mcp` Cloudflare Worker that serves Ceird MCP at `mcp.ceird.app`, while the API remains the OAuth issuer and normal HTTP API.

**Architecture:** Extract shared backend runtime code from `apps/api` into `packages/backend-core`, then make both `apps/api` and `apps/mcp` depend on that package. `apps/api` keeps Better Auth, auth email queues, and HTTP API routes; `apps/mcp` owns MCP resource metadata, bearer validation, Effect AI MCP routing, and MCP tool execution against the shared backend services.

**Tech Stack:** pnpm workspaces, TypeScript NodeNext packages, Effect 3, Effect Platform, Effect AI MCP, Better Auth OAuth Provider, Drizzle, pg, Cloudflare Workers, Hyperdrive, Alchemy v2.

---

## Success Criteria

- `apps/mcp` exists as a workspace package with its own `package.json`, `tsconfig.json`, Worker entrypoint, Cloudflare env contract, runtime composition, and tests.
- The deployed MCP resource URL is `https://mcp.ceird.app/mcp` for the `main` stage.
- `apps/api` no longer serves MCP HTTP or protected-resource metadata, but its Better Auth OAuth Provider still accepts `MCP_RESOURCE_URL` as a valid audience.
- Shared backend services, repositories, database runtime, schemas, and MCP modules live outside `apps/api` in `packages/backend-core`.
- Alchemy provisions a separate MCP Worker with a `DATABASE` Hyperdrive binding, MCP/OAuth env vars, Google Maps config, observability, workers.dev URL, and custom domain.
- Main deploy configuration includes `CEIRD_MCP_HOSTNAME=mcp.ceird.app`.
- Architecture docs describe the new topology and ownership boundaries.
- Focused checks pass: backend-core tests, API tests, MCP tests, infra tests, root type checks, lint, format.

## Target Runtime Topology

```text
MCP client
  -> https://mcp.ceird.app/.well-known/oauth-protected-resource
  -> https://mcp.ceird.app/mcp
  -> apps/mcp Cloudflare Worker
  -> @ceird/backend-core MCP handler and domain services
  -> Hyperdrive
  -> Neon Postgres

OAuth client registration and auth code flow
  -> https://api.ceird.app/api/auth/*
  -> apps/api Better Auth OAuth Provider
  -> tokens signed with issuer https://api.ceird.app/api/auth
  -> audience includes https://mcp.ceird.app/mcp
```

## File Structure

Create:

- `packages/backend-core/package.json` - server-side shared backend package.
- `packages/backend-core/tsconfig.json` - NodeNext package config matching existing core packages.
- `packages/backend-core/README.md` - ownership notes and commands.
- `packages/backend-core/src/index.ts` - public package barrel for stable exports.
- `packages/backend-core/src/domains/mcp/config.ts` - minimal MCP resource/OAuth issuer config shared by API and MCP.
- `apps/mcp/package.json` - MCP app workspace package.
- `apps/mcp/tsconfig.json` - Worker/test TypeScript config.
- `apps/mcp/README.md` - local commands, env contract, deployed URL.
- `apps/mcp/src/platform/cloudflare/env.ts` - MCP Worker binding/config types and config map.
- `apps/mcp/src/platform/cloudflare/runtime.ts` - Worker runtime layer composition for MCP fetch handling.
- `apps/mcp/src/worker.ts` - Cloudflare module Worker adapter.
- `apps/mcp/src/worker.test.ts` - MCP Worker runtime tests.

Move into `packages/backend-core/src`:

- `apps/api/src/platform/database/*` except API-only schema barrel decisions described below.
- `apps/api/src/domains/comments/*`
- `apps/api/src/domains/jobs/*` except `http.ts`
- `apps/api/src/domains/labels/*` except `http.ts`
- `apps/api/src/domains/organizations/*`
- `apps/api/src/domains/sites/*` except `http.ts`
- `apps/api/src/domains/json-cursor.ts`
- `apps/api/src/domains/mcp/*`

Keep in `apps/api`:

- `apps/api/src/domains/identity/authentication/*`
- `apps/api/src/domains/http-cors.ts`
- `apps/api/src/domains/api-observability.ts`
- `apps/api/src/domains/jobs/http.ts`
- `apps/api/src/domains/labels/http.ts`
- `apps/api/src/domains/sites/http.ts`
- `apps/api/src/http-api.ts`
- `apps/api/src/server.ts`
- `apps/api/src/index.ts`
- `apps/api/src/worker.ts`
- `apps/api/src/platform/cloudflare/*`

Modify:

- `apps/api/package.json`
- `apps/api/src/server.ts`
- `apps/api/src/platform/cloudflare/env.ts`
- `apps/api/src/platform/cloudflare/runtime.ts`
- `apps/api/src/platform/database/schema.ts`
- `apps/api/src/domains/identity/authentication/config.ts`
- `apps/api/src/domains/identity/authentication/auth.ts`
- `apps/api/src/domains/identity/authentication/authentication.test.ts`
- `apps/api/src/platform/cloudflare/env.test.ts`
- `apps/api/src/worker.test.ts`
- `infra/cloudflare-stack.ts`
- `infra/cloudflare-stack.test.ts`
- `infra/stages.ts`
- `infra/stages.test.ts`
- `infra/stages.contract.ts`
- `infra/README.md`
- `.github/workflows/deploy-main.yml`
- `docs/README.md`
- `docs/architecture/api.md`
- `docs/architecture/auth.md`
- `docs/architecture/local-development-and-infra.md`
- `docs/architecture/packages.md`
- `docs/architecture/system-overview.md`
- `README.md`
- `packages/README.md`

## Task 1: Create Backend Package Shell

**Files:**

- Create: `packages/backend-core/package.json`
- Create: `packages/backend-core/tsconfig.json`
- Create: `packages/backend-core/README.md`
- Create: `packages/backend-core/src/index.ts`
- Modify: `packages/README.md`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Add a failing workspace/package contract test**

Add a script assertion to `scripts/workflow-contract.test.mjs` that expects `packages/backend-core/package.json` to exist, be named `@ceird/backend-core`, expose `.` from `./src/index.ts`, and have `test` plus `check-types` scripts.

Run:

```bash
pnpm test:scripts -- scripts/workflow-contract.test.mjs
```

Expected: fail because `packages/backend-core/package.json` does not exist.

- [ ] **Step 2: Add package files**

Create `packages/backend-core/package.json`:

```json
{
  "name": "@ceird/backend-core",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./database": "./src/platform/database/index.ts",
    "./mcp": "./src/domains/mcp/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check-types": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run --globals"
  },
  "dependencies": {
    "@better-auth/oauth-provider": "1.6.11",
    "@ceird/comments-core": "workspace:*",
    "@ceird/identity-core": "workspace:*",
    "@ceird/jobs-core": "workspace:*",
    "@ceird/labels-core": "workspace:*",
    "@ceird/sites-core": "workspace:*",
    "@effect/ai": "0.35.0",
    "@effect/platform": "^0.96.1",
    "@effect/sql": "0.51.0",
    "@effect/sql-pg": "0.52.1",
    "drizzle-orm": "1.0.0-rc.2",
    "effect": "^3.21.2",
    "pg": "8.20.0",
    "uuid": "11.1.0"
  },
  "devDependencies": {
    "@effect/language-service": "^0.84.3",
    "@effect/vitest": "0.29.0",
    "@types/node": "^25.6.0",
    "@types/pg": "8.15.6",
    "typescript": "5.9.2",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/backend-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"],
    "plugins": [{ "name": "@effect/language-service" }]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"]
}
```

Create `packages/backend-core/src/index.ts`:

```ts
export * from "./domains/jobs/configuration-service.js";
export * from "./domains/jobs/service.js";
export * from "./domains/labels/service.js";
export * from "./domains/mcp/index.js";
export * from "./domains/sites/geocoder.js";
export * from "./domains/sites/service-areas-service.js";
export * from "./domains/sites/service.js";
export * from "./platform/database/index.js";
```

- [ ] **Step 3: Document ownership**

Add `packages/backend-core/README.md` describing that this package owns backend-only shared runtime code used by `apps/api` and `apps/mcp`: database runtime, non-auth domain services, repositories, server-side schemas, and MCP resource-server modules. State that API-specific HTTP adapters, CORS, and request logging stay in `apps/api`.

- [ ] **Step 4: Update package docs**

Update `packages/README.md` and `docs/architecture/packages.md` to list `@ceird/backend-core` as a backend-only package. State that browser app code must not import it.

- [ ] **Step 5: Verify package shell**

Run:

```bash
pnpm --filter @ceird/backend-core check-types
pnpm test:scripts -- scripts/workflow-contract.test.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend-core packages/README.md docs/architecture/packages.md scripts/workflow-contract.test.mjs
git commit -m "feat: add backend core package shell"
```

## Task 2: Move Database Runtime And Non-Auth Domain Runtime

**Files:**

- Move: `apps/api/src/platform/database/*` to `packages/backend-core/src/platform/database/*`
- Move: `apps/api/src/domains/comments/*` to `packages/backend-core/src/domains/comments/*`
- Move: `apps/api/src/domains/jobs/*` except `http.ts` to `packages/backend-core/src/domains/jobs/*`
- Move: `apps/api/src/domains/labels/*` except `http.ts` to `packages/backend-core/src/domains/labels/*`
- Move: `apps/api/src/domains/organizations/*` to `packages/backend-core/src/domains/organizations/*`
- Move: `apps/api/src/domains/sites/*` except `http.ts` to `packages/backend-core/src/domains/sites/*`
- Move: `apps/api/src/domains/json-cursor.ts` to `packages/backend-core/src/domains/json-cursor.ts`
- Create: `packages/backend-core/src/platform/database/index.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/config.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-queue.ts`
- Modify: `apps/api/src/platform/cloudflare/runtime.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Move files with `git mv`**

Use `git mv` so review history remains readable:

```bash
mkdir -p packages/backend-core/src/platform packages/backend-core/src/domains
git mv apps/api/src/platform/database packages/backend-core/src/platform/database
git mv apps/api/src/domains/comments packages/backend-core/src/domains/comments
git mv apps/api/src/domains/jobs packages/backend-core/src/domains/jobs
git mv apps/api/src/domains/labels packages/backend-core/src/domains/labels
git mv apps/api/src/domains/organizations packages/backend-core/src/domains/organizations
git mv apps/api/src/domains/sites packages/backend-core/src/domains/sites
git mv apps/api/src/domains/json-cursor.ts packages/backend-core/src/domains/json-cursor.ts
mkdir -p apps/api/src/domains/jobs apps/api/src/domains/labels apps/api/src/domains/sites
git mv packages/backend-core/src/domains/jobs/http.ts apps/api/src/domains/jobs/http.ts
git mv packages/backend-core/src/domains/labels/http.ts apps/api/src/domains/labels/http.ts
git mv packages/backend-core/src/domains/sites/http.ts apps/api/src/domains/sites/http.ts
```

- [ ] **Step 2: Add backend database barrel**

Create `packages/backend-core/src/platform/database/index.ts`:

```ts
export * from "./config.js";
export * from "./database-url.js";
export * from "./database.js";
export * from "./errors.js";
export * from "./schema.js";
export * from "./test-database.js";
```

Create `packages/backend-core/src/platform/database/schema.ts` as a non-auth database schema barrel:

```ts
import { commentsSchema } from "../../domains/comments/schema.js";
import { jobsSchema } from "../../domains/jobs/schema.js";
import { labelsSchema } from "../../domains/labels/schema.js";
import { sitesSchema } from "../../domains/sites/schema.js";

export {
  comment,
  commentsSchema,
  siteComment,
  workItemComment,
} from "../../domains/comments/schema.js";
export {
  contact,
  jobsSchema,
  rateCard,
  rateCardLine,
  siteContact,
  workItem,
  workItemActivity,
  workItemCollaborator,
  workItemCostLine,
  workItemLabel,
  workItemVisit,
} from "../../domains/jobs/schema.js";
export { label, labelsSchema } from "../../domains/labels/schema.js";
export {
  serviceArea,
  site,
  siteLabel,
  sitesSchema,
} from "../../domains/sites/schema.js";

export const backendDatabaseSchema = {
  ...commentsSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
};
```

- [ ] **Step 3: Update moved relative imports**

Update imports inside `packages/backend-core/src` so former sibling references still resolve. Expected examples:

```ts
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { SiteGeocoder } from "../sites/geocoder.js";
```

Keep domain files internal to `@ceird/backend-core`; do not import from `apps/api`.

- [ ] **Step 4: Rewire API imports**

Update API files to import backend runtime from `@ceird/backend-core`. Keep `apps/api/src/domains/*/http.ts` in `apps/api`, but update those files to import services from the backend package. Expected examples:

```ts
import {
  AppDatabaseRuntimeLive,
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
} from "@ceird/backend-core/database";
import {
  ConfigurationService,
  JobsService,
  LabelsService,
  ServiceAreasService,
  SiteGeocoder,
  SitesService,
} from "@ceird/backend-core";
```

The root `@ceird/backend-core` barrel should export the database runtime plus the service tags consumed by API HTTP adapters and MCP. Use package subpath exports only for stable coarse boundaries such as `@ceird/backend-core/database` and `@ceird/backend-core/mcp`.

- [ ] **Step 5: Keep API schema barrel stable for migrations**

Recreate `apps/api/src/platform/database/schema.ts` as the API migration schema composition point:

```ts
export {
  comment,
  commentsSchema,
  contact,
  jobsSchema,
  label,
  labelsSchema,
  rateCard,
  rateCardLine,
  serviceArea,
  site,
  siteComment,
  siteContact,
  siteLabel,
  sitesSchema,
  workItem,
  workItemActivity,
  workItemCollaborator,
  workItemComment,
  workItemCostLine,
  workItemLabel,
  workItemVisit,
} from "@ceird/backend-core/database";
export { authSchema } from "../../domains/identity/authentication/schema.js";

import { authSchema } from "../../domains/identity/authentication/schema.js";
import {
  commentsSchema,
  jobsSchema,
  labelsSchema,
  sitesSchema,
} from "@ceird/backend-core/database";

export const databaseSchema = {
  ...authSchema,
  ...commentsSchema,
  ...labelsSchema,
  ...sitesSchema,
  ...jobsSchema,
};
```

- [ ] **Step 6: Add API dependency**

Add `@ceird/backend-core: "workspace:*"` to `apps/api/package.json`. Remove dependencies from `apps/api/package.json` only after TypeScript confirms they are no longer directly imported by API-owned files. Expect `apps/api` to keep `better-auth`, `@better-auth/oauth-provider`, `@effect/platform-node`, and Cloudflare worker dev types.

- [ ] **Step 7: Run focused checks**

Run:

```bash
pnpm --filter @ceird/backend-core test
pnpm --filter @ceird/backend-core check-types
pnpm --filter api test
pnpm --filter api check-types
```

Expected: all pass. If type errors show package export gaps, add explicit `exports` entries instead of reaching into package internals with relative paths.

- [ ] **Step 8: Commit**

```bash
git add packages/backend-core apps/api
git commit -m "refactor: move backend domains into shared package"
```

## Task 3: Extract MCP Resource Config And Move MCP Tests

**Files:**

- Move: `apps/api/src/domains/mcp/*` to `packages/backend-core/src/domains/mcp/*`
- Create: `packages/backend-core/src/domains/mcp/index.ts`
- Create: `packages/backend-core/src/domains/mcp/config.ts`
- Modify: `packages/backend-core/src/domains/mcp/http.ts`
- Modify: `apps/api/src/domains/identity/authentication/config.ts`
- Modify: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [ ] **Step 1: Move MCP files**

```bash
git mv apps/api/src/domains/mcp packages/backend-core/src/domains/mcp
```

- [ ] **Step 2: Add minimal MCP config helper**

Create `packages/backend-core/src/domains/mcp/config.ts`:

```ts
import { Config, Effect, Option } from "effect";

export const DEFAULT_MCP_RESOURCE_PATH = "/mcp" as const;

export interface McpResourceAuthConfig {
  readonly mcpResourceUrl: string;
  readonly oauthIssuerUrl: string;
}

const absoluteUrlConfig = (name: string) =>
  Config.string(name).pipe(
    Config.validate({
      message: `${name} must be a valid absolute URL`,
      validation: (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
    })
  );

const mcpResourceUrlConfig = absoluteUrlConfig("MCP_RESOURCE_URL").pipe(
  Config.option
);
const oauthIssuerUrlConfig = absoluteUrlConfig("OAUTH_ISSUER_URL").pipe(
  Config.option
);

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  );
}

export function normalizeOAuthIssuerUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:" && !isLoopbackHostname(url.hostname)) {
    url.protocol = "https:";
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export function makeDefaultMcpResourceUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  return new URL(DEFAULT_MCP_RESOURCE_PATH, url.origin).toString();
}

export function makeMcpResourceAuthConfig(input: {
  readonly baseUrl: string;
  readonly mcpResourceUrl?: string | undefined;
  readonly oauthIssuerUrl?: string | undefined;
}): McpResourceAuthConfig {
  return {
    mcpResourceUrl:
      input.mcpResourceUrl ?? makeDefaultMcpResourceUrl(input.baseUrl),
    oauthIssuerUrl: normalizeOAuthIssuerUrl(
      input.oauthIssuerUrl ?? input.baseUrl
    ),
  };
}

export const loadMcpResourceAuthConfig = (baseUrl: string) =>
  Effect.gen(function* () {
    const mcpResourceUrl = yield* mcpResourceUrlConfig;
    const oauthIssuerUrl = yield* oauthIssuerUrlConfig;

    return makeMcpResourceAuthConfig({
      baseUrl,
      mcpResourceUrl: Option.getOrUndefined(mcpResourceUrl),
      oauthIssuerUrl: Option.getOrUndefined(oauthIssuerUrl),
    });
  });
```

- [ ] **Step 3: Narrow MCP handler input**

Change `packages/backend-core/src/domains/mcp/http.ts` so `makeMcpWebHandler` accepts `McpResourceAuthConfig` instead of the API's full `AuthenticationConfig`.

Expected signature:

```ts
export function makeMcpWebHandler<ERuntime>(
  options: {
    readonly authConfig: McpResourceAuthConfig;
  } & McpLayerOptions<ERuntime>
) {
```

- [ ] **Step 4: Add MCP barrel**

Create `packages/backend-core/src/domains/mcp/index.ts`:

```ts
export * from "./actor.js";
export * from "./config.js";
export * from "./http.js";
export * from "./tools.js";
```

- [ ] **Step 5: Reuse shared config in API auth config**

In `apps/api/src/domains/identity/authentication/config.ts`, import `DEFAULT_MCP_RESOURCE_PATH`, `makeMcpResourceAuthConfig`, and `normalizeOAuthIssuerUrl` from `@ceird/backend-core/mcp`. Remove duplicate local implementations for the same behavior. Keep the API's `AuthenticationConfig` shape unchanged.

- [ ] **Step 6: Move MCP tests to backend-core**

Move MCP test files with the MCP source. Ensure they run under `pnpm --filter @ceird/backend-core test`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter @ceird/backend-core test -- src/domains/mcp
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
pnpm --filter @ceird/backend-core check-types
pnpm --filter api check-types
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/backend-core apps/api
git commit -m "refactor: extract mcp runtime from api"
```

## Task 4: Add The `apps/mcp` Workspace App

**Files:**

- Create: `apps/mcp/package.json`
- Create: `apps/mcp/tsconfig.json`
- Create: `apps/mcp/README.md`
- Create: `apps/mcp/src/platform/cloudflare/env.ts`
- Create: `apps/mcp/src/platform/cloudflare/runtime.ts`
- Create: `apps/mcp/src/worker.ts`
- Create: `apps/mcp/src/worker.test.ts`
- Modify: `README.md`
- Modify: `apps/README.md`

- [ ] **Step 1: Add package shell**

Create `apps/mcp/package.json`:

```json
{
  "name": "mcp",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check-types": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@ceird/backend-core": "workspace:*",
    "effect": "^3.21.2"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260501.1",
    "@effect/language-service": "^0.84.3",
    "@effect/vitest": "0.29.0",
    "@types/node": "^25.6.0",
    "typescript": "5.9.2",
    "vitest": "3.2.4"
  }
}
```

Create `apps/mcp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals", "@cloudflare/workers-types"],
    "plugins": [{ "name": "@effect/language-service" }]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"]
}
```

- [ ] **Step 2: Add MCP Worker env contract**

Create `apps/mcp/src/platform/cloudflare/env.ts`:

```ts
import type { Hyperdrive } from "@cloudflare/workers-types";

export interface McpWorkerBindingRuntimeEnv {
  readonly DATABASE: Hyperdrive;
}

export interface McpWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly GOOGLE_MAPS_API_KEY: string;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV?: string;
  readonly OAUTH_ISSUER_URL: string;
}

export type McpWorkerEnv = McpWorkerBindingRuntimeEnv & McpWorkerConfigEnv;

export function mcpWorkerEnvConfigMap(env: McpWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY,
      MCP_RESOURCE_URL: env.MCP_RESOURCE_URL,
      NODE_ENV: env.NODE_ENV,
      OAUTH_ISSUER_URL: env.OAUTH_ISSUER_URL,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
```

- [ ] **Step 3: Add MCP Worker runtime**

Create `apps/mcp/src/platform/cloudflare/runtime.ts`:

```ts
import {
  makeAppDatabaseLive,
  makeAppDatabaseRuntimeLive,
  makeMcpWebHandler,
  SiteGeocoder,
} from "@ceird/backend-core";
import { loadMcpResourceAuthConfig } from "@ceird/backend-core/mcp";
import { Config, ConfigProvider, Effect, Layer } from "effect";

import type { McpWorkerEnv } from "./env.js";
import { mcpWorkerEnvConfigMap } from "./env.js";

export function makeMcpWorkerBaseLive(env: McpWorkerEnv) {
  return Layer.setConfigProvider(
    ConfigProvider.fromMap(mcpWorkerEnvConfigMap(env))
  );
}

export function makeMcpWorkerRuntimeLayers(env: McpWorkerEnv) {
  const baseLive = makeMcpWorkerBaseLive(env);
  const databaseRuntimeLive = makeAppDatabaseRuntimeLive(
    makeAppDatabaseLive(env.DATABASE.connectionString)
  );

  return {
    baseLive,
    databaseRuntimeLive,
    siteGeocoderLive: SiteGeocoder.Google,
  };
}

function makeMcpWorkerHandler(env: McpWorkerEnv) {
  const { baseLive, databaseRuntimeLive, siteGeocoderLive } =
    makeMcpWorkerRuntimeLayers(env);
  const authConfig = Effect.runSync(
    Effect.gen(function* () {
      const baseUrl = yield* Config.string("BETTER_AUTH_BASE_URL");
      return yield* loadMcpResourceAuthConfig(baseUrl);
    }).pipe(Effect.provide(baseLive))
  );

  return makeMcpWebHandler({
    authConfig,
    baseLive,
    runtimeLive: Layer.mergeAll(databaseRuntimeLive, siteGeocoderLive),
  });
}

export function handleMcpWorkerFetch(request: Request, env: McpWorkerEnv) {
  const handler = makeMcpWorkerHandler(env);
  return Effect.promise(async () => {
    const response = await handler(request);
    return response ?? new Response(null, { status: 404 });
  });
}
```

- [ ] **Step 4: Add Worker adapter**

Create `apps/mcp/src/worker.ts`:

```ts
import { Effect } from "effect";

import type { McpWorkerEnv } from "./platform/cloudflare/env.js";
import { handleMcpWorkerFetch } from "./platform/cloudflare/runtime.js";

const worker = {
  fetch(request: Request, env: McpWorkerEnv): Promise<Response> {
    return Effect.runPromise(handleMcpWorkerFetch(request, env));
  },
} satisfies ExportedHandler<McpWorkerEnv>;

export default worker;
```

- [ ] **Step 5: Add Worker tests**

Create `apps/mcp/src/worker.test.ts` with tests that assert:

- env config map exposes `MCP_RESOURCE_URL`, `OAUTH_ISSUER_URL`, `BETTER_AUTH_BASE_URL`, and Alchemy metadata.
- `GET /.well-known/oauth-protected-resource` returns resource metadata for `https://mcp.example.com/mcp`.
- an unknown path returns 404.
- a `POST /mcp` request without bearer auth returns 401 with a resource metadata hint.

Use the existing MCP handler tests in `packages/backend-core/src/domains/mcp/http.test.ts` as the behavioral reference.

- [ ] **Step 6: Add app docs**

Add `apps/mcp/README.md` with commands:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm --filter mcp build
```

State that local cloud-backed runs are owned by root Alchemy, not by a standalone `pnpm --filter mcp dev` script.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm --filter @ceird/backend-core check-types
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mcp README.md apps/README.md
git commit -m "feat: add mcp worker app"
```

## Task 5: Wire Alchemy Infrastructure For MCP

**Files:**

- Modify: `infra/stages.ts`
- Modify: `infra/stages.test.ts`
- Modify: `infra/stages.contract.ts`
- Modify: `infra/cloudflare-stack.ts`
- Modify: `infra/cloudflare-stack.test.ts`
- Modify: `infra/README.md`
- Modify: `.github/workflows/deploy-main.yml`
- Modify: `docs/architecture/cloudflare-ci.md`

- [ ] **Step 1: Add `mcpHostname` to stage config**

Update `InfraStageConfig` in `infra/stages.ts`:

```ts
readonly mcpHostname: DomainName;
```

Add default:

```ts
const defaultMcpHostname = `mcp.${identity.stageSlug}.${zoneName}`;
```

Load env:

```ts
const mcpHostname =
  yield *
  Config.string("CEIRD_MCP_HOSTNAME").pipe(
    Config.withDefault(defaultMcpHostname),
    Config.mapOrFail(decodeDomainName)
  );
```

Return `mcpHostname` with the config.

- [ ] **Step 2: Update stage tests**

Update `infra/stages.test.ts` to assert:

- default non-production hostname is `mcp.<stage>.<zone>`.
- main override can be `mcp.ceird.app`.
- `configWithoutCloudflareBootstrapSecrets` in `infra/stages.contract.ts` includes a deterministic `mcpHostname`.

- [ ] **Step 3: Add MCP Worker types and env helpers**

In `infra/cloudflare-stack.ts`, add:

```ts
export type McpWorkerBindings = {
  readonly DATABASE: Cloudflare.Hyperdrive;
};

export type McpWorkerBindingEnv = Cloudflare.InferEnv<
  Cloudflare.Worker<McpWorkerBindings>
>;

export interface McpWorkerConfiguredEnv {
  readonly BETTER_AUTH_BASE_URL: string;
  readonly GOOGLE_MAPS_API_KEY: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly MCP_RESOURCE_URL: string;
  readonly NODE_ENV: "production";
  readonly OAUTH_ISSUER_URL: string;
}
```

Add helpers:

```ts
export function makeMcpWorkerBindings(input: {
  readonly hyperdrive: Cloudflare.Hyperdrive;
}) {
  return {
    DATABASE: input.hyperdrive,
  } satisfies {
    readonly DATABASE: Cloudflare.Hyperdrive;
  };
}

export function makeMcpWorkerEnv(input: {
  readonly config: InfraStageConfig;
}): McpWorkerConfiguredEnv {
  const apiAuthUrl = `https://${input.config.apiHostname}/api/auth`;
  const mcpResourceUrl = `https://${input.config.mcpHostname}/mcp`;

  return {
    BETTER_AUTH_BASE_URL: apiAuthUrl,
    GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
    MCP_RESOURCE_URL: mcpResourceUrl,
    NODE_ENV: "production",
    OAUTH_ISSUER_URL: apiAuthUrl,
  };
}
```

- [ ] **Step 4: Set API audience env explicitly**

Change `makeApiWorkerEnv` so API receives the same MCP resource audience:

```ts
readonly MCP_RESOURCE_URL: string;
readonly OAUTH_ISSUER_URL: string;
```

Populate:

```ts
const apiAuthUrl = `https://${input.config.apiHostname}/api/auth`;

return {
  AUTH_APP_ORIGIN: `https://${input.config.appHostname}`,
  AUTH_EMAIL_FROM: input.config.authEmailFrom,
  AUTH_EMAIL_FROM_NAME: input.config.authEmailFromName,
  BETTER_AUTH_BASE_URL: apiAuthUrl,
  BETTER_AUTH_SECRET: input.betterAuthSecret,
  GOOGLE_MAPS_API_KEY: input.config.googleMapsApiKey,
  MCP_RESOURCE_URL: `https://${input.config.mcpHostname}/mcp`,
  NODE_ENV: "production",
  OAUTH_ISSUER_URL: apiAuthUrl,
};
```

- [ ] **Step 5: Add Cloudflare MCP Worker resource**

In `makeCloudflareStack`, add after the API worker and before app env derivation:

```ts
const mcp =
  yield *
  Cloudflare.Worker("Mcp", {
    name: resourceName(input.config, "mcp"),
    main: "apps/mcp/src/worker.ts",
    compatibility: workerCompatibility,
    bindings: makeMcpWorkerBindings({
      hyperdrive: input.hyperdrive,
    }),
    env: {
      ...makeMcpWorkerEnv({
        config: input.config,
      }),
    },
    domain: input.config.mcpHostname,
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
      traces: {
        enabled: true,
      },
    },
    url: true,
  });
```

Add `mcp` and `mcpOrigin` to the returned resources.

- [ ] **Step 6: Update infra tests**

Update `infra/cloudflare-stack.test.ts` to assert:

- MCP worker binding keys match `apps/mcp/src/platform/cloudflare/env.ts`.
- MCP configured env keys match the runtime config contract.
- API worker configured env now includes `MCP_RESOURCE_URL` and `OAUTH_ISSUER_URL`.
- stack outputs include `mcpOrigin`.

- [ ] **Step 7: Update main deployment env**

Add to `.github/workflows/deploy-main.yml`:

```yaml
CEIRD_MCP_HOSTNAME: mcp.ceird.app
```

Update workflow contract tests that assert production canonical hostnames.

- [ ] **Step 8: Verify**

Run:

```bash
pnpm run test:infra
pnpm run check-types:infra
pnpm test:scripts -- scripts/workflow-contract.test.mjs
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add infra .github/workflows/deploy-main.yml docs/architecture/cloudflare-ci.md scripts/workflow-contract.test.mjs
git commit -m "feat: provision mcp worker infrastructure"
```

## Task 6: Remove MCP Serving From API

**Files:**

- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/server.test.ts`
- Modify: `apps/api/src/platform/cloudflare/runtime.ts`
- Modify: `apps/api/src/platform/cloudflare/env.ts`
- Modify: `apps/api/src/platform/cloudflare/env.test.ts`
- Modify: `apps/api/src/worker.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add failing API non-ownership test**

Add or update an API server test so `GET /.well-known/oauth-protected-resource` and `POST /mcp` are not handled by the API MCP interceptor. Expected behavior can be 404 through the normal API handler or the existing API not-found response.

Run:

```bash
pnpm --filter api test -- src/server.test.ts
```

Expected: fail while API still intercepts MCP.

- [ ] **Step 2: Remove MCP interceptor from API server**

In `apps/api/src/server.ts`, remove:

```ts
import { makeMcpWebHandler } from "@ceird/backend-core/mcp";
```

Remove `authConfig`, `runtimeLive`, and `mcpWebHandler` setup from `makeApiWebHandler`.

Change handler return to:

```ts
return {
  dispose: handler.dispose,
  handler: (request: Request) => handler.handler(request),
};
```

- [ ] **Step 3: Keep API auth audience config**

Keep `MCP_RESOURCE_URL` and `OAUTH_ISSUER_URL` in `apps/api/src/platform/cloudflare/env.ts` because Better Auth still needs them to sign and accept the correct audience and issuer.

- [ ] **Step 4: Trim API dependencies**

Remove `@effect/ai` from `apps/api/package.json` if API-owned files no longer import it. Keep it in `@ceird/backend-core` and `apps/mcp`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm --filter api test -- src/server.test.ts src/worker.test.ts src/platform/cloudflare/env.test.ts
pnpm --filter api check-types
pnpm --filter mcp test
pnpm --filter mcp check-types
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api apps/mcp
git commit -m "refactor: stop serving mcp from api"
```

## Task 7: Update Architecture Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/architecture/system-overview.md`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/auth.md`
- Modify: `docs/architecture/local-development-and-infra.md`
- Modify: `docs/architecture/packages.md`
- Modify: `infra/README.md`
- Modify: `apps/api/README.md`
- Modify: `apps/mcp/README.md`

- [ ] **Step 1: Update workspace maps**

Add `apps/mcp` and `packages/backend-core` to root `README.md`, `docs/README.md`, and package/app README maps.

- [ ] **Step 2: Update system topology**

Change `docs/architecture/system-overview.md` to show:

```text
MCP clients
  -> apps/mcp Cloudflare Worker at mcp.<stage>.<zone> or mcp.ceird.app
  -> Better Auth OAuth issuer on apps/api
  -> @ceird/backend-core MCP router and domain services
  -> Postgres
```

- [ ] **Step 3: Update API guide**

Remove statements that `apps/api/src/server.ts` intercepts MCP. State that API owns OAuth issuer and valid audience configuration, while `apps/mcp` owns MCP HTTP.

- [ ] **Step 4: Update auth guide**

State:

- `BETTER_AUTH_BASE_URL` remains the API auth issuer URL.
- `MCP_RESOURCE_URL` should be explicit in deployed stages and points to `https://<mcp-hostname>/mcp`.
- `OAUTH_ISSUER_URL` points to `https://<api-hostname>/api/auth` for MCP verification.
- MCP protected-resource metadata is served by `apps/mcp`, not `apps/api`.

- [ ] **Step 5: Update infra guide**

Add `CEIRD_MCP_HOSTNAME` to env variable tables. Explain main production hostnames:

```text
app.ceird.app -> app Worker
api.ceird.app -> API Worker and OAuth issuer
mcp.ceird.app -> MCP Worker and protected resource
```

- [ ] **Step 6: Verify docs and formatting**

Run:

```bash
pnpm format
rg -n "API.*MCP|src/server.ts.*MCP|inside the API Worker|apps/api @effect/ai MCP" docs README.md apps infra -S
```

Expected: format passes, and remaining matches accurately describe historical context or the old behavior no longer appears.

- [ ] **Step 7: Commit**

```bash
git add README.md docs apps infra
git commit -m "docs: document standalone mcp worker"
```

## Task 8: Full Verification And Cleanup

**Files:**

- Modify only files required by verification failures.

- [ ] **Step 1: Run focused package checks**

```bash
pnpm --filter @ceird/backend-core test
pnpm --filter @ceird/backend-core check-types
pnpm --filter api test
pnpm --filter api check-types
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm run test:infra
pnpm run check-types:infra
pnpm test:scripts
```

Expected: all pass.

- [ ] **Step 2: Run broad checks**

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
git diff --check
```

Expected: all pass with no warnings or whitespace errors.

- [ ] **Step 3: Inspect final ownership**

Run:

```bash
rg -n "makeMcpWebHandler|domains/mcp|oauth-protected-resource|MCP_RESOURCE_URL" apps/api apps/mcp packages/backend-core infra docs -S
```

Expected:

- `apps/api` references `MCP_RESOURCE_URL` only for auth/OAuth audience configuration.
- `apps/api` has no `makeMcpWebHandler` call.
- `apps/mcp` owns Worker runtime and calls `makeMcpWebHandler`.
- `packages/backend-core` owns MCP handler/tool implementation.
- docs describe the new topology.

- [ ] **Step 4: Optional provider plan after operator confirmation**

If credentials and target stage are confirmed by the operator, run:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage codex-apps-mcp-worker
```

Expected: plan shows one new MCP Worker/domain and API env updates for the stage. Do not run `deploy` or `dev` without explicit operator confirmation for stage and credentials.

- [ ] **Step 5: Final commit**

```bash
git status --short
git commit --allow-empty -m "chore: verify standalone mcp worker"
```

Use the empty verification commit only if all implementation changes were already committed by prior tasks and the team wants an auditable verification marker. Otherwise skip it.

## Execution Notes

- Keep `apps/mcp` out of browser-facing package imports. It is a server Worker app only.
- Do not move Better Auth implementation into `packages/backend-core`; API owns auth provider setup and auth email behavior.
- Do not make `apps/mcp` import from `apps/api/src`. That would create the fake boundary this plan is avoiding.
- Keep Alchemy out of runtime packages. `apps/api`, `apps/mcp`, and `packages/backend-core` should not import `alchemy`.
- Use `Config` or `Schema` at env, HTTP, database, and external OAuth/MCP boundaries.
- Do not run provider-mutating Alchemy commands without confirming stage and credentials.
