# TanStack DB Data Plane

Ceird uses TanStack Start loaders for SSR and navigation preload, and TanStack
DB Query Collections for browser-side product entity state. The boundary is
intentional: loaders fetch and validate first-paint DTOs, then return typed
data-plane seed envelopes. The active organization route installs one
`DataPlaneProvider` for the current organization, viewer user, role, router
`QueryClient`, collection registry, and mutation journal.

## Collection Contracts

All product collections are created through `apps/app/src/data-plane`, not in
route components or view state files. A collection contract must declare:

- collection root and stable `id`
- scoped TanStack Query key
- `getKey`
- Effect Standard Schema
- completeness policy
- sync mode
- query function
- stale and garbage-collection behavior

Current collection roots are `activity-events`, `product-activity-actors`,
`jobs`, `job-activity`, `job-comment-bodies`, `job-comments`, `job-contacts`,
`job-options`, `job-label-assignments`, `job-details`, `job-collaborators`,
`job-sites`, `job-visits`, `sites`, `site-active-job-summaries`,
`site-comments`, `site-label-assignments`, `site-related-jobs`, and `labels`.
The legacy jobs primary route collection and legacy Sites route collection are
eager bounded Query Collections for their first cursor pages. The
Electric-native Sites read model uses named Electric contracts for
tenant-complete sites, tenant-complete site-label assignments, tenant-complete
domain-owned active-job summaries, and jobs rows that can be locally filtered
into related-job detail state. Site-related jobs in the legacy route remain the
first cursor page filtered by `siteId`. Job options remain an eager
complete-tenant option collection. Labels are a scoped option index, and the
Settings Labels surface uses a separate Electric-primary helper for active
organization labels. Job details, collaborators, and site comments are lazy
per-record collections that request snapshots from their mounted subscribers
rather than from Start loaders.
Global Activity has Electric-primary `activity-events` and
`product-activity-actors` collection contracts. `activity-events` uses the
named sync Worker shape and the shared collection health surface; its
completeness metadata is `sync-backed` over the
`activity-events.recent-retained` filtered query, not `complete-tenant`, because
the domain shape exposes only rows with `retained_until` after the domain
Worker's current time, while repository cleanup keeps only the latest 5,000
retained rows per organization. `product-activity-actors` is a complete-tenant
Electric collection containing product-safe display fields. The Activity route
joins the two collections locally and applies client-side event/entity/status
filters over synced rows without adding caller-supplied Electric predicates.
ElectricSQL integration starts at this same boundary. Raw
`@tanstack/electric-db-collection` and `@electric-sql/client` usage belongs only
in `apps/app/src/data-plane/electric-collection.ts`, which standardizes
collection ids, named sync shapes, `VITE_SYNC_ORIGIN` URL construction, schema
pass-through, snake-case/camel-case column mapping, row transformation hooks,
auth-aware fetch behavior, normalized sync errors, and the shared collection
health surface. Feature slices may opt into that factory while keeping their
current Query Collection contracts available as fallbacks; route views must not
construct Electric streams directly.
Electric opt-in slices compose both contracts through
`apps/app/src/data-plane/query-fallback-collection.ts`, which selects the active
collection while marking fallback activation on that same shared health object.
The initial factory supports eager full-shape sync only. Electric
`on-demand`/`progressive` subset loading remains a future extension because the
current sync Worker intentionally accepts named shape requests and protocol-safe
resume/live parameters, not caller-supplied subset predicates.
The existing jobs route collection still uses a fallback wrapper so current
route-visible first-paint data remains API-backed unless a caller explicitly
opts into Electric. The Electric-native Jobs workspace contract is separate and
explicit in `apps/app/src/features/jobs/jobs-data-plane.ts` through
`createJobsWorkspaceReadModelContracts(...)`. Its list graph derives from the
domain-approved `jobs`, `work-item-labels`, `labels`, `sites`, and `contacts`
shapes. Its detail graph adds `work-item-collaborators`,
`work-item-activity`, `work-item-visits`, `work-item-comments`, and `comments`.
Each shape is a complete-tenant, organization/viewer/role-scoped Electric
collection with shared health state; local live queries can join job rows,
label assignments, label definitions, site summaries, contact summaries,
collaborators, activity, visits, comment edges, and comment bodies without
constructing raw Electric streams in feature UI. Member/actor display names and
site-level active job rollups remain domain-owned projection follow-ups rather
than browser business-rule recomputation.
The `/jobs-workspace` live list consumes that graph through
`features/jobs-workspace/jobs-workspace-live-list.ts`, which creates the
Electric collections through the data-plane boundary, subscribes with the
shared live-query wrapper, joins labels/sites/contacts locally, and exposes
route-backed search, filters, sort, recent-search, and saved-view-ready hooks.
The list read model aggregates health across all five required list shapes and
derives visible rows only after jobs, label assignments, labels, sites, and
contacts are all healthy and live-query ready. When the graph is disabled,
unavailable, or not fully ready, the workspace reports that shared graph health
directly and does not activate the legacy Jobs Query Collection fallback.
The jobs primary route collection has a conservative Electric read canary behind
that same fallback wrapper. It is disabled by default and must be opted in
through the jobs data-plane sync options, so a configured `VITE_SYNC_ORIGIN`
alone does not migrate the visible jobs list. When enabled, it requests the
public sync Worker `jobs` shape and maps `work_items` rows into the narrow jobs
list item shape with joined fields such as labels left empty; Query Collection
fallback remains the default and fallback path for route-visible first-paint
data. Settings Labels is intentionally different: it requests the named
`labels` Electric shape directly through
`getOrCreateSettingsLabelsCollectionState(...)` and exposes disabled or
unavailable collection health to the route instead of silently activating an API
fallback. The route's label search derives from the hydrated local collection
items rather than API requests per keystroke. The Electric-native Sites
read-model contracts likewise do not introduce a legacy Query Collection
fallback. The `/sites-workspace` route uses a browser-safe feature data-plane
module under `features/sites-workspace` so the client route does not import the
legacy Sites module's server-backed query collection helpers. That workspace
read model requests the named `sites`, `site-labels`,
`site-active-job-summaries`, `jobs`, and `labels` shapes, joins shared label
definitions through site-label assignments, derives visible rows from local
search/filter/sort state, and selects related jobs from the synced jobs row set.
The synced `sites` row transformer carries the shared `SiteOption.updatedAt`
boundary field so the workspace's recently-updated sort is backed by production
site data rather than a view-local fallback.
The current visible-row helper derives over hydrated TanStack DB
collection snapshots inside the feature data-plane boundary rather than adding a
separate TanStack DB derived collection: each input collection is already a live
subscription, the route needs route-backed local query/filter/sort state, and a
second collection layer would not change sync coverage or health semantics in
this slice. Callers consume shared health from the Electric collection factory
and show explicit unavailable/degraded states when sync is disabled or
unavailable.

