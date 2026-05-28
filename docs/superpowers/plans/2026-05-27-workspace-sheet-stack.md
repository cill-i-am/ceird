# Workspace Sheet Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Ceird's jobs and sites sheets from child routes to a typed `sheets` search-param stack that preserves workspace context and supports nested sheet flows.

**Architecture:** The `/_app/_org` route owns a validated `sheets` array in search state and renders a workspace sheet stack above whichever org page is active. Sheet components receive close and nesting callbacks instead of assuming route paths, while sheet adapters load the jobs/sites providers and detail payloads they need. Deep-linked sheet data uses shared skeleton drawer states while async loaders resolve.

**Tech Stack:** TanStack Start/Router search params and navigation, React 19, Effect-backed domain types at deeper API boundaries, local UUID decoding for route-search code-splitting, Vaul responsive drawers, existing `Skeleton` UI primitive, Vitest/Testing Library/Playwright.

---

## File Structure

- Create `apps/app/src/features/workspace-sheets/workspace-sheet-search.ts` for the discriminated `WorkspaceSheet` union, search decoding, active-sheet helpers, and pure stack reducers.
- Create `apps/app/src/features/workspace-sheets/workspace-sheet-search.test.ts` for valid/invalid stack decoding and reducer behavior.
- Create `apps/app/src/features/workspace-sheets/workspace-sheet-navigation.tsx` for the route-scoped navigation provider and hooks: open, push, replace top, pop, and close all.
- Create `apps/app/src/features/workspace-sheets/workspace-sheet-events.tsx` for ephemeral parent-child sheet events, starting with `site.created`.
- Create `apps/app/src/features/workspace-sheets/workspace-sheet-loading.tsx` for skeleton drawer loading and unavailable/permission states.
- Create `apps/app/src/features/workspace-sheets/workspace-sheet-stack.tsx` for rendering decoded stack entries and their jobs/sites data adapters.
- Modify `apps/app/src/routes/_app._org.tsx` to validate `sheets`, install the navigation/event providers, and render `WorkspaceSheetStack`.
- Modify jobs and sites list/detail/create components so all sheet opens use stack helpers and sheets close by popping search state.
- Delete the route-only sheet files: `apps/app/src/routes/_app._org.jobs.new.tsx`, `apps/app/src/routes/_app._org.jobs.$jobId.tsx`, `apps/app/src/routes/_app._org.sites.new.tsx`, and `apps/app/src/routes/_app._org.sites.$siteId.tsx`.
- Update hotkey scope derivation, route code-splitting tests, E2E page objects, and architecture docs.

## Tasks

### Task 1: Typed Sheet Search Model

**Files:**

- Create: `apps/app/src/features/workspace-sheets/workspace-sheet-search.ts`
- Test: `apps/app/src/features/workspace-sheets/workspace-sheet-search.test.ts`
- Modify: `apps/app/src/test/app-route-code-splitting.test.ts`

- [ ] **Step 1: Write failing search-model tests**

```ts
const siteId = "019e6b6f-03d3-73e3-9dc6-d303722eef9a";
const jobId = "11111111-1111-4111-8111-111111111111";

expect(
  decodeWorkspaceSheetSearch({
    sheets: [
      { kind: "site.detail", siteId },
      { kind: "job.create", siteId },
      { kind: "job.detail", jobId },
    ],
  })
).toStrictEqual({
  sheets: [
    { kind: "site.detail", siteId },
    { kind: "job.create", siteId },
    { kind: "job.detail", jobId },
  ],
});

expect(
  decodeWorkspaceSheetSearch({
    sheets: [
      { kind: "site.detail", siteId: "not-a-uuid" },
      { kind: "job.create", siteId },
      { kind: "unknown" },
    ],
  })
).toStrictEqual({
  sheets: [{ kind: "job.create", siteId }],
});

expect(
  pushWorkspaceSheetSearch(
    { view: "map", sheets: [{ kind: "site.detail", siteId }] },
    { kind: "job.create", siteId }
  )
).toStrictEqual({
  view: "map",
  sheets: [
    { kind: "site.detail", siteId },
    { kind: "job.create", siteId },
  ],
});
```

Run: `pnpm --filter app test -- workspace-sheet-search`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement the decoder and pure stack helpers**

