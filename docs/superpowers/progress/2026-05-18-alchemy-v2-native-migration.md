# Alchemy V2 Native Migration Progress

## Goal

Migrate Ceird from the wrapper-heavy infra, sandbox, and Turborepo workflow to a
root Alchemy v2 stack that owns the app, API, Cloudflare resources, Neon
Postgres, Hyperdrive, checked-in Drizzle migrations, typed Worker bindings, and
Effect-threaded runtime composition.

## Current Shape

- Root development runs through `pnpm dev`, which delegates to
  `alchemy dev --env-file .env.local`.
- Root infrastructure lives in `alchemy.run.ts`, with implementation helpers
  under root `infra`, and composes native Alchemy Cloudflare, Neon, and Drizzle
  resources.
- The API Worker receives typed `DATABASE`, `AUTH_EMAIL_QUEUE`, and
  `AUTH_EMAIL` bindings and builds its Effect runtime from the Worker env and
  execution context.
- The app Worker receives both `API_ORIGIN` and `VITE_API_ORIGIN` because
  Cloudflare Vite inlines browser-facing `VITE_` values and also uploads Worker
  env bindings.
- Non-parent stages reference the parent `main` stage's Neon project, so the
  parent stage must exist before child stage reconciliation can succeed.
- A tombstone provider remains for the old `Drizzle.Migrations` state entry so
  Cloudflare-backed Alchemy state can plan and delete that legacy resource
  cleanly. New migrations are owned by `Drizzle.Schema` and `Neon.Branch`.
- The parent `main` stage now has the native `PostgresProject`,
  `PostgresBranch`, `DatabaseSchema`, and adopted `PostgresHyperdrive` entries
  in Cloudflare-backed Alchemy state. Non-parent stages can plan against the
  parent project reference.

## Validation Evidence

- `pnpm test:scripts -- scripts/workflow-contract.test.mjs` passed after the
  latest root infra relocation and docs updates.
- `pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts src/domains/identity/authentication/auth-email-transport.test.ts src/domains/identity/authentication/cloudflare-email-binding-auth-email-transport.test.ts src/platform/cloudflare/env.test.ts`
  passed.
- `pnpm --filter api test` passed.
- `pnpm run check-types:infra` passed.
- `pnpm check-types` passed.
- `pnpm run test:infra` passed.
- `pnpm test` passed.
- `pnpm format` passed.
- `pnpm lint` passed with 0 warnings and 0 errors.
- `git diff --check` passed.
- `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main`
  completed after operator approval and returned:
  `api=https://api-main.ceird.app`, `app=https://app-main.ceird.app`,
  `branch=main`, `hyperdrive=ceird-production-postgres`, and
  `neonDatabase=ceird`.
- `curl -fsS https://api-main.ceird.app/health` returned
  `{"ok":true,"service":"api","stackName":"ceird","stage":"main"}`.
- `curl -fsS https://app-main.ceird.app/health` returned
  `{"ok":true,"service":"app","stackName":"ceird","stage":"main"}`.
- `CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main`
  now reports `Plan: 10 to noop`. Neon, Hyperdrive, Drizzle schema state,
  queues, secret, the API Worker, and the app Worker are all no-op.
- The API Worker `DATABASE` binding state now persists the Hyperdrive id
  `8ef9c8cdd94d46458841fc88d77ad3c8`, so the parent-stage API resource no
  longer plans a binding-only update after the native Hyperdrive resource is
  stable.
- `CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage codex-alchemy-v2-native-migration`
  now succeeds and plans child-stage resource creation instead of failing with
  `InvalidReferenceError`.

## Provider Reconciliation Status