## Collection Health

Data-plane collection health is a durable app boundary owned by
`apps/app/src/data-plane/collection-health.ts`. Electric-backed collection
creation returns a per-collection health object alongside the TanStack DB
collection. The health snapshot records the collection root, stable collection
id, source, named subscription, status, start timestamp, last status-change
timestamp, initial readiness latency, sanitized last error, recovery-attempt
count, and fallback reason when a Query Collection path is active.

The shared status vocabulary is `disabled`, `connecting`, `ready`,
`unavailable`, and `fallback-active`. Electric disabled states cover SSR,
missing `VITE_SYNC_ORIGIN`, and invalid sync origins. Browser Electric
collections start as `connecting`; their initial ready latency is recorded when
TanStack DB first marks the collection ready after Electric reaches its
up-to-date point. `ShapeStreamOptions.onError` is normalized into the Ceird
health error shape before any caller retry handling runs. That error shape keeps
only kind, safe message, retryability, and optional HTTP status, so auth
cookies, bearer tokens, source secrets, sync URLs, and raw Electric internals do
not cross the data-plane status boundary.

Query Collection fallback uses the same health object by marking
`fallback-active` through the shared helper instead of carrying a separate
feature-local flag. Product routes may consume the resulting status through
feature data-plane modules, but should not inspect raw Electric errors or
construct a separate fallback-health model. The fallback wrapper preserves
TanStack DB subscription options and replays the latest hydration snapshot
request when the active backend changes, so loader-seeded Query Collection data
is still loaded after an Electric failure.