```ts
export type WorkspaceSheet =
  | {
      readonly kind: "job.create";
      readonly siteId?: SiteIdType;
      readonly contactId?: ContactIdType;
    }
  | { readonly kind: "job.detail"; readonly jobId: WorkItemIdType }
  | { readonly kind: "site.create" }
  | { readonly kind: "site.detail"; readonly siteId: SiteIdType };

export interface WorkspaceSheetSearch {
  readonly sheets?: readonly WorkspaceSheet[] | undefined;
}

export function decodeWorkspaceSheetSearch(
  input: unknown
): WorkspaceSheetSearch {
  const rawSheets = readSearchValue(input, "sheets");
  const sheets = Array.isArray(rawSheets)
    ? rawSheets.flatMap((entry) => {
        const decoded = decodeWorkspaceSheet(entry);
        return decoded === undefined ? [] : [decoded];
      })
    : [];

  return sheets.length > 0 ? { sheets } : {};
}

export function pushWorkspaceSheetSearch<T extends WorkspaceSheetSearch>(
  search: T,
  sheet: WorkspaceSheet
) {
  return withWorkspaceSheetStack(search, [
    ...getWorkspaceSheetStack(search),
    sheet,
  ]);
}
```

Use a local UUID parser in this route-search module so the org route does not pull `effect`, `@ceird/jobs-core`, or `@ceird/sites-core` value imports into every org page. The parser returns branded ID types only after UUID validation.

- [ ] **Step 3: Protect the search decoder from heavy route imports**

Add `features/workspace-sheets/workspace-sheet-search.ts` to `ROUTE_SEARCH_FILES` in `apps/app/src/test/app-route-code-splitting.test.ts`. Keep the existing assertions that search decoders do not import `effect` or domain package values.

- [ ] **Step 4: Run the focused tests**

Run: `pnpm --filter app test -- workspace-sheet-search app-route-code-splitting`

Expected: PASS.

### Task 2: Navigation Provider, Events, And Org Route Ownership

**Files:**

- Create: `apps/app/src/features/workspace-sheets/workspace-sheet-navigation.tsx`
- Create: `apps/app/src/features/workspace-sheets/workspace-sheet-events.tsx`
- Modify: `apps/app/src/routes/_app._org.tsx`

- [ ] **Step 1: Add a provider with typed stack operations**

```tsx
export function WorkspaceSheetNavigationProvider({
  children,
  stack,
}: {
  readonly children: React.ReactNode;
  readonly stack: readonly WorkspaceSheet[];
}) {
  const navigate = useNavigate({ from: "/_app/_org" });

  const push = React.useCallback(
    (sheet: WorkspaceSheet) => {
      React.startTransition(() => {
        navigate({
          search: (current) => pushWorkspaceSheetSearch(current, sheet),
        });
      });
    },
    [navigate]
  );

  const value = React.useMemo(
    () => ({ closeAll, open, pop, push, replaceTop, stack }),
    [closeAll, open, pop, push, replaceTop, stack]
  );

  return (
    <WorkspaceSheetNavigationContext.Provider value={value}>
      {children}
    </WorkspaceSheetNavigationContext.Provider>
  );
}
```

Also export small hooks: `useWorkspaceSheetNavigation()`, `useOpenWorkspaceSheet()`, `usePushWorkspaceSheet()`, and `usePopWorkspaceSheet()`.

- [ ] **Step 2: Add the site-created event bridge**

```tsx
export function WorkspaceSheetEventsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const siteCreatedListenersRef = React.useRef(
    new Set<(site: SiteOption) => void>()
  );

  const value = React.useMemo(
    () => ({
      notifySiteCreated: (site: SiteOption) => {
        for (const listener of siteCreatedListenersRef.current) {
          listener(site);
        }
      },
      subscribeSiteCreated: (listener: (site: SiteOption) => void) => {
        siteCreatedListenersRef.current.add(listener);
        return () => siteCreatedListenersRef.current.delete(listener);
      },
    }),
    []
  );

  return (
    <WorkspaceSheetEventsContext.Provider value={value}>
      {children}
    </WorkspaceSheetEventsContext.Provider>
  );
}
```

- [ ] **Step 3: Install the model at `/_app/_org`**

Set `validateSearch: decodeWorkspaceSheetSearch` on `apps/app/src/routes/_app._org.tsx`. In the component, derive `const stack = Route.useSearch().sheets ?? []`, wrap `<Outlet />` in both workspace providers, and render `<WorkspaceSheetStack stack={stack} />` after the outlet.

- [ ] **Step 4: Run type checking for the org route change**

