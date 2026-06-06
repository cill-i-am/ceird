# Route-Aware Proximity UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `$using-superpowers` before starting, use `$impeccable` for every UI task, and follow `$shadcn` project conventions before adding or changing components. This plan uses checkbox (`- [ ]`) syntax for task tracking.

**Goal:** Build the Jobs, Sites, map, Agent chat, onboarding, and settings UI for route-aware nearby Jobs and Sites.

**Architecture:** The app owns origin preflight, current-location permission UX, typed-origin fallback, route result presentation, maps handoff, and structured Agent rendering. The app calls the logic plan's route-aware Jobs/Sites endpoints and Agent actions; it must not compute proximity ranking locally, persist user coordinates, or add a second map runtime.

**Tech Stack:** TanStack Start, React, TanStack Query/data plane patterns already used by the app, shadcn/base-luma components, Hugeicons, Tailwind v4, the source-owned Ceird MapLibre map primitive, browser geolocation, Vitest, Testing Library, and Playwright/browser screenshot checks.

---

## Required Reference Material

- Product/design source: `docs/planned-features/2026-06-03-route-aware-job-proximity.md`
- UI lock-in source: `docs/planned-features/2026-06-04-route-aware-job-proximity-ui-lock-in.md`
- Logic implementation plan: `docs/superpowers/plans/2026-06-06-route-aware-proximity-logic.md`
- Frontend architecture: `docs/architecture/frontend.md`
- API architecture: `docs/architecture/api.md`
- Product glossary: `CONTEXT.md`

## Required UI Skill Workflow

- Before any UI code edit, run the Impeccable context command:

  ```bash
  node .agents/skills/impeccable/scripts/context.mjs
  ```

- Read the register files it points to, including `reference/product.md`.
- Use `pnpm dlx shadcn@latest info --json -c apps/app` before adding or updating shadcn components.
- Current shadcn context from planning:
  - framework: TanStack Start;
  - Tailwind: v4;
  - design style: `base-luma`;
  - import alias: `#`;
  - UI alias: `#/components/ui`;
  - icon library: Hugeicons;
  - installed primitives include `button`, `badge`, `card`, `command`, `dialog`, `drawer`, `dropdown-menu`, `empty`, `field`, `input-group`, `kbd`, `popover`, `select`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, and `tooltip`.
- Prefer existing source-owned shadcn primitives over new dependencies. Add a shadcn component only when the existing set does not cover the UI.
- Keep new workflow actions registered through the app hotkey layer or document why a hotkey would be harmful.

## Reference Images

Use these images as visual and journey references. They do not need to be pixel-perfect at the component level, and generated text/details should not be copied blindly. The implementation should match the user journeys, information hierarchy, dashboard topology, map behavior, and UI shape while aligning with Ceird's shadcn/base-luma design system.

- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/combined-jobs-near-me-laptop.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/combined-mobile-near-me.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/combined-sites-near-me-laptop.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-near-me-filter-controls.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-route-result-rows-cards.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-proximity-map-primitives.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-maps-handoff-origin-sharing.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-agent-inline-route-preview.png`
- `docs/planned-features/assets/route-aware-job-proximity-ui-lock-in/component-route-operational-states.png`

## Locked UI Rules

- "Near me" is an explicit filter mode on Jobs and Sites. It is not a separate detached results page.
- Near me always respects selected filters first, then orders eligible mapped results by traffic-aware driving time.
- Jobs default to active jobs unless filters say otherwise.
- Priority remains a normal filter. Urgent jobs near me means urgent matches ordered by driving time.
- Near me implies mapped-only eligibility. Represent that as a locked mapped-only chip/control while Near me is active.
- Current location is requested at the moment the user runs or refreshes Near me. Do not store coordinates in URL state, local storage, app preferences, or Ceird persistence.
- Typed origin is a two-step fallback with autocomplete/details selection. Do not send ambiguous free text to route endpoints.
- List mode may request route summaries without route geometry. Map mode and focused route previews request route display lines.
- Switching from list to map may make a second API call with `includeRouteLines=true`; backend cache absorbs fresh matrix work.
- Result rows, map markers, and route lines are linked selection surfaces.
- Primary handoff action is `Open in Maps`; the attached dropdown exposes Google Maps and Apple Maps explicitly.
- Agent proximity results render structured inline components, not raw JSON.
- Route failures preserve ordinary Jobs/Sites data where possible and fail explicitly for the route-ranked result.
- The UI must never silently fall back to straight-line distance ordering.

## File Structure

- Create `apps/app/src/features/proximity/proximity-api.ts`
- Create `apps/app/src/features/proximity/proximity-origin.ts`
- Create `apps/app/src/features/proximity/proximity-origin-dialog.tsx`
- Create `apps/app/src/features/proximity/proximity-location-access.ts`
- Create `apps/app/src/features/proximity/proximity-format.ts`
- Create `apps/app/src/features/proximity/proximity-state.ts`
- Create `apps/app/src/features/proximity/maps-handoff.ts`
- Create `apps/app/src/features/proximity/proximity-result-row.tsx`
- Create `apps/app/src/features/proximity/proximity-result-card.tsx`
- Create `apps/app/src/features/proximity/proximity-status-panel.tsx`
- Create `apps/app/src/features/proximity/proximity-limit-select.tsx`
- Test `apps/app/src/features/proximity/*.test.ts`
- Modify `apps/app/src/components/ui/map.tsx`
- Test `apps/app/src/components/ui/map.test.tsx`
- Modify `apps/app/src/features/jobs/jobs-search.ts`
- Modify `apps/app/src/routes/_app._org.jobs.tsx`
- Modify `apps/app/src/features/jobs/jobs-page.tsx`
- Create `apps/app/src/features/jobs/jobs-proximity-panel.tsx`
- Create `apps/app/src/features/jobs/jobs-proximity-map.tsx`
- Create `apps/app/src/features/jobs/jobs-proximity-row.tsx`
- Test `apps/app/src/features/jobs/jobs-proximity*.test.tsx`
- Create `apps/app/src/features/sites/sites-search.ts`
- Modify `apps/app/src/routes/_app._org.sites.tsx`
- Modify `apps/app/src/features/sites/sites-page.tsx`
- Create `apps/app/src/features/sites/sites-proximity-panel.tsx`
- Create `apps/app/src/features/sites/sites-proximity-map.tsx`
- Create `apps/app/src/features/sites/sites-proximity-row.tsx`
- Test `apps/app/src/features/sites/sites-proximity*.test.tsx`
- Modify `apps/app/src/features/agent/global-agent-chat-panel.tsx`
- Create `apps/app/src/features/agent/agent-proximity-intent.ts`
- Create `apps/app/src/features/agent/agent-proximity-location.tsx`
- Create `apps/app/src/features/agent/agent-proximity-tool-renderers.tsx`
- Create `apps/app/src/features/agent/agent-route-preview-card.tsx`
- Test `apps/app/src/features/agent/agent-proximity*.test.tsx`
- Create `apps/app/src/features/onboarding/location-access-step.tsx`
- Modify the existing account creation/onboarding route that first welcomes a new user
- Modify `apps/app/src/features/settings/user-settings-page.tsx`
- Test affected onboarding/settings files
- Modify `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify `docs/architecture/frontend.md`

## Task 1: Shared App Proximity Primitives

**Files:**

- Create: `apps/app/src/features/proximity/proximity-api.ts`
- Create: `apps/app/src/features/proximity/proximity-origin.ts`
- Create: `apps/app/src/features/proximity/proximity-origin-dialog.tsx`
- Create: `apps/app/src/features/proximity/proximity-location-access.ts`
- Create: `apps/app/src/features/proximity/proximity-format.ts`
- Create: `apps/app/src/features/proximity/proximity-state.ts`
- Create: `apps/app/src/features/proximity/maps-handoff.ts`
- Create: `apps/app/src/features/proximity/proximity-result-row.tsx`
- Create: `apps/app/src/features/proximity/proximity-result-card.tsx`
- Create: `apps/app/src/features/proximity/proximity-status-panel.tsx`
- Create: `apps/app/src/features/proximity/proximity-limit-select.tsx`
- Test: `apps/app/src/features/proximity/*.test.ts`

- [ ] **Step 1: Write failing primitive tests**

  Cover:
  - no proximity API call happens before an origin is resolved;
  - browser current location resolves to `{ mode: "current_location" }`;
  - typed origin resolves only after a Google-backed place details selection;
  - denied, unavailable, or timed-out geolocation moves to typed-origin fallback;
  - no coordinates are written into URL search params, local storage, or user preferences;
  - `limit` defaults to 10 and only allows `10`, `15`, `20`, or `25` in the UI;
  - maps handoff builds default, Google Maps, and Apple Maps URLs from response origin and destination coordinates;
  - route time, route distance, origin accuracy, and computed-at formatting match shared vocabulary.

  Run:

  ```bash
  pnpm --filter app test -- src/features/proximity
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement API wrappers**

  Use the composed app API client from the logic plan. Keep wrappers thin:
  - `rankNearbyJobs`;
  - `rankNearbySites`;
  - `getJobRoutePreview`;
  - `getSiteRoutePreview`;
  - `autocompleteProximityOrigin`;
  - `resolveProximityOriginPlace`.

  These functions should call `runBrowserAppApiRequest` or the existing feature API pattern. Do not create ad hoc `fetch` wrappers unless the API client cannot express the endpoint.

- [ ] **Step 3: Implement origin resolution state machine**

  Model origin state explicitly:
  - `idle`;
  - `requesting_current_location`;
  - `current_location_ready`;
  - `typed_origin_searching`;
  - `typed_origin_selected`;
  - `blocked`;
  - `failed`.

  Use `apps/app/src/lib/browser-geolocation.ts` for current location. Read the user preference from the logic plan's `UserPreferencesApiGroup`, but still ask the browser for a fresh position when running proximity. The preference says Ceird may try; it is not a saved location.

- [ ] **Step 4: Implement typed-origin dialog**

  Build the dialog/sheet from existing shadcn primitives:
  - `Dialog` or `Sheet` depending on existing app pattern;
  - `Command` or `InputGroup` for search;
  - `Button`, `Badge`, `Field`, `Tooltip`, `Skeleton`, and `Alert` as needed.

  Typed origins must require selection/confirmation. A plain typed string must not call the proximity endpoint.

- [ ] **Step 5: Implement shared route display primitives**

  Create reusable components for:
  - route summary cluster with drive time first and distance second;
  - traffic-aware tooltip;
  - computed-at and refresh cluster;
  - cap metadata label;
  - result limit select;
  - maps handoff split button/dropdown;
  - route operational state panels.

  Use Hugeicons through the existing app icon conventions. Do not introduce decorative map or AI imagery.

- [ ] **Step 6: Verify shared primitives**

  Run:

  ```bash
  pnpm --filter app test -- src/features/proximity
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/features/proximity
  git commit -m "Add app proximity UI primitives"
  ```

## Task 2: Route Lines in the Ceird Map Primitive

**Files:**

- Modify: `apps/app/src/components/ui/map.tsx`
- Test: `apps/app/src/components/ui/map.test.tsx`

- [ ] **Step 1: Write failing map primitive tests**

  Cover:
  - route lines render from response-owned display geometry;
  - selected route line uses the selected visual variant;
  - unavailable route geometry omits only the line, not the destination marker;
  - route source/layers are recreated safely after a MapLibre style load;
  - row/marker/line selection can be controlled by feature code.

  Run:

  ```bash
  pnpm --filter app test -- src/components/ui/map.test.tsx
  ```

  Expected: FAIL.

- [ ] **Step 2: Add source-owned route line components**

  Extend the existing map primitive with components such as:
  - `MapRouteLine`;
  - `MapRouteLineCollection`;
  - `MapOriginMarker`;
  - `MapRankedDestinationMarker`;
  - optional `MapFitRouteBounds`.

  Keep MapLibre details inside `components/ui/map.tsx`. Feature code should not call MapLibre APIs directly.

- [ ] **Step 3: Preserve one map runtime**

  Do not add Google Maps UI SDK or a second map library in this implementation. If route display lines cannot be shown compliantly on the existing MapLibre primitive, stop and run the separate Google Maps migration spike from the product doc before continuing with Near me UI.

- [ ] **Step 4: Verify map primitive behavior**

  Run:

  ```bash
  pnpm --filter app test -- src/components/ui/map.test.tsx
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/components/ui/map.tsx apps/app/src/components/ui/map.test.tsx
  git commit -m "Add route display lines to map primitive"
  ```

## Task 3: Jobs Near Me Dashboard

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-search.ts`
- Modify: `apps/app/src/routes/_app._org.jobs.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Create: `apps/app/src/features/jobs/jobs-proximity-panel.tsx`
- Create: `apps/app/src/features/jobs/jobs-proximity-map.tsx`
- Create: `apps/app/src/features/jobs/jobs-proximity-row.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Test: `apps/app/src/features/jobs/jobs-proximity*.test.tsx`
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Write failing Jobs UI tests**

  Cover:
  - ordinary Jobs page load does not request geolocation or call proximity;
  - selecting Near me requests current location when preference/browser permission allow it;
  - denied current location opens typed-origin fallback;
  - selected status, priority, assignee, coordinator, site, label, and query filters are passed into `POST /jobs/proximity`;
  - Near me locks mapped-only while active and restores previous mapped state after clearing;
  - priority filter remains a filter, not a priority-first sort;
  - list mode sends `includeRouteLines=false`;
  - map mode sends `includeRouteLines=true`;
  - result limit defaults to 10 and allows up to 25;
  - cap metadata says ranking was limited to 100 when returned by the API;
  - rows show full job result data, drive time, route distance, traffic-aware tooltip, computed-at, and maps handoff;
  - route provider errors preserve the ordinary Jobs data surface and show explicit proximity failure.

  Run:

  ```bash
  pnpm --filter app test -- src/features/jobs/jobs-proximity
  ```

  Expected: FAIL.

- [ ] **Step 2: Extend Jobs search params without storing origin**

  Add URL search params for:
  - `near=true | false`;
  - `routeLimit=10 | 15 | 20 | 25`;
  - existing `view=list | map`.

  Do not put coordinates, typed-origin display text, place IDs, route summaries, or computed-at timestamps in the URL. Store the resolved origin in component state for the current run only.

- [ ] **Step 3: Add Near me controls**

  Integrate with the existing Jobs toolbar and filter model:
  - explicit `Near me` chip/control;
  - locked `Mapped only` chip while active;
  - compact limit select;
  - refresh action beside computed-at;
  - traffic-aware distance tooltip;
  - change-origin action.

  Register a context-aware hotkey or command action for toggling Near me. If a hotkey is rejected because it would conflict with typing or browser geolocation prompts, document that in `docs/architecture/frontend.md` and still add a command-row action.

- [ ] **Step 4: Build route-ranked Jobs rows**

  Reuse the ordinary Jobs row vocabulary where possible. Add route summary as the leading scan target while preserving:
  - job title/reference;
  - status;
  - existing priority;
  - assignee/coordinator where already shown;
  - site context;
  - labels;
  - detail navigation.

  Add the maps handoff split button as a row action. The primary action label is `Open in Maps`; the attached dropdown exposes Google Maps and Apple Maps.

- [ ] **Step 5: Build Jobs proximity map mode**

  The map should match the combined laptop and mobile references:
  - origin marker;
  - numbered ranked destination markers;
  - muted route lines for all returned rows;
  - selected route line and marker highlighted;
  - side rail on desktop;
  - bottom sheet selected result on mobile;
  - route line omitted gracefully when display geometry is unavailable.

  Hover/focus/select must sync row, marker, and route line.

- [ ] **Step 6: Implement route operational states**

  Cover:
  - loading skeleton rows and map placeholders;
  - no eligible mapped jobs;
  - no driving route for eligible jobs;
  - route provider unavailable;
  - cost guard blocked with retry hint;
  - typed-origin required;
  - location denied/unavailable;
  - cap-hit metadata.

  Recovery actions should be one of `Refresh`, `Change origin`, `Clear filters`, or `View ordinary jobs`.

- [ ] **Step 7: Verify Jobs UI**

  Run:

  ```bash
  pnpm --filter app test -- src/features/jobs
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/features/jobs apps/app/src/routes/_app._org.jobs.tsx apps/app/src/hotkeys/hotkey-registry.ts docs/architecture/frontend.md
  git commit -m "Add route-aware Jobs near me UI"
  ```

## Task 4: Sites Near Me Dashboard

**Files:**

- Create: `apps/app/src/features/sites/sites-search.ts`
- Modify: `apps/app/src/routes/_app._org.sites.tsx`
- Modify: `apps/app/src/features/sites/sites-page.tsx`
- Create: `apps/app/src/features/sites/sites-proximity-panel.tsx`
- Create: `apps/app/src/features/sites/sites-proximity-map.tsx`
- Create: `apps/app/src/features/sites/sites-proximity-row.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Test: `apps/app/src/features/sites/sites-proximity*.test.tsx`
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Write failing Sites UI tests**

  Cover:
  - ordinary Sites page load does not request geolocation or call proximity;
  - selecting Near me requests current location or moves to typed-origin fallback;
  - Sites query/search filters are sent before route ranking;
  - mapped-only is locked while Near me is active;
  - all mapped, non-archived sites are eligible by default;
  - rows include site data, active job count, highest active priority, drive time, route distance, and maps handoff;
  - map mode requests route lines;
  - list mode does not request route lines;
  - cap metadata and route errors render consistently with Jobs.

  Run:

  ```bash
  pnpm --filter app test -- src/features/sites/sites-proximity
  ```

  Expected: FAIL.

- [ ] **Step 2: Add Sites search params**

  Add a typed Sites search module similar to Jobs:
  - `near=true | false`;
  - `routeLimit=10 | 15 | 20 | 25`;
  - `view=list | map` if Sites does not already have a route-owned view param.

  Preserve existing route search behavior. Do not store origin data in the URL.

- [ ] **Step 3: Build Sites Near me controls**

  Match the Jobs controls so the experience is uniform:
  - explicit Near me chip/control;
  - locked mapped-only chip;
  - limit select;
  - computed-at and refresh;
  - change origin;
  - traffic-aware tooltip.

  Register the Sites equivalent hotkey or command action through the hotkey layer.

- [ ] **Step 4: Build Sites route-ranked rows**

  Reuse shared route result primitives but keep the row domain-specific:
  - site name;
  - site address;
  - active job count;
  - highest active priority;
  - route summary;
  - maps handoff;
  - site detail navigation.

  Add a note in docs that stronger identification for sites with jobs attached is a follow-up enhancement from the product plan.

- [ ] **Step 5: Build Sites proximity map mode**

  Match the Sites laptop reference:
  - map-first layout on desktop where appropriate;
  - dense ranked results rail;
  - numbered markers;
  - route lines and selection sync;
  - mobile bottom sheet behavior consistent with Jobs.

- [ ] **Step 6: Verify Sites UI**

  Run:

  ```bash
  pnpm --filter app test -- src/features/sites
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/features/sites apps/app/src/routes/_app._org.sites.tsx apps/app/src/hotkeys/hotkey-registry.ts docs/architecture/frontend.md
  git commit -m "Add route-aware Sites near me UI"
  ```

## Task 5: Agent Inline Proximity UI

**Files:**

- Modify: `apps/app/src/features/agent/global-agent-chat-panel.tsx`
- Create: `apps/app/src/features/agent/agent-proximity-intent.ts`
- Create: `apps/app/src/features/agent/agent-proximity-location.tsx`
- Create: `apps/app/src/features/agent/agent-proximity-tool-renderers.tsx`
- Create: `apps/app/src/features/agent/agent-route-preview-card.tsx`
- Test: `apps/app/src/features/agent/agent-proximity*.test.tsx`
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Inspect the chat SDK transport**

  Before editing, inspect the installed `@cloudflare/ai-chat` and `agents/react` types/source. The current app types `sendMessage` as `{ text }`, but the implementation must verify whether the SDK supports hidden metadata/context on user messages.

  Preferred path:
  - pass current-location origin context as non-visible message metadata or an equivalent SDK-supported side channel;
  - keep the visible user text unchanged;
  - let the Agent Worker or action input builder use the structured origin when the model calls proximity tools.

  If the SDK cannot carry non-visible context, implement a small source-owned transport extension in the Agent Worker/app boundary as part of this task before shipping seamless Agent Near me. Do not append coordinates, place IDs, or typed-origin details to visible chat text as a workaround.

- [ ] **Step 2: Write failing Agent UI tests**

  Cover:
  - proximity-intent detection preflights location before sending a near-me message;
  - current-location preflight uses the global preference and browser geolocation;
  - missing permission renders inline `Share current location` action;
  - denied location renders typed-origin fallback;
  - proximity list tool outputs render compact ranked cards, not raw JSON;
  - job/site route preview outputs render a mini map with route line, markers, drive time, distance, computed-at, and maps handoff;
  - route-list Agent outputs omit route geometry;
  - cost guard/provider errors stop retry-like UI and explain the issue.

  Run:

  ```bash
  pnpm --filter app test -- src/features/agent/agent-proximity
  ```

  Expected: FAIL.

- [ ] **Step 3: Add proximity intent preflight**

  Add a conservative client-side detector for obvious current-location intents:
  - "near me";
  - "closest jobs";
  - "closest sites";
  - "how close is this job";
  - "directions to this site";
  - equivalent phrases already present in the product plan.

  The detector is a UX preflight only. The model and backend schemas remain authoritative. If the detector is unsure, send the message normally.

- [ ] **Step 4: Add Agent location sharing UI**

  Use the same origin state machine as Jobs and Sites:
  - if preference is enabled and browser permission works, fetch current location for this request;
  - if preference is missing or permission is prompt, show a clear inline action;
  - if denied/unavailable, open typed-origin fallback.

  The UI must say Ceird uses current coordinates for this route request and does not save them.

- [ ] **Step 5: Render structured proximity tool outputs**

  Replace raw `ToolPayloadPreview` only for known proximity action outputs:
  - `ceird.jobs.proximity`;
  - `ceird.sites.proximity`;
  - job route preview;
  - site route preview.

  Keep raw payload preview for unrelated tools. Render list outputs as compact ranked cards using the same shared route row vocabulary as the dashboards. Include `View in Jobs` or `View in Sites` actions that open the dashboard with the matching filters, but do not put coordinates in the URL.

- [ ] **Step 6: Render inline route preview maps**

  Specific job/site distance questions should show:
  - mini map;
  - origin marker;
  - destination marker;
  - display-only route line;
  - drive time;
  - route distance;
  - computed-at;
  - `Open in Maps` split/dropdown.

  Do not render turn-by-turn directions or navigation steps.

- [ ] **Step 7: Verify Agent UI**

  Run:

  ```bash
  pnpm --filter app test -- src/features/agent
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/features/agent docs/architecture/frontend.md
  git commit -m "Add Agent proximity location and inline route UI"
  ```

## Task 6: Location Access Onboarding and Settings

**Files:**

- Create: `apps/app/src/features/onboarding/location-access-step.tsx`
- Modify: the existing account creation/onboarding route that first welcomes a new user
- Modify: `apps/app/src/features/settings/user-settings-page.tsx`
- Test: affected onboarding/settings files
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Identify the onboarding entry point**

  Inspect the auth/onboarding routes and find the first post-signup or account-creation surface where a user can be asked for product permissions. Do not create a disconnected marketing-style onboarding page.

- [ ] **Step 2: Write failing onboarding/settings tests**

  Cover:
  - new users see a location access step during account creation/onboarding;
  - enabling updates only the user preference and then asks the browser only when feature code needs location;
  - dismissing lets the user continue;
  - settings can change the preference later;
  - no coordinates are stored in preference payloads;
  - the copy explains route-aware nearby jobs/sites without promising background tracking.

  Run:

  ```bash
  pnpm --filter app test -- src/features/onboarding src/features/settings
  ```

  Expected: FAIL.

- [ ] **Step 3: Add onboarding step**

  Build a compact step using shadcn `Field`, `Button`, `Badge`, and `Tooltip` conventions:
  - explain that location lets Ceird find traffic-aware nearby jobs and sites;
  - primary action enables the preference;
  - secondary action continues without enabling;
  - no geolocation request is required during onboarding unless the existing browser flow makes that appropriate.

  The preference is global, but current coordinates are still requested fresh per device and per proximity run.

- [ ] **Step 4: Add settings control**

  Add a user settings row/card for:
  - current preference state;
  - enable;
  - dismiss/disable;
  - short explanation that coordinates are not stored.

- [ ] **Step 5: Verify onboarding/settings**

  Run:

  ```bash
  pnpm --filter app test -- src/features/onboarding src/features/settings
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/app/src/features/onboarding apps/app/src/features/settings docs/architecture/frontend.md
  git commit -m "Add location access onboarding and settings"
  ```

## Task 7: Visual QA, Accessibility, and Handoff Verification

**Files:**

- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Run responsive browser checks**

  Start the app against an appropriate Alchemy stage only after confirming the stage and credentials. Then capture and inspect:
  - Jobs Near me list desktop;
  - Jobs Near me map desktop;
  - Sites Near me map/list desktop;
  - mobile Jobs Near me list;
  - mobile map bottom sheet;
  - Agent inline proximity list;
  - Agent route preview;
  - onboarding location access;
  - typed-origin fallback;
  - provider/cost-guard states.

  Compare against the reference images for journey and shape, not pixel perfection.

- [ ] **Step 2: Run accessibility checks**

  Verify:
  - keyboard access for Near me, refresh, change origin, route limit, maps handoff, result selection, and map/list view switching;
  - visible focus states on rows, markers where reachable, and handoff buttons;
  - tooltip content is available by keyboard;
  - no text overflow on mobile or desktop;
  - route color is not the only state indicator;
  - map controls have accessible names.

- [ ] **Step 3: Run focused app verification**

  Run:

  ```bash
  pnpm --filter app test -- src/features/proximity src/features/jobs src/features/sites src/features/agent
  pnpm --filter app check-types
  pnpm --filter app lint
  ```

  Expected: PASS.

- [ ] **Step 4: Run handoff checks**

  Run:

  ```bash
  pnpm check-types
  pnpm test
  pnpm lint
  pnpm format
  ```

  Expected: PASS.

- [ ] **Step 5: Update frontend architecture**

  Document:
  - Near me as an explicit Jobs/Sites filter mode;
  - app-side origin preflight and typed-origin fallback;
  - no coordinate persistence;
  - map route-line primitive ownership;
  - Agent structured tool rendering;
  - hotkey/command discoverability;
  - visual reference image paths.

  Commit:

  ```bash
  git add docs/architecture/frontend.md
  git commit -m "Document route-aware proximity UI architecture"
  ```

## Self-Review Checklist

- [ ] All UI work used `$impeccable` and the product register before edits.
- [ ] shadcn/base-luma conventions are preserved.
- [ ] Reference images are matched for journey and UI shape, not copied pixel-for-pixel.
- [ ] No straight-line route ranking exists in UI, tests, or copy.
- [ ] Near me respects selected filters before route ranking.
- [ ] Jobs and Sites experiences are uniform.
- [ ] Location is requested at run/refresh time and never persisted.
- [ ] Coordinates are not placed in URL state, local storage, preferences, logs, or visible chat text.
- [ ] Agent proximity outputs render structured components instead of raw JSON.
- [ ] Route lines stay behind the Ceird map primitive.
- [ ] The implementation uses one product map runtime.
- [ ] `Open in Maps` primary and explicit Google/Apple dropdown options are present.
- [ ] Result limit defaults to 10 and caps at 25.
- [ ] The 100-candidate cap is displayed calmly when returned.
- [ ] Route provider and cost-guard failures fail explicitly and preserve ordinary data surfaces where possible.
- [ ] Desktop and mobile screenshots have been reviewed against the persisted references.
