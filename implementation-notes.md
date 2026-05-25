# TanStack Start And DB Integration Notes

## Context

- Work started on 2026-05-19 from a detached worktree, then moved to `codex/tanstack-start-db-integration`.
- Goal: audit TanStack Start and TanStack DB usage, preserve existing behavior, and refactor toward a best-in-class integration.
- Running checks and decisions are recorded here as the work progresses.

## Research Inputs

- Repo orientation:
  - `README.md` describes the app as TanStack Start plus Effect HTTP API, with `opensrc/` as dependency source.
  - `docs/architecture/frontend.md` says API-backed feature state should prefer TanStack DB collections, seeded by route loaders and decoded shared schemas.
  - `docs/architecture/jobs-v1-spec.md` preserves the intended SSR loader plus route-scoped DB provider pattern for jobs.
- Local dependency source:
  - `opensrc/sources.json` contains `@tanstack/react-start@1.167.16` and `@tanstack/db@0.6.5`; the DB repo also includes `react-db` and `query-db-collection` source.
  - Local DB skills say React apps should import DB APIs from `@tanstack/react-db`, use `useLiveQuery` for React subscriptions, and use route-loader collection `preload()` only for client-side routes with SSR disabled.
- Current official TanStack documentation:
  - TanStack Start server functions are server-only RPC boundaries and enforce serializable inputs/outputs by default.
  - TanStack Router coordinates preload work through route loaders and `defaultPreload: "intent"`.
  - TanStack DB Query Collection is the official REST/TanStack Query bridge, but it introduces `@tanstack/query-core` and treats `queryFn` output as complete collection state.
  - TanStack DB live queries are reactive by default; React usage should go through `useLiveQuery`.

## Decisions And Tradeoffs

- The Superpowers skill path linked in the user request was not present locally; the installed `superpowers:using-superpowers` skill with the same name is being used instead.
- Because the worktree was detached and this task will involve edits, a dedicated `codex/tanstack-start-db-integration` branch was created before changing files.
- Do not move TanStack DB collection `preload()` into SSR route loaders. The local DB meta-framework skill explicitly says TanStack DB collections are client-side only for meta-framework integration and should disable SSR when preloading collections. Ceird's existing hybrid pattern keeps Start SSR loaders as the first-paint source of truth, then seeds client collections.
- Do not add `@tanstack/query-db-collection` in this pass. It is likely useful later, but it adds TanStack Query as another cache/sync layer and would reshape mutation and loading semantics more broadly than needed for preserving current behavior. The current route-scoped local collections remain acceptable because Start loaders and typed browser API calls are the remote boundary.
- Derived `useLiveQuery` collections must not have their source collection manually cleaned up during React unmount. Tests showed TanStack DB emits lifecycle errors in that case. For current route-scoped `localOnly` collections, provider scope and garbage collection are sufficient; manual cleanup was removed.

## Audit Findings

- Jobs, sites, and organization configuration already use route-scoped TanStack DB local collections with shared Effect schemas through `Schema.standardSchemaV1(...)`.
- The state modules manually subscribe with `collection.subscribeChanges()` and read `collection.toArray`, duplicating React DB behavior and virtual-property stripping.
- Sites and organization configuration expose sorted collection views in React after reading DB arrays. This preserves behavior, but the subscription layer should still be `useLiveQuery`.
- Router intent preloading is already enabled globally via `defaultPreload: "intent"` and `defaultPreloadStaleTime: 0`, so route loaders are the correct preload point for server DTOs.
- Server/API boundary code keeps server-only imports behind `createIsomorphicFn` server branches or `.server` files, preserving client/server separation.

## Implementation Log

- Planned first refactor: add a small shared TanStack DB helper for stripping virtual props, then switch route-scoped collection hooks from manual subscriptions to `useLiveQuery`.
- Added `src/lib/tanstack-db-collection.ts` to centralize virtual prop stripping.
- Switched product collection hooks from manual `subscribeChanges()` wiring to React DB `useLiveQuery` query-builder subscriptions.
- Removed manual cleanup of local-only source collections because derived live queries own their own cleanup and warn when a source is cleaned while still subscribed.
- Updated `docs/architecture/frontend.md` with the Start-loader plus route-scoped TanStack DB pattern and the `useLiveQuery` subscription/lifecycle rule.
- Tightened the root infra test script from `vitest run infra` to `vitest run --dir infra`. The old command hung during root discovery with the large local `opensrc/` source tree present; constraining Vitest's directory makes the existing infra suite collect and complete.
- Updated the workflow contract test that locks the root infra script so it now expects the discovery-safe `--dir infra` command.
- Adjusted the `opensrc` ignore rule to match both directories and symlinks, because this worktree exposes `opensrc` as a symlink to the fetched dependency source.