Run: `pnpm --filter app check-types`

Expected: PASS or a narrow type error in the new provider to fix before continuing.

### Task 3: Sheet Stack Renderer With Skeleton Loading States

**Files:**

- Create: `apps/app/src/features/workspace-sheets/workspace-sheet-loading.tsx`
- Create: `apps/app/src/features/workspace-sheets/workspace-sheet-stack.tsx`
- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-detail-route-loader.ts`
- Modify: `apps/app/src/features/sites/sites-detail-route-loader.ts`

- [ ] **Step 1: Create skeleton drawer building blocks**

```tsx
export function WorkspaceSheetSkeleton({ title }: { readonly title: string }) {
  return (
    <ResponsiveDrawer open modal={false}>
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-lg">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6">
          <Skeleton className="h-9 w-3/4 rounded-md" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}
```

Also add `WorkspaceSheetUnavailable` for not-found, permission, and loader-error states.

- [ ] **Step 2: Add provider loaders for sheet adapters**

In `WorkspaceSheetStack`, add `WorkspaceJobsSheetProvider` and `WorkspaceSitesSheetProvider` components that call `loadJobsRouteData` and `loadSitesRouteData` from `useEffect`, render `WorkspaceSheetSkeleton` while loading, and wrap children in `JobsStateProvider` or `SitesStateProvider` on success.

- [ ] **Step 3: Add detail loaders inside the relevant providers**

For `job.detail`, load `loadJobDetailRouteData(sheet.jobId, orgContext)`. For `site.detail`, load `loadSiteDetailRouteData(sheet.siteId, orgContext)`. Render skeletons while pending and unavailable drawers for `null` or thrown errors.

- [ ] **Step 4: Add jobs-option site upsert support**

Extend the jobs state context with `upsertJobOptionSite(site: SiteOption)` and export `useUpsertJobOptionSite()`. It should update `state.options.sites` with the created site so a parent job-create draft can select a site created by a child `site.create` sheet.

- [ ] **Step 5: Run focused state and type tests**

Run: `pnpm --filter app test -- jobs-state sites-detail-route-loader jobs-detail-route-loader`

Expected: PASS or no matching tests for route loaders.

### Task 4: Decouple Sheet Components From Route Paths

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`

- [ ] **Step 1: Replace route navigation props with callbacks**

Change create/detail sheet props to accept `onClose?: () => void`, and call that callback after the existing close animation instead of navigating to `/jobs` or `/sites`. Remove `useNavigate({ from: "/jobs/new" })`, `useNavigate({ from: "/jobs/$jobId" })`, `useNavigate({ from: "/sites/new" })`, and `useNavigate({ from: "/sites/$siteId" })`.

- [ ] **Step 2: Make job create push `site.create`**

When the site select chooses `Create a new site`, call `push({ kind: "site.create" })`. Register a `site.created` listener that upserts the new site option and sets `values.siteSelection` to the new site ID. Keep inline contact creation as-is.

```tsx
useWorkspaceSheetSiteCreated(
  React.useCallback(
    (site) => {
      upsertJobOptionSite(site);
      setValues((current) => ({
        ...current,
        siteSelection: site.id,
      }));
      setFieldErrors(clearInlineSiteFieldErrors);
    },
    [upsertJobOptionSite]
  )
);
```

- [ ] **Step 3: Make site create notify and pop**

On successful site creation, call `notifySiteCreated(createdSite)` before closing. The close callback pops only the active sheet, so a parent job-create sheet remains mounted.

- [ ] **Step 4: Make site detail related actions push sheets**

Replace the related-jobs `New job` link with a button that pushes `{ kind: "job.create", siteId }`. Related job rows should open `{ kind: "job.detail", jobId: job.id }` without navigating to `/jobs/$jobId`.

- [ ] **Step 5: Run app tests that exercise sheet components**

Run: `pnpm --filter app test -- jobs sites active-shortcut-scopes`

Expected: PASS after tests are updated in the next task.

### Task 5: Migrate Call Sites, Hotkeys, Routes, And Tests

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/features/sites/sites-page.tsx`
- Modify: `apps/app/src/features/auth/authenticated-shell-home.tsx`
- Modify: `apps/app/src/hotkeys/active-shortcut-scopes.ts`
- Modify: `apps/app/src/hotkeys/active-shortcut-scopes.test.ts`
- Modify: `apps/app/e2e/pages/jobs-page.ts`
- Modify: `apps/app/e2e/jobs.test.ts`
- Modify: `apps/app/src/router.tsx`
- Delete: `apps/app/src/routes/_app._org.jobs.new.tsx`
- Delete: `apps/app/src/routes/_app._org.jobs.$jobId.tsx`
- Delete: `apps/app/src/routes/_app._org.sites.new.tsx`
- Delete: `apps/app/src/routes/_app._org.sites.$siteId.tsx`

- [ ] **Step 1: Replace create/detail navigations**

Every former `/jobs/new`, `/jobs/$jobId`, `/sites/new`, and `/sites/$siteId` action should target a stable workspace route plus a typed sheet stack. Examples:

```tsx
navigate({
  search: (current) =>
    openWorkspaceSheetSearch(current, { kind: "job.create" }),
});

navigate({
  search: (current) =>
    openWorkspaceSheetSearch(current, { kind: "job.detail", jobId }),
});
```

Home dashboard links can use `/jobs` or `/sites` as the durable base route; in-route actions preserve the current route.

- [ ] **Step 2: Update hotkey scope derivation**

`getActiveShortcutScopes(pathname, search)` should decode the active sheet and merge sheet scopes with the base route scopes. A top `job.create` sheet should include `job-create`; a top `job.detail` sheet should include `job-detail`; top site sheets should include `sites`.

- [ ] **Step 3: Delete route-only sheet files and regenerate the route tree**

Remove the four route files and run a Vite/TanStack generation command through the app build or typecheck path. Confirm `apps/app/src/routeTree.gen.ts` no longer includes `/jobs/new`, `/jobs/$jobId`, `/sites/new`, or `/sites/$siteId`.

- [ ] **Step 4: Update Playwright expectations**

`JobsCreateSheet.expectOpen()` should assert the URL contains `/jobs` and `sheets`, not `/jobs/new`. The happy path should create a site through the stacked `New site` sheet and then assert the parent job draft is still visible with the created site selected.

- [ ] **Step 5: Run focused app tests**

Run: `pnpm --filter app test -- active-shortcut-scopes authenticated-shell-home jobs sites app-route-code-splitting`

Expected: PASS.

### Task 6: Documentation, Verification, And Review Loop

**Files:**

- Modify: `docs/architecture/frontend.md`
- Modify: `docs/architecture/jobs-v1-spec.md`
- Modify: any docs found by `rg "/jobs/new|/sites/new|/jobs/\\$jobId|/sites/\\$siteId" docs apps/app/src`

- [ ] **Step 1: Update architecture docs**

Document that org workspace routes own durable pages while `sheets` search state owns overlays. Include examples such as `/sites?sheets=[site.detail,job.create]` and note unsaved drafts are local unless future API-backed persistence is added.

- [ ] **Step 2: Run the verification ladder**

Run:

```bash
pnpm --filter app test
pnpm --filter app check-types
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

Use the narrowest failing command while fixing. Broaden again before review.

- [ ] **Step 3: Browser verification**

Use the Browser plugin against an appropriate local or deployed stage. Verify:

- From a site detail sheet, `New job` keeps the route on `/sites` and appends a `sheets` stack.
- The new job sheet preselects the site.
- Selecting `Create a new site` from new job opens a stacked new-site sheet.
- Creating/closing the child sheet returns to the parent job draft without losing its title/contact fields.
- Detail-sheet deep links show skeleton drawers while loading.

- [ ] **Step 4: Run requested reviews and fix findings**

Use `review-swarm`, `effect-review`, TanStack Router best-practice skills, Vercel composition patterns, and React best-practice checks. Fix actionable findings, then rerun the relevant verification commands.

- [ ] **Step 5: Commit, push, create PR, and watch CI**

Use conventional commits. Push `codex/workspace-sheet-stack`, open a PR, watch GitHub CI, and fix failures until CI passes.

## Self-Review

- Spec coverage: The plan covers typed query params, stacked sheets, route decoupling, unsaved-draft reset on share, skeleton loading states, hotkey scopes, docs, tests, review, PR, and CI.
- Placeholder scan: No task relies on unresolved `TODO`, `TBD`, or unnamed error handling.
- Type consistency: The search key is consistently `sheets`; sheet kinds are `job.create`, `job.detail`, `site.create`, and `site.detail`; stack operations are `open`, `push`, `replaceTop`, `pop`, and `closeAll`.
