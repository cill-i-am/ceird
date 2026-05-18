# Alchemy V2 Native Migration Design

## Summary

Migrate Ceird from the current `packages/infra` plus Docker sandbox model to a
root Alchemy v2 stack that owns deploy, preview, and local cloud-backed
development environments.

The target state is intentionally not a compatibility layer around the current
setup. The repo is greenfield, and the migration should remove infrastructure
wrappers, the sandbox CLI package, and Turborepo orchestration where Alchemy
stages and direct `pnpm` package scripts are a simpler source of truth.

The desired local development model is full Alchemy-native local dev:

- `alchemy dev` creates or updates stage-scoped cloud resources.
- Workers run locally in workerd with hot reload.
- Neon branches provide database isolation for dev, preview, and agent stages.
- Docker Postgres worktree sandboxes are removed.

## Goals

- Move the stack entrypoint to root `alchemy.run.ts`.
- Upgrade Alchemy to the current v2 beta line that exposes native
  `alchemy/Neon` and `alchemy/Drizzle` providers.
- Compose `Cloudflare.providers()`, `Neon.providers()`, and
  `Drizzle.providers()` in one stack provider layer.
- Use `Cloudflare.state()` as the shared state store for local, CI, and team
  deploys.
- Let Alchemy stages be the only deployment environment axis.
- Provision Neon with native `Neon.Project` and `Neon.Branch` resources.
- Apply Drizzle migrations through native Alchemy resources, preferably
  `Drizzle.Schema(...).out` passed into `Neon.Branch({ migrationsDir })`.
- Create Cloudflare Hyperdrive from the Neon branch `origin`, not from
  deploy-time Neon URL secrets.
- Prefer deploying the API as an Alchemy Effect Worker with typed Cloudflare
  bindings when the Effect dependency graph is compatible.
- If Effect 4 compatibility is blocked, deploy the API first as an Alchemy
  async Worker with typed bindings and keep the existing Effect 3 runtime
  composition inside the handler while the frontend/shared package upgrade is
  handled separately.
- Deploy the TanStack Start app with `Cloudflare.Vite`.
- Replace manual `ApiWorkerEnv` drift with types inferred from Alchemy
  resource bindings.
- Thread Effect runtime composition through the Worker init/runtime boundary,
  including database, auth email queue, email binding, config, geocoder, and
  request context.
- Replace Effect Atom for server-backed frontend resource state with TanStack
  DB collections, live queries, and optimistic actions so the app is no longer
  pinned to Effect 3 by its client state library.
- Remove `packages/sandbox-cli` and Docker Compose sandbox assets.
- Remove or reduce Turborepo until it is no longer part of the normal local,
  CI, or deploy workflow.
- Update architecture docs and workflows so the documented source of truth
  matches the new Alchemy-native workflow.

## Non-Goals

- Preserving the Docker sandbox as an alternate supported local workflow.
- Keeping deploy-time Neon URL secrets as the primary database provisioning
  mechanism.
- Keeping custom Alchemy resources for Hyperdrive or migration execution once
  native resources cover the behavior.
- Adding Terraform, Pulumi, raw Wrangler config, or another IaC layer.
- Replacing Better Auth in this migration.
- Rewriting product data models or moving Postgres data into D1, R2, Durable
  Objects, or Workflows.
- Running `alchemy dev`, `alchemy deploy`, or `alchemy destroy` without an
  explicit operator approval immediately before that command.

## Current Context

The current production infrastructure is under `packages/infra`:

- `packages/infra/alchemy.run.ts` exports an Alchemy stack.
- `packages/infra/src/cloudflare-stack.ts` provisions API Worker, app Worker,
  queues, queue consumer, raw Hyperdrive binding, and raw send email binding.
- `packages/infra/src/cloudflare-hyperdrive.ts` is a custom Cloudflare
  Hyperdrive resource.
- `packages/infra/src/drizzle-migrations.ts` is a custom deploy-time migration
  resource.
- `packages/infra/src/neon.ts` parses externally managed Neon direct database
  URLs; it does not provision Neon.
- `packages/infra/src/stages.ts` uses `CEIRD_INFRA_STAGE` plus separate
  host/stage variables, which can diverge from the Alchemy stage.

The current local environment is owned by `packages/sandbox-cli`:

- Root `pnpm sandbox:*` scripts call `packages/sandbox-cli/src/cli.ts`.
- The CLI creates Docker Compose services for app, API, and Postgres.
- The CLI derives sandbox identity from the current Git branch.
- Sandbox URL JSON is consumed by scripts and tests.

Turborepo currently orchestrates package scripts:

- Root `build`, `check-types`, and `test` scripts run `turbo run ...`.
- App and API package `turbo.json` files add small task relationships.
- The sandbox path also relies on Turbo `sandbox:dev` tasks.

The API is already Effect-first:

- `apps/api/src/server.ts` builds the HTTP handler from layers.
- `apps/api/src/worker.ts` adapts Cloudflare env and queue handlers into the
  existing web handler.
- `apps/api/src/platform/database/database.ts` owns the current `pg.Pool`,
  Better Auth Drizzle database, Effect SQL client, and Effect Drizzle service.

The current Worker env type is manually authored in
`apps/api/src/platform/cloudflare/env.ts`. This is exactly the class of drift
that Alchemy resource binding inference should replace.

The app uses Effect on the client side:

- `apps/app` depends on `@effect-atom/atom-react`.
- Jobs, sites, and organization settings state all use `Atom.make`,
  `Atom.fn`, `Atom.family`, `useAtomValue`, `useAtomSet`, `Result`, and
  `RegistryProvider`.
- App API client helpers and tests also use Effect values directly.

That means upgrading every app/API/shared package to Effect 4 is not just an
infra dependency bump. It crosses frontend state management, shared schemas,
API clients, tests, and runtime packages.

## External Facts

The current live Alchemy v2 docs show:

- Getting Started installs `alchemy@2.0.0-beta.40` with Effect 4 beta-compatible
  peer dependencies.
- `alchemy dev` deploys cloud resources while Workers run locally in workerd
  with hot reload.
- `Cloudflare.Worker` supports typed `bindings` plus `Cloudflare.InferEnv` for
  async Workers.
- Effect Workers bind resources in the Worker init phase and use typed handles
  in runtime handlers.
- `Cloudflare.Hyperdrive` is native and exposes `Hyperdrive.bind(...)` for a
  typed runtime connection string.
- `Neon.Project` and `Neon.Branch` are native resources.
- `Neon.Branch` exposes `connectionUri`, `pooledConnectionUri`, and `origin`;
  `origin` is the direct endpoint shape intended for resources such as
  Cloudflare Hyperdrive.
- `Drizzle.Schema` can generate migration output and pass `schema.out` into a
  database resource `migrationsDir`.

The installed repo version is older:

- `packages/infra` currently pins `alchemy@2.0.0-beta.28`.
- That version does not expose `alchemy/Neon` or `alchemy/Drizzle`.
- `alchemy@2.0.0-beta.40` exports `./Neon`, `./Drizzle`, and the relevant
  Cloudflare resources.

The package upgrade is therefore not incidental; it is the migration path that
lets us delete the custom wrappers.

Effect Atom compatibility is currently a real blocker for a repo-wide Effect 4
upgrade:

- `@effect-atom/atom-react@0.5.0` is the latest published version and peers on
  `effect ^3.19`.
- `@effect-atom/atom@0.5.3` is the latest published version and peers on
  `effect ^3.19.15`, `@effect/platform ^0.94.2`,
  `@effect/rpc ^0.73.0`, and `@effect/experimental ^0.58.0`.
- The repo currently resolves the app to `effect@3.21.2` and
  `@effect-atom/atom-react@0.5.0`.
- Inspecting the published package source shows this is not just a peer range
  problem: `@effect-atom/atom` imports `@effect/platform/KeyValueStore`,
  `@effect/experimental/Reactivity`, and `@effect/rpc` modules from the Effect
  3-era ecosystem.

Because of this, a local patch or fork of Effect Atom is possible but should not
be the first choice. The cleaner direction is to remove Effect Atom from the app
state architecture and reserve patching it only as a short-lived fallback if the
TanStack DB migration exposes an unexpected blocker.

TanStack DB is a strong replacement candidate for the app's server-backed state:

- `@tanstack/react-db@0.1.83`, `@tanstack/db@0.6.5`,
  `@tanstack/query-db-collection@1.0.36`, and
  `@tanstack/electric-db-collection@0.3.3` are the current latest package
  versions inspected during this design pass.