## Verification

- Initial red test: `pnpm --filter app test -- src/lib/tanstack-db-collection.test.ts` failed because `src/lib/tanstack-db-collection.ts` did not exist.
- Focused green tests: `pnpm --filter app test -- src/lib/tanstack-db-collection.test.ts src/features/sites/sites-state.integration.test.tsx src/features/jobs/jobs-state.test.ts`.
- Focused type check: `pnpm --filter app check-types`.
- Full app tests: `pnpm --filter app test`.
- Workspace type check: `pnpm check-types`.
- Lint: `pnpm lint`.
- Format: `pnpm format`.
- Script tests: `pnpm run test:scripts`.
- Infra tests after script isolation: `pnpm exec vitest run --dir infra --reporter=verbose`.
- Full root test suite: `pnpm test`.

---

## Full Query Collection And Mutation Trial

### Context

- Started on 2026-05-20 after deciding the migration is reversible enough to run as a full trial instead of a narrow pilot.
- New goal: migrate query and mutation flows to a best-practice TanStack Start plus TanStack DB model while preserving current behavior and SSR performance.
- Plan file: `docs/superpowers/plans/2026-05-20-tanstack-db-full-trial.md`.

### Research Updates

- TanStack Router's Query integration provides automatic SSR dehydration/hydration and streaming for a per-router `QueryClient`.
- TanStack Start uses TanStack Router underneath, so the same `setupRouterSsrQueryIntegration` wiring applies.
- TanStack DB Query Collection expects `queryFn` to return the complete collection state or a response that `select` turns into the complete collection state.
- Query Collection wraps `onInsert`, `onUpdate`, and `onDelete` handlers and refetches by default after successful persistence.
- TanStack DB recommends `createOptimisticAction` for intent-based mutations, multi-collection updates, server-generated IDs, and server-side domain logic.

### Decisions And Tradeoffs

- Query is an implementation detail under TanStack DB, not a feature-component API. Components should not gain `useQuery` or `useMutation` for DB-backed feature state.
- The typed Effect HTTP client stays as the transport and runtime-decoding boundary.
- Start route loaders keep the SSR/first-paint responsibility and will seed matching Query Collection data where practical.
- Server-generated IDs make raw `collection.insert` a poor fit for create flows unless we accept temporary ID handling. Use optimistic actions or server-confirmed insert/write patterns for these flows.
- TanStack DB `createOptimisticAction` only calls `mutationFn` when `onMutate` records at least one collection mutation. Organization create flows now insert temporary optimistic rows, then reconcile with the typed HTTP response via Query Collection `writeUpsert`.
- Query Collection treats `queryFn` output as complete state. Query functions now return authoritative server arrays by default. To preserve Ceird's stale-response race behavior, a shared write-version guard reconciles current collection rows only when a local write happened while that request was in flight; ordinary later refetches can still prune server-deleted rows.
- The root route now uses `createRootRouteWithContext<AppRouterContext>()` so route components can access the router-level QueryClient in a typed way.
- Sites and site comments use separate Query key prefixes. A nested comments key under the sites key caused Query Collection cache writes for sites to update comment caches because TanStack Query uses prefix matching.
- Site comment collections disable Query retries. Comment refresh is user-triggered and existing behavior expects immediate success/failure, with failed canonical refreshes keeping the server-confirmed comment row.
- Jobs list state uses Query Collection with route-loader cache seeding. Command-style mutations such as job create and detail-side updates still reconcile from typed HTTP responses because the server enriches rows and may create linked site/contact records.
- Jobs create keeps the existing post-create behavior: refresh the full jobs list when possible, and fall back to direct `writeUpsert` state when the refresh fails.

### Simplify Pass Updates