The parent-stage provider gate has been crossed with explicit operator
approval. Continue to require approval for any new provider-mutating command,
but the exact parent-stage deploy command has already been exercised and the
parent provider state is converged:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main
```

After the native Hyperdrive resource reached no-op, rerunning the approved
parent deploy refreshed the persisted API Worker binding metadata. Fresh
parent-stage plan output is `Plan: 10 to noop`; no parent-stage provider drift
is currently known.

## Run Log

### 2026-05-18 Agent Guide Command Alignment

- Added `AGENTS.md` to the workflow contract coverage for local Alchemy command
  snippets.
- Confirmed the tightened contract failed while the root agent guide documented
  `pnpm alchemy destroy --stage <stage>` without the local env file.
- Updated the root agent guide to use
  `pnpm alchemy destroy --env-file .env.local --stage <stage>`.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 34
  root script and workflow contract tests passed.

### 2026-05-18 Teardown Helper Alignment

- Added a failing local environment test requiring the teardown helper to point
  at `pnpm alchemy destroy --env-file .env.local --stage <stage>`.
- Updated `scripts/teardown-local-environment.sh` so local cleanup guidance no
  longer advertises a bare destroy command.
- Re-ran `node --test scripts/local-environment.test.mjs`; all 7 local
  environment tests passed.

### 2026-05-18 Worker Runtime Documentation Alignment

- Added a failing workflow contract requiring the infrastructure guide to
  describe the API Worker as a single Effect-threaded Worker runtime boundary.
- Replaced stale "temporary async Worker bridge" wording with the current
  source-backed shape: `apps/api/src/worker.ts` is only the Cloudflare module
  adapter, while `apps/api/src/platform/cloudflare/runtime.ts` composes config,
  Hyperdrive, auth queue scheduling, email binding delivery, and Google site
  geocoding from Worker bindings.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 35
  workflow and script tests passed.

### 2026-05-18 Main State Tree Evidence

- Re-ran the non-mutating parent-stage state inspection with
  `CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file .env.local --stage main`.
- Confirmed `ceird/main` still has `Api`, `App`, `AuthEmailConsumer`,
  `AuthEmailDeadLetterQueue`, `AuthEmailQueue`, `BetterAuthSecret`,
  `DrizzleMigrations`, and `PostgresHyperdrive` in remote state.
- Confirmed the corresponding parent-stage plan still creates
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`, deletes
  `DrizzleMigrations`, and replaces the auth email queues.
- Re-ran the non-mutating child-stage preflight with
  `CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage codex-alchemy-v2-native-migration`.
- Confirmed it currently fails with `InvalidReferenceError` because the child
  stage references `PostgresProject` from `ceird/main`, and the parent native
  project has not been deployed yet.

### 2026-05-18 Package Boundary Cleanup

- Added a workflow contract that keeps the package overview aligned with the
  Alchemy-native infrastructure boundary and catches stale Docker-era process
  wording.
- Confirmed the tightened contract failed against the existing
  `packages/README.md` text.
- Updated `packages/README.md` so shared package guidance points deployment
  concerns at Alchemy infrastructure instead of Docker process execution.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 36
  workflow and script tests passed.
- Re-ran `pnpm format`, `pnpm lint`, `git diff --check`, the non-mutating
  parent-stage Alchemy plan, and the parent-stage state tree inspection.

### 2026-05-18 Parent State Inspection Action

- Added a failing workflow contract for a Codex environment action that inspects
  the parent `main` Alchemy state tree, since that state is the current deploy
  gate for child-stage Neon project references.
- Updated `.codex/environments/environment.toml` with an
  `Inspect parent Alchemy state` action running
  `CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file .env.local --stage main`.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 37
  workflow and script tests passed.

### 2026-05-18 Manual Drizzle Command Scope

- Added a failing workflow contract requiring manual Drizzle commands to be
  documented as package-local fallbacks rather than the stage deploy path.
- Updated `README.md`, `docs/development.md`, and `apps/api/README.md` so
  Alchemy remains the documented path for stage migration application, while
  `db:generate` and `db:migrate` are scoped to package-local/manual database
  workflows.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 38
  workflow and script tests passed.

### 2026-05-18 API Worker Runtime Documentation

