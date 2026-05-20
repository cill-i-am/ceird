# TanStack DB Full Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Ceird's app feature query and mutation flows to a best-practice TanStack Start plus TanStack DB model while preserving behavior.

**Architecture:** TanStack Start route loaders remain the SSR and intent-preload boundary. TanStack Query is introduced only as the remote-sync layer underneath TanStack DB Query Collection; React feature components continue to read from TanStack DB with `useLiveQuery`. The typed Effect HTTP client remains the transport and runtime-decoding boundary.

**Tech Stack:** TanStack Start, TanStack Router SSR Query integration, TanStack Query, TanStack DB Query Collection, TanStack DB optimistic actions, Effect HTTP API client, Vitest.

---

### Task 1: Router SSR Query Integration

**Files:**

- Modify: `apps/app/package.json`
- Modify: `apps/app/src/router.tsx`
- Modify: `apps/app/src/routes/*.tsx` route loaders for jobs/sites/settings as needed
- Test: `apps/app/src/vite-config.test.ts`

- [ ] Add `@tanstack/react-query`, `@tanstack/query-core`, and `@tanstack/query-db-collection` as app dependencies.
- [ ] Create one fresh `QueryClient` inside `getRouter()`.
- [ ] Pass the client through router context as `{ queryClient }`.
- [ ] Call `setupRouterSsrQueryIntegration({ router, queryClient })`.
- [ ] Preserve `defaultPreload: "intent"` and `defaultPreloadStaleTime: 0`.
- [ ] Update route loader types only where needed so server-loaded DTOs can also seed query data.
- [ ] Run `pnpm --filter app check-types`.

### Task 2: Shared Query Collection Helpers

**Files:**

- Create: `apps/app/src/lib/tanstack-db-query.ts`
- Create: `apps/app/src/lib/tanstack-db-query.test.ts`

- [ ] Write a failing test that proves `seedQueryCollectionData` writes loader data into a QueryClient only when the query has no cached data.
- [ ] Implement shared query-key and seed helpers that keep route-loader first paint and DB collection hydration aligned.
- [ ] Add a helper for converting thrown persistence failures into `Exit` results used by current UI hooks.
- [ ] Run the new helper test and `pnpm --filter app check-types`.

### Task 3: Organization Configuration Collections

**Files:**

- Modify: `apps/app/src/features/organizations/organization-configuration-state.tsx`
- Test: `apps/app/src/features/organizations/organization-service-areas-section.test.tsx`
- Test: `apps/app/src/features/organizations/organization-rate-card-section.test.tsx`

- [ ] Convert service areas and rate cards from `localOnlyCollectionOptions` to `queryCollectionOptions`.
- [ ] Use typed HTTP list functions as `queryFn` and schemas as collection schemas.
- [ ] Use collection `utils.refetch({ throwOnError: true })` for load actions.
- [ ] Move update persistence into `onUpdate` handlers.
- [ ] Use `createOptimisticAction` for create operations because IDs are server-generated.
- [ ] Preserve current async result state and UI behavior.
- [ ] Run the organization configuration focused tests.

### Task 4: Sites Collections

**Files:**

- Modify: `apps/app/src/features/sites/sites-state.ts`
- Modify: `apps/app/src/routes/_app._org.sites.tsx`
- Test: `apps/app/src/features/sites/sites-state.integration.test.tsx`
- Test: `apps/app/src/routes/-_app._org.sites.test.tsx`

- [ ] Convert the sites list collection to Query Collection.
- [ ] Seed the sites query from the Start loader result for SSR first paint.
- [ ] Convert site comments collections to Query Collection keyed by organization and site.
- [ ] Use `utils.refetch` for refresh actions.
- [ ] Move update-site persistence into a DB action or handler while preserving notices and per-row pending/error state.
- [ ] Use `createOptimisticAction` for create-site and add-comment flows because server creates canonical rows.
- [ ] Keep assign/remove label as intent-style actions because they are server-side domain commands.
- [ ] Run sites focused tests.

### Task 5: Jobs Collection And Commands

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-state.ts`
- Modify: `apps/app/src/routes/_app._org.jobs.tsx`
- Test: `apps/app/src/features/jobs/jobs-state.test.ts`
- Test: `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`
- Test: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
- Test: `apps/app/src/routes/-_app._org.jobs.test.tsx`
- Test: `apps/app/src/routes/-_app._org.jobs.$jobId.test.tsx`

- [ ] Convert jobs list to Query Collection and seed it from the Start loader result.
- [ ] Preserve list ordering with the existing route/list order reference.
- [ ] Use `utils.refetch` for list refresh.
- [ ] Use `createOptimisticAction` for create-job because the API creates canonical job rows and may create related site/contact rows.
- [ ] Keep detail operations as intent-style DB actions or existing typed HTTP calls followed by DB reconciliation where the optimistic projection would be lossy.
- [ ] Preserve current detail/list reconciliation behavior.
- [ ] Run jobs focused tests.

### Task 6: Documentation And Exhaustive Verification

**Files:**

- Modify: `docs/architecture/frontend.md`
- Modify: `implementation-notes.md`

- [ ] Document the chosen ownership model: Start loaders for SSR/first-paint, Query Collection for remote list sync, DB live queries for reads, DB handlers/actions for mutations, typed HTTP client for transport.
- [ ] Record tradeoffs around server-generated IDs and domain commands.
- [ ] Run `pnpm --filter app check-types`.
- [ ] Run focused test suites for jobs/sites/org configuration.
- [ ] Run `pnpm check-types`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format`.
- [ ] Run `pnpm test`.
