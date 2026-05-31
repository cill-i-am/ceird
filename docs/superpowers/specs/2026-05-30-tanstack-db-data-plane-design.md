# TanStack DB Data Plane Design

## Goal

Move Ceird from route/view-owned product state to a scoped TanStack DB data
plane. TanStack Start route loaders remain the SSR and navigation preload
boundary, but entity state belongs to an organization-scoped client data session
with normalized collections, live views, command mutations, architecture
enforcement, and real browser performance gates.

## Success Criteria

- Jobs and sites route components no longer own product entity collections
  directly through route-local state stores.
- Product data is seeded through a typed bootstrap envelope that can hydrate one
  or more collections for the active organization/user/role scope.
- Jobs, sites, labels/options, and site comments have explicit collection
  contracts: scope, query key, sync mode, schema, completeness policy, and
  mutation/write policy.
- Components read product lists and lookups through data-plane view hooks rather
  than route DTO arrays.
- Mutations are named command actions with declared affected collections,
  server-confirmed reconciliation, and an explicit place to add optimistic
  behavior later.
- Current jobs/sites/workspace behavior remains functionally equivalent.
- Narrow unit/component tests, full workspace tests, type checks, lint, format,
  and real browser E2E pass.
- Real browser E2E performance for the covered jobs/sites flows is the same as
  or better than the current implementation on the same stage/server.

## Architecture

The app gets a new `src/data-plane` package-local module. It owns generic
collection contracts, scope keys, seed envelopes, collection factories, data
session lifecycle, live-view helpers, command action plumbing, and architecture
tests. Feature folders keep feature-specific schemas, server calls, and UI, but
they no longer build Query Collections by hand.

The active organization route context creates or exposes the router
`QueryClient`. Jobs and sites route loaders return their existing DTOs for
first-paint compatibility, but also create data-plane seed envelopes. Providers
consume those envelopes to seed collections under the current organization query
scope. The existing `JobsStateProvider` and `SitesStateProvider` remain as
compatibility facades during the migration, but their entity reads and writes
delegate to the data plane.

Collections start in eager mode for current full-list jobs/sites behavior.
Contracts make this explicit and keep `syncMode: "on-demand"` ready for future
server-backed filtering and ElectricSQL. Site comments become a first-class
lazy, per-site collection instead of dormant state hidden inside `sites-state.ts`.

Mutations are command actions. The first migration keeps server-confirmed
behavior for creates, updates, label assignment, and comments because the server
owns IDs, authorization, Google Places enrichment, linked records, and canonical
fields. Each command declares the collections it affects and reconciles returned
canonical rows through shared write helpers.

## Real Browser Performance Gate

The performance gate runs the same Playwright jobs/sites flows before and after
the refactor against the same target. It captures route navigation timing,
hydration-to-visible timing for jobs/sites lists, key user interaction timing
for opening workspace sheets and create forms, and network request counts for
jobs/sites route loads. The refactor passes only if timings are not worse beyond
normal run variance and no extra route-load waterfall appears.

Provider-mutating Alchemy commands require explicit target stage confirmation.
The package-local Playwright server path can be used when a local test database
is available; otherwise the final E2E run must use explicit Alchemy app/API
URLs and database URL from the selected stage state.

## Non-Goals

- Do not introduce ElectricSQL in this change.
- Do not redesign visible UI or hotkeys unless the data-plane migration requires
  a narrow compatibility change.
- Do not change API/domain persistence schemas unless required for preserving
  current behavior.
- Do not make speculative optimistic writes for server-enriched mutations.