- Expanded the workflow contract so both the local infrastructure guide and the
  API architecture guide must describe the current
  `src/platform/cloudflare/runtime.ts` boundary as the single Effect-threaded
  Worker runtime.
- Confirmed the contract failed while `docs/architecture/api.md` still
  described the runtime as something that could move later to an Alchemy Effect
  Worker.
- Updated the API guide to describe the current thin Worker adapter and Effect
  runtime composition, while keeping Alchemy and Effect 4 dependencies isolated
  in `packages/infra`.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 38
  workflow and script tests passed.

### 2026-05-18 Playwright Stage Database URL Scope

- Added a failing workflow contract requiring the Playwright E2E database URL
  helper to treat generic `DATABASE_URL` as package-local only.
- Updated `apps/app/e2e/test-urls.ts` so existing Alchemy-stage E2E runs require
  `PLAYWRIGHT_DATABASE_URL` for database-backed tests and no longer silently
  fall back to `DATABASE_URL`.
- Split app/API origin resolution into `apps/app/e2e/test-origins.ts` so
  `playwright.config.ts` can load Alchemy-stage origins without eagerly
  resolving a database URL. Database-backed specs now call
  `readPlaywrightDatabaseUrl()` only when they open Postgres.
- Updated `docs/architecture/frontend.md` with the same distinction:
  `DATABASE_URL` is only for `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1`, while
  Alchemy-stage E2E uses `PLAYWRIGHT_DATABASE_URL`.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 39
  workflow and script tests passed.
- Verified `PLAYWRIGHT_BASE_URL=https://app.example.com PLAYWRIGHT_API_URL=https://api.example.com env -u PLAYWRIGHT_DATABASE_URL pnpm --filter app exec playwright test e2e/jobs.test.ts --list`
  lists the non-database-backed jobs E2E specs without requiring a database URL.

### 2026-05-18 README Migration State Wording

- Added a failing workflow contract requiring the root README database guidance
  to name Alchemy-generated migration state instead of the stale
  `baseline/future snapshots` wording.
- Updated `README.md` so database-change quality gates point at the
  package-local Drizzle migration tree plus the Alchemy-generated migration
  state under `apps/api/drizzle/alchemy`.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 39
  workflow and script tests passed.
- Re-ran `pnpm check-types`, `pnpm format`, `pnpm lint`, and
  `git diff --check`; all completed without reported issues.
- Re-ran the non-mutating parent-state checks. `CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file .env.local --stage main`
  still shows `ceird/main` without `PostgresProject`, `PostgresBranch`, or
  `DatabaseSchema`, while `CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main`
  still plans to create those native Neon/Drizzle resources.
- Re-ran the non-mutating child-stage plan. It still fails with
  `InvalidReferenceError` because `codex-alchemy-v2-native-migration`
  references `PostgresProject` from `ceird/main` before the parent native
  deploy has been applied.

### 2026-05-18 Playwright Stage Database URL Discovery

- Added a failing workflow contract requiring stage-targeted Playwright docs to
  retrieve `PLAYWRIGHT_DATABASE_URL` from the Alchemy `PostgresBranch` state
  instead of adding Neon connection strings to root stack outputs.
- Kept the root stack output surface free of `databaseUrl`, `connectionUri`, and
  `pooledConnectionUri` so deploy logs do not print direct database
  credentials.
- Updated `README.md`, `apps/app/README.md`, `docs/development.md`,
  `docs/architecture/frontend.md`, `docs/architecture/local-development-and-infra.md`,
  and `packages/infra/README.md` with the same operator guidance.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 39
  workflow and script tests passed.
- Re-ran `pnpm check-types`, `pnpm format`, `pnpm lint`, and
  `git diff --check`; all completed without reported issues.
- Re-ran the non-mutating parent checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources, and the child-stage plan still fails with
  `InvalidReferenceError` until the parent native deploy is applied.

### 2026-05-18 Local Alchemy Command Hygiene