- `OrganizationSettingsPage` now receives the router-scoped `QueryClient` from the settings route instead of letting organization configuration create a private fallback client in production.
- Jobs, sites, labels, and site comments now share collection helpers for stripping TanStack DB virtual props, replacing synced data, and guarding stale query responses after concurrent local writes.
- Query Collection fetchers no longer unconditionally merge fetched rows with collection rows. The merge is limited to requests that overlap a local write, which keeps optimistic/server-confirmed changes from being clobbered by older responses without keeping deleted server rows alive forever.
- Organization configuration collections use disabled Query observers plus explicit section loads. This keeps the existing error/loading UI and prevents duplicate initial list requests from `useLiveQuery` plus the mounted tab effects.
- Organization update mutations fall back to a direct typed HTTP update plus `writeUpsert` if the local row is missing, because `createOptimisticAction` does not call `mutationFn` when `onMutate` records no collection mutation.
- Site comment collections are no longer dropped from the store blindly during options replacement. Inactive collections for removed sites are explicitly cleaned up, while active comment collections stay reusable until their subscribers detach.

### Verification Updates

- `pnpm --filter app test -- src/features/organizations`
- `pnpm --filter app check-types`
- `pnpm --filter app test -- src/features/sites/sites-state.integration.test.tsx src/features/sites/sites-page.test.tsx src/features/sites/sites-detail-sheet.test.tsx src/routes/-_app._org.sites.test.tsx`
- `pnpm --filter app test -- src/features/jobs/jobs-state.test.ts src/features/jobs/jobs-create-sheet.integration.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx src/features/jobs/jobs-page.test.tsx src/routes/-_app._org.jobs.test.tsx`
- `pnpm --filter app test -- 'src/routes/-_app._org.jobs.$jobId.test.tsx' src/routes/-_app._org.jobs.test.tsx src/routes/-_app._org.sites.test.tsx`
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm test`

---

## Review Swarm Fixes

### Findings Accepted

- `useLiveQuery` starts source collection sync during render. Because Start
  routes SSR by default and the DB meta-framework guidance treats collections
  as client-side, live-query subscriptions are now gated on hydration while
  loader DTOs remain the SSR and hydration-render source.
- Query Collection results are complete synced state. The concurrent-write
  reconciliation helper now ignores `$synced: false` optimistic rows so temp
  IDs from optimistic creates cannot be promoted into canonical Query cache.
- Full collection replacements now use Query Collection `utils.writeBatch` so
  delete plus upsert reconciliation is atomic to subscribers and updates the
  Query cache once.
- Query keys for jobs, sites, site comments, and labels now
  include organization plus viewer role/user when available. This prevents a
  router-scoped QueryClient from reusing scoped data across role or session
  changes.
- Route loader Query seeding now records the request start time and refuses to
  overwrite cache data that was updated after that request began. When this
  happens, the loader returns the newer cached items to the provider as well.
- Provider unmount cleanup was not kept. Tests confirmed manual source
  collection cleanup can race live-query teardown and put derived live queries
  into an error state. Route-scoped Query Collections now set a short native
  `gcTime` and inactive comment collections are removed from the provider
  registry without forcing `cleanup()`.
- Organization configuration update actions now return the current
  collection row for no-op edits before creating an optimistic action. This
  avoids TanStack DB's documented behavior where an action with no recorded
  collection mutation completes without calling `mutationFn`.
- Fresh full verification exposed one late async reducer dispatch from the
  organization configuration provider after route/test teardown. The provider
  now wraps async operation result dispatches with an unmount guard so in-flight
  TanStack DB mutations can finish without scheduling React state updates after
  the owning route is gone.

### Verification Updates

- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm --filter app check-types`
- `pnpm --filter app test -- src/lib/tanstack-db-collection.test.ts src/lib/tanstack-db-query.test.ts src/routes/-_app._org.jobs.test.tsx src/routes/-_app._org.sites.test.tsx src/features/organizations src/features/sites/sites-state.integration.test.tsx src/features/sites/sites-page.test.tsx src/features/jobs/jobs-state.test.ts src/features/jobs/jobs-page.test.tsx`
- `pnpm test`

---

## Browser Plugin And E2E Follow-up

### Browser Plugin Cache Repair

- The Browser plugin was installed as `browser@openai-bundled`, but
  `~/.codex/config.toml` also contained a stale
  `browser-use@openai-bundled` entry. The Codex app bundle no longer contains
  that plugin id.
- Removed the stale `browser-use@openai-bundled` config block and deleted
  `~/.codex/.tmp/plugins.sha` so the app can rebuild plugin discovery from the
  current config.
- After the cache repair, the current Codex session still did not expose the
  Browser plugin's privileged Node REPL bridge. Direct shell imports of
  `browser-client.mjs` are intentionally rejected as untrusted, so E2E testing
  continued through Playwright rather than the in-app Browser bridge.