- The React package peers only on React `>=16.8.0`; the DB packages do not peer
  on Effect.
- Query Collection integrates with TanStack Query Core and existing REST/API
  fetchers.
- TanStack DB schemas use Standard Schema, and the docs list Effect Schema as a
  supported schema library.
- In the currently installed Effect 3 line, `Schema.standardSchemaV1(schema)`
  produces a Standard Schema adapter, which gives a direct bridge from existing
  shared schemas into TanStack DB collections.
- Electric Collection can provide real-time Postgres sync later, but it requires
  an Electric sync path and transaction-id matching. It is not required for the
  first replacement of Effect Atom.

## Target Architecture

### Stack Entry

Create a root `alchemy.run.ts` as the only default deploy stack.

The root stack should:

- import provider modules from `alchemy/Cloudflare`, `alchemy/Neon`, and
  `alchemy/Drizzle`;
- compose providers with `Layer.mergeAll(...)`;
- use `Cloudflare.state()`;
- load small typed config for hostnames and production-only values;
- derive stage-sensitive names from the Alchemy stage, not
  `CEIRD_INFRA_STAGE`;
- return useful stack outputs such as app URL, API URL, Neon branch name,
  Hyperdrive name, and queue names.

`packages/infra` should either disappear or become a short-lived transitional
package during the implementation. The final target is root-native Alchemy.

### Stages And Names

Alchemy stage is the environment identity.

Recommended stages:

- `main` for production.
- `pr-<number>` for pull request previews.
- default `dev_$USER` or an explicit branch-like local stage for human and
  agent development.

Production protection is derived from the same stage value. For example,
`stage === "main"` protects the production Neon branch and disables accidental
destroy paths. There should not be a second stage enum that can disagree with
Alchemy state.

Resource names should be deterministic and stage-scoped. A single helper can
sanitize stage names for Cloudflare and Neon physical names when provider
limits require it.

### Neon And Drizzle

Use Alchemy-native Neon resources:

```ts
const project =
  yield *
  Neon.Project("Database", {
    name: "ceird",
    region: "aws-eu-west-2",
    pgVersion: 17,
    databaseName: "ceird",
    defaultBranchName: "main",
  });

const schema =
  yield *
  Drizzle.Schema("DatabaseSchema", {
    schema: "./apps/api/src/platform/database/schema.ts",
    out: "./apps/api/drizzle/alchemy",
  });

const branch =
  yield *
  Neon.Branch("DatabaseBranch", {
    project,
    name: stageBranchName,
    protected: isProduction,
    migrationsDir: schema.out,
  });
```

The exact `Drizzle.Schema` input may need a small schema export file because
the application currently combines app and Better Auth schemas across modules.
The migration should prefer one explicit schema barrel for Alchemy migration
generation rather than importing runtime services.

The final design should remove:

- `NEON_DATABASE_URL`;
- `NEON_MIGRATION_DATABASE_URL`;
- `CEIRD_APPLY_MIGRATIONS`;
- custom Neon URL validation for the deploy path;
- the custom `DrizzleMigrations` Alchemy resource.

### Hyperdrive

Use native Cloudflare Hyperdrive:

```ts
const hyperdrive =
  yield *
  Cloudflare.Hyperdrive("PostgresHyperdrive", {
    name: stageResourceName("postgres"),
    origin: branch.origin,
    caching: { disabled: true },
    originConnectionLimit,
  });
```

The important invariant is that Hyperdrive receives `branch.origin`, not the
Neon pooled connection URI. Hyperdrive is the pooling layer in the Worker path.

### Effect Version Strategy

The preferred long-term state is one compatible Effect line across app, API,
shared packages, Alchemy Worker runtime, and tests.

The implementation must start with a compatibility spike:

1. Replace or spike-replace the highest-risk Effect Atom usages with TanStack DB
   collections and optimistic actions.
2. Check whether the app's direct Effect usage can typecheck on the Effect 4
   beta line once the Effect Atom dependency is out of the critical path.
3. Check whether shared schema packages can move to Effect 4 without breaking
   app consumers.