- Added a failing workflow contract requiring docs that pipe Alchemy state JSON
  through `jq` to name that dependency explicitly.
- Added a failing workflow contract requiring local `alchemy destroy` snippets
  to carry the same `CEIRD_CLOUDFLARE=1` and `.env.local` assumptions as the
  rest of the direct local Alchemy commands.
- Updated `docs/development.md`,
  `docs/architecture/local-development-and-infra.md`, `AGENTS.md`, and
  `packages/infra/README.md` so the local operator docs match those contracts.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 40
  workflow and script tests passed.
- Re-ran `pnpm format`, `pnpm lint`, and `git diff --check`; all completed
  without reported issues.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates them, and the child-stage plan still fails with
  `InvalidReferenceError` until the parent stage is deployed.

### 2026-05-18 Cloudflare REST Auth Email Transport Removal

- Added a failing workflow contract requiring auth email delivery to use the
  native Worker email binding in deployed Workers and deterministic development
  delivery in package-local Node tests, with no parallel Cloudflare REST SDK
  transport path in `apps/api`.
- Confirmed the contract failed while `apps/api/package.json` still carried the
  direct `cloudflare` SDK dependency.
- Removed the old package-local Cloudflare REST transport implementation, its
  tests, optional Cloudflare API credentials from auth email config, and the
  unused Worker env entries for `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN`.
- Kept deployed auth email delivery on
  `cloudflare-email-binding-auth-email-transport.ts` and simplified
  `AuthEmailTransport.Local` so package-local execution always uses the
  deterministic development transport.
- Updated the auth, data layer, development, and local infrastructure docs so
  Cloudflare account credentials are documented only as provider auth inputs for
  Alchemy automation, not as runtime email transport configuration.
- Re-ran the focused auth transport checks:
  `pnpm --filter api test -- src/domains/identity/authentication/auth-email.test.ts src/domains/identity/authentication/auth-email-transport.test.ts src/domains/identity/authentication/cloudflare-email-binding-auth-email-transport.test.ts src/platform/cloudflare/env.test.ts`.
- Re-ran `pnpm --filter api check-types`, `pnpm --filter api test`,
  `pnpm check-types`, `pnpm test:scripts -- scripts/workflow-contract.test.mjs`,
  `pnpm test`, `pnpm format`, `pnpm lint`, and `git diff --check`; all passed.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those native resources, and the child-stage plan still fails
  with `InvalidReferenceError` until the parent stage is deployed.

### 2026-05-18 Local Teardown Command Guidance Alignment

- Added a failing local environment script test requiring the teardown helper
  to show the full direct local Alchemy destroy command:
  `CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage <stage>`.
- Confirmed the test failed while `scripts/teardown-local-environment.sh`
  printed the destroy command without `CEIRD_CLOUDFLARE=1`.
- Updated the helper output so its no-op teardown guidance matches the active
  local Alchemy command hygiene contract.
- Re-ran `node --test scripts/local-environment.test.mjs`; all 7 local
  environment tests passed.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`,
  `pnpm format`, `pnpm lint`, and `git diff --check`; all passed.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources, and the child-stage plan still fails with
  `InvalidReferenceError` until the parent stage is deployed.

### 2026-05-18 Root Infra Helper Relocation

- Added a failing workflow contract requiring Alchemy implementation helpers to
  live under root `infra`, requiring `packages/infra` to be absent, and
  requiring root `check-types:infra` and `test:infra` scripts to own infra
  verification.
- Confirmed the contract failed while `alchemy.run.ts` still imported
  `./packages/infra/src/...` and `packages/infra` still existed as a workspace
  package.
- Moved the Alchemy stack helpers, tests, stage config, native Neon/Drizzle
  layout, Cloudflare binding type bridge, and legacy `Drizzle.Migrations`
  tombstone provider from `packages/infra/src` to root `infra`.
- Removed the `@ceird/infra` workspace package shell, moved its directory-local
  guidance to `infra/`, and shifted Alchemy/Effect 4/Vitest infra dependencies
  to the root package.
- Updated root scripts so `pnpm check-types` includes
  `pnpm run check-types:infra` and `pnpm test` includes
  `pnpm run test:infra`.
- Updated CI and active architecture/development docs to describe root `infra`
  instead of a workspace infra package.
- Re-ran `pnpm run check-types:infra`, `pnpm run test:infra`,
  `pnpm check-types`, `pnpm test`, and
  `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all passed.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources, and the child-stage plan still fails with
  `InvalidReferenceError` until the parent stage is deployed.

