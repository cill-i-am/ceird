# TanStack DB Data Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an organization-scoped TanStack DB data plane that decouples jobs/sites entity state from route/view-owned DTO stores while preserving current behavior and real browser performance.

**Architecture:** Add a package-local `apps/app/src/data-plane` layer for scope, query keys, seed envelopes, collection factories, sessions, command actions, and view subscriptions. Migrate jobs and sites providers into compatibility facades over the data plane, then add enforcement tests and browser performance coverage.

**Tech Stack:** TanStack Start, TanStack Router, TanStack Query, TanStack DB Query Collection, React 19, Effect Schema, Vitest, Playwright.

---

## File Structure

- Create `apps/app/src/data-plane/query-scope.ts` for reusable organization/user/role-scoped query key helpers.
- Create `apps/app/src/data-plane/bootstrap.ts` for typed seed envelopes and route-loader seeding helpers.
- Create `apps/app/src/data-plane/collection-contract.ts` for collection contract types and collection factory helpers.
- Create `apps/app/src/data-plane/session.tsx` for the active data session provider and hook.
- Create `apps/app/src/data-plane/collection-write.ts` to move shared write/version/reconcile helpers out of `src/lib`.
- Create `apps/app/src/data-plane/hydrated-collection.ts` to move the SSR-safe collection subscription hook out of `src/lib`.
- Create `apps/app/src/data-plane/command-action.ts` for server-confirmed command mutation plumbing.
- Create `apps/app/src/features/jobs/jobs-data-plane.ts` for jobs collection contracts, seeds, commands, and live view hooks.
- Create `apps/app/src/features/sites/sites-data-plane.ts` for sites/comment collection contracts, seeds, commands, and live view hooks.
- Modify `apps/app/src/features/jobs/jobs-state.ts` and `apps/app/src/features/sites/sites-state.ts` into compatibility facades that delegate entity state to the data plane.
- Modify `apps/app/src/features/jobs/jobs-route-loader.ts` and `apps/app/src/features/sites/sites-route-loader.ts` to produce seed envelopes while keeping current DTO returns.
- Modify `apps/app/src/features/jobs/jobs-route-content.tsx`, `apps/app/src/features/sites/sites-route-content.tsx`, and `apps/app/src/features/workspace-sheets/workspace-sheet-stack.tsx` to install/reuse data sessions.
- Add tests under `apps/app/src/data-plane/*.test.ts(x)`, plus focused jobs/sites provider tests and architecture boundary tests.
- Update `docs/architecture/frontend.md` and add `docs/architecture/tanstack-db-data-plane.md`.

## Task 1: Data-Plane Foundation

**Files:**

- Create: `apps/app/src/data-plane/query-scope.ts`
- Create: `apps/app/src/data-plane/bootstrap.ts`
- Create: `apps/app/src/data-plane/collection-contract.ts`
- Create: `apps/app/src/data-plane/collection-write.ts`
- Create: `apps/app/src/data-plane/hydrated-collection.ts`
- Test: `apps/app/src/data-plane/query-scope.test.ts`
- Test: `apps/app/src/data-plane/bootstrap.test.ts`
- Test: `apps/app/src/data-plane/collection-contract.test.ts`
- Test: `apps/app/src/data-plane/collection-write.test.ts`