4. Check whether the API can move to the Alchemy-compatible Effect 4 beta line
   while still using Better Auth, Effect HTTP API, Effect SQL, SQL Drizzle,
   and the current MCP dependencies.

If the TanStack DB replacement is contained and the remaining checks pass, do
the full Effect 4 upgrade and use the Alchemy Effect Worker pattern immediately.

If they do not pass, keep runtime packages on Effect 3 for the first native
Alchemy migration and use this bridge:

- root Alchemy stack and provider code use the Alchemy-compatible Effect 4 beta
  line;
- API Worker resource uses native typed `bindings`;
- `apps/api/src/worker.ts` remains a plain async Cloudflare handler typed from
  `Cloudflare.InferEnv<typeof ApiWorker>`;
- inside that async handler, the existing Effect 3 runtime continues to build
  and run the API layers from the bound Hyperdrive connection string and queue
  binding;
- the manual env interface is replaced with an inferred binding bridge so
  resource drift is still fixed.

This bridge is not the final architecture. It is acceptable only as the path
that lets the repo delete custom Alchemy wrappers, Neon URL secrets,
Turborepo/sandbox workflow, and Docker Postgres while waiting on or replacing
Effect Atom.

Patching Effect Atom is a fallback, not the recommended path. A viable patch
would require a fork or workspace package that ports the core library away from
Effect 3-era `@effect/platform`, `@effect/experimental`, and `@effect/rpc`
imports. That may be useful as an emergency compatibility shim, but it is a
larger maintenance surface than moving Ceird's server-backed frontend state to
TanStack DB.

### API Worker

Move the API Worker toward the Alchemy Effect Worker pattern:

- resource binding happens in the Worker init phase;
- request and queue handlers use typed handles produced by `bind(...)`;
- config values are provided through an Effect config layer;
- request context is provided as a scoped service where needed;
- queue message acknowledgement/retry stays explicit and testable.

The API Worker should bind:

- Hyperdrive;
- auth email Queue;
- optional dead-letter Queue via `QueueConsumer`;
- send email binding;
- any required secrets/vars for Better Auth and Google geocoding.

The manual `ApiWorkerEnv` interface should be replaced or reduced to a
compile-time bridge from the actual Alchemy Worker resource. Raw
`api.bind\`...\`` calls should disappear for Hyperdrive and send email once
native binding descriptors cover them.

The current database runtime can be migrated in two steps:

1. Keep the `pg.Pool` and existing Effect SQL/Drizzle services behind a
   connection string factory while the Worker binding type is made native.
2. Move Worker runtime database creation to the Alchemy docs pattern:
   `Drizzle.postgres(hyperdrive.connectionString)` where it cleanly fits the
   app's Effect SQL and Better Auth needs.

The final state should not leave deploy/runtime composition split between an
Alchemy Effect Worker and an unrelated manual env adapter.

When the Effect 4 compatibility gate fails, the first implementation keeps the
async Worker shape but still removes the unrelated manual env adapter by
exporting the API Worker resource type from the stack and deriving the Worker
environment type from `Cloudflare.InferEnv`.

### Frontend State

Replace Effect Atom with TanStack DB for server-backed resource state.

The initial collections should use `@tanstack/query-db-collection` over the
existing typed API client rather than introducing Electric immediately. This
keeps the first change aligned with the current API surface while removing the
frontend dependency that pins the app to Effect 3.

Recommended collection mapping:

- jobs list and job detail;
- job collaborators, comments, visits, labels, and cost lines where they are
  rendered as resource collections;
- sites and site comments;
- organization service areas and rate cards;
- shared option datasets that currently live in long-lived atoms.

TanStack DB does not replace every atom one-for-one. Use the right state home:

- server-backed rows live in TanStack DB collections;
- derived views use `useLiveQuery`, `createLiveQueryCollection`, and query
  operators such as `eq`, `and`, `or`, `orderBy`, and joins;
- route-visible filters should move toward TanStack Router search params;
- short-lived notices and sheet/form state should stay in React state or a tiny
  local store, not a server collection;
- multi-collection mutations should use `createOptimisticAction` or explicit
  transactions;
- auto-save style interactions should use `usePacedMutations`.

Schema source of truth should remain in the shared domain packages. Where
TanStack DB needs Standard Schema, use `Schema.standardSchemaV1(...)` around
Effect schemas unless the Effect 4 spike proves a different adapter is cleaner.