### 2026-05-18 Root Infra Review Hook Alignment

- Added a failing workflow contract requiring the Codex stop-review hook to
  treat root `infra/`, `alchemy.run.ts`, and `tsconfig.infra.json` as
  backend/infra review inputs, with no remaining `packages/infra` path.
- Confirmed the contract failed while `.codex/hooks/stop_review_prompt.mjs`
  still classified only `packages/infra/` as infra-related backend work.
- Updated the hook so root stack, infra TypeScript config, and root infra
  helper changes trigger the Ceird backend review reminder.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 42
  workflow and script tests passed.

### 2026-05-18 Provider Reconciliation Gate Contract

- Re-scanned the active source, workflow, and architecture docs for remaining
  sandbox, Portless, Turborepo, and `packages/infra` references. The remaining
  active matches are workflow-contract assertions and historical progress notes;
  the next live blocker is provider state.
- Added a failing workflow contract requiring the progress note to name the
  provider reconciliation gate, the exact parent-stage deploy command, the
  `AuthEmailDeadLetterQueue` and `AuthEmailQueue` replacement risk, and the
  rule to not run provider-mutating commands without approval.
- Updated the provider gate section so the remaining external-state blocker is
  explicit and searchable for the next operator handoff.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 42
  workflow and script tests passed.
- Re-ran `pnpm format`, `pnpm lint`, and `git diff --check`; all passed.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources and replaces both auth email queues, and the
  child-stage plan still fails with `InvalidReferenceError` until the parent
  stage is deployed.

### 2026-05-18 API Auth Email Documentation Cleanup

- Found stale active API architecture wording that still described a deleted
  `cloudflare-auth-email-transport.ts` file and package-local auth email
  delivery via a Cloudflare control-plane provider.
- Tightened the workflow contract so `docs/architecture/api.md` is included in
  the no-parallel-REST-email path check, and expanded the pattern to catch
  generic Cloudflare control-plane provider wording.
- Confirmed the contract failed against the stale API guide.
- Updated `docs/architecture/api.md` so auth email config is runtime sender
  config only, local/package-local delivery is deterministic development
  delivery, and deployed delivery uses the Cloudflare Email Worker binding.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 42
  workflow and script tests passed.
- Re-ran `pnpm format`, `pnpm lint`, and `git diff --check`; all passed.
- Re-ran the explicit active-path search for removed Cloudflare control-plane
  auth email delivery wording; it returned no matches.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources and replaces both auth email queues, and the
  child-stage plan still fails with `InvalidReferenceError` until the parent
  stage is deployed.

### 2026-05-18 Data Layer Root Infra Handoff Cleanup

- Found stale active data-layer wording that still described the Alchemy
  Drizzle handoff as owned by an "infra package" and mentioned a runtime email
  token instead of the deployed Email Worker binding.
- Added a failing workflow contract requiring the data-layer guide to name the
  root `infra` directory and reject the removed infra package wording in the
  manual Drizzle fallback section.
- Confirmed the contract failed against the stale data-layer guide.
- Updated `docs/architecture/data-layer.md` so it describes the root `infra`
  handoff, deployed Cloudflare Email Worker binding, deterministic package-local
  email delivery, and the package-local SQL migration fallback path.