- [ ] **Step 1: Write failing data-plane unit tests**

  Add tests proving:
  - scoped keys include collection name, organization id, user id, and role;
  - different collections do not share unsafe prefixes;
  - seed envelopes preserve request start timestamps and do not overwrite newer cache data;
  - collection contracts require `id`, `queryKey`, `schema`, `getKey`, `syncMode`, `completeness`, and `queryFn`;
  - full replacements use `writeBatch`;
  - race reconciliation does not promote `$synced: false` rows.

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane
  ```

  Expected: FAIL because files do not exist yet.

- [ ] **Step 2: Implement the generic data-plane helpers**

  Move the behavior from `src/lib/tanstack-db-query.ts`,
  `src/lib/tanstack-db-collection.ts`, and `src/lib/tanstack-db-react.ts` into
  the new `src/data-plane` modules. Keep old `src/lib/*` exports as thin
  re-export shims for compatibility during migration.

- [ ] **Step 3: Verify foundation tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane src/lib/tanstack-db-query.test.ts src/lib/tanstack-db-collection.test.ts
  ```

  Expected: PASS.

## Task 2: Data Session Provider

**Files:**

- Create: `apps/app/src/data-plane/session.tsx`
- Test: `apps/app/src/data-plane/session.test.tsx`
- Modify: `apps/app/src/router-context.ts`
- Modify: `apps/app/src/routes/_app._org.tsx` or matching organization layout route if session installation belongs there.

- [ ] **Step 1: Write failing session tests**

  Cover:
  - creating one session for an organization/user/role scope;
  - reusing the route `QueryClient`;
  - replacing the session when organization id changes;
  - rejecting data-plane hooks outside a provider;
  - applying multiple seed envelopes without overwriting newer cache entries.

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane/session.test.tsx
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement `DataPlaneProvider` and hooks**

  Expose:
  - `DataPlaneProvider`
  - `useDataPlaneSession`
  - `useOptionalDataPlaneSession`
  - `useApplyDataPlaneSeeds`

  The session owns scope, `QueryClient`, and a stable registry for lazily created
  collections. It must not create fallback Query clients when route context has
  one.

- [ ] **Step 3: Install the provider at the organization route boundary**

  Install the provider where active organization, current user, role, and router
  Query client are all available. Keep existing jobs/sites route props working.

- [ ] **Step 4: Verify session tests and organization route tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane/session.test.tsx src/routes/-_app._org.test.tsx
  ```

  Expected: PASS.

## Task 3: Jobs Data Plane

**Files:**

- Create: `apps/app/src/features/jobs/jobs-data-plane.ts`
- Test: `apps/app/src/features/jobs/jobs-data-plane.test.ts`
- Modify: `apps/app/src/features/jobs/jobs-query-keys.ts`
- Modify: `apps/app/src/features/jobs/jobs-route-loader.ts`
- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-route-content.tsx`
- Modify: `apps/app/src/features/workspace-sheets/workspace-sheet-stack.tsx`

- [ ] **Step 1: Write failing jobs data-plane tests**

  Cover:
  - jobs contract uses the scoped `jobs` key and eager complete-list semantics;
  - route loader creates a jobs seed envelope with `requestStartedAt`;
  - `useJobsListState` reads from the jobs collection view, not route DTO arrays;
  - `refreshJobsList`, `createJob`, and `upsertJobsListItem` reconcile through
    the jobs collection;
  - job order remains stable with loader order and server-confirmed creates.

  Run:

  ```bash
  pnpm --filter app test -- src/features/jobs/jobs-data-plane.test.ts src/features/jobs/jobs-state.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement jobs collection contract and seed helper**

  Define:
  - `jobsCollectionId(scope)`
  - `jobsCollectionKey(scope)`
  - `createJobsListSeed(scope, list, requestStartedAt)`
  - `getOrCreateJobsCollection(session, seed)`
  - `useJobsListView()`

  The initial implementation should keep eager full-list sync and current
  `listAllCurrentServerJobs({})` fetching.

- [ ] **Step 3: Convert `JobsStateProvider` into a compatibility facade**

  Keep current exported hooks and context value shape, but delegate list reads,
  refreshes, replaces, and upserts to `jobs-data-plane.ts`.

- [ ] **Step 4: Preserve route and workspace behavior**

  Ensure jobs route loaders still return `{ list, options, viewer }`, but route
  content applies the seed envelope to the active data session. Workspace sheets
  must reuse the same session if the route already has one.

- [ ] **Step 5: Verify jobs tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/features/jobs src/features/workspace-sheets/workspace-sheet-stack.test.tsx
  ```

  Expected: PASS.

## Task 4: Sites and Comments Data Plane

**Files:**

- Create: `apps/app/src/features/sites/sites-data-plane.ts`
- Test: `apps/app/src/features/sites/sites-data-plane.test.ts`
- Modify: `apps/app/src/features/sites/sites-query-keys.ts`
- Modify: `apps/app/src/features/sites/sites-route-loader.ts`
- Modify: `apps/app/src/features/sites/sites-state.ts`
- Modify: `apps/app/src/features/sites/sites-route-content.tsx`
- Modify: `apps/app/src/features/workspace-sheets/workspace-sheet-stack.tsx`

- [ ] **Step 1: Write failing sites/comments tests**

  Cover:
  - sites contract uses the scoped `sites` key and eager complete-list semantics;
  - comments contract uses a separate `site-comments` key root plus site id;
  - route loader creates a sites seed envelope with `requestStartedAt`;
  - `useSitesOptions` reads from the sites collection view;
  - create/update/label mutations reconcile site detail into the collection;
  - comments are lazily created per site and can be read through a public hook.

  Run:

  ```bash
  pnpm --filter app test -- src/features/sites/sites-data-plane.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement sites and comments contracts**

  Define:
  - `sitesCollectionId(scope)`
  - `sitesCollectionKey(scope)`
  - `siteCommentsCollectionId(scope, siteId)`
  - `siteCommentsCollectionKey(scope, siteId)`
  - `createSitesSeed(scope, options, requestStartedAt)`
  - `getOrCreateSitesCollection(session, seed)`
  - `getOrCreateSiteCommentsCollection(session, siteId, initialComments)`
  - `useSitesOptionsView()`
  - `useSiteComments(siteId)`

- [ ] **Step 3: Convert `SitesStateProvider` into a compatibility facade**

  Keep current exported hooks and mutation APIs, but delegate entity reads and
  writes to `sites-data-plane.ts`.

- [ ] **Step 4: Finish comments as first-class data-plane state**

  Expose a reader hook for comments. If no existing UI consumes it yet, cover the
  hook with tests and document that visible UI integration remains feature work.

- [ ] **Step 5: Verify sites tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/features/sites src/features/workspace-sheets/workspace-sheet-stack.test.tsx
  ```

  Expected: PASS.

## Task 5: Command Actions and Mutation Journal

**Files:**

- Create: `apps/app/src/data-plane/command-action.ts`
- Create: `apps/app/src/data-plane/mutation-journal.ts`
- Test: `apps/app/src/data-plane/command-action.test.ts`
- Test: `apps/app/src/data-plane/mutation-journal.test.ts`
- Modify: `apps/app/src/features/jobs/jobs-data-plane.ts`
- Modify: `apps/app/src/features/sites/sites-data-plane.ts`

- [ ] **Step 1: Write failing command action tests**

  Cover:
  - command actions declare `name`, `affectedCollections`, `optimistic`, and
    `execute`;
  - server-confirmed commands record pending/success/failure journal entries;
  - command failures preserve existing collection state and surface typed errors;
  - successful commands run reconciliation exactly once.

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane/command-action.test.ts src/data-plane/mutation-journal.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement command action plumbing**

  Add server-confirmed command helpers now. Leave a typed `optimistic:
"none" | "reversible" | "temporary-row" | "multi-collection"` field so future
  optimistic actions can be added without changing the public mutation API.

- [ ] **Step 3: Route jobs/sites mutations through commands**

  Keep the current server-confirmed behavior, but express create job, refresh
  jobs, create site, update site, assign/remove label, create-and-assign label,
  add comment, and refresh comments as command actions.

- [ ] **Step 4: Verify command and feature tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/data-plane src/features/jobs src/features/sites
  ```

  Expected: PASS.

## Task 6: Architecture Enforcement

**Files:**

- Create: `apps/app/src/test/data-plane-boundaries.test.ts`
- Modify: `docs/architecture/frontend.md`
- Create: `docs/architecture/tanstack-db-data-plane.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write failing architecture tests**

  Enforce:
  - no direct `queryCollectionOptions` imports outside `src/data-plane` and
    approved feature data-plane modules;
  - no direct `createCollection` imports in jobs/sites state facade files;
  - every app product Query Collection key goes through data-plane scope helpers;
  - no product data collection root accidentally prefixes another root.

  Run:

  ```bash
  pnpm --filter app test -- src/test/data-plane-boundaries.test.ts
  ```

  Expected: FAIL until old imports are removed.

- [ ] **Step 2: Fix imports and document the architecture**

  Remove old direct collection creation from jobs/sites state files. Update
  frontend architecture and add a focused data-plane architecture guide.

- [ ] **Step 3: Verify architecture tests pass**

  Run:

  ```bash
  pnpm --filter app test -- src/test/data-plane-boundaries.test.ts
  ```

  Expected: PASS.

## Task 7: Browser E2E and Performance Gate

**Files:**

- Create: `apps/app/e2e/data-plane-performance.test.ts`
- Create: `apps/app/e2e/helpers/performance.ts`
- Modify: `apps/app/e2e/jobs.test.ts` if shared flows need instrumentation.
- Modify: `docs/development.md` or `docs/architecture/tanstack-db-data-plane.md` with the browser verification procedure.

- [ ] **Step 1: Write browser performance helper**

  Capture:
  - route navigation duration;
  - time until jobs/sites list content is visible;
  - time to open a workspace sheet;
  - network request count for jobs/sites route data.

- [ ] **Step 2: Add real browser flow coverage**

  Cover jobs route load, sites route load, jobs workspace sheet open, sites
  workspace sheet open, and create form open. Keep assertions behavior-focused.

- [ ] **Step 3: Run package-local Playwright if local database env exists**

  Run:

  ```bash
  PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e -- data-plane-performance.test.ts jobs.test.ts
  ```

  Expected: PASS when `PLAYWRIGHT_DATABASE_URL` or the package-local migration
  requirements are available. If local DB is unavailable, record the blocker and
  run against an explicitly confirmed Alchemy stage instead.

- [ ] **Step 4: Compare pre/post performance on the same target**

  Use the current branch before the refactor and final branch after the refactor
  against the same browser target. The refactor passes if there is no meaningful
  regression in measured route/list/sheet timings and no added route-load
  waterfall.

## Task 8: Full Verification and Final Review

**Files:**

- All changed source, tests, and docs.

- [ ] **Step 1: Run focused app checks**

  ```bash
  pnpm --filter app check-types
  pnpm --filter app test
  ```

  Expected: PASS.

- [ ] **Step 2: Run repository checks**

  ```bash
  pnpm check-types
  pnpm test
  pnpm lint
  pnpm format
  ```

  Expected: PASS.

- [ ] **Step 3: Run real browser E2E/performance**

  Run the confirmed browser command from Task 7. Expected: PASS with same or
  better measured performance.

- [ ] **Step 4: Final review**

  Use a high-reasoning code review pass focused on Start boundaries, DB
  contracts, hydration, mutation consistency, and test coverage.