Important Query Collection invariant: `queryFn` must return complete state for
that collection scope. Do not feed a filtered or paginated API response into a
collection as if it were the complete dataset. Either make the collection scope
explicit, such as organization plus resource type, fetch all pages before
loading the collection, or use on-demand loading where that matches the API.

Electric Collection remains a later option. It could pair nicely with Neon and
Alchemy once the core migration has landed, but it adds a sync service shape,
Postgres logical replication considerations, and transaction id matching. The
first migration should get the app off Effect Atom without adding that extra
infrastructure variable.

### App Worker

Keep TanStack Start under `apps/app`, deployed through `Cloudflare.Vite`.

The app resource should:

- use `rootDir: "./apps/app"`;
- keep `nodejs_compat` while TanStack Start requires Node APIs;
- receive `API_ORIGIN` and `VITE_API_ORIGIN` from the API Worker domain/output;
- use stage-scoped domains for previews/dev where appropriate;
- remain a real product surface, not a landing page or static shell.

The app can continue calling the public API origin first. A service binding
from app to API is a future optimization, not a blocker for this migration.

### Local Development

The local model is Alchemy-native:

```sh
pnpm alchemy dev
```

or a root script that delegates to that command with a stage when desired:

```sh
pnpm dev
pnpm dev -- --stage dev_cillian
```

`alchemy dev` is expected to create or update cloud resources for the selected
stage and run Workers locally in workerd. Because it mutates provider state,
agents must ask before running it, just as they must ask before deploy or
destroy.

The Docker sandbox package is removed. The replacement for sandbox identity is
the Alchemy stage name.

### CI/CD

Build CI should stop depending on Turborepo once direct package scripts cover
the same checks.

Deploy CI should:

- install dependencies;
- typecheck the affected packages;
- run relevant tests;
- run Alchemy with an explicit stage;
- deploy `main` from stage `main`;
- deploy pull request previews with stage `pr-<number>` if previews are
  enabled;
- destroy preview stages on PR close only through an explicit workflow.

The current Neon URL secrets are removed from deploy CI. CI instead needs
provider credentials for Cloudflare and Neon. Existing `~/.alchemy` local
profiles are enough for local work if they are valid; GitHub Actions should use
dedicated secrets or an Alchemy-managed GitHub credentials stack.

### Turborepo Removal

Turborepo is not part of the target workflow.

Replace root scripts with direct package orchestration, for example:

- `pnpm -r --filter './packages/*' --filter './apps/*' run check-types`
- `pnpm -r --if-present run test`
- direct `pnpm --filter app build` and `pnpm --filter api build` where order
  matters
- root `pnpm alchemy ...` commands for deploy/dev

The implementation should verify whether package build ordering still needs a
small explicit script. If it does, prefer a readable Node script or direct
`pnpm --filter` sequence over keeping Turbo for one dependency edge.

### Sandbox Package Removal

Remove final support for:

- `packages/sandbox-cli`;
- Docker Compose sandbox assets;
- root `sandbox:*` scripts;
- package-local `sandbox:dev` scripts;
- sandbox-specific test wrappers;
- docs that describe sandbox startup as the default.

Historical sandbox design docs can remain as history. Current architecture and
development docs must point to Alchemy stages and `alchemy dev`.

`packages/sandbox-core` should be evaluated separately. If it only supports the
sandbox CLI, remove it. If product/runtime code still imports reusable domain
types from it, move those types to a neutral package before deletion.

## Configuration

Keep a small typed config surface:

| Variable                                   | Purpose                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `CEIRD_ZONE_NAME`                          | Cloudflare zone for production domains, defaulting to `ceird.app`.               |
| `CEIRD_APP_HOSTNAME`                       | Optional app hostname override; defaults to parent or stage-scoped app hostname. |
| `CEIRD_API_HOSTNAME`                       | Optional API hostname override; defaults to parent or stage-scoped API hostname. |
| `AUTH_EMAIL_FROM`                          | Sender address for deployed auth email.                                          |
| `AUTH_EMAIL_FROM_NAME`                     | Sender display name.                                                             |
| `GOOGLE_MAPS_API_KEY`                      | Production Google geocoding key.                                                 |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` | Optional Hyperdrive connection limit.                                            |

Remove or stop using:

| Variable                      | Replacement                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `CEIRD_INFRA_STAGE`           | Alchemy stage.                                                |
| `CEIRD_ALCHEMY_STACK_NAME`    | Root stack name unless a real multi-stack need appears.       |
| `NEON_DATABASE_URL`           | Native `Neon.Project` / `Neon.Branch`.                        |
| `NEON_MIGRATION_DATABASE_URL` | Native branch migration application.                          |
| `CEIRD_APPLY_MIGRATIONS`      | Native branch `migrationsDir`; migrations are part of deploy. |
| `CEIRD_SANDBOX`               | Alchemy stage and runtime dev mode.                           |

## Testing And Verification

The migration needs staged verification because it changes infrastructure,
runtime composition, local development, and CI.

Focused checks:

- typecheck the new root Alchemy stack;
- run API Worker unit tests after the binding/runtime refactor;
- run database service tests against a test database connection;
- run app tests after Vite config changes;
- run script tests after removing sandbox wrappers;
- run docs/reference searches to ensure current docs no longer advertise
  sandbox as the default.

Broader checks:

- `pnpm check-types`;
- `pnpm test`;
- `pnpm lint`;
- `pnpm format`;
- Alchemy plan or dry-run style command if available for the chosen beta.

Provider-mutating checks:

- Ask before `alchemy dev`, `alchemy deploy`, and `alchemy destroy`.
- First approved `alchemy dev` should use a non-production stage.
- Verify stack outputs and Worker URLs after an approved deploy/dev run.
- Verify Neon branch creation and migrations from provider-visible state or
  Alchemy outputs.

## Migration Phases

### Phase 1: Dependency Compatibility And Stack Foundation

- Investigate Effect 4 compatibility across app, API, shared packages,
  direct app Effect usage, Better Auth, Effect SQL, Effect RPC, and MCP
  dependencies.
- Add a TanStack DB spike for one representative app slice, preferably jobs,
  because it covers list state, derived filtering, options, and optimistic
  mutation feedback.
- Choose one of two explicit tracks:
  - full Effect 4 upgrade if the compatibility spike is contained;
  - Effect 3 runtime bridge with typed Alchemy async Worker if API/runtime
    packages block the upgrade after Effect Atom is removed from the app path.
- Upgrade Alchemy to the beta that provides native Neon and Drizzle.
- Align dependencies for the selected track.
- Add root `alchemy.run.ts`.
- Create stage/config helpers.
- Keep the old infra package only long enough to compare behavior.

### Phase 2: Native Data Infrastructure

- Add native Neon project/branch resources.
- Add `Drizzle.Schema` or a native migrations directory flow.
- Add native Hyperdrive from `branch.origin`.
- Remove custom Neon URL parsing from the deploy path.
- Remove custom Hyperdrive and migration resources.

### Phase 3: Typed API Worker

- Convert API Worker to Alchemy-native binding definitions.
- Replace manual Worker env drift with inferred or exported binding types.
- Thread Effect layers through Worker init/runtime.
- Keep queue handling behavior equivalent while moving to typed bindings.
- Move database runtime toward `Drizzle.postgres(hyperdrive.connectionString)`
  where compatible.

### Phase 4: App And Workflow

- Keep app on `Cloudflare.Vite` through the root stack.
- Wire app API origin from the stack.
- Replace `@effect-atom/atom-react` state with TanStack DB collections,
  live queries, and optimistic actions for server-backed resources.
- Remove `RegistryProvider` usage once the last Effect Atom feature state is
  gone.
- Replace root dev/deploy scripts with Alchemy commands.
- Remove sandbox scripts and package-local `sandbox:dev` commands.
- Remove Turborepo and replace root orchestration.

### Phase 5: CI And Docs

- Update GitHub Actions for explicit Alchemy stages.
- Remove Neon URL secrets from deploy workflow.
- Add preview deploy/destroy workflow if enabled.
- Update `README.md`, `docs/development.md`, and architecture guides.
- Remove or rewrite tests that only verify sandbox CLI behavior.

## Risks

### Effect Version Upgrade

Alchemy beta.40 expects Effect 4 beta-compatible peers. The app/API packages
currently use Effect 3 ecosystem packages, and the latest Effect Atom packages
peer on Effect 3.

Mitigation: make dependency compatibility the first implementation phase. Use a
full Effect 4 upgrade only after replacing Effect Atom with TanStack DB or
otherwise proving the app state layer is not blocking. Otherwise, use typed
Alchemy async Worker bindings with the existing Effect 3 runtime as an explicit
interim bridge.

### TanStack DB Beta Adoption

TanStack DB is still labeled beta and the current React adapter is versioned
below 1.0.

Mitigation: introduce it behind one representative feature slice first, keep
shared Effect schemas as the runtime validation source, and avoid adding
Electric sync in the same step. The upside is meaningful: TanStack DB removes a
client dependency on the Effect 3 atom ecosystem while improving normalized
resource state, live derived views, and optimistic mutation handling.

### Query Collection Scope

Query Collection treats a query result as the complete collection state for its
scope. Accidentally loading a filtered or partial result as a full collection
can delete or hide existing local rows.

Mitigation: define every collection scope explicitly, fetch complete pages for
the scoped dataset, and keep UI filtering in live queries or router search
params rather than changing the collection's base fetch arbitrarily.

### Drizzle 1 RC Upgrade

Alchemy beta.40 declares Drizzle 1 rc peer dependencies for native Drizzle
resources, while the app currently uses Drizzle 0.45.

Mitigation: isolate migration-generation compatibility first. If `Drizzle.Schema`
cannot consume the existing schema directly, add a small schema barrel or
temporarily use `Neon.Branch({ migrationsDir: "./apps/api/drizzle" })` before
moving generation into Alchemy.

### Provider State Mutation During Dev

`alchemy dev` creates or updates cloud resources. This is the desired model, but
it changes the safety posture for local commands.

Mitigation: stage names must be explicit and non-production for agent/dev
testing, and agents must ask before running provider-mutating commands.

### Deleting Sandbox Too Early

Deleting `packages/sandbox-cli` before Alchemy dev works would temporarily
remove the easiest browser/E2E feedback loop.

Mitigation: delete sandbox only after the root Alchemy stack can typecheck and
the first approved non-production `alchemy dev` path has a clear command. The
target is still deletion, not permanent coexistence.

## Open Decisions Resolved

- "Workspace CLI" means `packages/sandbox-cli`, not product workspaces or
  organizations.
- Local agent/dev environments should use cloud-backed Alchemy stages all the
  way down.
- The recommended infrastructure path is the full Alchemy-native cut-over, not
  an infra-only or sandbox-preserving hybrid.
- Effect 4 alignment is preferred, but it is gated by compatibility. Current
  evidence shows Effect Atom is Effect 3-only at the source level, so the
  preferred frontend path is to replace it with TanStack DB rather than patch
  it.
- TanStack DB should start with Query Collection over the existing API. Electric
  sync is a future enhancement, not a prerequisite for the Alchemy migration.

## Required Operator Inputs

No extra filesystem permissions are needed for repository edits.

No operator input is needed for typechecks, tests, package inspection, or
non-mutating local scripts.

Explicit operator approval is required immediately before:

- `pnpm alchemy dev`;
- `pnpm alchemy deploy`;
- `pnpm alchemy destroy`;
- any equivalent command routed through package scripts.

An operator may also need to refresh Alchemy provider login if existing local
profiles are stale. Current local profile files exist under `~/.alchemy`, so
login is not assumed to be required until a command proves it.

## Review Checklist

- The design removes the sandbox CLI rather than preserving it as a supported
  alternate path.
- Alchemy stage is the single environment axis.
- Native Neon, Hyperdrive, and Drizzle resources replace custom wrappers.
- Hyperdrive uses the Neon branch direct `origin`.
- The API Worker binding type comes from Alchemy resource declarations, even if
  the first runtime bridge remains an async Worker on Effect 3.
- Effect 4 is attempted after the TanStack DB app-state spike; remaining API or
  shared-package compatibility determines whether the first implementation uses
  Alchemy Effect Worker or typed async Worker.
- Effect runtime composition remains deliberate and testable across the Worker
  boundary.
- Turborepo is removed or reduced out of the normal workflow.
- CI uses explicit stages and no Neon URL deploy secrets.
- Provider-mutating commands require explicit approval.