- Re-ran `pnpm test:scripts -- scripts/workflow-contract.test.mjs`; all 42
  workflow and script tests passed.
- Re-ran the stale wording search for `infra package` and
  `runtime email token` across the active data-layer/local-development docs; it
  returned no matches.
- Re-ran `pnpm format`, `pnpm lint`, and `git diff --check`; all completed
  without reported issues.
- Re-ran the non-mutating Alchemy checks. `ceird/main` still lacks
  `PostgresProject`, `PostgresBranch`, and `DatabaseSchema`; the parent plan
  still creates those resources and replaces both auth email queues, and the
  child-stage plan still fails with `InvalidReferenceError` until the parent
  stage is deployed.

### 2026-05-18 Parent Main Deploy And Native State Convergence

- Ran the approved parent-stage deploy command:
  `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main`.
- Fixed the deploy-time Drizzle schema import failure by adding
  `infra/api-drizzle-schema.ts`, which loads the API schema barrel through
  `tsx/esm/api` so Alchemy `Drizzle.Schema` can import NodeNext `.js`
  specifiers from TypeScript source under plain Node.
- Added a plain-Node Drizzle schema regression test in `infra/drizzle.test.ts`
  and added `tsx` as a root dev dependency.
- Fixed the Neon protected-branch deploy failure by making parent branch
  protection opt-in through `CEIRD_NEON_PARENT_BRANCH_PROTECTED=false`.
- Fixed the canonical hostname collision with existing `ceird-production-*`
  Workers by making the parent `main` stage default to
  `app-main.ceird.app` and `api-main.ceird.app`; canonical `app.ceird.app` and
  `api.ceird.app` now require explicit hostname overrides after route cutover.
- Fixed parent-stage repeat plans by adding explicit provider-normalized
  settings: `CEIRD_HYPERDRIVE_NAME` defaults to the adopted
  `ceird-production-postgres` Hyperdrive config for the parent stage, and
  `CEIRD_NEON_HISTORY_RETENTION_SECONDS` defaults to `21600`.
- Confirmed `ceird/main` state now contains `PostgresProject`,
  `PostgresBranch`, `DatabaseSchema`, and `PostgresHyperdrive`, and no longer
  contains the old `DrizzleMigrations` state entry.
- Confirmed the child-stage plan now succeeds and plans child-stage resource
  creation instead of failing on the missing parent `PostgresProject`.
- Re-ran the parent-stage plan after convergence. Neon, Hyperdrive,
  `DatabaseSchema`, queues, secret, and the app Worker are no-op; the API
  Worker and its `DATABASE` binding still plan one update and need follow-up
  before the migration can be considered fully converged.
- Verified both deployed health endpoints:
  `https://api-main.ceird.app/health` and `https://app-main.ceird.app/health`.

### 2026-05-18 API Hyperdrive Binding Convergence

- Reproduced the remaining parent-stage plan drift and confirmed it was limited
  to the API Worker `DATABASE` binding.
- Inspected Alchemy beta source and confirmed Hyperdrive Worker bindings are
  persisted with `{ type: "hyperdrive", name: "DATABASE", id:
hyperdriveId }`.
- Compared parent-stage state and found `Api.props.bindings.DATABASE` already
  referenced the native Hyperdrive id while `Api.bindings` still lacked the
  provider-normalized `id`, indicating stale persisted Worker binding metadata.
- Re-ran the exact operator-approved parent deploy command in an interactive
  terminal and approved the single API Worker update.
- Re-ran `CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main`;
  it now reports `Plan: 10 to noop`.
- Re-ran `CEIRD_CLOUDFLARE=1 pnpm alchemy state get ceird main Api --env-file .env.local`
  and confirmed the persisted API Worker `DATABASE` binding now includes
  `id: 8ef9c8cdd94d46458841fc88d77ad3c8`.
- Re-verified `https://api-main.ceird.app/health` and
  `https://app-main.ceird.app/health`; both returned healthy `ceird/main`
  payloads.
