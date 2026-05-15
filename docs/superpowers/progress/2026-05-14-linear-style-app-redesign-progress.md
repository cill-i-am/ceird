# Linear-Style App Redesign Progress

## Goal

Audit Ceird end to end, break the product into its current feature modules, and
redesign the app toward a Linear-style construction operations workspace. The
work should use the auth and organization setup routes as the quality baseline,
generate visual inspiration, implement the strongest improvements, and verify
them with browser proof and automated checks.

## Standing Redesign Rules

- Keep this document updated on every run before and after material work.
- Use `impeccable craft` for every redesign pass. Load product context, the
  product register reference, and the craft reference before shaping or editing
  UI.
- Treat the generated images as concrete visual references for composition,
  density, hierarchy, and responsive behavior. Do not let later passes drift
  back to generic panels or rails when a reference image exists.
- Use the persisted reference images below when the matching feature family is
  revisited:
  - Dashboard/home:
    [dashboard-home-reference.png](assets/2026-05-14-linear-style-app-redesign/dashboard-home-reference.png)
  - Jobs/sites:
    [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  - Settings/admin/mobile:
    [settings-admin-mobile-reference.png](assets/2026-05-14-linear-style-app-redesign/settings-admin-mobile-reference.png)

## Run Log

### 2026-05-14 22:02 IST

- Created goal: audit the app, map features and flows, redesign toward the new
  direction, implement, and verify.
- Loaded product context, design system context, and the relevant impeccable,
  browser, image generation, and testing guidance.
- Created branch `codex/linear-style-redesign`.
- Started the worktree sandbox:
  `https://codex-linear-style-redesign.app.ceird.localhost:1355`.
- Removed the stale cached Browser plugin bundle at
  `/Users/cillianbarron/.codex/plugins/cache/openai-bundled/browser-use`.
- Confirmed the fresh Browser bundle rehydrated under
  `/Users/cillianbarron/.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/browser`.
- Reconnected the in-app browser with the refreshed runtime and reached
  `/login`.
- Started logged-out flow exploration. The first signup automation attempt
  found the signup button label differs from the expected selector, so the next
  step is to inspect the live signup snapshot and continue with selectors from
  the current DOM.

### 2026-05-14 22:17 IST

- Completed the primary auth/setup path in the in-app browser with a synthetic
  account:
  - `/signup`
  - `/create-organization`
  - optional invite step
  - authenticated home
- Explored public recovery/status routes:
  - `/forgot-password`
  - `/reset-password`
  - `/verify-email`
- Explored authenticated routes:
  - `/`
  - `/jobs`
  - `/jobs/new`
  - `/jobs/$jobId`
  - `/sites`
  - `/sites/new`
  - `/sites/$siteId`
  - `/activity`
  - `/members`
  - `/organization/settings`
  - `/settings`
- Created one job and one site through the browser, then opened the job and
  site detail dialogs.
- Created one pending member invitation with a synthetic email address.
- Opened the command bar and confirmed route/current-page commands appear with
  shortcut hints.
- Switched from system/dark to light theme and inspected the members page.
- Checked the members page at a narrow mobile viewport.

### 2026-05-14 22:19 IST

- Started the first implementation slice from the browser findings:
  - Mobile-safe email verification banner.
  - Workspace home upgraded from a single next action into a compact operations
    overview.
- Added focused tests proving:
  - Long email addresses in the verification banner wrap instead of truncating
    or forcing the action out of the mobile layout.
  - Home exposes workspace status, command readiness, organization slug,
    account verification state, and multiple outcome-based next actions.
  - Verified users do not see the account verification action in the home list.
- Implemented the banner layout changes and the home overview using existing
  app primitives (`AppStatusStrip`, `AppRowList`, `AppPageHeader`) so the work
  stays aligned with the current Linear-style surface language.
- Verification so far:
  - `pnpm --filter app exec vitest run src/features/auth/email-verification-banner.test.tsx src/features/auth/authenticated-shell-home.test.tsx`
    passes.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
- Next proof needed: in-app browser inspection of `/` and the verification
  banner at desktop and mobile widths.

### 2026-05-14 22:21 IST

- Completed browser proof for the first implementation slice in the refreshed
  in-app browser.
- Desktop `/` proof:
  - The verification banner now presents email text and resend action without
    the previous mobile-oriented overflow risk.
  - Home now shows a four-item workspace status strip: workspace setup, jobs
    queue, account verification, and command access.
  - Next actions now point to jobs, members, and account verification outcomes.
- Mobile `/` proof at `390x844`:
  - Long audit email wraps cleanly inside the warning banner.
  - Resend verification email action becomes full-width and stays inside the
    banner.
  - Status tiles and next action rows stack without text overlap.
- Follow-up adjustment from proof: added the fourth "Jobs queue" status item so
  the status strip fills the desktop grid and reads as a complete operational
  overview.
- Re-ran focused tests and app type-check after the adjustment; both still pass.
- Next target: verify whether `/settings` truly loses active organization
  context after load or whether the earlier finding was a transient loading
  state.

### 2026-05-14 22:24 IST

- Verified `/settings` in the in-app browser after waiting for app data:
  - The sidebar does recover the active organization (`Ceird Audit Works`), so
    the earlier "No active organization" observation was a transient loading
    state rather than a persisted route regression.
- Completed a focused design pass on user settings:
  - Added a visible `Account settings` page header using the shared
    `AppPageHeader` language.
  - Added a four-item `Account status` strip for profile identity, sign-in
    email, password, and form shortcuts.
  - Kept the existing profile/email/password form logic intact.
  - Changed settings form submit buttons to be full-width only on narrow
    viewports instead of stretching across desktop form rows.
- Browser proof:
  - Desktop `/settings` now has a clearer Linear-style page frame above the
    forms and preserves the active organization in the sidebar.
  - Mobile `/settings` stacks the banner, header, status strip, and forms
    without overlap or clipped email text.
- Verification:
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx src/features/auth/authenticated-shell-home.test.tsx src/features/auth/email-verification-banner.test.tsx`
    passes.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-14 22:31 IST

- Re-opened the generated settings/admin inspiration image and used it directly
  as a reference instead of relying on it as background direction.
- Design moves pulled from the image:
  - Horizontal section rail under the page heading.
  - Overview-first structure before editable admin sections.
  - Admin-console density with restrained section labels rather than large
    marketing-style panels.
  - Mobile section rails that scroll horizontally and preserve the status card
    stack.
- Applied the pattern to user settings:
  - Added `Overview`, `Profile`, `Email`, and `Password` section links.
  - Anchored the account status strip and all account forms.
  - Kept profile/email/password behavior and hotkey ownership unchanged.
- Mirrored the same generated-image pattern into organization settings:
  - Added `Overview`, `General`, `Labels`, `Service areas`, `Rate card`, and
    `Details` section links.
  - Anchored the organization overview, general form, labels, service areas,
    rate card, and identity/details panels.
  - Kept organization form, label editing, service area, and rate card behavior
    unchanged.
- Browser proof:
  - Desktop `/settings` and `/organization/settings` now show the tab rail and
    overview strip in the same rhythm as the generated reference.
  - Mobile proof at `390x844` shows both section rails fit horizontally without
    overlap; overflowing items are available by horizontal scroll.
- Verification:
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx src/features/organizations/organization-settings-page.test.tsx src/features/auth/authenticated-shell-home.test.tsx src/features/auth/email-verification-banner.test.tsx`
    passes.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-14 22:42 IST

- The goal was updated to make this progress document the guide and persistent
  working record for the redesign.
- Persisted the generated image references in the repo under
  `docs/superpowers/progress/assets/2026-05-14-linear-style-app-redesign/`:
  dashboard/home, jobs/sites, and settings/admin/mobile.
- Added a standing rule to use `impeccable craft` for every redesign pass,
  including future dashboard, jobs, and sites passes.
- Checked the shadcn Tabs guidance and Base UI Tabs API. The previous
  generated-image-inspired section rails are being replaced with real shadcn
  tabs, with forms and feature groups split into their matching tab panels.
- Implementation in progress:
  - Added `TabsContent` to the local shadcn/Base UI tabs component.
  - Converted user settings into `Overview`, `Profile`, `Email`, and
    `Password` tabs.
  - Converted organization settings into `Overview`, `General`, `Labels`,
    `Service areas`, `Rate card`, and `Details` tabs.
- Proof still needed for this slice: focused settings tests, app type-check,
  and in-app browser verification of the desktop and mobile tab states.

### 2026-05-14 22:47 IST

- Completed the shadcn tabs slice for user and organization settings.
- User settings now uses real tabs:
  - `Overview` contains the account status strip.
  - `Profile` contains profile identity fields.
  - `Email` contains current email and email-change verification.
  - `Password` contains password-change fields.
- Organization settings now uses real tabs:
  - `Overview` contains the organization status strip.
  - `General` contains workspace name editing.
  - `Labels` contains create/edit/archive label workflows.
  - `Service areas` and `Rate card` contain their existing feature modules.
  - `Details` contains slug and access metadata.
- Browser proof from the in-app browser:
  - Desktop `/settings`: clicked `Profile`, `Email`, `Password`, and
    `Overview`; each tab exposed the expected selected state and panel.
  - Desktop `/organization/settings`: clicked `General`, `Labels`,
    `Service areas`, `Rate card`, `Details`, and `Overview`; each tab exposed
    the expected selected state and panel after hydration.
  - Mobile `390x844` `/settings`: confirmed the tab list fits and `Password`
    opens the password panel after hydration.
  - Mobile `390x844` `/organization/settings`: confirmed the longer tab list
    scrolls horizontally and `Rate card` opens the rate-card panel.
- Proof screenshots saved in
  `docs/superpowers/progress/assets/2026-05-14-linear-style-app-redesign/`:
  - [settings-tabs-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/settings-tabs-desktop-proof.png)
  - [organization-tabs-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/organization-tabs-desktop-proof.png)
  - [settings-tabs-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/settings-tabs-mobile-proof.png)
  - [organization-tabs-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/organization-tabs-mobile-proof.png)
- Verification:
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx src/features/organizations/organization-settings-page.test.tsx`
    passes: 32 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx src/features/organizations/organization-settings-page.test.tsx src/features/auth/authenticated-shell-home.test.tsx src/features/auth/email-verification-banner.test.tsx`
    passes: 38 tests.

### 2026-05-14 22:49 IST

- Addressed browser review feedback on `/settings`: the `Settings` eyebrow
  above `Account settings` was redundant and has been removed.
- Added regression coverage so the account settings page does not reintroduce
  a generic `SETTINGS` eyebrow.
- Verification:
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx`
    passes: 16 tests.

### 2026-05-14 22:53 IST

- Started the dashboard/jobs/sites pass using the persisted generated images as
  references:
  - Dashboard/home reference:
    `docs/superpowers/progress/assets/2026-05-14-linear-style-app-redesign/dashboard-home-reference.png`
  - Jobs/sites reference:
    `docs/superpowers/progress/assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png`
- Browser audit of `/`, `/jobs`, and `/sites` found:
  - Home already has the earlier status strip and next-action upgrade, but does
    not yet contain the reference image's jobs/sites tables or recent activity
    column.
  - Jobs is closest to the generated direction: dense queue, saved views,
    filters, list/map tabs, and job rows.
  - Sites was the least aligned surface: it was a plain table without coverage
    context, directory framing, or map/service-area readiness.
- Saved before screenshots for this pass:
  - [dashboard-before-sites-pass.png](assets/2026-05-14-linear-style-app-redesign/dashboard-before-sites-pass.png)
  - [jobs-before-sites-pass.png](assets/2026-05-14-linear-style-app-redesign/jobs-before-sites-pass.png)
  - [sites-before-sites-pass.png](assets/2026-05-14-linear-style-app-redesign/sites-before-sites-pass.png)
- Implemented the first jobs/sites slice on `/sites`:
  - Added a `Site coverage` status strip with total sites, mapped readiness,
    service area readiness, and directory permissions.
  - Added a named `Site directory` panel above the table with map readiness
    summary.
  - Changed mapped/unmapped values to badges and sharpened the empty state copy
    around addresses, service areas, and job locations.
- Browser proof:
  - Desktop `/sites` shows the new coverage strip, directory panel, and mapped
    badge.
  - Mobile `390x844` `/sites` has no horizontal body overflow; the coverage
    strip stacks and the directory panel remains within the viewport.
  - `/settings` was also rechecked and no longer shows the redundant `Settings`
    eyebrow above `Account settings`.
- Proof screenshots saved:
  - [sites-redesign-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-redesign-desktop-proof.png)
  - [sites-redesign-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-redesign-mobile-proof.png)
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx src/features/settings/user-settings-page.test.tsx`
    passes: 22 tests.
- Next pass candidate: bring `/` closer to the dashboard reference by adding
  live jobs/sites/recent-activity modules or, if route data makes that too
  broad for one slice, tighten the jobs list/detail relationship toward the
  generated jobs/sites reference.

### 2026-05-14 22:56 IST

- Continued the jobs/sites pass on `/jobs`, using the generated jobs/sites
  reference as the density and hierarchy target.
- Implemented a compact `Jobs overview` status strip above the queue:
  - `Active queue`: active jobs with blocked and unassigned context.
  - `Visible now`: the current filtered/saved-view count.
  - `Priority watch`: urgent and high-priority work.
  - `Mapped sites`: jobs attached to sites with coordinates.
- Kept the existing jobs mechanics intact: saved views, filters, search, list
  and map tabs, route hotkeys, command actions, empty states, and job rows.
- Browser proof:
  - Desktop `/jobs` shows the overview strip above the backlog while preserving
    list view controls and queue rows.
  - Mobile `390x844` `/jobs` stacks the overview strip without body overflow.
- Proof screenshots saved:
  - [jobs-overview-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/jobs-overview-desktop-proof.png)
  - [jobs-overview-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/jobs-overview-mobile-proof.png)
- Verification:
  - `pnpm --filter app exec vitest run src/features/jobs/jobs-page.test.tsx`
    passes: 17 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `pnpm --filter app exec vitest run src/features/jobs/jobs-page.test.tsx src/features/sites/sites-page.test.tsx src/features/settings/user-settings-page.test.tsx`
    passes: 39 tests.
- Remaining dashboard/jobs/sites gap: `/` still does not yet use live
  jobs/sites/recent-activity modules from the dashboard reference. That should
  be the next larger pass after checking the route-data shape.

### 2026-05-14 23:06 IST

- Addressed the latest browser review comments and corrected the settings/sites
  direction:
  - `/settings`: removed the header description, removed the header bottom
    border, kept the generic `SETTINGS` eyebrow out, and removed the `Overview`
    tab plus `Account status` strip entirely.
  - `/organization/settings`: removed the `Overview` tab plus
    `Organization status` strip, and removed the `Details`/identity tab because
    it was not carrying useful work.
  - `/sites`: removed the `Site coverage` status strip while keeping the more
    useful `Site directory` frame, map-readiness summary, and mapped/unmapped
    badges.
- Reverted the unfinished dashboard route-loader experiment so this pass stays
  coherent and the app type-check remains clean before the larger dashboard
  data-model pass.
- Current tab structures:
  - `/settings`: `Profile`, `Email`, `Password`.
  - `/organization/settings`: `General`, `Labels`, `Service areas`,
    `Rate card`.
- Browser DOM proof from the in-app browser:
  - `/settings`: `Account settings` is visible; old `SETTINGS` eyebrow,
    descriptive header copy, `Account status`, and `Overview` tab are absent;
    `Profile` is the selected tab; header class includes `border-b-0`.
  - `/organization/settings`: `Organization settings` is visible; old
    `Organization status`, `Overview`, `Details`, and identity-panel copy are
    absent; `General` is the selected tab.
  - `/sites`: `Site coverage` is absent; `Site directory` or the empty-state
    equivalent remains visible; the directory map summary remains present when
    sites exist.
- Browser screenshot capture timed out through the in-app browser backend during
  this run, so the proof for this corrective pass is DOM-based. Earlier proof
  screenshots remain in the assets directory for the broader tabs/jobs/sites
  exploration.
- Verification:
  - `pnpm --filter app exec vitest run src/features/settings/user-settings-page.test.tsx src/features/organizations/organization-settings-page.test.tsx src/features/sites/sites-page.test.tsx`
    passes: 38 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
- Next pass guidance: when returning to dashboard/jobs/sites, keep using the
  persisted generated images as references, but apply them through outcome-based
  modules rather than generic overview/status strips.

### 2026-05-14 23:18 IST

- Continued the dashboard/home pass with the persisted
  [dashboard-home-reference.png](assets/2026-05-14-linear-style-app-redesign/dashboard-home-reference.png)
  open as the visual reference.
- Replaced the static home route surface with live, outcome-based modules
  inspired by the reference image:
  - `Workspace overview` metric row for active jobs, sites, members, and email
    trust.
  - `Jobs at a glance` table fed from the organization jobs list.
  - `Sites with active work` table fed from site options and active job counts.
  - `Next actions` generated from real conditions such as priority work, first
    job/site, email verification, and team size.
  - `Recent activity` fed from organization activity for owner/admin users, with
    an explicit admin-only state for members.
- Added `loadOrganizationHomeDashboardRouteData` on `/` so the home route now
  gathers jobs, job options, site options, and recent activity instead of
  rendering generic placeholder guidance.
- Kept the prior review lesson in place: this is not another status strip. The
  home is now closer to the generated dashboard reference through actual
  working modules, tables, and action rows.
- Browser proof from the in-app browser:
  - Desktop `/`: `Home`, `Workspace overview`, `Jobs at a glance`,
    `Sites with active work`, `Next actions`, and `Recent activity` are present;
    the old `Workspace status` strip and `Ready for intake` copy are absent; no
    horizontal body overflow at `1159px`.
  - Mobile `390x844` `/`: all five modules remain present and body width stays
    at `390px`, so there is no horizontal overflow.
- Browser screenshot capture still times out through `Page.captureScreenshot`,
  so proof for this pass is DOM and viewport-width based.
- Verification:
  - TDD red run first failed because the dashboard component and route loader
    did not exist.
  - `pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx src/routes/-_app._org.index.test.tsx`
    passes: 8 tests.
  - `pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx src/routes/-_app._org.index.test.tsx src/features/jobs/jobs-page.test.tsx src/features/sites/sites-page.test.tsx`
    passes: 31 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
- Next pass candidate: audit the right rail and table density in-browser after
  real seeded data changes, then continue into activity/members empty states or
  deepen the dashboard with invitations once a server-side invitation summary
  exists.

### 2026-05-14 23:24 IST - `/sites` review follow-up and cache refresh

- Received browser feedback that the `Site coverage` block on `/sites` was
  pointless.
- Verified the source already reflected the intended direction:
  - `apps/app/src/features/sites/sites-page.tsx` has no `Site coverage` region.
  - `apps/app/src/features/sites/sites-page.test.tsx` asserts the region is
    absent for both populated and empty states.
- Cleared the stale running app cache and restarted the sandbox:
  - Stopped `codex-linear-style-redesign`.
  - Deleted `apps/app/node_modules/.vite` and
    `apps/app/node_modules/.vite-temp`.
  - Restarted with `pnpm sandbox:up`.
- Browser proof after restart:
  - Signed up a fresh sandbox user, created `Cache Check Works`, and opened
    `https://codex-linear-style-redesign.app.ceird.localhost:1355/sites`.
  - DOM readout: `hasSiteCoverage: false`, `hasEmpty: true`,
    `horizontalOverflow: false`.
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.
- Keep watching for this kind of stale app state when browser comments reference
  UI text that no longer exists in source.

### 2026-05-14 23:33 IST - Activity timeline pass

- Continued with `impeccable craft` guidance in product-register mode. The
  activity route is an operational audit surface, so this pass kept the design
  restrained, dense, and task-native rather than generating a decorative new
  visual direction.
- Browser audit before implementation:
  - Fresh sandbox workspace `/activity` had only one heading, `Activity`.
  - No `Activity timeline` label, no route-specific audit framing, no jobs
    action in the first-run empty state.
  - Desktop width `1159px` had no horizontal overflow.
- Redesign outcome:
  - Replaced the loose feed/empty split with one named `Activity timeline`
    panel.
  - Added event scope text such as `1 event shown`, `1 of 3 events shown`, and
    `0 of 3 events shown`.
  - Added active filter chips for actor, event type, date range, and job title,
    with a single clear action.
  - Updated the first-run empty state to `No activity recorded yet.` with
    outcome copy and an `Open jobs` route action.
  - Updated the filtered empty state to explain how to widen the audit trail.
- TDD proof:
  - Red run failed first because the route lacked `Activity timeline`, event
    scope text, filter chips, and the new empty-state copy.
  - `pnpm --filter app exec vitest run src/features/activity/organization-activity-page.test.tsx`
    passes: 10 tests.
  - `pnpm --filter app exec vitest run src/features/activity/organization-activity-page.test.tsx src/routes/-_app._org.activity.test.tsx`
    passes: 17 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `git diff --check` passes.
- Browser proof after implementation:
  - Desktop `/activity`: headings are `Activity` and `Activity timeline`;
    `No activity recorded yet.` and `Open jobs` are present; old
    `No activity yet.` title is absent; no horizontal overflow.
  - Desktop `/activity?eventType=visit_logged`: `Event type: Visit logged`,
    `No events match these filters.`, `Clear filters`, and
    `0 of 0 events shown` are present; no horizontal overflow.
  - Mobile `390x844` `/activity`: `Activity timeline` and `Open jobs` remain
    present; body width stays at `390px`, so there is no horizontal overflow.
- Next pass candidate: revisit members, jobs, or site detail flows in-browser
  with seeded data. For dashboard/jobs/sites, continue using the persisted
  generated references in
  `docs/superpowers/progress/assets/2026-05-14-linear-style-app-redesign/`;
  for any new visual direction, use the `impeccable` craft process first.

### 2026-05-14 23:39 IST - Jobs queue grouping pass

- Reopened the persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  before implementation. The reference direction to carry forward was not a
  decorative metric strip; it was the dense operational queue, visible status
  grouping, compact rows, and table/list rhythm.
- Browser audit before implementation:
  - Fresh sandbox `/jobs` showed the route header, filters, metric strip, and
    first-run empty state.
  - Populated source/tests still rendered the list as one flat `Backlog` table.
- Redesign outcome:
  - Replaced the flat `Backlog` queue heading with `Job queue`.
  - Grouped visible jobs by current status using the domain order: `New`,
    `Triaged`, `In progress`, `Blocked`, `Completed`, `Canceled`.
  - Added accessible group headings with counts, such as `New 1`,
    `Triaged 2`, and `Blocked 1`.
  - Preserved the existing dense desktop table rows, compact mobile rows,
    saved views, filters, map toggle, route hotkeys, and command-bar behavior.
- TDD proof:
  - Red run failed first because the queue did not expose `New 1`,
    `Triaged 2`, `Blocked 1`, `Completed 1`, or `Canceled 1`, and still used
    `Backlog`.
  - Focused red/green:
    `pnpm --filter app exec vitest run src/features/jobs/jobs-page.test.tsx --testNamePattern "defaults to the active view"`
    passes.
  - `pnpm --filter app exec vitest run src/features/jobs/jobs-page.test.tsx`
    passes: 17 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `git diff --check` passes.
- Browser proof after implementation:
  - Created a real sandbox job through `/jobs/new`: `Replace relay 57974`.
  - Desktop `/jobs`: `Job queue`, `Grouped by current status for fast triage.`,
    `New 1`, and the created job are present; `Backlog` is absent; no
    horizontal overflow at `1159px`.
  - Mobile `390x844` `/jobs`: `Job queue`, `New 1`, and the created job remain
    present; body width stays at `390px`, so there is no horizontal overflow.
- Next pass candidate: use the same reference image to inspect the job detail
  sheet/right-panel experience after opening a real job, especially details,
  visits, costs, comments, and activity density.

### 2026-05-14 23:41 IST - `/sites` stale coverage follow-up

- Received another browser review note showing the old `Site coverage` block
  on `/sites`.
- Source check confirms the intended code still has no `Site coverage` region:
  the Sites page renders `Site directory` directly, and tests assert the
  coverage region is absent in populated and empty states.
- Current hypothesis: the in-app browser or running app is still serving stale
  compiled UI from Vite cache. This run will clear the app caches, restart the
  sandbox, then verify `/sites` by DOM and focused tests before continuing the
  broader redesign goal.
- Cleared the stale app build caches and restarted the sandbox:
  - Stopped `codex-linear-style-redesign`.
  - Deleted `apps/app/node_modules/.vite` and
    `apps/app/node_modules/.vite-temp`.
  - Restarted with `pnpm sandbox:up`.
- Browser proof after restart:
  - Empty `/sites`: `hasSiteCoverage: false`, empty state present, no
    horizontal overflow at `1159px`.
  - Populated `/sites`: created `Docklands 1778798646540`; `Site directory`,
    the created site row, `1 mapped / 1 total`, and `Mapped` are present;
    `hasSiteCoverage: false`.
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `git diff --check` passes.

### 2026-05-15 00:00 IST - Job detail sheet pass started

- Continuing from the previous next-pass note: the target is the job detail
  sheet/right-side experience after opening a real job.
- Reopened the persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  as the visual contract for this pass.
- Initial source read: the current detail sheet already contains rich sections
  for location, contact, status movement, site assignment, comments,
  collaborators, costs, visits, and activity, but it renders them as one long
  vertical scroll rather than the reference image's compact detail tabs.
- Next proof: inspect a live job detail in-browser at desktop and mobile, then
  implement the smallest useful tabbed structure that preserves permissions,
  forms, command actions, and existing mutations.
- Future site detail note from review: after the job detail tab pass, implement
  a stronger site detail view that mirrors the job detail quality bar: map,
  labels/details/notes, and a list of jobs associated with the site.

### 2026-05-15 00:07 IST - Job detail sheet tabs completed

- Continued with `impeccable craft` in product-register mode and used the
  persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  as the composition reference: compact right detail panel, dense tabs, and
  operational modules split by outcome.
- Browser proof before implementation showed the job detail sheet had all the
  right data and actions, but comments, collaborators, costs, visits, and
  activity were stacked into one long vertical scroll.
- Redesign outcome:
  - Split the detail sheet into shadcn/Base UI tabs: `Details`, `Comments`,
    `Costs`, `Visits`, and `Activity`.
  - Added tab counts for comments, visits, and activity.
  - Kept external collaborators on the smaller permission surface: `Details`
    and `Comments` only.
  - Moved site, assignee, contact, reference, and updated metadata into the
    `Details` tab so the header stays compact.
  - Hid the explanatory drawer description visually while keeping an accessible
    description for the dialog.
  - Preserved existing behavior for label assignment, status transitions, site
    assignment, comments, collaborator management, cost lines, visits, activity,
    command-bar registration, and hotkeys.
- Browser proof after implementation:
  - Desktop job detail shows the five tabs and no horizontal overflow at
    `1159px`.
  - Desktop tab cycling reached `Activity 1`, and the visible panel contained
    the system activity copy.
  - Mobile `390x844` shows the tab rail inside the viewport, body width stays
    at `390px`, and the visible drawer description is gone.
  - Mobile proof values: tablist `top: 377`, `bottom: 413`, tabs `Details`,
    `Comments 0`, `Costs`, `Visits 0`, `Activity 1`.
  - Proof PNGs for this pass are present in the assets folder:
    [job-detail-tabs-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/job-detail-tabs-desktop-proof.png)
    and
    [job-detail-tabs-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/job-detail-tabs-mobile-proof.png).
    The final Browser screenshot emission also worked inline, but overwriting
    those files from the Browser runtime failed with `EPERM`, so the latest
    compact-header fix is recorded with DOM/viewport proof.
- TDD proof:
  - Added a regression test that requires the operational detail surface to
    expose the new tab structure.
  - Initial red run failed because no detail tabs existed.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-sheet.test.tsx --reporter=verbose`
    passes: 26 tests.
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-sheet.integration.test.tsx --reporter=verbose`
    passes: 10 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: audit members and invitations in-browser with populated
  pending invitations, then tighten role/action density and empty states using
  the same Linear-style product register.

### 2026-05-15 00:10 IST - `/sites` in-app browser cache cleared again

- Received another in-app browser annotation showing the old `Site coverage`
  block on `/sites`.
- Verified source and tests first, per review-feedback discipline:
  - `apps/app/src/features/sites/sites-page.tsx` still renders `Site directory`
    directly and contains no `Site coverage` region.
  - `apps/app/src/features/sites/sites-page.test.tsx` still asserts the
    coverage region is absent for both populated and empty states.
- Confirmed with a fresh Playwright browser context before restart:
  - Empty `/sites`: `hasSiteCoverage: false`, empty state present.
  - Populated `/sites`: created a real site; the directory row appeared and
    `hasSiteCoverage: false`.
- Cleared both stale layers this time:
  - Stopped `codex-linear-style-redesign`.
  - Deleted `apps/app/node_modules/.vite` and
    `apps/app/node_modules/.vite-temp`.
  - Deleted Codex Electron in-app browser cache/code-cache directories under
    `~/Library/Application Support/Codex/Partitions/codex-browser-app/`.
  - Deleted matching top-level Codex Electron cache/code-cache directories.
  - Restarted with `pnpm sandbox:up`.
- Browser proof after restart:
  - Empty `/sites`: `hasSiteCoverage: false`, `hasEmpty: true`, body width
    `1159px`.
  - Populated `/sites`: created `Docklands cache verify ...`; `Site directory`,
    the created row, and `1 mapped / 1 total` are present;
    `hasSiteCoverage: false`, body width `1159px`.
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.
  - `git diff --check` passes.

### 2026-05-15 00:15 IST - Site detail sheet pass started

- Continuing the broader Linear-style redesign goal with the site detail sheet,
  following the future-site-detail note from the job detail pass.
- Reopened the persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  before implementation. The direction to preserve is a compact operational
  detail panel with tabs, map/site context, related work, and editable details,
  not another top-level metric strip.
- Using `impeccable craft` in product-register mode for this redesign. Since
  the user already accepted this generated jobs/sites direction as reference
  material for dashboard/jobs/sites work, this pass treats that image as the
  visual contract rather than generating a new mock.
- Next proof: inspect the current live site detail flow at desktop and mobile,
  then implement the smallest honest slice that improves the detail surface
  toward map/details/notes/related-job structure without fabricating data the
  route does not load yet.
- User direction update: do not switch into the site-view build yet. Keep the
  site view requirement here as a tracked follow-up, but continue the active
  browser/design pass on job detail first.

### 2026-05-15 00:20 IST - Members access distillation

- Continued with `impeccable craft` in product-register mode. The members
  surface is an admin workflow, so this pass favored direct feature modules,
  restrained density, and removing duplicated status chrome.
- Browser audit before implementation:
  - The session had expired, so a fresh synthetic account and organization were
    created through the in-app browser.
  - Created `Members Audit Works 1778800201903` and sent a synthetic pending
    invitation, `pending-member-1778800213193@example.com`, through the
    onboarding invite step.
  - Desktop `/members` showed the page header, `Member access overview`,
    `Current members`, and `Pending invitations`; no horizontal overflow at
    `1159px`.
  - Mobile `390x844` also had no horizontal overflow, but the overview strip
    repeated the active member count, open invitation count, and viewer role
    that were already visible in the member and invite modules.
- Redesign outcome:
  - Removed the redundant `Member access overview` strip.
  - Kept the useful operational modules directly on the page: `Current members`
    and `Pending invitations`, each with its own count badge.
  - Preserved invite dialog behavior, pending invite resend/cancel actions,
    member role actions, self/owner protections, command-bar actions, and
    members hotkeys.
- Browser proof after implementation:
  - Desktop `/members`: `Member access overview` is absent; `Current members`
    and `Pending invitations` remain visible with `1 active` and `1 open`;
    body width remains `1159px`.
  - Mobile `390x844`: overview remains absent; both modules remain present;
    body width stays at `390px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/organizations/organization-members-page.test.tsx src/routes/-_app._org.members.test.tsx --reporter=verbose`
    passes: 44 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: return to the site detail sheet pass already started
  above, using the persisted jobs/sites reference and the recorded
  map/details/notes/related-jobs direction.

### 2026-05-15 00:23 IST - Site detail sheet tabs completed

- Resumed the started site detail pass using the persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  as the accepted visual reference: right-side operational detail, dense tabs,
  map/site context, editable details, and related work.
- Browser audit before implementation:
  - Created `Docklands detail ...` in the sandbox and opened the site detail.
  - Desktop detail was a centered edit form with no tabs, no read-only
    location summary, no map-readiness module, and no related-jobs surface.
  - Mobile had no horizontal overflow, but it preserved the same flat form-only
    structure.
  - Saved before screenshots:
    [site-detail-before-desktop.png](assets/2026-05-14-linear-style-app-redesign/site-detail-before-desktop.png)
    and
    [site-detail-before-mobile.png](assets/2026-05-14-linear-style-app-redesign/site-detail-before-mobile.png).
- Redesign outcome:
  - Converted site detail to the same Linear-style right-side drawer language
    as job detail.
  - Added shadcn/Base UI tabs: `Details`, `Edit`, and `Jobs`.
  - Made `Details` the default tab with service area, map readiness,
    coordinates, address, access notes, Google Maps link, and the existing map
    preview component when coordinates are present.
  - Moved the existing editable form into the `Edit` tab and only shows
    `Save changes` while that tab is active.
  - Added a `Jobs` tab backed by route data from
    `listAllCurrentServerJobs({ siteId })`; it renders related job rows when
    present and an honest empty state when no jobs are attached.
  - Hid the old visible drawer description while preserving an accessible
    dialog description.
- TDD proof:
  - Added `sites-detail-sheet.test.tsx`; the red run failed because no
    `Details`, `Edit`, or `Jobs 0` tabs existed.
  - Added a route-loader regression test; the red run failed because
    `loadSiteDetailRouteData` returned only a string site id instead of related
    jobs.
- Browser proof after implementation:
  - Desktop `/sites/$siteId`: tabs are `Details`, `Edit`, and `Jobs 0`;
    `Details` is selected by default; `Location summary`, `Mapped`, access
    notes, and Google Maps action are present; the old visible description is
    absent; body width stays at `1159px`.
  - Desktop tab cycling: `Edit` shows the existing form and `Save changes`;
    `Jobs 0` shows `No jobs linked to this site yet.`
  - Mobile `390x844`: the same tab rail remains visible, `Details` is selected,
    `Location summary` is present, and body width stays at `390px`.
  - Saved proof screenshots:
    [site-detail-tabs-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/site-detail-tabs-desktop-proof.png)
    and
    [site-detail-tabs-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/site-detail-tabs-mobile-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-detail-sheet.test.tsx src/features/sites/sites-page.test.tsx src/features/sites/sites-state.integration.test.tsx src/routes/-_app._org.sites.test.tsx`
    passes: 13 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `git diff --check` passes.
- Next pass candidate: audit members and invitations with populated invitation
  data, then bring member/invite rows and empty states up to the same tabbed,
  dense, outcome-based quality bar.

### 2026-05-15 00:31 IST - Job detail browser polish

- User direction update: keep the proposed site view as a tracked follow-up,
  but continue the active job detail work in-browser first.
- Used the in-app browser against the sandbox and created a real job,
  `Browser detail audit 1778800713868`, because the current synthetic account
  had an empty queue.
- Browser audit:
  - Desktop job detail opened at
    `/jobs/019e28c8-e265-71a9-b020-3a36ebd0cbb6` with `Details`,
    `Comments 0`, `Costs`, `Visits 0`, and `Activity 1`.
  - The internal detail panel scrolls independently: observed `scrollTop: 500`
    with no page-level horizontal overflow at `1159px`.
  - Mobile `390x844` kept body width at `390px` and allowed the tab rail to
    scroll horizontally, but the browser proof exposed a native horizontal
    scrollbar on the rail after swiping to `Activity`.
- Redesign outcome:
  - Added the missing shared `no-scrollbar` utility used elsewhere in the app.
  - Applied it to the shadcn/Base UI tab rail scroll wrappers on job detail,
    site detail, user settings, and organization settings so compact horizontal
    rails stay touch-scrollable without the chunky native scrollbar.
- Browser proof after implementation:
  - Mobile job detail at `390x844`: tab rail scrolls to `Activity 1`,
    `wrapperScrollLeft: 133`, `scrollbar-width: none`, no horizontal body
    overflow.
  - Desktop job detail at `1159x863`: tab cycling reached `Activity 1`; the
    visible panel showed "Members Audit created the job" and no horizontal body
    overflow.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-sheet.test.tsx --reporter=verbose`
    passes: 26 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.

### 2026-05-15 00:37 IST - Activity timeline filter density

- Continued with `impeccable craft` in product-register mode: Activity is an
  audit trail, so the layout should prioritize quick scanning and compact
  filtering over form-page spacing.
- Browser audit before implementation:
  - Desktop `/activity` showed a useful `Activity timeline` panel, but the
    filters occupied three rows at `1159px` before the user reached the audit
    trail.
  - Mobile `390x844` stacked the filters and timeline without horizontal
    overflow.
- Redesign outcome:
  - Tightened the Activity filter grid so owner/admin desktop widths use one
    compact toolbar row: actor, event type, date range, and job title.
  - Preserved the same labels, controls, URL-driven search behavior, active
    filter chips, empty states, and route access rules.
- Browser proof after implementation:
  - Desktop `/activity` at `1159x863`: all five filter controls share one
    row, the timeline starts at `top: 359`, and body width remains `1159px`.
  - Mobile `390x844`: filters still stack structurally, `Activity timeline`
    remains present, and body width stays at `390px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/activity/organization-activity-page.test.tsx src/routes/-_app._org.activity.test.tsx --reporter=verbose`
    passes: 17 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: revisit the remaining stale findings section and either
  retire resolved gaps or audit the command bar/hotkey surface end to end with
  the same browser-proof loop.

### 2026-05-15 00:45 IST - Command bar shortcut discoverability

- Continued with `impeccable craft` in product-register mode. The command
  surface is part of Ceird's product identity, so shortcut hints should be
  visible exactly where users decide which command to run.
- Browser audit before implementation:
  - Desktop `/jobs` command bar grouped the right route commands, saved views,
    filters, navigation, and settings.
  - The command bar already showed navigation shortcuts like `G H`, but
    route-level jobs commands did not expose the active page hotkeys:
    `Create job`, `Switch to list view`, and `Switch to map view` had no
    shortcut hints.
- Redesign outcome:
  - Added the existing registry shortcuts to the jobs command actions:
    `Create job` uses `N`, `Switch to list view` uses `V L`,
    `Switch to map view` uses `V M`, and `Clear job filters` uses `C` when it
    appears.
  - Preserved the same command groups, saved-view actions, filtering behavior,
    and route navigation.
- Browser proof after implementation:
  - Desktop `/jobs` at `1159x863`: command bar shows `Create job N`,
    `Switch to list view V L`, and `Switch to map view V M`; no horizontal
    body overflow.
  - Mobile `390x844`: the command drawer shows the same three shortcut hints
    and body width remains `390px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-page.test.tsx src/features/command-bar/command-bar.test.tsx src/features/command-bar/app-global-command-actions.test.tsx --reporter=verbose`
    passes: 27 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: update the stale Browser Findings section so resolved
  gaps are no longer listed as active, then use any remaining current gap as
  the next browser-proof target.

### 2026-05-15 00:31 IST - Jobs first-run action pass

- Continued with `impeccable craft` in product-register mode. The target was
  the first-run jobs empty state, not the populated queue that already has a
  stronger grouped structure.
- Source audit:
  - `EmailVerificationBanner` already has mobile-safe wrapping and a regression
    test for long email addresses, so the old mobile-overflow gap is no longer
    current.
  - Jobs first-run empty state still said to create the first job, but the
    empty panel itself did not include the action. The only `New job` affordance
    was up in the route header.
- Redesign outcome:
  - Added a direct `New job` action to the true first-run jobs empty state.
  - Kept filtered-empty focused on `Clear filters`.
  - Included the existing `N` shortcut hint on the empty-state action so the
    route hotkey remains discoverable in the moment it matters.
- TDD proof:
  - Updated the first-run jobs empty-state test first. The red run failed
    because there was only one `New job` link.
  - Implemented the empty-state action and reran the focused test green.
- Browser proof:
  - Created a fresh sandbox workspace and opened `/jobs` with no jobs.
  - Desktop `1159x863`: `No jobs yet.` is present, two `New job` links exist
    (header and empty panel), the empty panel contains `New job`, and body width
    stays `1159px`.
  - Mobile `390x844`: `No jobs yet.` is present, the empty panel contains
    `New job`, and body width stays `390px`.
  - The same mobile proof shows the email verification banner wrapping safely,
    with no horizontal overflow.
  - Saved screenshots:
    [jobs-empty-action-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/jobs-empty-action-desktop-proof.png)
    and
    [jobs-empty-action-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/jobs-empty-action-mobile-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/jobs/jobs-page.test.tsx`
    passes: 17 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-15 00:53 IST - Shortcut help active-scope ordering

- Continued the app-shell command/hotkey pass with the in-app browser.
- Browser audit before implementation:
  - `/jobs` shortcut help opened and listed the correct registered shortcuts.
  - The overlay used static group ordering, so `Navigation` filled the first
    viewport while the active page's `Jobs` shortcuts sat lower in the scroll
    area.
- Redesign outcome:
  - Changed shortcut-help grouping to prioritize active non-global scopes before
    global groups. On `/jobs`, `Jobs` now appears before `Navigation` and
    `Layout`; the same rule applies to `Sites`, `Members`, `Settings`, `Map`,
    and drawer scopes when they are active.
  - Preserved registration filtering, disabled-shortcut handling, group
    headings, keycap hints, and global fallback behavior.
- Browser proof after implementation:
  - Desktop `/jobs` at `1159x863`: shortcut help opens with headings `Jobs`,
    `Navigation`, `Layout`; the first visible group includes `Search jobs`,
    `Create job`, `Refresh jobs`, `List view`, `Map view`, and `Saved views`;
    no horizontal body overflow.
  - Mobile shortcut help still needs a separate entry-path audit: the mobile
    sidebar/`?` path was flaky in the browser runtime, so this run only
    verified the desktop overlay and automated ordering behavior.
- Verification:
  - `./node_modules/.bin/vitest run src/hotkeys/shortcut-help-overlay.test.tsx src/features/jobs/jobs-page.test.tsx src/components/site-header.test.tsx --reporter=verbose`
    passes: 33 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: audit mobile access to shortcut help from the app shell,
  then decide whether the header/sidebar needs a clearer touch path.

### 2026-05-15 00:34 IST - `/sites` stale coverage annotation repeated

- Received another in-app browser annotation targeting the old `Site coverage`
  block on `/sites`.
- Current source still matches the intended Linear-style simplification:
  `/sites` renders `Site directory` directly, with no separate top-level
  coverage summary block.
- Current test coverage already guards that decision:
  `sites-page.test.tsx` asserts no `site coverage` region in populated and
  empty states.
- Action for this run: refresh the running app/browser cache layers again,
  then verify with a focused sites test and live DOM proof before returning to
  the broader redesign goal.
- Refreshed stale layers:
  - Stopped `codex-linear-style-redesign`.
  - Deleted `apps/app/node_modules/.vite` and
    `apps/app/node_modules/.vite-temp`.
  - Deleted Codex Electron cache/code-cache/GPU cache directories for the
    `codex-browser-app` partition and top-level Codex app cache.
  - Restarted with `pnpm sandbox:up`.
- Browser proof after restart:
  - Empty `/sites`: `hasSiteCoverage: false`, `hasEmpty: true`, body width
    `1159px`.
  - Populated `/sites`: created `Docklands cache proof ...`;
    `Site directory`, the created row, `1 mapped / 1 total`, and `Mapped` are
    present; `hasSiteCoverage: false`, body width `1159px`.
  - Saved screenshots:
    [sites-cache-refresh-empty-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-cache-refresh-empty-proof.png)
    and
    [sites-cache-refresh-populated-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-cache-refresh-populated-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.

### 2026-05-15 00:41 IST - Mobile shortcut help access

- Continued with the Browser skill and `impeccable craft` guidance for the app
  shell: command and shortcut access is part of Ceird's product identity, so it
  needs a touch path as well as keyboard discovery.
- Browser audit before implementation:
  - Mobile `/jobs` at `390x844` had only `Toggle navigation` in the visible
    header and no direct `Keyboard shortcuts` button.
  - Opening the mobile navigation drawer did expose `Keyboard shortcuts`, so
    the feature existed, but it was one level deeper than the visible shell.
  - The first Browser attempt hit a crashed in-app tab. Cache deletion was
    attempted per the standing instruction, but the Codex browser cache
    directories were blocked by OS permissions in this sandbox. A fresh in-app
    tab recovered the workflow.
- Redesign outcome:
  - Added a compact mobile-only `Keyboard shortcuts` button to the app header,
    next to `Toggle navigation`.
  - Kept the desktop header clean: desktop still exposes shortcut help through
    the sidebar footer.
  - Added `registerHotkeys` to `ShortcutHelpOverlay` so only one mounted help
    surface owns the `?` shortcut at a time: sidebar on desktop, header on
    mobile.
- Browser proof after implementation:
  - Mobile `/jobs` at `390x844`: one visible `Keyboard shortcuts` header button
    at `40x40`, body width stayed `390px`.
  - Tapping it opened the shortcut help drawer; groups appeared as `Jobs`,
    `Navigation`, then `Layout`, and `Create job` was present.
  - Desktop `/jobs` at `1159x863`: no header shortcut button was present; the
    sidebar footer remained the single visible `Keyboard shortcuts` button.
- Verification:
  - `./node_modules/.bin/vitest run src/components/site-header.test.tsx src/components/app-sidebar.test.tsx src/hotkeys/shortcut-help-overlay.test.tsx --reporter=verbose`
    passes: 27 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.

### 2026-05-15 00:44 IST - Mobile shortcut intro hit-target fix

- Re-audited mobile `/jobs` after the direct header shortcut button existed.
- Browser finding:
  - The `Keyboard shortcuts` header button was present, but the first-run
    shortcut intro notice intercepted the tap in the hit-test stack.
  - Playwright could resolve the button, but click retries were blocked by the
    notice text `Keyboard shortcuts are available. Press ? anytime.`
- Fix:
  - Made the passive shortcut intro notice shell `pointer-events-none`.
  - Kept the `Got it` dismiss button `pointer-events-auto`, so the notice can
    still be dismissed intentionally.
- TDD proof:
  - Added a regression test first. The red run failed because the notice did
    not have `pointer-events-none`.
  - Implemented the pass-through shell and reran the focused test green.
- Browser proof after implementation:
  - Mobile `/jobs` at `390x844`: `Keyboard shortcuts` trigger is present,
    the intro notice is pass-through, tapping the trigger opens the dialog,
    and the dialog headings are `Jobs`, `Navigation`, `Layout`.
  - The dialog includes `Search jobs`, `Create job`, and the prompt
    `Press ? anytime`; body width remains `390px`.
  - Saved screenshot:
    [mobile-shortcut-help-jobs-proof.png](assets/2026-05-14-linear-style-app-redesign/mobile-shortcut-help-jobs-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/hotkeys/shortcut-help-overlay.test.tsx src/components/site-header.test.tsx`
    passes: 18 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-15 00:50 IST - Devtools source-injection hydration fix

- Revisited the repeated browser-console hydration warning that had been
  tracked in the findings section.
- Source trace:
  - The warning was tied to TanStack Devtools' Vite source-injection plugin,
    which adds `data-tsd-source` attributes to JSX in development.
  - The plugin source confirms `injectSource.enabled` controls that DOM
    attribute injection, while leaving the rest of the Devtools plugin
    available.
- Fix:
  - Added a Vite config regression test that finds the
    `@tanstack/devtools:inject-source` sub-plugin and asserts it does not apply
    in development.
  - Configured `devtools(defineDevtoolsConfig({ injectSource: { enabled:
false } }))` so the app keeps Devtools behavior without injecting DOM
    source attributes into SSR/client markup.
- TDD proof:
  - First config test run failed correctly because the source-injection plugin
    still applied in development.
  - After the config change, `src/vite-config.test.ts` passes.
- Browser proof after restarting the sandbox and clearing Vite cache:
  - `/organization/settings` at `1159x863`: `sourceAttributeCount: 0`, no
    hydration mismatch console messages, `Organization settings` and `Labels`
    remain present, and body width stays `1159px`.
  - Saved screenshot:
    [devtools-source-injection-disabled-proof.png](assets/2026-05-14-linear-style-app-redesign/devtools-source-injection-disabled-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/vite-config.test.ts` passes.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-15 00:51 IST - Members invitation row density

- Continued the members/admin pass with the persisted
  [settings-admin-mobile-reference.png](assets/2026-05-14-linear-style-app-redesign/settings-admin-mobile-reference.png)
  open as the visual reference. The relevant pattern was compact admin rows
  with counts and a single row action, not exposed button piles.
- Browser audit before implementation:
  - Seeded a members workspace with three pending invitations, including one
    long construction-company email address.
  - Desktop `/members` showed `Current members` and `Pending invitations`
    correctly, with no horizontal overflow at `1159px`.
  - Mobile `/members` at `390x844` also had no horizontal overflow, but every
    pending invitation row exposed separate `Resend` and `Cancel` text buttons,
    making the invitation-heavy list taller and less like the generated admin
    reference.
- Redesign outcome:
  - Collapsed each pending invitation row into one icon action button:
    `Invitation actions for <email>`.
  - Moved `Resend invitation` and `Cancel invitation` into a dropdown menu,
    matching the current member row action pattern and the generated reference
    direction.
  - Preserved resend/cancel mutation behavior, loading state, errors, success
    messages, long-email wrapping, and active organization safeguards.
- Browser proof after implementation:
  - Fresh browser proof workspace:
    `Members Proof Works 1778802659797`, with three pending invitations.
  - Mobile `/members` at `390x844`: `Pending invitations` and `3 open` are
    present; there are three `Invitation actions for ...` buttons, zero direct
    `Resend invitation to ...` / `Cancel invitation to ...` row buttons, and
    body width stayed `390px`.
  - Opening the first invitation action menu exposed `Resend invitation` and
    `Cancel invitation`.
  - Desktop `/members` at `1159x863`: `Pending invitations` and `3 open` are
    present; three invitation action buttons are present; direct resend/cancel
    row buttons are absent; body width stayed `1159px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/organizations/organization-members-page.test.tsx --reporter=verbose`
    passes: 37 tests.
  - `./node_modules/.bin/vitest run src/vite-config.test.ts src/features/organizations/organization-members-page.test.tsx --reporter=verbose`
    passes: 38 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Adjacent cleanup:
  - App type-check exposed a test-only type issue in
    `apps/app/src/vite-config.test.ts` around flattening Vite plugin options.
    The test helper now narrows actual plugin objects instead of assuming every
    plugin option is synchronously flattenable.

### 2026-05-15 00:53 IST - Organization settings header distillation

- Reopened the persisted
  [settings-admin-mobile-reference.png](assets/2026-05-14-linear-style-app-redesign/settings-admin-mobile-reference.png)
  as the visual reference for the admin settings pass.
- Browser audit before implementation:
  - `/organization/settings` still rendered an `Organization` eyebrow and the
    long description `Keep the workspace identity, labels, service coverage,
and billing defaults ready for field operations.`
  - The saved reference and the already-updated `/settings` route both point
    to a cleaner structure: title, direct tabs, then the admin modules.
- Redesign outcome:
  - Removed the redundant organization-settings eyebrow and long header copy.
  - Removed the extra page-header bottom border for this route, matching the
    user-settings treatment and letting the tab rule carry the section
    structure.
  - Preserved the direct feature tabs: `General`, `Labels`, `Service areas`,
    and `Rate card`.
- TDD proof:
  - Added assertions first that the eyebrow and long description are absent.
  - Red run failed because the `Organization` eyebrow was still rendered.
  - Implemented the header cleanup and reran the focused test green.
- Browser proof after implementation:
  - Desktop `/organization/settings` at `1159x863`: title is present, eyebrow
    and long description are absent, tabs are intact, body width stays
    `1159px`.
  - Mobile `390x844`: same title/tabs/no-eyebrow/no-description state, body
    width stays `390px`.
  - Saved screenshots:
    [organization-settings-header-clean-desktop-proof.png](assets/2026-05-14-linear-style-app-redesign/organization-settings-header-clean-desktop-proof.png)
    and
    [organization-settings-header-clean-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/organization-settings-header-clean-mobile-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/organizations/organization-settings-page.test.tsx`
    passes: 16 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.

### 2026-05-15 00:58 IST - Organization labels action density

- Continued the admin settings pass with the persisted
  [settings-admin-mobile-reference.png](assets/2026-05-14-linear-style-app-redesign/settings-admin-mobile-reference.png)
  as the visual reference. The applied pattern is the same one used for member
  invitations: compact admin rows with one row action menu instead of exposed
  action clusters.
- Browser audit before implementation:
  - `/organization/settings` Labels tab had the right create/edit/archive
    capability, but populated label rows exposed separate edit and archive icon
    buttons.
  - Created real labels through the browser in the proof workspace so the
    populated state could be verified against live UI rather than fixture
    assumptions.
- Redesign outcome:
  - Collapsed each non-editing label row into one icon action button:
    `Label actions for <name>`.
  - Moved `Edit label` and `Archive label` into a dropdown menu while
    preserving inline edit mode, save/cancel behavior, archive behavior, and
    existing mutation safeguards.
- Browser proof after implementation:
  - Desktop `/organization/settings` at `1159x863`: created
    `Plumbing 1778802958154` and `Electrical 1778802958154`; two label action
    buttons were present, direct `Edit <name>` / `Archive <name>` row buttons
    were absent, and body width stayed `1159px`.
  - Opening the first label action menu exposed `Edit label` and
    `Archive label`.
  - Mobile `/organization/settings` at `390x844`: the Labels panel remained in
    viewport, two 32px row action buttons were present, direct edit/archive row
    buttons were absent, and body width stayed `390px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/organizations/organization-settings-page.test.tsx --reporter=verbose`
    passes: 16 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.

### 2026-05-15 01:08 IST - Job detail browser continuation

- Followed the latest instruction to keep using the in-app browser. The
  canonical sandbox alias initially returned the portless 404 page, and the
  loopback fallback could render the app but could not complete auth because
  the API origin was not reachable from that browser origin.
- Cache/runtime recovery:
  - Stopped `codex-linear-style-redesign`.
  - Cleared the app Vite caches at `apps/app/node_modules/.vite` and
    `apps/app/node_modules/.vite-temp` using the local runtime because direct
    shell removal was blocked.
  - Restarted the sandbox; it returned to `ready` with the canonical app URL
    `https://codex-linear-style-redesign.app.ceird.localhost:1355`.
  - Browser proof after restart showed zero `data-tsd-source` attributes in the
    live document, confirming the old Devtools source-injection cache was gone.
- Browser proof:
  - Signed up `job-detail-1778803206196@example.com`, created
    `Job Detail Works 1778803206196`, skipped invites, and created the real job
    `Replace relay 1778803206196` through the UI.
  - Desktop job detail at `1159x863`: the right drawer opened with `Details`,
    `Comments 0`, `Costs`, `Visits 0`, and `Activity 1` tabs; the accessible
    drawer description was `sr-only` with a 1px rect; the drawer width was
    `672px`; body and document scroll width stayed `1159px`.
  - Desktop tab proof: selected `Activity 1`; the visible panel showed
    `Activity`, `System activity stays separate from narrative comments.`, and
    the created-job audit event.
  - Mobile job detail at `390x844`: the tab rail scrolled horizontally without
    widening the document; body and document scroll width stayed `390px`.
  - Mobile tab proof: horizontally scrolled the tab rail and selected
    `Activity 1`; the visible panel showed the activity event and the
    accessible description remained `sr-only`.
- Verification:
  - `git diff --check` passes.
- Next pass candidate stays the same: implement the stronger site detail view
  after the job-detail pass, with map, labels, details, notes, and associated
  jobs, using the persisted jobs/sites reference image and `impeccable craft`.

### 2026-05-15 01:03 IST - `/sites` stale coverage cache refresh

- Received another in-app browser annotation targeting the old `Site coverage`
  block on `/sites`.
- Source and regression status:
  - `apps/app/src/features/sites/sites-page.tsx` still renders the site
    directory or empty state directly, with no top-level `Site coverage`
    section.
  - `apps/app/src/features/sites/sites-page.test.tsx` still asserts the
    coverage region is absent in both populated and empty states.
- Cleared the stale layers again:
  - Deleted `apps/app/node_modules/.vite` and `.vite-temp`.
  - Deleted the Codex in-app browser partition cache/code-cache/GPU/WebGPU
    cache directories under
    `~/Library/Application Support/Codex/Partitions/codex-browser-app/`.
  - Deleted matching top-level Codex Electron cache directories.
  - Restarted `codex-linear-style-redesign` with `pnpm sandbox:down` then
    `pnpm sandbox:up`.
- Browser proof after restart:
  - Empty `/sites`: `hasSiteCoverage: false`, empty state present.
  - Populated `/sites`: created `Docklands 0727701b`; `Site directory`, the
    created row, `1 mapped / 1 total`, and mapped state are present;
    `hasSiteCoverage: false`, body width `1159px`.
  - Saved screenshots:
    [sites-stale-cache-empty-proof-latest.png](assets/2026-05-14-linear-style-app-redesign/sites-stale-cache-empty-proof-latest.png)
    and
    [sites-stale-cache-populated-proof-latest.png](assets/2026-05-14-linear-style-app-redesign/sites-stale-cache-populated-proof-latest.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/sites/sites-page.test.tsx`
    passes: 6 tests.

### 2026-05-15 01:12 IST - Home dashboard primary actions

- Continued the dashboard/home pass with `impeccable craft` in product-register
  mode, using the persisted
  [dashboard-home-reference.png](assets/2026-05-14-linear-style-app-redesign/dashboard-home-reference.png)
  as the visual reference.
- Browser audit before implementation:
  - Fresh synthetic organization home had the dashboard modules, first-run
    action links, and no horizontal overflow at `1159px`.
  - The top action area still led with `Open jobs`, while the generated
    reference treats home as an operational dashboard with direct `New job` and
    `Invite teammate` actions.
  - Saved before screenshot:
    [home-dashboard-before-primary-actions.png](assets/2026-05-14-linear-style-app-redesign/home-dashboard-before-primary-actions.png).
- Redesign outcome:
  - Replaced the home header `Open jobs` action with `Invite teammate` and
    `New job`, matching the generated dashboard direction.
  - Added a home-scoped `N` shortcut for `New job` and included the shortcut
    hint in the button.
  - Added the `home` shortcut scope so shortcut help can show home-specific
    actions when the organization home route is active.
- Browser proof after implementation:
  - Desktop `/` at `1159x863`: `Invite teammate` links to `/members`, `New job`
    links to `/jobs/new`, `Open jobs` is absent from the page header,
    `Workspace overview` remains present, and body width stays `1159px`.
  - Pressing `N` from home navigates to `/jobs/new`.
  - Mobile `390x844`: both header actions remain visible and document/body
    width stay `390px`.
  - Saved screenshots:
    [home-dashboard-primary-actions-proof.png](assets/2026-05-14-linear-style-app-redesign/home-dashboard-primary-actions-proof.png),
    [home-dashboard-new-job-hotkey-proof.png](assets/2026-05-14-linear-style-app-redesign/home-dashboard-new-job-hotkey-proof.png),
    and
    [home-dashboard-primary-actions-mobile-proof.png](assets/2026-05-14-linear-style-app-redesign/home-dashboard-primary-actions-mobile-proof.png).
- Verification:
  - `pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx src/hotkeys/active-shortcut-scopes.test.ts`
    passes: 8 tests.
  - `pnpm --filter app exec vitest run src/hotkeys/shortcut-help-overlay.test.tsx`
    passes: 8 tests.
  - `pnpm --filter app exec tsc --noEmit --pretty false` passes.
  - `git diff --check` passes.

### 2026-05-15 01:14 IST - Site detail view pass

- Continued the jobs/sites pass using the persisted
  [jobs-sites-reference.png](assets/2026-05-14-linear-style-app-redesign/jobs-sites-reference.png)
  as the visual contract: list context plus a dense right-side detail surface
  with map, operational tabs, and associated work.
- Browser audit before implementation:
  - Created `Docklands Site 1778803627984` through `/sites/new`.
  - The site drawer already had a useful `Details`, `Edit`, and `Jobs` tab
    structure with map preview and related-job loading, but access notes were
    still folded into the details panel and the jobs panel read as a generic
    related list.
- Redesign outcome:
  - Promoted site notes to a first-class `Notes` tab so dispatch instructions
    are not buried inside location details.
  - Reordered the site drawer tabs to `Details`, `Notes`, `Jobs`, and `Edit`,
    keeping edit actions available without making the editable form the primary
    read surface.
  - Tightened the jobs panel into `Associated jobs`, including a linked job
    count and dense job rows with status, priority, and updated date.
  - Preserved the existing map preview, Google Maps link, editable site fields,
    update mutation, not-found state, and permission gating.
- Browser proof after implementation:
  - Created `Boiler follow-up 1778803627984` through `/jobs/new` and selected
    `Docklands Site 1778803627984` from the real site picker.
  - Desktop `/sites/$siteId` at `1159x863`: drawer showed `Details`, `Notes`,
    `Jobs 1`, and `Edit`; `Notes` selected cleanly and showed the access note
    `Use the quay entrance beside the loading bay.`; `Jobs 1` selected cleanly
    and showed `Associated jobs`, `1 job linked`, and the linked job row; body
    and document scroll width stayed `1159px`.
  - Mobile `/sites/$siteId` at `390x844`: drawer width stayed `390px`, the tab
    rail fit inside the viewport, `Jobs 1` selected cleanly, the associated job
    row remained visible, and body/document scroll width stayed `390px`.
  - The live document had zero `data-tsd-source` attributes during the proof.
- Verification:
  - `./node_modules/.bin/vitest run src/features/sites/sites-detail-sheet.test.tsx --reporter=verbose`
    passes: 1 test.
  - `./node_modules/.bin/vitest run src/features/sites/sites-detail-sheet.test.tsx src/features/sites/sites-page.test.tsx src/routes/-_app._org.sites.test.tsx --reporter=verbose`
    passes: 11 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.

### 2026-05-15 01:24 IST - Organization settings admin modules

- Continued the organization settings pass with `impeccable craft`, using the
  persisted
  [settings-admin-mobile-reference.png](assets/2026-05-14-linear-style-app-redesign/settings-admin-mobile-reference.png)
  as the admin visual contract: compact feature tabs, dense rows, ellipsis row
  actions, and little explanatory copy.
- Browser audit before implementation:
  - The in-app browser first hit the stale portless route again. Cleared
    `apps/app/node_modules/.vite` and `.vite-temp`, then restarted the
    `codex-linear-style-redesign` sandbox with `pnpm sandbox:down` and
    `pnpm sandbox:up`.
  - On the real `/organization/settings` route, service areas still showed an
    exposed `Edit <area>` row button, and the rate-card tab repeated generic
    helper copy plus verbose visible labels such as `Kind for line 1`.
- Redesign outcome:
  - Service-area rows now use the same compact ellipsis action-menu pattern as
    labels and member invitations.
  - Service-area create and list surfaces now sit in tighter bordered admin
    rows, matching the generated settings reference more closely.
  - Rate card now has a compact `Standard rates` toolbar with line count,
    `Add line`, and `Save rate card`; the old explanatory copy was removed.
  - Rate-card line controls keep precise accessible names (`Name for line 1`,
    `Value for line 1`, etc.) while showing shorter visible labels (`Name`,
    `Value`, `Unit`) to reduce mobile height.
- Browser proof after implementation:
  - Created throwaway account `admin-pass-1778804545626@example.com` and
    organization `Admin Pass Works 1778804569775` after the sandbox restart.
  - Mobile `/organization/settings` at `390x844`: created service area
    `Dublin City`; row action button `Service area actions for Dublin City`
    opened a menu with `Edit service area`; direct `Edit Dublin City` text was
    absent; body/document scroll width stayed `390px`.
  - Mobile rate-card proof at `390x844`: added one `Labour` line; visible text
    showed `Standard rates`, `1 line`, `Kind`, `Name`, `Value`, and `Unit`;
    old copy `One editable standard card...` and verbose visible line labels
    were absent; body/document scroll width stayed `390px`.
  - The live document had zero `data-tsd-source` attributes during the proof.
- Verification:
  - `./node_modules/.bin/vitest run src/features/organizations/organization-service-areas-section.test.tsx src/features/organizations/organization-rate-card-section.test.tsx --reporter=verbose`
    passes: 14 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.

### 2026-05-15 01:32 IST - Populated home mobile density pass

- Continued the dashboard/home pass with `impeccable craft`, using the
  persisted
  [dashboard-home-reference.png](assets/2026-05-14-linear-style-app-redesign/dashboard-home-reference.png)
  as the visual reference for an operational home surface with live jobs,
  sites, next actions, and recent activity.
- Browser audit before implementation:
  - Used the in-app browser to create real populated state in the restarted
    sandbox:
    - Site: `Harbour Yard 1778804880890`.
    - Job: `Boiler repair 1778804922237`, high priority and attached to that
      site.
  - Mobile `/` at `390x844` showed the live home data, but the jobs/sites
    tables clipped row content inside their panels. Document width stayed
    `390px`, so this was a component density/readability problem rather than a
    page overflow problem.
- Redesign outcome:
  - Replaced the home jobs/sites table rendering with one responsive
    table-rhythm row system.
  - Desktop keeps the dense column header rhythm through grid headers.
  - Mobile stacks each job and site row into labelled operational facts, so
    long titles, site names, addresses, assignee, status, and updated time stay
    readable without horizontal scrolling.
  - Kept the existing route links, live dashboard data, next-action logic,
    activity feed, and home `N` shortcut behavior intact.
- Browser proof after implementation:
  - Mobile `/` at `390x844`: `Boiler repair 1778804922237`, `Harbour Yard
1778804880890`, `Review priority work`, `Recent activity`, and labelled
    mobile facts (`Site`, `Assignee`, `Updated`, `Active jobs`, `Address`) were
    visible.
  - Body/document scroll width stayed `390px`.
  - The live document had zero `data-tsd-source` attributes during the proof.
- Verification:
  - `./node_modules/.bin/vitest run src/features/auth/authenticated-shell-home.test.tsx src/routes/-_app._org.index.test.tsx --reporter=verbose`
    passes: 9 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.

### 2026-05-15 01:36 IST - `/sites` in-app browser cache clear

- Received another in-app browser annotation targeting the old `Site coverage`
  block on `/sites`.
- Verified source first:
  - `apps/app/src/features/sites/sites-page.tsx` still has no `Site coverage`
    region and renders the directory or empty state directly.
  - `apps/app/src/features/sites/sites-page.test.tsx` still asserts the old
    coverage region is absent in populated and empty states.
- Cleared only generated cache/runtime layers:
  - Stopped `codex-linear-style-redesign` with `pnpm sandbox:down`.
  - Deleted `apps/app/node_modules/.vite` and `.vite-temp`.
  - Deleted the Codex in-app browser partition cache/code-cache/GPU/WebGPU
    cache directories under
    `~/Library/Application Support/Codex/Partitions/codex-browser-app/`.
  - Deleted matching top-level Codex Electron cache directories.
  - Restarted the sandbox with `pnpm sandbox:up`; it returned to ready at
    `https://codex-linear-style-redesign.app.ceird.localhost:1355`.
- Browser proof after restart:
  - Seeded a fresh authenticated organization via the real API session cookie
    and opened `/sites` at `1159x863`; `Site coverage` count was `0` and the
    empty state was visible.
  - Created `Docklands Cache 1778805124915` through the API, reopened `/sites`
    in a fresh authenticated browser context, and confirmed `Site coverage`
    count stayed `0`; `Site directory`, the created site row, and
    `1 mapped / 1 total` were visible.
  - Body/document scroll width stayed `1159px`; the live document had zero
    `data-tsd-source` attributes.
  - Saved screenshots:
    [sites-cache-cleared-empty-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-cache-cleared-empty-proof.png)
    and
    [sites-cache-cleared-populated-proof.png](assets/2026-05-14-linear-style-app-redesign/sites-cache-cleared-populated-proof.png).

### 2026-05-15 02:45 IST - Jobs status rail correction

- Continued the populated jobs/sites pass with the generated
  `jobs-sites-reference.png` open as the visual contract. The useful reference
  move is the compact, actionable status row above the queue, not a static
  metric overview.
- Browser finding before the patch:
  - Mobile `/jobs` at `390x844` had no horizontal overflow, but the first
    useful work list was pushed down by the static `Active queue` overview
    strip.
  - The route still had good job mechanics: saved views, filters, map/list
    switch, hotkeys, and grouped rows.
- Redesign outcome:
  - Removed the static `Jobs overview` status strip from `/jobs`.
  - Added an actionable `Job status views` rail inside the page header with
    `Active`, `All jobs`, `New`, `Triaged`, `In progress`, `Blocked`,
    `Completed`, and `Canceled` counts.
  - Kept the existing status dropdown for compact filter parity while making
    the most common status changes visible like the generated reference.
  - Removed the redundant `Grouped by current status for fast triage.` queue
    description.
  - Added explicit accessible names such as `Active 1` and `All jobs 1` so the
    compact count chips do not collapse into unreadable names.
- Browser proof after implementation:
  - `/jobs` at `390x844`: `Job status views` is present; `Active 1` is
    selected; `Job queue` and the real job row are visible.
  - The old `ACTIVE QUEUE` and `Jobs overview` text are absent.
  - The redundant queue description is absent.
  - Body/document width stayed at `390px`; `data-tsd-source` marker count
    stayed `0`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 17 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: continue the jobs/sites reference pass on `/sites` with
  populated data and then return to richer dashboard volume testing.

### 2026-05-15 06:00 IST - Sites directory copy distillation

- Continued the populated `/sites` pass against the generated
  `jobs-sites-reference.png`. The reference keeps the work surface direct:
  compact header, action, list/table, and metadata that earns its space.
- Browser finding before the patch:
  - Desktop `/sites` had already removed the old `Site coverage` block.
  - The page still spent space on two explanatory lines:
    `Keep job locations, service areas, and map readiness in one operational directory.`
    and `Addresses, service areas, and map readiness for active work.`
- Redesign outcome:
  - Removed the page-header description from `/sites`.
  - Removed the `Site directory` panel description.
  - Kept the useful directory count and map-readiness summary as compact
    metadata: `1` and `1 mapped / 1 total`.
  - Added regression assertions so the redundant descriptions stay absent.
- Browser proof after implementation:
  - Default desktop `/sites`: `Site directory`, `1 mapped / 1 total`, and the
    real `Harbour Yard ...` row are visible.
  - Mobile `390x844` `/sites`: the same directory and row are visible, with
    body/document width staying at `390px`.
  - `Site coverage`, both redundant descriptions, and `data-tsd-source`
    markers are absent.
- Verification:
  - `./node_modules/.bin/vitest run src/features/sites/sites-page.test.tsx --reporter=verbose`
    passes: 6 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: use the jobs/sites reference on a higher-volume
  populated data set, or continue into the dashboard/activity surfaces that
  still need richer volume checks.

### 2026-05-15 06:06 IST - Sites mobile directory density

- Continued the `/sites` pass with the generated `jobs-sites-reference.png` as
  the reference for dense list/table rhythm.
- Browser finding before the patch:
  - Mobile `/sites` at `390x844` reported no document overflow, but the table
    itself measured `730px` wide inside the clipped directory panel.
  - The address and map columns sat off-screen at x positions beyond the
    viewport, so the page looked stable while hiding useful content.
- Redesign outcome:
  - Kept the desktop table for wide viewports.
  - Added a real mobile `Sites mobile directory` row-list with site name,
    address, map readiness, and service-area metadata in one tappable row.
  - Reused the existing site route link, map badge logic, route hotkey, command
    actions, and directory count.
- Browser proof after implementation:
  - Mobile `390x844`: the mobile list displays as a `362px` wide row, the first
    site link is `362px` wide with no horizontal overflow, and address plus
    `Mapped` are visible in the row.
  - Desktop `1280x844`: the mobile list is hidden, the table is visible at
    `972px` wide, and the site row/address/map state remain visible.
  - `Site coverage` is still absent and `data-tsd-source` markers stayed `0`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/sites/sites-page.test.tsx --reporter=verbose`
    passes: 6 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: move to higher-volume jobs/sites data or continue the
  dashboard/activity surfaces with the generated dashboard reference.

### 2026-05-15 06:08 IST - Activity timeline copy distillation

- Continued the dashboard/activity pass using the generated
  `dashboard-home-reference.png` as the density reference. The relevant move is
  compact operational activity, not extra explanatory copy around the feed.
- Browser finding before the patch:
  - `/activity` showed filters, a populated timeline row, and the event count.
  - The `Activity timeline` panel repeated itself with `Audit trail for job
changes, visits, labels, and costs.`
- Redesign outcome:
  - Removed the redundant activity timeline description.
  - Preserved actor/event/date/job filters, active filter chips, clear filters,
    count metadata, empty states, and job links.
  - Added a regression assertion that the removed description stays absent.
- Browser proof after implementation:
  - Desktop `1280x844` `/activity`: filters, `Activity timeline`, `1 event
shown`, and the real job activity row are visible.
  - The redundant timeline description is absent.
  - The filters and timeline rows have no horizontal overflow, and
    `data-tsd-source` marker count stayed `0`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/activity/organization-activity-page.test.tsx --reporter=verbose`
    passes: 10 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: inspect `/activity` on a narrow viewport with a richer
  activity set, or move to remaining first-run/empty-state passes.

### 2026-05-15 06:11 IST - Members section copy distillation

- Continued the mapped-route audit on `/members`, using the same product UI
  standard applied to settings, jobs, sites, and activity: headings, counts,
  rows, and actions should carry the surface before helper copy does.
- Browser finding before the patch:
  - Mobile `/members` at `390x844` had no horizontal overflow and no old
    member-access overview block.
  - The route still showed `Owners, admins, teammates, and external
collaborators with active access.` under `Current members`, repeating the
    heading and row content.
- Redesign outcome:
  - Removed the redundant `Current members` description.
  - Removed the matching `Pending invitations` helper sentence from source.
  - Preserved invite action, count badges, row actions, loading/error states,
    command actions, and hotkeys.
  - Added regression assertions that those helper lines stay absent.
- Browser proof after implementation:
  - Mobile `390x844` `/members`: `Members`, `Invite teammate`, and `Current
members` remain visible.
  - The old overview text and both section helper descriptions are absent.
  - The current members section is `364px` wide with no horizontal overflow;
    body/document width stayed `390px`; `data-tsd-source` marker count stayed
    `0`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/organizations/organization-members-page.test.tsx --reporter=verbose`
    passes: 37 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: continue empty-state/mobile checks on remaining admin
  surfaces or inspect richer activity volume.

### 2026-05-15 06:14 IST - Activity mobile filter density

- Continued the `/activity` mobile audit after the desktop copy pass.
- Browser finding before the patch:
  - Mobile `390x844` had no horizontal overflow, but the filter block consumed
    `338px` of height and pushed the timeline to `y=643`.
  - The route was technically responsive but too tall before the user reached
    the actual activity feed.
- Redesign outcome:
  - Changed the activity filter grid to two columns by default.
  - Kept `Job title` full-width on mobile and restored the existing five-column
    layout on large screens.
  - Preserved actor, event, date, job-title filtering, active filter chips,
    empty states, and timeline rows.
- Browser proof after implementation:
  - Mobile `390x844`: filter controls are `176px / 176px / 176px / 176px /
364px` wide with no internal overflow.
  - The filter block height dropped from `338px` to `198px`.
  - The timeline moved from `y=643` to `y=503`, and the first row moved from
    `y=709` to `y=569`.
  - Body/document width stayed `390px`; `data-tsd-source` marker count stayed
    `0`; the redundant timeline description remains absent.
  - A viewport reset was completed after browser proof.
- Verification:
  - `./node_modules/.bin/vitest run src/features/activity/organization-activity-page.test.tsx --reporter=verbose`
    passes: 10 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue first-run/empty-state passes or inspect
  higher-volume activity/jobs data.

### 2026-05-15 06:23 IST - Home dashboard reference alignment

- Continued the populated home/dashboard pass using the persisted
  `dashboard-home-reference.png` as the visual reference.
- Browser finding before the patch:
  - At the active desktop browser width (`1159x863`), the home page had the
    right modules but still rendered them as one long column because the
    dashboard split waited until `xl`.
  - The bottom `Workspace shortcuts` strip repeated product guidance that is
    already carried by visible route actions, hotkey hints, and the sidebar
    shortcut entry.
- Redesign outcome:
  - Changed the dashboard module layout to split at `lg` with a compact
    right-hand rail, while preserving the larger `xl` rail from the previous
    pass.
  - Removed the bottom explanatory shortcut strip.
  - Distilled next-action descriptions and moved the category labels into the
    row body so the right rail reads like the generated dashboard reference
    instead of a form-heavy list.
  - Kept mobile structurally stacked, with compact horizontal next-action rows
    to avoid unnecessary vertical growth.
- Browser proof after implementation:
  - Desktop `1159x863`: dashboard modules are `853px` wide; jobs/sites occupy a
    `549px` left column and next actions/recent activity occupy a `288px`
    right rail.
  - The next-actions panel height dropped from `753px` before copy distillation
    to `310px`; recent activity now fits in the first desktop viewport.
  - Page document height dropped from `1324px` to `881px`; body/document width
    stayed `1159px`; `data-tsd-source` marker count stayed `0`.
  - Mobile `390x844`: modules remain stacked, next actions follow sites, the
    compact next-action panel is `294px` tall, body/document width stays
    `390px`, and there is no horizontal overflow.
- Verification:
  - `./node_modules/.bin/vitest run src/features/auth/authenticated-shell-home.test.tsx --reporter=verbose`
    passes: 4 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue populated jobs/sites volume checks with the
  persisted `jobs-sites-reference.png`, or inspect remaining empty states for
  action/context gaps.

### 2026-05-15 06:26 IST - Jobs queue reference alignment

- Continued the jobs/sites family pass using the persisted
  `jobs-sites-reference.png` as the visual reference.
- Browser finding before the patch:
  - `/jobs` had the right core structure: compact route header, list/map
    toggle, saved view, filter row, status views, grouped queue, and table/row
    layouts.
  - The route still inserted a separate `Job queue` title/count between status
    views and the grouped queue. The generated reference moves directly from
    status tabs into the work rows, with group headings and counts carrying the
    context.
- Redesign outcome:
  - Removed the extra `Job queue` panel header.
  - Preserved status view counts, grouped status headings, table rows, mobile
    rows, filters, map/list switching, saved views, and empty/filter states.
  - Added a regression assertion that the queue panel no longer contains the
    removed title.
- Browser proof after implementation:
  - Desktop `1159x863`: status views remain `853px` wide, the queue begins
    directly below them at `y=474`, the first status group starts at `y=475`,
    and the queue height is `102px` for the current one-job data set.
  - Mobile `390x844`: status views remain horizontally scrollable by design,
    the queue starts below them at `y=478`, the first group starts at `y=479`,
    and the queue height is `154px`.
  - Body/document widths stayed `1159px` desktop and `390px` mobile;
    `data-tsd-source` marker count stayed `0`; `Job queue` and `Jobs overview`
    are absent.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 17 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: inspect `/sites` against the same jobs/sites reference,
  especially populated mobile density and direct row-to-detail flow.

### 2026-05-15 06:31 IST - Site detail copy distillation

- Continued the sites pass using the persisted `jobs-sites-reference.png` as
  the feature-family reference.
- Browser finding before the patch:
  - `/sites` itself remains healthy: desktop uses the table, mobile uses the
    dedicated row list, `Site coverage` is absent, and body/document width
    stays stable at both desktop and mobile sizes.
  - Opening the populated site row reaches the detail sheet with `Details`,
    `Notes`, `Jobs 1`, and `Edit` tabs, and the Jobs tab contains the linked
    `Boiler repair` job.
  - The site detail panels still carried helper sentences below already-clear
    headings: location summary, site notes, and associated jobs.
- Redesign outcome:
  - Removed the redundant visible helper copy from `Location summary`,
    `Site notes`, and `Associated jobs`.
  - Preserved the site detail tabs, badges, address fields, map preview,
    Google Maps link, empty notes state, associated jobs list, and edit form.
  - Added regression assertions that the removed helper copy stays absent.
- Browser proof after implementation:
  - Desktop `1159x863`: clicking the site row opens the detail sheet, tabs show
    `Details`, `Notes`, `Jobs 1`, and `Edit`, and the details panel is `656px`
    wide with no visual horizontal overflow.
  - Mobile `390x844`: clicking the same site row opens the bottom drawer,
    dialog width is `390px`, details panel width is `374px`, body/document
    width stays `390px`, and the removed helper copy is absent.
  - `data-tsd-source` marker count stayed `0`.
  - Browser control hit a stale CDP timeout once during proof; the browser
    automation connection was reset and the proof succeeded on retry.
- Verification:
  - `./node_modules/.bin/vitest run src/features/sites/sites-detail-sheet.test.tsx src/features/sites/sites-page.test.tsx --reporter=verbose`
    passes: 7 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue site detail proof on direct deep-link reloads
  and richer related-job data, or move to remaining first-run/empty states.

### 2026-05-15 06:44 IST - Route drawer direct-link proof

- Continued the site detail deep-link pass from the previous candidate.
- Browser finding before the patch:
  - Direct navigation to
    `/sites/019e2908-78fd-72a6-a804-62c7d17cf621` mounted the detail content
    and tabs, but Vaul left the desktop right drawer at `x=1159` with a
    `translateX(672px)` transform, exactly off the right edge of the `1159px`
    viewport.
  - The same direct link on mobile mounted the bottom drawer content, but left
    it translated below the `390x844` viewport.
- Redesign/behavior outcome:
  - Added route-owned drawer classes for initially-open route drawers.
  - Added a scoped CSS guard so route drawers opened from URL state resolve to
    `translate3d(0, 0, 0)` instead of remaining at Vaul's off-canvas animation
    keyframe.
  - Applied the guard to job detail, site detail, job creation, and mobile site
    creation route drawers without changing centered desktop creation drawer
    positioning.
- Browser proof after implementation:
  - Desktop direct site detail: drawer direction `right`, dialog `x=608` in a
    `1280x720` viewport, transform `matrix(1, 0, 0, 1, 0, 0)`, tabs
    `Details`, `Notes`, `Jobs 1`, `Edit`, and `data-tsd-source` count `0`.
  - Mobile direct site detail at `390x844`: drawer direction `bottom`, dialog
    `x=0`, `y=169`, width `390px`, transform
    `matrix(1, 0, 0, 1, 0, 0)`, tabs intact, and body/document width stayed
    `390px`.
  - Direct job detail was also checked from the live job link; the right drawer
    opened at `x=487`, transform `matrix(1, 0, 0, 1, 0, 0)`, and the job title
    was visible.
- Verification:
  - `./node_modules/.bin/vitest run src/components/ui/responsive-drawer.test.tsx src/features/sites/sites-detail-sheet.test.tsx src/features/sites/sites-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/jobs/jobs-create-sheet.test.tsx --reporter=verbose`
    passes: 50 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue richer jobs/sites data checks, or move to
  remaining first-run/empty states.

### 2026-05-15 06:54 IST - Shared map preview copy distillation

- Continued the jobs/sites detail pass using the persisted
  `jobs-sites-reference.png` feature-family reference.
- Browser/design finding before the patch:
  - The job and site detail panels had already been stripped back, but their
    shared map preview still carried a redundant helper sentence:
    `A quick visual check before you open navigation.`
  - The map title, Google Maps action, marker, and coordinate-required fallback
    were the useful parts of the surface.
- Redesign outcome:
  - Removed the redundant helper copy from the shared map preview component.
  - Preserved the `Map preview` label, map canvas, marker label, map controls,
    and coordinate-required state for unmapped sites.
  - Added focused regression coverage so the removed helper sentence stays out
    of the shared jobs/sites map preview.
- Browser proof after implementation:
  - Direct site detail at
    `/sites/019e2908-78fd-72a6-a804-62c7d17cf621` exposes one
    `Harbour Yard` dialog, `Details`, `Notes`, `Jobs 1`, and `Edit` tabs, one
    `Map preview` label, and zero matches for the removed helper sentence.
  - Direct job detail at
    `/jobs/019e2909-1d57-76f6-8d97-f13cbf4079ed` exposes the `Boiler repair`
    dialog as an on-screen right drawer at `x=608` in a `1280px` viewport with
    zero transform, the `Location` section, the map preview in the DOM
    snapshot, and zero matches for the removed helper sentence.
  - Browser screenshot capture timed out twice after the DOM proof; the
    browser route, locator, drawer geometry, and snapshot checks all completed.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-location-map-preview-canvas.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/sites/sites-detail-sheet.test.tsx --reporter=verbose`
    passes: 29 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue richer jobs/sites data checks, especially the
  next job detail refinement against the generated jobs/sites reference.

### 2026-05-15 06:54 IST - Job detail details-tab copy distillation

- Continued the job detail pass in the in-app browser after the shared map
  preview cleanup.
- Browser/design finding before the patch:
  - The details tab still had visible helper sentences below obvious section
    headings: `Move forward`, `Location`, `Contact`, `Site assignment`, and
    `Collaborators`.
  - The site-assignment field also repeated an implementation warning below the
    selector, adding visual noise to an already clear control.
- Redesign outcome:
  - Made the shared job `DetailSection` description optional.
  - Removed the redundant visible descriptions from the job detail details tab
    while preserving headings, status transition controls, location details,
    map preview, contact state, site selector, collaborator form, and empty
    collaborator state.
  - Added regression assertions for the removed details-tab helper copy.
- Browser proof after implementation:
  - Direct job detail at
    `/jobs/019e2909-1d57-76f6-8d97-f13cbf4079ed` opens the `Boiler repair`
    right drawer at `x=608` in a `1280px` viewport with zero transform.
  - The details tab still exposes `Move forward`, `Location`, `Contact`,
    `Site assignment`, `Collaborators`, and `Map preview`.
  - The removed helper sentences have zero matches, and body/document width
    stays `1280px`.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-location-map-preview-canvas.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/sites/sites-detail-sheet.test.tsx --reporter=verbose`
    passes: 29 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-detail-section.tsx apps/app/src/features/jobs/jobs-detail-location.tsx apps/app/src/features/jobs/jobs-detail-location-map-preview-canvas.tsx apps/app/src/features/jobs/jobs-detail-location-map-preview-canvas.test.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-detail-section.tsx apps/app/src/features/jobs/jobs-detail-location.tsx apps/app/src/features/jobs/jobs-detail-location-map-preview-canvas.tsx apps/app/src/features/jobs/jobs-detail-location-map-preview-canvas.test.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx docs/superpowers/progress/2026-05-14-linear-style-app-redesign-progress.md`
    passes.
  - `git diff --check` passes.
- Next pass candidate: continue job detail copy distillation on the comments,
  visits, costs, and activity tabs, then re-check mobile drawer density.

### 2026-05-15 07:02 IST - Job detail secondary-tab copy distillation

- Continued the job detail pass against the persisted `jobs-sites-reference.png`
  direction: dense operational drawer, useful tabs, and content-first panels.
- Browser finding before the patch:
  - Comments, costs, visits, and activity all still carried helper copy directly
    below their section headings.
  - The comments, costs, and visits forms also had field helper lines that
    repeated the obvious intent of the field.
  - Empty tab states repeated the empty heading with another sentence.
- Redesign outcome:
  - Removed the redundant visible helper copy from the comments, costs, visits,
    and activity tabs.
  - Made `DetailEmpty` descriptions optional so empty states can be terse when
    the title carries enough meaning.
  - Preserved all real workflow controls: comment composer, cost total and cost
    line form, visit date/duration/note form, activity list, and empty titles.
  - Added regression coverage for the removed secondary-tab helper copy.
- Browser proof after implementation:
  - Direct job detail at
    `/jobs/019e2909-1d57-76f6-8d97-f13cbf4079ed` opens the `Boiler repair`
    drawer at `x=608` in a `1280px` viewport with zero transform.
  - Comments now shows `Add a comment`, `Add comment`, and `No comments yet.`
    without the removed helper copy.
  - Costs now shows `Cost total`, the cost fields, `Add cost line`, and
    `No costs added yet.` without the removed helper copy.
  - Visits now shows `Visit date`, `Duration`, `Visit note`, `Log visit`, and
    `No visits logged yet.` without the removed helper copy.
  - Activity keeps the real creation event and timestamp without the removed
    helper copy.
  - Mobile `390x844`: the same direct job route opens as a bottom drawer at
    `x=0`, `y=169`, width `390px`, transform
    `matrix(1, 0, 0, 1, 0, 0)`, body/document width stays `390px`, all five
    tabs remain available, and the removed helper copy has zero matches.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-location-map-preview-canvas.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/sites/sites-detail-sheet.test.tsx --reporter=verbose`
    passes: 29 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-detail-section.tsx apps/app/src/features/jobs/jobs-detail-costs-section.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-detail-section.tsx apps/app/src/features/jobs/jobs-detail-costs-section.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
- Next pass candidate: continue richer jobs/sites data checks against the
  generated reference.

### 2026-05-15 07:09 IST - Jobs map mapped-site rail

- Continued richer jobs/sites checks against the persisted
  `jobs-sites-reference.png` direction.
- Browser finding before the patch:
  - `/jobs` list and `/sites` remained stable on desktop and mobile with no
    horizontal overflow and without the old overview blocks.
  - The jobs map view showed the map and count badges, but when every visible
    job was mapped it did not expose a scannable rail of the mapped site and
    the jobs behind that marker.
- Redesign outcome:
  - Added a compact `Mapped sites` rail to the jobs map view.
  - The rail stays visible even when there are no unmapped jobs, showing each
    mapped site, job count, status counts, and direct job links.
  - Preserved the existing `Needs location` rail for unmapped work, Google Maps
    affordance, map canvas, and count badges.
- Browser proof after implementation:
  - Desktop `/jobs?view=map`: panel width `974px`, body/document width
    `1280px`, no dev overlay, and the view shows `1 mapped`, `0 unmapped`,
    `Mapped sites`, `Harbour Yard 1778804880890`, `1 job`, and
    `Boiler repair 1778804922237`.
  - Mobile `390x844`: panel width `364px`, body/document width stays `390px`,
    no dev overlay, and the same mapped-site rail content remains available.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-coverage-map.test.tsx src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 20 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
- Next pass candidate: continue higher-volume jobs/sites checks, especially
  multi-site map grouping and mobile scroll ergonomics.

### 2026-05-15 07:13 IST - Jobs map site-route handoff

- Continued the jobs map rail pass against the same jobs/sites generated
  reference.
- Browser/design finding before the patch:
  - The new mapped-site rail exposed job links, counts, and statuses, but the
    mapped site name itself was only text.
  - That left a small break in the map-to-site-to-job workflow: users could open
    the job from the rail, but not the site behind the marker.
- Redesign outcome:
  - Converted mapped site names in the jobs map rail into direct links to
    `/sites/$siteId`.
  - Preserved the existing job links, status badges, map canvas, and unmapped
    work rail.
  - Added regression assertions proving mapped site names are links in both the
    mixed mapped/unmapped case and the all-mapped case.
- Browser proof after implementation:
  - Desktop `/jobs?view=map`: mapped rail exposes the site link
    `/sites/019e2908-78fd-72a6-a804-62c7d17cf621` and job link
    `/jobs/019e2909-1d57-76f6-8d97-f13cbf4079ed`.
  - Opening the site link reaches the `Harbour Yard 1778804880890` route drawer
    with `Details`, `Notes`, `Jobs`, and `Edit` tabs visible.
  - Drawer geometry remains stable at `x=608`, width `672px`, transform
    `matrix(1, 0, 0, 1, 0, 0)`, body/document width stays `1280px`, and no dev
    overlay is present.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-coverage-map.test.tsx src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 20 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
- Next pass candidate: continue multi-site map grouping and mobile scroll
  ergonomics with richer seeded data.

### 2026-05-15 07:18 IST - Jobs map rail overflow disclosure

- Continued the higher-volume jobs/sites map pass against the persisted
  generated jobs/sites reference image.
- Browser/design finding before the patch:
  - The mapped-site rail showed the total job count for a site, but only linked
    the first four grouped jobs.
  - When a mapped site carried more than four jobs, the extra work was hidden
    without an explicit path to the full site context.
- Redesign outcome:
  - Extracted the mapped-site rail row into a focused item component.
  - Preserved the first four direct job links for fast jumps.
  - Added a compact `View N more on site` row that links to `/sites/$siteId`
    whenever grouped jobs overflow the visible rail slice.
- Browser proof after implementation:
  - Desktop `/jobs?view=map`: body/document width stays `1280px`, no dev
    overlay, and the live single-job map still shows `1 mapped`, `0 unmapped`,
    `Mapped sites`, the Harbour Yard site, and the Boiler repair job link.
  - Mobile `390x844`: body/document width stays `390px`, no dev overlay, and
    the mapped-site rail remains visible without horizontal overflow.
  - The live sandbox currently has one mapped job at the mapped site, so the
    overflow branch is covered by component test proof rather than browser
    seed data.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-coverage-map.test.tsx src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 21 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
    passes.
- Next pass candidate: create or seed richer mapped jobs for browser-level
  proof of site rail overflow and continue mobile scroll ergonomics.

### 2026-05-15 07:25 IST - Jobs map overflow browser proof

- Continued the jobs/sites map proof pass against the persisted generated
  jobs/sites reference.
- Browser setup:
  - Created four additional jobs through the real `/jobs/new` app flow:
    `Overflow map proof 1`, `Overflow map proof 2`, `Overflow map proof 3`,
    and `Overflow map proof 4`.
  - Each job was linked to the existing mapped Harbour Yard site, giving the
    sandbox five active jobs on one mapped site without bypassing the app's
    create form.
- Browser proof:
  - Desktop `/jobs?view=map`: route now shows `Active 5`, `All jobs 5`,
    `1 mapped`, `0 unmapped`, `5 jobs`, `5 New`, the first four overflow-proof
    job links, and `View 1 more on site`.
  - Desktop overflow handoff: clicking `View 1 more on site` opens
    `/sites/019e2908-78fd-72a6-a804-62c7d17cf621`; the site drawer exposes a
    `Jobs 5` tab.
  - Desktop site jobs tab: `Associated jobs`, `5 jobs linked`, all four
    overflow-proof jobs, and the original `Boiler repair 1778804922237` job are
    visible. Body/document width stays `1280px`; no dev overlay.
  - Mobile `390x844` `/jobs?view=map`: body/document width stays `390px`, no
    dev overlay, and the overflow rail still shows `5 jobs` plus
    `View 1 more on site`.
  - Mobile overflow handoff: the site `Jobs 5` tab shows `Associated jobs`,
    `5 jobs linked`, all four overflow-proof jobs, and the original Boiler
    repair job. Body/document width stays `390px`; no dev overlay.
- Outcome:
  - The previous unit-test-only overflow proof is now backed by a browser state
    created through the product workflow.
  - The map-to-site-to-associated-jobs path matches the Linear-style reference:
    compact map context first, direct jumps for the nearest work, and the full
    related list one click deeper.
- Next pass candidate: continue mobile scroll ergonomics for high-volume
  jobs/sites pages or move to another unfinished feature module from the
  browser findings list.

### 2026-05-15 07:31 IST - Jobs mobile row metadata polish

- Continued high-volume jobs/sites mobile scroll ergonomics against the
  browser-created five-job Harbour Yard data and the jobs/sites generated
  reference.
- Browser/design finding:
  - Mobile `/jobs` stayed within the viewport at `390x844`, with five active
    jobs reachable and no offscreen controls.
  - The compact mobile job rows used literal `/` text nodes between site,
    assignee, and updated metadata. The visual rhythm was fine, but the row
    text and accessible link names became noisier than the Linear-style
    reference calls for.
- Redesign outcome:
  - Rebuilt compact job row metadata as structured metadata items.
  - Kept the same visual separator treatment through CSS-generated separators,
    so the row still scans as a compact sequence without adding literal slash
    text to the content.
  - Cleaned nearby jobs-page lint issues by replacing a nested empty-state
    ternary with a small action helper and converting the status group shape to
    an interface.
- Browser proof after implementation:
  - Mobile `/jobs` at `390x844`: body/document width stays `390px`, no dev
    overlay, five active jobs render, and row text no longer contains standalone
    `/` separators.
  - Mobile direct site detail route still opens the Harbour Yard drawer after
    load; the `Jobs 5` tab shows `Associated jobs`, `5 jobs linked`, all four
    overflow-proof jobs, and the original Boiler repair job. Body/document
    width stays `390px`; no dev overlay.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-page.test.tsx --reporter=verbose`
    passes: 17 tests.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-page.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-page.tsx`
    passes.
- Next pass candidate: inspect multi-site volume or move to the next unfinished
  module in the browser findings list.

### 2026-05-15 07:38 IST - Multi-site map volume proof

- Continued the jobs/sites volume pass against the persisted jobs/sites
  generated reference.
- Browser setup:
  - Created a second mapped site through the real `/sites/new` flow:
    `NORTHPOINT OFFICE 1778827016381`.
  - Created two jobs through the real `/jobs/new` flow and linked both to the
    second site: `NORTHPOINT LIFT INSPECTION` and `NORTHPOINT RISER CHECK`.
  - Kept the existing Harbour Yard group with five mapped jobs, including the
    overflow row from the previous pass.
- Browser proof:
  - Desktop `/jobs?view=map`: route shows `Active 7`, `All jobs 7`, `2 mapped`,
    `0 unmapped`, the Harbour Yard `5 jobs` group with `View 1 more on site`,
    and the Northpoint `2 jobs` group with both Northpoint job links.
  - Mobile `390x844` `/jobs?view=map`: body/document width stays `390px`, no
    dev overlay, no offscreen controls, and both mapped site groups remain
    visible in the rail.
  - Mobile second-site handoff: tapping the Northpoint site link opens
    `/sites/019e2a5a-4859-715f-a808-da2d907fe6e5`; the `Jobs 2` tab shows
    `Associated jobs`, `2 jobs linked`, `NORTHPOINT RISER CHECK`, and
    `NORTHPOINT LIFT INSPECTION`.
- Outcome:
  - No code patch was needed for this pass: the current jobs map rail handles
    multiple mapped site groups cleanly after the earlier rail and overflow
    work.
  - The multi-site proof strengthens the evidence that the jobs/sites map
    direction matches the generated reference: map context, grouped sites,
    counts, direct job links, and site-to-associated-work handoff all hold
    across desktop and mobile.
- Next pass candidate: move to another unfinished module from the browser
  findings list, likely populated organization settings or first-run states.

### 2026-05-15 07:44 IST - Organization settings populated admin pass

- Re-opened the persisted settings/admin/mobile generated reference and used it
  as the active direction for the organization settings audit: terse tab
  panels, compact admin rows, no overview rail, and no helper copy that repeats
  the selected tab.
- Browser pass:
  - Recovered the in-app Browser session after a stale interaction path by
    resetting the browser runtime and retrying against the live tab.
  - Mobile `390x844` `/organization/settings` starts on `General`, keeps
    document/body width at `390px`, and exposes the real shadcn/Base UI tabs:
    `General`, `Labels`, `Service areas`, and `Rate card`.
  - Physical browser clicks prove the `Labels` tab can be opened on mobile;
    the earlier Playwright role-click miss was a browser automation quirk, not
    an app regression.
  - Service areas still shows the seeded `Dublin City` row, and rate card still
    reaches the existing card flow.
- Implementation:
  - Removed the remaining helper sentences from the `General` and `Labels`
    panels so the tab heading, form labels, row data, and actions carry the
    interface without repeated explanatory copy.
  - Added regression assertions so those two helper strings stay removed.
- Verification:
  - Browser proof after reload at `390x844`: `General` shows only
    `Organization name` and `Save changes`; `Labels` shows `New label name`,
    `Create label`, and `No labels yet`; both states have no horizontal
    overflow.
  - `./node_modules/.bin/vitest run src/features/organizations/organization-settings-page.test.tsx --reporter=verbose`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/features/organizations/organization-settings-page.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/features/organizations/organization-settings-page.test.tsx`
    passes.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: continue the admin/settings family with user settings
  proof, then resume the previous route-detail train of thought from the
  browser without switching into the site-detail implementation yet.

### 2026-05-15 07:49 IST - Job detail drawer copy distillation

- Continued the previous job-detail browser pass instead of switching into the
  requested site-view implementation. The site-view request remains a noted
  future feature, but this run stayed on the job detail work already in flight.
- Re-opened the persisted jobs/sites generated reference before editing. The
  relevant direction is the dense right-side job drawer: status chips, title,
  tabs, compact detail fields, map/site context, and direct operational rows
  without helper prose.
- Browser pass:
  - Opened `/jobs`, then opened `NORTHPOINT RISER CHECK` through the real job
    row link.
  - Confirmed the drawer contains Details, Comments, Costs, Visits, and
    Activity tabs, site/location context, empty Contact, Site assignment,
    Collaborators, and no horizontal overflow.
  - Found leftover filler in the drawer text model: the generic drawer
    description, the Reference helper, Contact empty-state description, and
    Collaborators empty-state description.
- Implementation:
  - Removed the generic drawer description from the job detail header.
  - Removed the Reference helper sentence when no external reference exists.
  - Removed descriptions from the empty Contact and Collaborators states while
    keeping the actionable empty titles.
  - Added regression coverage to the existing removed-copy assertion list.
- Browser proof after reload and row-open:
  - `NORTHPOINT RISER CHECK` drawer keeps `No contact yet` and
    `No external collaborators yet`.
  - The drawer no longer includes the old generic helper copy:
    `Job details, comments, costs, visits, and activity.`,
    `Optional reference from outside this workspace`,
    `Add one when there is a clear related person or organization.`, or
    `Attach an external member when this job needs limited shared visibility.`
  - Document width remains equal to viewport width; no horizontal overflow.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-sheet.test.tsx --reporter=verbose`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: continue job detail proof on mobile and tab-specific
  states, then fold any remaining density/copy fixes into the same drawer
  surface before returning to dashboard/sites passes.

### 2026-05-15 07:52 IST - Simplify pass on current drawer diff

- Ran the `simplify` review lenses locally across the current changed-file
  scope, with emphasis on the newest job detail and organization settings
  edits. I did not spawn review subagents because this turn did not explicitly
  request delegated subagent work.
- Findings:
  - The job detail drawer had a now-pointless wrapper around `DrawerTitle`
    after the header description was removed.
  - The job detail sheet test still mocked `DrawerDescription` even though the
    component no longer imports it.
- Implementation:
  - Removed the redundant title wrapper.
  - Removed the unused `DrawerDescription` test mock.
- Verification:
  - `./node_modules/.bin/vitest run src/features/jobs/jobs-detail-sheet.test.tsx --reporter=verbose`
    passes.
  - `./node_modules/.bin/oxlint --config .oxlintrc.mjs apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/oxfmt --check apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
    passes.
  - `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passes.
- Next pass candidate: resume the mobile job-detail tab proof that was in
  progress before the simplify request.

### 2026-05-15 08:13 IST - Whole-refactor simplify pass

- Ran `/simplify` across the full refactor changeset instead of only the most
  recent drawer diff. The pass covered changed tracked files plus untracked
  TypeScript/TSX additions.
- Reuse and boundary findings:
  - Site detail was borrowing the job map preview and jobs server route helper,
    which crossed the feature boundaries guarded by
    `app-domain-boundaries.test.ts`.
  - The interactive map capability hook was job-owned even though it now serves
    both jobs and sites.
  - Job and site detail tests still carried stale drawer/map mocks after the
    copy and map-preview distillation.
- Quality findings:
  - A few mechanical lint issues had crept into the wider diff: negated
    conditional rendering, mixed type/value import style, mutable `sort`,
    shadowed `config`, boolean matcher style, and test destructuring.
  - Removing the job drawer description needed an explicit dialog
    `aria-describedby={undefined}` opt-out instead of relying on absent helper
    copy.
  - The sites route first-paint test needed a precise expectation because the
    responsive directory intentionally renders both mobile and desktop copies in
    the DOM.
- Implementation:
  - Moved the map preview/canvas/test into `features/sites` as the site-owned
    `SiteLocationMapPreview`, and updated job detail to consume that shared
    site-location component.
  - Moved `useCanRenderInteractiveMap` into `components/ui`.
  - Added a shared `listAllCurrentServerJobs` facade to
    `features/api/app-api-server` so site detail can load associated jobs
    without importing from `features/jobs`.
  - Removed stale drawer/map mocks, old `no-array-sort` suppressions, and
    redundant wrappers/copy from the simplified surfaces.
  - Cleaned the broader diff for lint/type/format consistency.
- Verification:
  - Focused failure rerun:
    `./node_modules/.bin/vitest run src/test/app-domain-boundaries.test.ts src/routes/-_app._org.sites.test.tsx src/features/sites/site-location-map-preview-canvas.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx --reporter=dot`
    passed with `4` files and `35` tests.
  - Changed-file lint:
    `./node_modules/.bin/oxlint --config .oxlintrc.mjs $(git diff --name-only -- '*.ts' '*.tsx') $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')`
    passed on `57` files.
  - Changed-file format:
    `./node_modules/.bin/oxfmt --check $(git diff --name-only -- '*.ts' '*.tsx') $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')`
    passed on `57` files.
  - App typecheck:
    `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passed.
  - Whitespace diff check: `git diff --check` passed.
  - Full app suite:
    `./node_modules/.bin/vitest run --reporter=dot` passed with `92` files and
    `607` tests.
- Next pass candidate: resume the in-browser job detail mobile/tab proof, then
  continue with the dashboard, jobs, and sites passes using the persisted
  generated references and `impeccable craft`.

### 2026-05-15 08:38 IST - Review swarm, Effect, and React/TanStack pass

- Ran the requested read-only review swarm plus Effect and
  React/composition/TanStack Start review passes over the whole current
  changeset. The environment capped parallel agents, so four review-swarm
  agents, two Effect agents, and one React/TanStack composition agent ran in
  batches; OTEL/error and composition checks were also reviewed locally from
  the loaded skill references.
- Material findings fixed:
  - Home dashboard `Sites with active work` was using the first five sites
    before considering active job count. It now derives active site rows from
    active jobs, filters out inactive sites, sorts by active job count, and
    has regression coverage.
  - Home dashboard member data no longer loads the full job options payload
    just to get members; it uses the narrower member-options helper while
    keeping site options separate.
  - Site detail associated jobs no longer eagerly fetch every matching job.
    The route loads a bounded first page of `25` related jobs and surfaces a
    `+` continuation signal in the tab and related-jobs panel.
  - The shared app API server facade now has direct tests for one-page job
    reads, cursor pagination preserving static `siteId` filters, forwarded
    headers/cookies, and no-fetch behavior without an auth cookie.
  - Site route shortcut scopes now cover `/sites/new` and `/sites/$siteId`.
  - Branded `SiteIdType` is preserved through home dashboard site rows and jobs
    map site records, and collaborator user selection decodes non-empty values
    through the `UserId` schema.
  - `Cause.failureOption` checks in create/detail sheets now use
    `Option.isSome`, and the rate-card section uses `Result.isFailure` instead
    of raw `_tag` inspection.
  - Site related-job dates now format with `timeZone: "UTC"` to avoid
    SSR/client hydration drift.
- Review findings intentionally left as follow-up:
  - A purpose-built home/dashboard summary endpoint would be cleaner than
    walking all job pages for dashboard-wide counts. The pass reduced duplicate
    options loading now, but the endpoint is a broader API design slice.
  - Organization label mutations still work through direct
    `runBrowserAppApiRequest` calls; moving them into Effect-Atom mutations
    remains a consistency cleanup, not a correctness blocker.
- Effect review summary after fixes: no critical findings, no open warnings
  from the patched surfaces; remaining items are architectural follow-ups.
  Verdict: `PASS`, score `8/10`.
- Verification:
  - Focused rerun:
    `./node_modules/.bin/vitest run src/features/auth/authenticated-shell-home-dashboard.test.ts src/features/auth/authenticated-shell-home.test.tsx src/features/api/app-api-server-ssr.test.ts src/routes/-_app._org.index.test.tsx src/routes/-_app._org.sites.test.tsx src/features/sites/sites-detail-sheet.test.tsx src/hotkeys/active-shortcut-scopes.test.ts --reporter=dot`
    passed with `7` files and `28` tests.
  - App typecheck:
    `./node_modules/.bin/tsc --noEmit -p apps/app/tsconfig.json --pretty false`
    passed.
  - Changed-file lint:
    `./node_modules/.bin/oxlint --config .oxlintrc.mjs $(git diff --name-only -- '*.ts' '*.tsx') $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')`
    passed on `59` files.
  - Changed-file format:
    `./node_modules/.bin/oxfmt --check $(git diff --name-only -- '*.ts' '*.tsx') $(git ls-files --others --exclude-standard -- '*.ts' '*.tsx')`
    passed on `59` files.
  - Whitespace diff check: `git diff --check` passed.
  - Full app suite:
    `./node_modules/.bin/vitest run --reporter=dot` passed with `93` files and
    `612` tests.
- Next pass candidate: resume the in-browser job detail mobile/tab proof, then
  continue dashboard/jobs/sites browser passes using the generated references
  and `impeccable craft`.

## Feature Map

Initial source-backed feature modules to explore and redesign:

- Public auth: login, signup, forgot password, reset password, verify email.
- Pre-app setup: accept invitation, create organization, optional invite step.
- App shell: sidebar, top header, command bar, hotkeys, theme switching, user
  menu, organization switcher.
- Workspace home: organization context, next actions, empty/first-run state.
- Jobs: list, filters, saved views, map view, create sheet, detail sheet,
  comments, activity, visits, status transitions, costs, labels, locations.
- Sites: list, create sheet, detail sheet, address and map state, notes, and
  jobs associated with a site.
- Members: active members, pending invitations, role changes, removal,
  invitation resend/cancel states.
- Organization settings: organization profile, labels, service areas, rate
  cards.
- Activity: organization activity feed search and formatting.
- User settings: profile/settings route and search state.

## Current Design Reading

- Product register: authenticated product UI serving construction and trades
  teams.
- Desired feel: dense, calm, precise, light-mode-first, Linear-like, tool-native,
  not generic project-management SaaS.
- Strong existing baseline: auth and organization setup routes already use a
  split-shell direction with restrained copy and contextual right-column
  framing.
- Likely redesign pressure: bring operational modules such as jobs, sites,
  settings, members, activity, and home closer to that sharpness while keeping
  their density and workflow power.

## Browser Findings

### Strong Existing Patterns

- Auth and organization setup flows feel closest to the intended product
  direction: compact split shell, clear task column, restrained context column.
- The authenticated home now behaves like an operations dashboard: workspace
  metrics, jobs, sites, next actions, recent activity, and direct header actions
  for inviting a teammate and creating a job.
- Jobs and sites list pages already have a useful Linear-like density:
  compact headers, filter chips, route hotkeys, and direct creation actions.
  `/jobs` now uses an actionable status rail instead of the old static overview
  strip. `/sites` now serves the directory or empty state directly without the
  old `Site coverage` overview block or redundant directory descriptions.
- Jobs detail is feature-rich and product-native, with clear sections for
  status, location, comments, collaborators, costs, visits, and activity. The
  current tabbed drawer was rechecked in-browser after cache recovery across
  desktop and mobile.
- Sites create/detail flows use the same sheet/dialog vocabulary as jobs, which
  keeps the product model coherent. Site detail now has dedicated Details,
  Notes, Jobs, and Edit tabs with map and associated-work proof.
- Members page has a strong operational structure after loading: active member
  rows, pending invitation rows, and contextual row actions without the old
  duplicated overview strip.
- Command bar exposes current page actions, navigation, settings commands, and
  route-level shortcuts for jobs view/create commands.
- Mobile app shell now exposes shortcut help directly from the header, and the
  first-run shortcut intro notice no longer blocks that tap target.

### Design And UX Gaps

- Home dashboard proof is now stronger for first-run state, primary actions,
  populated mobile density, and generated-reference desktop composition. A
  future pass should inspect a richer account with several jobs, sites, and
  activity events to tune status slices against real operational volume.
- Jobs populated proof is stronger after replacing the static overview with
  status-view controls and removing the extra queue header between the views
  and grouped rows. Mobile high-volume rows now keep compact metadata visually
  separated without literal slash text in the row content.
- Sites populated proof is stronger after copy distillation: the route now
  foregrounds the directory, count, map readiness, rows, and detail tabs without
  explanatory header or panel copy.
- Shared jobs/sites map previews now keep only the useful title, map, marker,
  controls, and fallback state; the redundant navigation-check helper sentence
  has been removed.
- Job detail details-tab sections now keep the operational headings and
  controls without the repeated helper copy below each section heading.
- Job detail comments, costs, visits, and activity tabs now follow the same
  terse operational style: heading, controls, data, and empty title only when
  extra helper copy does not earn its space.
- Job detail drawer header, Reference meta, Contact empty state, and
  Collaborators empty state have had the remaining generic helper copy removed
  while retaining the actual status, tabs, fields, map/site context, empty
  titles, and actions.
- Jobs map view now keeps mapped-site context visible even when all visible
  jobs are mapped: site rail, job count, status counts, and direct job links.
- Jobs map mapped-site rail now links directly into the site detail route, so
  map-to-site-to-job navigation is continuous.
- Jobs map mapped-site rail now discloses grouped-job overflow with a compact
  `View N more on site` link instead of silently hiding jobs after the first
  four direct links.
- Jobs map rail has browser proof for multi-site volume: two mapped site
  groups, seven active jobs, clean mobile rail behavior, and site handoff into
  associated jobs.
- Sites mobile proof now catches and fixes clipped table content: mobile uses a
  dedicated row-list while desktop keeps the full table.
- Route-owned job and site drawers now survive direct deep-link loads on both
  desktop and mobile instead of remaining at Vaul's off-canvas animation
  keyframe.
- Empty-state quality is improving: activity, sites, and jobs now have more
  outcome-based framing. Continue checking remaining first-run states as routes
  are re-audited.
- Activity populated proof is cleaner after removing redundant panel copy while
  keeping filters, event count, and the real audit rows intact.
- Activity mobile density is better after compacting filters into a two-column
  grid while keeping the large-screen operational layout.
- Organization and user settings now use direct shadcn/Base UI feature tabs
  with redundant overview/status tabs removed. Continue checking dense admin
  submodules such as labels, service areas, and rate cards.
- `/settings` organization context was rechecked in an earlier focused pass and
  did not reproduce the old `No active organization` regression.
- Email verification banner has mobile-safe wrapping and long-email regression
  coverage; the jobs empty-state mobile proof also showed no horizontal
  overflow.
- Mobile members layout has had the redundant overview strip removed, and
  invitation-heavy rows now use one action menu per pending invite instead of
  exposed resend/cancel button pairs. The members route no longer uses
  redundant helper copy under its section headings.
- Organization settings labels now match the same compact admin-row pattern:
  one label action menu per row with edit/archive inside the menu.
- Organization settings service areas and rate card now follow the same compact
  admin direction: service-area row actions live in an ellipsis menu, rate-card
  copy is stripped back, and mobile line-editing labels stay short while
  preserving accessible field names.
- Organization settings General and Labels panels now follow the same terse
  generated-reference direction: no helper sentence under the panel heading,
  just the active tab, fields, rows, and actions.
- The repeated `data-tsd-source` hydration warning has been fixed by disabling
  Devtools source injection while preserving the Devtools plugin.
- GitHub check repair pass: React Doctor is back to 100/100 after reducing
  settings state churn, hoisting site detail formatting, tightening metadata
  keys, and removing redundant padding axes. E2E has been aligned with the new
  tabbed settings and job detail flows, including hydration waits for tab
  activation after reloads.
- Local proof for the GitHub repair: `pnpm format`, `pnpm lint`,
  `pnpm check-types`, `pnpm --filter app react-doctor`, and
  `pnpm --filter app e2e` all pass before pushing the check-fix commit.

### Candidate Implementation Targets

- Keep the browser finding section current as each old gap is resolved.
- Continue checking populated organization settings data as new admin modules
  are added.
- Revisit site detail if the product gains a real site-label model; the current
  data model supports service-area badges and notes, but not distinct site
  labels.
- Continue populated-dashboard passes with higher-volume jobs/sites data using
  the persisted generated references.
- Richer browser-created mapped jobs now prove the map rail overflow path live,
  mobile row metadata is cleaner for high-volume job queues, and multi-site map
  volume has live browser proof.
- Continue first-run/empty-state passes on any remaining routes that still lack
  primary action, context, or command discoverability.
- Continue preserving and strengthening route hotkey/command-bar
  discoverability.

## Validation Plan

- Browser exploration with screenshots and DOM snapshots for each major route.
- Synthetic sandbox account for safe end-to-end workflow testing.
- Generated UI inspiration for the main feature families before implementation.
- Focused component/unit tests for changed surfaces.
- Broader app checks once shared UI or route behavior changes.
- Browser reinspection across desktop and at least one narrow viewport before
  completion.