Completeness is a discriminated contract, not a boolean. `complete-tenant`
means the data covers the active organization scope. `paged-query` and
`filtered-query` describe bounded query results that must not feed selectors or
components that require tenant-wide data. `entity-detail` covers one parent
entity such as a job detail or a site's comments. `sync-backed` records the
subscription source and the coverage it provides, so future Electric-backed
collections can be explicit about whether they cover tenant, page, filter, or
entity scopes. The jobs route primary list now uses a `paged-query` contract
whose query key includes cursor, limit, filters, text search, and the stable
updated-desc sort order. The sites route first paint uses a `paged-query`
contract for its first cursor page. The home route uses a bounded aggregate
summary response instead of seeding tenant-wide jobs or sites for first paint.
Current unmigrated route lists keep their eager `complete-tenant` behavior until
follow-up paging issues replace those first-paint reads.

## Start Bootstrap

Route loaders create seed envelopes with `createDataPlaneSeed(...)` helpers and
apply them to the router `QueryClient` with `applyDataPlaneSeed(...)` when the
client is available. Route content also applies the envelopes after hydration
through `useApplyDataPlaneSeeds(...)`. Seed application preserves newer cache
data by comparing the loader request start time with the Query cache update
time.

Do not call collection `preload()` in SSR loaders. Start loaders should fetch
server DTOs, seed query cache, and let browser collection subscriptions own
client sync. The Electric factory is SSR-safe by returning a disabled result
during server render; browser-only ShapeStream state is created only when the
runtime is hydrated and `VITE_SYNC_ORIGIN` is configured.

## Session Scope

Collection keys include organization id, viewer user id, and role because API
responses can vary by authorization scope. Product roots must not be nested
under each other accidentally; for example `site-comments` and
`site-related-jobs` are separate roots from `sites` so TanStack Query prefix
matching never treats detail-side collections as site rows.

The organization route owns the session lifecycle. Feature providers such as
`JobsStateProvider` and `SitesStateProvider` are compatibility facades over the
session registry and should not instantiate raw TanStack DB collections
directly.

## Sites Performance Harness

The Electric-native Sites workspace has a repeatable larger-organization
evidence path under `apps/app`. The local synthetic harness is
`apps/app/src/features/sites-workspace/sites-workspace-performance-harness.ts`
and runs with:

```bash
pnpm --filter app perf:sites-workspace
```

It creates the TSK-200 fixture shape in memory: 1,000 sites, 5,000 related job
rows, 100 labels, roughly three label assignments per site, active-job summary
rows for every site, a realistic active/completed/canceled job status mix, and
queries that exercise label joins, related-job detail selection, active-job
summary updates, local search, filters, and sorts through
`deriveSitesWorkspaceVisibleRows(...)`. The JSON report records p95/mean/min/max
interaction timings, recomputation input/output row counts, process heap
movement, CPU usage when available, and recommendations for projection or query
changes before cutover.

The browser/stage harness is `apps/app/e2e/sites-workspace-performance.test.ts`
and is opt-in so ordinary package-local Playwright runs do not require a stage.
It only consumes an already-approved, already-seeded stage/account; it never
creates an organization or seed data for performance evidence. The stage
credentials and seeded-row expectation are mandatory:

```bash
SITES_WORKSPACE_PERF_STAGE=1 \
PLAYWRIGHT_BASE_URL=<alchemy-app-url> \
PLAYWRIGHT_API_URL=<alchemy-api-url> \
SITES_WORKSPACE_PERF_EMAIL=<seeded-user-email> \
SITES_WORKSPACE_PERF_PASSWORD=<seeded-user-password> \
SITES_WORKSPACE_PERF_EXPECTED_MIN_ROWS=1000 \
SITES_WORKSPACE_PERF_SEARCH_QUERY=<query-with-results> \
DATA_PLANE_PERF_OUTPUT=artifacts/sites-workspace-performance.ndjson \
pnpm --filter app e2e -- sites-workspace-performance.test.ts
```

`SITES_WORKSPACE_PERF_EXPECTED_MIN_ROWS` must be at least `1000`, matching the
TSK-200 Sites fixture. `SITES_WORKSPACE_PERF_SEARCH_QUERY` should be a stable
term known to return rows in that seeded organization; when omitted the harness
uses `site`. The test records time from route navigation to the `Live Sites read
model ready` state, visible row count, browser heap observation when Chrome
exposes it, and completed local search/filter/sort/detail timings. Each timed
interaction waits for post-action UI state: search results visible, active-job
filtered rows with related jobs present, the updated-sort control selected, the
selected detail panel visible, and related jobs rendered. It fails if required
seed credentials are absent, the workspace is unavailable, the seeded row count
is below the TSK-200 threshold, or initial ready exceeds the TSK-200 5s blocker
threshold. Creating or mutating an Alchemy stage and seeding the organization
remain explicit operator actions outside the harness.

## Commands

Browser writes are named server-confirmed data-plane commands. Every command
declares affected collections and an optimistic policy. The current policy is
`"none"` for jobs/sites because the server owns generated IDs, authorization,
Google Places enrichment, linked contacts/sites, labels, and canonical fields.

Successful commands reconcile canonical server output through feature-owned
data-plane helpers. Failures are recorded in the session mutation journal and
leave collection state unchanged. Optimistic commands can be added later by
widening the command implementation, not by bypassing the data plane.

Electric-backed mutation handlers are enabled for the first narrow write slice
that needs replication confirmation: organization label definition create,
update, and archive. Labels were chosen because their Electric shape is a direct
`labels` table DTO and the app already has an opt-in label collection contract.
Label handlers call the typed Effect HTTP label API, receive `{ label,
mutation: { txid } }`, and return `{ txid, timeout }` to
`@tanstack/electric-db-collection` so the client waits for the corresponding
Electric signal. The public label helpers still map successful write responses
back to `Label`, so existing command reconciliation and mutation journal
semantics stay unchanged.

The Electric-native Sites workspace uses a data-plane command runner instead of
raw collection mutation handlers because the domain owns generated IDs,
authorization, Google Places enrichment, and canonical label assignment
invariants. Site create, update, assign-label, and remove-label commands call
the typed Sites API, receive `{ site, mutation: { txid } }`, keep the command
pending in the mutation journal, and resolve only after the relevant Electric
collection observes the committed row: `sites` for create/update and
`site-label-assignments` for assignment changes. The Sites shapes expose the
product rows, not Electric txid stream metadata, so the route presents this as
row-state observation while preserving the server txid for diagnostics. If the
row state was already reflected, for example an idempotent assign/remove race,
the runner records that as already reflected instead of claiming Electric
observed the returned txid. Confirmation timeout or failure records the command
as failed and leaves synced collection data as the source of truth. Read-only
Electric adoption, including the jobs canary, does not require mutation
confirmation and remains opt-in/test-gated.

## Enforcement

`apps/app/src/test/data-plane-boundaries.test.ts` prevents product views from
importing `queryCollectionOptions`, `createCollection`,
`@tanstack/electric-db-collection`, or `@electric-sql/client` directly, keeps
jobs and sites facades out of raw collection factories, verifies product roots
stay distinct, and checks command affected-collection declarations against the
known data-plane roots. When adding new API-backed product state, add a feature
data-plane module and keep the same contract and command boundaries.
