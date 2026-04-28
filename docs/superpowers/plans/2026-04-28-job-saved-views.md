# Job Saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add built-in saved views to the jobs list so users can switch named job subsets by applying the existing filters.

**Architecture:** Keep `jobsListFiltersAtom` as the single source of truth for list filtering. Add a small saved-view definition module that resolves built-in view filters, compare the current filters to those definitions to show the active/custom state, and render a saved views popover in `JobsPage` above the existing filters. Expand the existing assignee filter model to support `unassigned`, because that built-in view is not currently representable.

**Tech Stack:** React 19, TanStack Router, Effect Atom, Vitest, Testing Library, existing shadcn/Base UI command/popover components, Hugeicons.

---

## Current Filtering Map

- `apps/app/src/routes/_app._org.jobs.tsx` validates only the `view` search param and passes list/map mode to `JobsRouteContent`.
- `apps/app/src/features/jobs/jobs-route-content.tsx` seeds `jobsListStateAtom` and `jobsOptionsStateAtom`, then renders `JobsPage`.
- `apps/app/src/features/jobs/jobs-state.ts` owns `JobsListFilters`, `defaultJobsListFilters`, `jobsListFiltersAtom`, and `visibleJobsAtom`.
- `apps/app/src/features/jobs/jobs-page.tsx` reads and patches `jobsListFiltersAtom`, renders search/status/assignee/priority/site/region/coordinator filters, builds active filter badges, registers route command actions, and uses the jobs hotkey layer.
- `apps/app/src/features/jobs/jobs-page.test.tsx` already exercises real atom-backed filtering with seeded jobs/options.

The cleanest implementation is to make saved views pure named filter presets. Selecting a saved view should call `setFilters(resolvedView.filters)`. It should not add routes, new server APIs, persistence, or URL search params.

## Built-In Views

Use these definitions for the first version:

| View           | Resolved filters                                          |
| -------------- | --------------------------------------------------------- |
| Active jobs    | `defaultJobsListFilters`                                  |
| Assigned to me | `defaultJobsListFilters` plus `assigneeId: viewer.userId` |
| Completed      | `defaultJobsListFilters` plus `status: "completed"`       |
| Blocked        | `defaultJobsListFilters` plus `status: "blocked"`         |
| High priority  | `defaultJobsListFilters` plus `priority: "high"`          |
| Unassigned     | `defaultJobsListFilters` plus `assigneeId: "unassigned"`  |

`High priority` intentionally maps to the existing single-value priority filter. A future `high OR urgent` saved view should first add multi-select priority support rather than making saved views use filtering rules that cannot be represented by the visible controls.

## File Structure

- Create: `apps/app/src/features/jobs/jobs-saved-views.ts`
  - Owns built-in saved-view ids, labels, filter resolution, and exact-match detection.
- Modify: `apps/app/src/features/jobs/jobs-state.ts`
  - Extends `JobsListFilters.assigneeId` to include `"unassigned"`.
  - Teaches `visibleJobsAtom` how to match unassigned jobs.
- Modify: `apps/app/src/features/jobs/jobs-viewer.ts`
  - Tightens `JobsViewer.userId` from `string` to `UserIdType` so dynamic saved views can assign the current user into typed job filters without casts.
- Modify: `apps/app/src/routes/_app._org.jobs.tsx`
  - Decodes the session user id into the jobs-core `UserId` brand at the jobs route boundary.
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
  - Adds the saved views popover.
  - Applies full filter presets through existing `setFilters`.
  - Shows the exact active saved view or a `Custom view` state.
  - Adds command bar actions for saved views.
  - Registers a context-aware hotkey to open saved views.
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
  - Adds one jobs-scope shortcut for opening the saved views control.
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`
  - Adds UI behavior tests for selecting saved views, custom state after manual filter edits, and unassigned filtering.
- Modify: `apps/app/src/hotkeys/shortcut-help-overlay.test.tsx`
  - Covers the new saved-views hotkey in the shortcut help surface.

---

### Task 1: Tighten The Viewer User Type

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-viewer.ts`
- Modify: `apps/app/src/routes/_app._org.jobs.tsx`
- Test: `apps/app/src/routes/-_app._org.jobs.test.tsx`