### SSR Collection Subscription Fix

- Full package-local E2E exposed React SSR warnings from `useLiveQuery`:
  `Missing getServerSnapshot, which is required for server-rendered content`.
  Hydration-gating the query builder was insufficient because the hook itself
  still calls `useSyncExternalStore` during SSR.
- Added `src/lib/tanstack-db-react.ts` with
  `useHydratedCollectionItems(...)`. It supplies a server snapshot, keeps
  loader DTOs as the SSR/hydration-render source, strips TanStack DB virtual
  props, and subscribes on the first client commit so disabled Query
  Collections can still be manually `refetch()`ed by mounted section effects.
- Jobs, sites, labels, and site comments now use this helper
  for simple whole-collection reads. Future `useLiveQuery` usage should be
  limited to client-only derived DB queries unless React DB adds an SSR
  `getServerSnapshot` path.

### E2E Findings

- Package-local E2E initially could not migrate the local Postgres test
  database because the Drizzle migration folder format was outdated for the
  current `drizzle-kit`. Running `pnpm --filter domain exec drizzle-kit up`
  converted the tracked migrations into timestamped migration directories; the
  package-local Playwright `db:migrate` command then succeeded.
- Domain tests still had a few old-layout assumptions: direct reads of
  `drizzle/meta/_journal.json` and flat `0003_*.sql` migration files. The
  shared test migration helper now resolves both old numeric filenames and new
  timestamped migration directories, so targeted legacy migration tests can
  stay readable while matching the new Drizzle layout.
- The infra Drizzle smoke test also read one old flat migration filename
  directly. It now finds the committed timestamped migration directory by
  migration slug before asserting that the `pg_trgm` extension migration is
  still present.
- Direct Playwright API signups failed with `MISSING_OR_NULL_ORIGIN`. The auth
  layer is correctly requiring a trusted browser origin for credentialed auth
  mutations, so E2E setup signups now send `Origin: APP_ORIGIN`.
- The organization settings flow could edit an optimistic configuration row
  before the create response swapped in the canonical row, causing the edit
  input to detach during Playwright fill. The E2E now waits for the service
  area create response before editing the canonical row.

### Verification Updates

- `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e` from a clean
  Docker Postgres on `127.0.0.1:5439`: `22 passed`.
- Final full-suite checks after the migration helper repair:
  - `pnpm format`
  - `pnpm lint`
  - `pnpm check-types`
  - `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5439/postgres pnpm test`
  - `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e`: `22 passed`.
- Focused repair checks:
  - `pnpm --filter app check-types`
  - `pnpm --filter app test -- src/features/organizations src/features/jobs/jobs-state.test.ts src/features/sites/sites-state.integration.test.tsx src/routes/-_app._org.jobs.test.tsx src/routes/-_app._org.sites.test.tsx`
  - `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app exec playwright test --project=chromium e2e/auth.test.ts e2e/organization-settings.test.ts --grep "signup creates|organization settings"`
  - `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5439/postgres pnpm --filter domain exec vitest run src/platform/database/test-database.test.ts src/domains/identity/authentication/authentication.test.ts src/domains/identity/authentication/authentication.integration.test.ts src/domains/persistence.integration.test.ts src/domains/http.integration.test.ts`: `74 passed`.

---

## CI Preview Deploy Repair

- GitHub Preview run `26185892173` failed while deploying PR stage `pr-107`.
  The deploy preview forked its Neon branch from `main`, then the native
  `Neon.Branch` migration step reapplied the full historical
  `apps/domain/drizzle` tree. After the Drizzle folder-format conversion, those
  historical migrations are visible as timestamped migration directories, so the
  preview branch hit `relation "account" already exists`.
- The fix keeps parent-stage bootstrap behavior on `apps/domain/drizzle`, but
  switches child/local/preview stages to apply only
  `apps/domain/drizzle/alchemy` after `Drizzle.Schema` runs. That preserves the
  parent bootstrap path while preventing forked branches from replaying SQL that
  already exists on the parent branch.
- Local repair checks before pushing:
  - `pnpm exec vitest run infra/neon.test.ts --reporter=verbose`: `5 passed`.
  - `pnpm run check-types:infra`
  - `pnpm run test:infra`: `27 passed`.
  - `pnpm run test:scripts`: `52 passed`.
  - `pnpm format`
  - `pnpm lint`
