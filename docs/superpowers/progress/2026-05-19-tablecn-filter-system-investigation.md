# TableCN Filter System Investigation

Date: 2026-05-19

Ceird source reviewed at `9ddae3b8` (`main`, after fetching `origin/main`).
TableCN source reviewed from `sadmann7/tablecn` at `374e6ae`; website and Dice
UI docs were also checked:

- https://tablecn.com/?filterFlag=commandFilters
- https://github.com/sadmann7/tablecn
- https://www.diceui.com/docs/components/radix/data-table

## Recommendation

Do not adopt TableCN directly yet. Ceird should first stabilize list filter,
URL, API query, pagination, saved-view, and command-bar contracts, then build a
Ceird-native table/filter layer that adapts selected TableCN/Dice UI patterns.

The useful parts to borrow are:

- column/field metadata that describes filter labels, variants, options, and
  command-menu presentation
- Linear-style command filter chips
- applied-filter chips with per-chip remove and clear-all behavior
- table toolbar composition: standard toolbar, advanced toolbar, sort menu,
  view options, row-selection action bar

The parts to avoid or rewrite are:

- direct `nuqs`/Next.js URL state wiring
- Drizzle-table-to-SQL filter generation
- page/per-page assumptions for lists that already use cursor pagination
- ad hoc `window` keydown listeners for filter/sort shortcuts
- generic JSON filter URL state before Ceird knows which filters should be
  durable, shareable, or saved as views

## Current Ceird Contracts

### Jobs

Source files:

- `apps/app/src/routes/_app._org.jobs.tsx`
- `apps/app/src/features/jobs/jobs-search.ts`
- `apps/app/src/features/jobs/jobs-page.tsx`
- `apps/app/src/features/jobs/jobs-state.ts`
- `apps/app/src/features/jobs/jobs-saved-views.ts`
- `packages/jobs-core/src/dto.ts`
- `apps/domain/src/domains/jobs/repositories.ts`

Current shape:

- URL/search params only hold `view?: "list" | "map"`.
- The route loader ignores route filter state and calls
  `listAllCurrentServerJobs({})`.
- Client list state is a route-scoped TanStack DB collection seeded by the
  loader.
- `JobsPage` owns `JobsListFilters` in local React state.
- Filtering is client-side over all loaded jobs via `filterVisibleJobs`.
- Static saved views are local objects that set `JobsListFilters`; they are not
  persisted and are not URL-addressable.
- API `JobListQuerySchema` supports `cursor`, `limit`, `status`,
  `assigneeId`, `coordinatorId`, `priority`, `siteId`, `labelId`, and
  `serviceAreaId`.
- API pagination is keyset by `updatedAt desc, id desc`, but the app hides that
  by fetching every page.
- UI filters include concepts not represented directly in the API contract:
  `active`, `all`, `unassigned`, free-text query, and saved-view IDs.
- Clear filters resets to `defaultJobsListFilters`.
- Command affordances exist for create, view switching, saved views, two status
  filters, and clear filters. Route hotkeys are registered for search, create,
  refresh, list view, map view, and saved views. The clear-filter command shows
  a shortcut definition in the command bar but does not currently have a
  matching direct route hotkey registration.

### Sites

Source files:

- `apps/app/src/routes/_app._org.sites.tsx`
- `apps/app/src/features/sites/sites-route-loader.ts`
- `apps/app/src/features/sites/sites-page.tsx`
- `apps/app/src/features/sites/sites-state.ts`
- `packages/sites-core/src/dto.ts`
- `apps/domain/src/domains/sites/repositories.ts`

Current shape:

- No route `validateSearch` for `/sites`.
- Search text, map readiness, and service-area filter are local React state.
- The route loader calls `listAllCurrentServerSites()` and stores all returned
  sites in a TanStack DB collection.
- API `SiteListQuerySchema` supports `cursor`, `limit`, and `serviceAreaId`.
- API pagination is keyset by `name asc, id asc`; site cursors include
  organization and service-area scope, and the repository rejects cursor reuse
  across scopes.
- UI supports local filters not represented in API query params: text search,
  mapped/unmapped, and no-service-area.
- No saved views.
- Clear filters resets local React state only.
- Command bar actions cover create-site and opening up to the first 25 sites,
  not filter manipulation.

### Activity

Source files:

- `apps/app/src/routes/_app._org.activity.tsx`
- `apps/app/src/features/activity/activity-search.ts`
- `apps/app/src/features/activity/activity-route-loader.ts`
- `apps/app/src/features/activity/organization-activity-page.tsx`
- `packages/jobs-core/src/dto.ts`
- `apps/domain/src/domains/jobs/repositories.ts`