- [ ] **Step 1: Update `JobsViewer.userId`**

In `jobs-viewer.ts`, add `UserIdType` to the jobs-core import:

```ts
import type { JobStatus, UserIdType } from "@task-tracker/jobs-core";
```

Then change:

```ts
readonly userId: string;
```

to:

```ts
readonly userId: UserIdType;
```

- [ ] **Step 2: Decode the session user id at the jobs route boundary**

In `_app._org.jobs.tsx`, add these imports:

```ts
import { ParseResult } from "effect";
import { UserId } from "@task-tracker/jobs-core";
import type { UserIdType } from "@task-tracker/jobs-core";
```

Change `JobsRouteOrganizationAccess.currentUserId` to:

```ts
readonly currentUserId: UserIdType;
```

In `toJobsRouteOrganizationAccess`, set:

```ts
currentUserId: ParseResult.decodeUnknownSync(UserId)(
  organizationAccess.session.user.id
),
```

- [ ] **Step 3: Keep route tests using typed ids**

In `apps/app/src/routes/-_app._org.jobs.test.tsx`, import `UserIdType` and define:

```ts
const userId = "user_123" as UserIdType;
```

Use `userId` in mocked route access and expected viewer payloads.

- [ ] **Step 4: Run route tests**

Run: `pnpm --filter app test -- src/routes/-_app._org.jobs.test.tsx`

Expected: PASS.

---

### Task 2: Add Saved View Definitions

**Files:**

- Create: `apps/app/src/features/jobs/jobs-saved-views.ts`
- Test: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Create the saved-view module**

Add:

```ts
import type { UserIdType } from "@task-tracker/jobs-core";

import { defaultJobsListFilters, type JobsListFilters } from "./jobs-state";

export const JOB_SAVED_VIEW_IDS = [
  "active",
  "assigned-to-me",
  "completed",
  "blocked",
  "high-priority",
  "unassigned",
] as const;

export type JobSavedViewId = (typeof JOB_SAVED_VIEW_IDS)[number];

export interface JobSavedView {
  readonly id: JobSavedViewId;
  readonly label: string;
  readonly filters: JobsListFilters;
}

export function buildJobSavedViews(
  viewerUserId: UserIdType
): readonly JobSavedView[] {
  return [
    {
      id: "active",
      label: "Active jobs",
      filters: defaultJobsListFilters,
    },
    {
      id: "assigned-to-me",
      label: "Assigned to me",
      filters: {
        ...defaultJobsListFilters,
        assigneeId: viewerUserId,
      },
    },
    {
      id: "completed",
      label: "Completed",
      filters: {
        ...defaultJobsListFilters,
        status: "completed",
      },
    },
    {
      id: "blocked",
      label: "Blocked",
      filters: {
        ...defaultJobsListFilters,
        status: "blocked",
      },
    },
    {
      id: "high-priority",
      label: "High priority",
      filters: {
        ...defaultJobsListFilters,
        priority: "high",
      },
    },
    {
      id: "unassigned",
      label: "Unassigned",
      filters: {
        ...defaultJobsListFilters,
        assigneeId: "unassigned",
      },
    },
  ];
}

export function findMatchingJobSavedView(
  filters: JobsListFilters,
  savedViews: readonly JobSavedView[]
): JobSavedView | undefined {
  return savedViews.find((view) =>
    areJobsListFiltersEqual(filters, view.filters)
  );
}

export function areJobsListFiltersEqual(
  left: JobsListFilters,
  right: JobsListFilters
): boolean {
  return (
    left.assigneeId === right.assigneeId &&
    left.coordinatorId === right.coordinatorId &&
    left.priority === right.priority &&
    left.query.trim() === right.query.trim() &&
    left.regionId === right.regionId &&
    left.siteId === right.siteId &&
    left.status === right.status
  );
}
```

