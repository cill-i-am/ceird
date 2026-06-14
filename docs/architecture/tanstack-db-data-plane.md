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

Current collection roots are `jobs`, `job-options`, `job-details`,
`job-collaborators`, `sites`, `site-comments`, `site-related-jobs`, and
`labels`. The jobs primary route collection and Sites route collection are
eager bounded Query Collections for their first cursor pages. Site-related jobs
are the first cursor page filtered by `siteId`. Job options remain an eager
complete-tenant option collection. Labels are a scoped option index. Job
details, collaborators, and site comments are lazy per-record collections that
request snapshots from their mounted subscribers rather than from Start loaders.
ElectricSQL integration starts at this same boundary. Raw
`@tanstack/electric-db-collection` and `@electric-sql/client` usage belongs only
in `apps/app/src/data-plane/electric-collection.ts`, which standardizes
collection ids, named sync shapes, `VITE_SYNC_ORIGIN` URL construction, schema
pass-through, snake-case/camel-case column mapping, row transformation hooks,
auth-aware fetch behavior, and normalized sync errors. Feature slices may opt
into that factory while keeping their current Query Collection contracts
available as fallbacks; route views must not construct Electric streams
directly.
The initial factory supports eager full-shape sync only. Electric
`on-demand`/`progressive` subset loading remains a future extension because the
current sync Worker intentionally accepts named shape requests and protocol-safe
resume/live parameters, not caller-supplied subset predicates.

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

## Commands

Browser writes are named server-confirmed data-plane commands. Every command
declares affected collections and an optimistic policy. The current policy is
`"none"` for jobs/sites because the server owns generated IDs, authorization,
Google Places enrichment, linked contacts/sites, labels, and canonical fields.

Successful commands reconcile canonical server output through feature-owned
data-plane helpers. Failures are recorded in the session mutation journal and
leave collection state unchanged. Optimistic commands can be added later by
widening the command implementation, not by bypassing the data plane.

## Enforcement

`apps/app/src/test/data-plane-boundaries.test.ts` prevents product views from
importing `queryCollectionOptions`, `createCollection`,
`@tanstack/electric-db-collection`, or `@electric-sql/client` directly, keeps
jobs and sites facades out of raw collection factories, verifies product roots
stay distinct, and checks command affected-collection declarations against the
known data-plane roots. When adding new API-backed product state, add a feature
data-plane module and keep the same contract and command boundaries.