Current shape:

- URL/search params are the canonical state for `actorUserId`, `eventType`,
  `fromDate`, `jobTitle`, and `toDate`.
- Loader deps include the search fields and call
  `listCurrentServerOrganizationActivity(toOrganizationActivityQuery(search))`.
- API `OrganizationActivityQuerySchema` also supports `cursor` and `limit`.
- API pagination is keyset by `createdAt desc, id desc`, but the UI does not
  expose `nextCursor`.
- Server filtering is implemented in SQL, including date bounds and job-title
  `ilike`.
- The page filters the returned page again client-side with
  `activityItemMatchesSearch`, duplicating server behavior.
- `jobTitle` uses local draft state until blur or Enter, then updates URL
  search.
- Clear filters navigates to an empty activity search object.
- No activity-specific command bar filter actions or filter hotkeys.

## Inconsistencies Blocking A Site-Wide Component

1. URL state is inconsistent. Activity is URL-driven, jobs/sites are mostly
   local state.
2. API query DTOs do not match visible UI filters. Jobs UI has `active`,
   `unassigned`, and text search; sites UI has query, map readiness, and
   no-service-area; activity exposes URL filters but not cursor/limit.
3. Pagination is unstable from the UI perspective. The APIs are cursor-based,
   while current pages fetch all rows and filter client-side. TableCN assumes a
   page/per-page server table with `pageCount`.
4. Saved views are not a settled contract. Jobs has static local saved views
   over a local filter object; sites and activity have none.
5. Clear-filter behavior is route-specific and local. There is no shared
   "default search" or "reset cursor/page when filters change" contract.
6. Command filter affordances are promising but not uniform. Jobs has command
   filters and command-bar actions; sites and activity do not. TableCN's
   keyboard shortcuts would need to be rewritten through Ceird's hotkey layer.
7. Current list surfaces are not all generic tables. Jobs is a grouped queue
   with a map mode and mobile cards; activity is a timeline; sites is a simple
   directory. A generic data-table component would leak product-specific
   behavior unless contracts are narrowed first.

## TableCN Review

TableCN/Dice UI provides:

- `useDataTable` wrapping TanStack Table with manual pagination, sorting, and
  filtering
- URL state through `nuqs`, including `page`, `perPage`, JSON `sort`, JSON
  `filters`, and `joinOperator`
- standard and advanced toolbars
- `DataTableFilterList` for Airtable/Notion-style advanced filters
- `DataTableFilterMenu` for Linear-style command filters
- column metadata for labels, placeholders, variants, option lists, ranges,
  units, and icons
- filter variants: text, number, range, date, dateRange, boolean, select, and
  multiSelect
- operators such as contains, equals, in array, empty, less/greater than,
  between, and relative-to-today
- row selection, action bars, view options, column pinning, sorting, and
  pagination

Fit with Ceird:

- Good conceptual fit for command-filter ergonomics and shadcn-style copy-owned
  components.
- Weak direct fit for routing: TableCN uses Next.js and `nuqs`; Ceird uses
  TanStack Router/Start route search validation and loaders.
- Weak direct fit for persistence: TableCN's reusable SQL helper targets
  Drizzle table columns; Ceird's product queries live in Effect SQL
  repositories and shared Effect Schema DTO contracts.
- Weak direct fit for pagination: TableCN is page/per-page oriented; Ceird's
  jobs, sites, and activity APIs already use cursor/keyset pagination.
- Styling would need adaptation to Ceird's recent tighter radius and
  operational SaaS direction.
- Keyboard behavior needs adaptation because Ceird requires the shared hotkey
  layer instead of ad hoc global listeners.

## Proposed Ceird Filter Contract

Use route search as the canonical state for list filters, saved view selection,
view mode, sort, and pagination position. Local React state should only hold
draft UI state such as an uncommitted search input or open popover.

Recommended contract rules:

1. Each list route has a feature-local `*-search.ts` module that owns:
   - a small TanStack Router `validateSearch` parser
   - default search state
   - `omitDefault*Search` serialization helper
   - `to*ApiQuery` mapper that decodes through the shared package DTO at the
     API boundary
2. API query DTOs in `*-core` expose only server-supported filters and
   pagination. UI-only concepts map explicitly:
   - `status=active` maps to a server-supported active-status query, or stays
     client-only only if the route intentionally loads all jobs
   - `assignee=unassigned` gets an explicit API representation before it is
     URL-shareable
   - text search gets an explicit API field such as `query` before it is
     persisted in URLs or saved views