- [ ] **Step 2: Run typecheck to expose the planned `unassigned` type gap**

Run: `pnpm --filter app check-types`

Expected: TypeScript fails where `"unassigned"` is not yet accepted by `JobsListFilters.assigneeId`.

---

### Task 3: Make Unassigned Representable In Existing Filters

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Test: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Extend the filter type**

In `jobs-state.ts`, change:

```ts
readonly assigneeId: UserIdType | "all";
```

to:

```ts
readonly assigneeId: UserIdType | "all" | "unassigned";
```

- [ ] **Step 2: Update `visibleJobsAtom` assignee matching**

Replace the current assignee check with:

```ts
if (filters.assigneeId === "unassigned" && item.assigneeId !== undefined) {
  return false;
}

if (
  filters.assigneeId !== "all" &&
  filters.assigneeId !== "unassigned" &&
  item.assigneeId !== filters.assigneeId
) {
  return false;
}
```

- [ ] **Step 3: Add the visible unassigned option**

In `JobsCommandToolbar`, update the assignee options to include:

```tsx
options={[
  { label: "All assignees", value: "all" },
  { label: "Unassigned", value: "unassigned" },
  ...optionsState.members.map((member) => ({
    label: member.name,
    value: member.id,
  })),
]}
```

- [ ] **Step 4: Update active filter badges**

In `buildActiveFilterBadges`, make the assignee label branch explicit:

```ts
if (filters.assigneeId !== defaultJobsListFilters.assigneeId) {
  badges.push({
    key: "assigneeId",
    label:
      filters.assigneeId === "unassigned"
        ? "Assignee: Unassigned"
        : `Assignee: ${lookup.memberById.get(filters.assigneeId)?.name ?? "Unknown"}`,
  });
}
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx`

Expected: Existing jobs page tests still pass.

---

### Task 4: Render The Saved Views Control

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Test: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Import saved-view helpers**

Add imports:

```ts
import {
  buildJobSavedViews,
  findMatchingJobSavedView,
  type JobSavedView,
} from "./jobs-saved-views";
```

- [ ] **Step 2: Derive views and active/custom state in `JobsPage`**

Near the existing filter-derived constants, add:

```ts
const savedViews = React.useMemo(
  () => buildJobSavedViews(viewer.userId),
  [viewer.userId]
);
const activeSavedView = findMatchingJobSavedView(filters, savedViews);
```

- [ ] **Step 3: Add an apply helper**

Add:

```ts
const applySavedView = React.useCallback(
  (savedView: JobSavedView) => {
    setFilters(savedView.filters);
  },
  [setFilters]
);
```

- [ ] **Step 4: Pass saved-view props into the toolbar**

Update `JobsCommandToolbar` props to include:

```ts
readonly activeSavedView: JobSavedView | undefined;
readonly onSavedViewSelect: (savedView: JobSavedView) => void;
readonly savedViews: readonly JobSavedView[];
```

Pass them from `JobsPage`:

```tsx
<JobsCommandToolbar
  activeSavedView={activeSavedView}
  filters={filters}
  hasCustomFilters={hasCustomFilters}
  onSavedViewSelect={applySavedView}
  optionsState={optionsState.data}
  onClearFilters={() => setFilters(defaultJobsListFilters)}
  onFiltersChange={patchFilters}
  savedViews={savedViews}
  searchInputRef={searchInputRef}
/>
```

- [ ] **Step 5: Add `SavedViewsControl` before the search input**

Add this component near `CommandFilter`:

```tsx
function SavedViewsControl({
  activeSavedView,
  onSavedViewSelect,
  savedViews,
}: {
  readonly activeSavedView: JobSavedView | undefined;
  readonly onSavedViewSelect: (savedView: JobSavedView) => void;
  readonly savedViews: readonly JobSavedView[];
}) {
  const [open, setOpen] = React.useState(false);
  const label = activeSavedView?.label ?? "Custom view";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 bg-background"
            aria-label={`Saved view: ${label}`}
          />
        }
      >
        <HugeiconsIcon
          icon={FilterHorizontalIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Switch saved view" />
          <CommandList>
            <CommandEmpty>No views.</CommandEmpty>
            <CommandGroup heading="Saved views">
              {savedViews.map((savedView) => (
                <CommandItem
                  key={savedView.id}
                  value={savedView.label}
                  data-checked={
                    savedView.id === activeSavedView?.id ? "true" : undefined
                  }
                  onSelect={() => {
                    onSavedViewSelect(savedView);
                    setOpen(false);
                  }}
                >
                  {savedView.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

Render it as the first item in the toolbar row:

```tsx
<SavedViewsControl
  activeSavedView={activeSavedView}
  onSavedViewSelect={onSavedViewSelect}
  savedViews={savedViews}
/>
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx`

Expected: Existing tests still pass before adding saved-view assertions.

---

### Task 5: Add Command Bar And Hotkey Coverage

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/hotkeys/shortcut-help-overlay.test.tsx`

- [ ] **Step 1: Register saved-view command actions**

In `jobsPageCommandActions`, add one command action per saved view:

```ts
...savedViews.map((savedView, index) => ({
  disabled: savedView.id === activeSavedView?.id,
  group: "Job views",
  icon: FilterHorizontalIcon,
  id: `jobs-saved-view-${savedView.id}`,
  priority: 65 - index,
  run: () => applySavedView(savedView),
  scope: "route" as const,
  title: `Apply ${savedView.label} view`,
})),
```

Add `activeSavedView?.id`, `applySavedView`, and `savedViews` to the `useMemo` dependency list.

- [ ] **Step 2: Add a saved views hotkey**

Add this to `HOTKEYS`:

```ts
jobsSavedViews: {
  group: "Jobs",
  hotkey: "V S",
  id: "jobsSavedViews",
  label: "Saved views",
  scope: "jobs",
},
```

Then wire a ref or controlled `open` state from `JobsPage` to `SavedViewsControl` and register:

```ts
useAppHotkeySequence(
  "jobsSavedViews",
  () => {
    openSavedViews();
  },
  { enabled: listHotkeysEnabled }
);
```

Use a single `V S` sequence to open the saved views picker. Do not add direct per-view hotkeys in this iteration because six more job-scope shortcuts would make the shortcut surface harder to scan; the command bar actions already cover fast direct selection.

- [ ] **Step 3: Run command/hotkey tests**

Run: `pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/hotkeys/shortcut-help-overlay.test.tsx`

Expected: Tests pass and the shortcut help includes `Saved views` when the jobs scope is active and the shortcut is registered.

---

### Task 6: Test Saved View Behavior

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Add a test for selecting built-in views**

Add a test that:

```ts
it("switches saved views by applying the existing filters", async () => {
  const user = userEvent.setup();

  renderJobsPage();

  expect(
    screen.getByRole("button", { name: /saved view: active jobs/i })
  ).toBeInTheDocument();

  await chooseCommandFilter(user, /saved view/i, "Completed");

  let queuePanel = getPrimaryQueuePanel();
  expect(
    within(queuePanel).getAllByText("Closed inspection").length
  ).toBeGreaterThan(0);
  expect(
    within(queuePanel).queryByText("Inspect boiler")
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /saved view: completed/i })
  ).toBeInTheDocument();

  await chooseCommandFilter(user, /saved view/i, "Blocked");

  queuePanel = getPrimaryQueuePanel();
  expect(
    within(queuePanel).getAllByText("Await materials").length
  ).toBeGreaterThan(0);
  expect(
    within(queuePanel).queryByText("Closed inspection")
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /saved view: blocked/i })
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Add a test for dynamic assigned/unassigned views**

Add a test that:

```ts
it("supports assigned-to-me and unassigned saved views", async () => {
  const user = userEvent.setup();

  renderJobsPage({
    viewer: {
      role: "owner",
      userId: memberOneId,
    },
  });

  await chooseCommandFilter(user, /saved view/i, "Assigned to me");

  let queuePanel = getPrimaryQueuePanel();
  expect(
    within(queuePanel).getAllByText("Inspect boiler").length
  ).toBeGreaterThan(0);
  expect(
    within(queuePanel).getAllByText("Await materials").length
  ).toBeGreaterThan(0);
  expect(
    within(queuePanel).queryByText("Finalize snag list")
  ).not.toBeInTheDocument();

  await chooseCommandFilter(user, /saved view/i, "Unassigned");

  queuePanel = getPrimaryQueuePanel();
  expect(
    within(queuePanel).queryByText("Inspect boiler")
  ).not.toBeInTheDocument();
  expect(
    within(queuePanel).queryByText("Await materials")
  ).not.toBeInTheDocument();
  expect(
    within(queuePanel).queryByText("Canceled visit")
  ).not.toBeInTheDocument();
  expect(screen.getByText(/no jobs here/i)).toBeInTheDocument();
});
```

The empty result is correct because the seeded unassigned job is canceled, and built-in views preserve the default active status filter unless they explicitly change it.

- [ ] **Step 3: Add a test for manual customization state**

Add a test that:

```ts
it("shows a custom view when manual filters no longer match a saved view", async () => {
  const user = userEvent.setup();

  renderJobsPage();

  await chooseCommandFilter(user, /saved view/i, "Blocked");
  expect(
    screen.getByRole("button", { name: /saved view: blocked/i })
  ).toBeInTheDocument();

  await chooseCommandFilter(user, /priority filter/i, "Urgent");

  expect(
    screen.getByRole("button", { name: /saved view: custom view/i })
  ).toBeInTheDocument();

  const activeFilters = screen.getByLabelText("Active filters");
  expect(
    within(activeFilters).getByText("Status: Blocked")
  ).toBeInTheDocument();
  expect(
    within(activeFilters).getByText("Priority: Urgent")
  ).toBeInTheDocument();
});
```

- [ ] **Step 4: Keep the popover helper generic**

Keep `chooseCommandFilter` for this implementation because saved views use the same popover/command interaction pattern as the existing filters.

- [ ] **Step 5: Run the focused jobs test file**

Run: `pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx`

Expected: All jobs page tests pass.

---

### Task 7: Final Verification

**Files:**

- Verify only

- [ ] **Step 1: Run app typecheck**

Run: `pnpm --filter app check-types`

Expected: PASS.

- [ ] **Step 2: Run focused app tests**

Run: `pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/routes/-_app._org.jobs.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run full app tests if focused tests are green**

Run: `pnpm --filter app test`

Expected: PASS.

- [ ] **Step 4: Run a browser smoke test**

Use the sandbox workflow from `AGENTS.md` after the focused and full app tests pass:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Open the app URL and verify:

- `/jobs` shows `Active jobs` in the saved view control.
- Choosing `Completed`, `Blocked`, `High priority`, `Assigned to me`, and `Unassigned` changes the existing filter controls and list contents.
- Changing search/status/assignee/priority/site/region manually changes the saved view control to `Custom view` unless the filters exactly match a built-in view.
- No duplicate jobs routes/pages were created.

---

## Self-Review

- Requirement coverage:
  - Visible saved views control: Task 4.
  - Selecting saved view updates existing filters: Task 4.
  - Built-in/default views: Task 2.
  - Active view clarity: Task 4.
  - Manual customization clarity: Task 6.
  - Built-in only, no persistence: file structure and architecture sections.
  - Existing search/status/assignee/priority/site/region filters: Tasks 2-6 preserve `JobsListFilters` and exact matching across all fields.
  - Tests: Task 6 and Task 7.
  - No duplicate pages: architecture and verification.
- Placeholder scan: no incomplete placeholder markers remain.
- Type consistency: `JobsListFilters.assigneeId` is explicitly widened before saved views use `"unassigned"`.