3. Any filter or sort change resets `cursor` or `page` to the first position.
4. Cursors remain scoped to the filter/sort identity used to produce them.
   Sites already does this for organization and service-area scope; jobs and
   activity should do the same if cursors become user-visible.
5. Saved views store the same normalized search payload used by the route,
   excluding cursor. Applying a view navigates to the saved search. Editing a
   filter after applying a saved view clears `viewId` or marks the view custom.
6. Clear filters means "navigate to the route default search state", not "clear
   local component state". Empty states can then branch on
   `hasActiveFilters(defaultSearch, search)`.
7. Command filters are generated from a Ceird field registry:
   - `id`, `label`, `kind`, `operators`, `options`, `icon`
   - role/permission guard
   - URL encoder/decoder
   - API query mapper
   - clear/default behavior
8. Shortcut and command-bar exposure is part of the field registry or the
   feature route, but implementation must use `useAppHotkey`,
   `useAppHotkeySequence`, and `useRegisterCommandActions`.

The first concrete route targets should be:

- Jobs: `view`, `q`, `status`, `assignee`, `coordinatorId`, `priority`,
  `labelId`, `siteId`, `serviceAreaId`, `display` (`list` or `map`), and
  later `viewId`.
- Sites: `q`, `serviceAreaId`, `mapStatus`, and optionally `labelId` once site
  label filtering is product-ready.
- Activity: keep existing fields, remove duplicated client filtering, and
  decide whether to expose `cursor`/`limit` or intentionally cap the first page.

## Phased Plan

### Phase 1: Stabilize Contracts

- Write route-search modules and tests for jobs, sites, and activity.
- Align jobs/sites/activity API query DTOs with only the filters Ceird wants to
  support server-side.
- Decide route-by-route whether lists are "load all and client-filter" or
  "server-filter with visible pagination/load more".
- Add repository integration tests for every server-supported filter and cursor
  interaction.

### Phase 2: Move Current Filters To URL

- Migrate jobs filters from local React state to route search.
- Convert static jobs saved views to search payloads.
- Migrate sites local filters to route search.
- Remove duplicate activity client filtering after server filtering is proven
  by tests.
- Standardize filtered and unfiltered empty states plus clear-filter behavior.

### Phase 3: Build Ceird-Native Filter Components

- Add a shared filter field registry type in the app, not a shared package yet.
- Build `ListFilterBar`, `ActiveFilterChips`, and `CommandFilterMenu` using
  Ceird's existing `Command`, `CommandSelect`, `Button`, `Badge`, and hotkey
  infrastructure.
- Keep route-specific rendering slots for jobs status rail, sites map-status
  buttons, activity timeline filters, and mobile layouts.

### Phase 4: Add Table Capabilities Selectively

- Add `@tanstack/react-table` only when a route needs real table capabilities:
  sorting, column visibility, row selection, pinning, or row-action state.
- Start with sites if it remains a straightforward directory. Jobs may need a
  queue-specific wrapper rather than a generic table because of status grouping
  and map mode.
- Keep API pagination cursor-first unless a product route genuinely needs
  page-number navigation and total page counts.

### Phase 5: Persist Saved Views

- Add saved-view persistence after the normalized search payload is stable.
- Store view name, owning organization/user scope, target route, normalized
  filter payload, optional sort/display preferences, and timestamps.
- Reuse the same route search payload for create/update/apply behavior.

## Risks And Validation

Risks:

- URL bloat if Ceird copies TableCN's generic JSON `filters` too early.
- Cursor bugs if filters change without clearing or scoping cursors.
- Role-specific filters leaking actions or options to external viewers.
- Fetch-all behavior becoming expensive as jobs/sites grow.
- Keyboard regressions if command filters bypass the hotkey layer.
- Generic table abstraction flattening jobs' queue/map/timeline-specific UX.

Validation steps:

- Unit tests for route search parsing, omission of defaults, clear behavior,
  and API query mapping.
- Shared package tests for new query DTOs.
- Domain repository integration tests for filter combinations and cursor scope.
- Route loader tests for search-driven reload behavior.
- Component tests for active filter chips, command filter menu keyboard
  behavior, saved-view application, and filtered empty states.
- Playwright coverage for jobs, sites, and activity filter flows once UI moves
  from local state to URL state.
- Browser screenshots for desktop and mobile when shared filter components are
  introduced.
