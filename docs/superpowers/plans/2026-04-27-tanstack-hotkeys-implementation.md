# TanStack Hotkeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add app-wide, context-aware keyboard shortcuts using TanStack Hotkeys, with Linear-style shortcut discovery rendered through shadcn `Kbd`.

**Architecture:** TanStack Hotkeys owns shortcut registration, scoping, sequences, and key handling. A small `#/hotkeys` layer owns shortcut IDs, display labels, scope metadata, and rendering helpers so the hotkey behavior and UI hints cannot drift apart. Discoverability is layered: global help overlay, one-time quiet notification, tooltips, dropdown/command keycaps, and context-only shortcuts in drawers/pages.

**Tech Stack:** React 19, TanStack Router, TanStack Hotkeys (`@tanstack/react-hotkeys`), shadcn `Kbd`, Base UI tooltip/dialog/menu primitives, Vitest, Testing Library `userEvent.keyboard`.

---

## References

- TanStack Hotkeys docs: https://tanstack.com/hotkeys/latest
- TanStack Hotkeys installation: https://tanstack.com/hotkeys/latest/docs/installation
- TanStack Hotkeys guide: https://tanstack.com/hotkeys/latest/docs/framework/react/guides/hotkeys
- TanStack Hotkeys formatting/display: https://tanstack.com/hotkeys/latest/docs/framework/react/guides/formatting-display
- shadcn Kbd docs: https://ui.shadcn.com/docs/components/base/kbd

## File Structure

- Create `apps/app/src/hotkeys/hotkey-registry.ts`: typed shortcut IDs, groups, scopes, key strings, labels, and enablement metadata.
- Create `apps/app/src/hotkeys/hotkey-display.tsx`: platform-aware shortcut parsing/rendering with shadcn `Kbd`/`KbdGroup`.
- Create `apps/app/src/hotkeys/use-app-hotkey.ts`: project wrapper around TanStack `useHotkey` and sequence APIs with app defaults.
- Create `apps/app/src/hotkeys/shortcut-help-overlay.tsx`: `?` / `Mod+/` overlay listing available shortcuts for the current context.
- Create `apps/app/src/hotkeys/shortcut-intro-notice.tsx`: one-time Linear-style notice telling users to press `?`.
- Create `apps/app/src/components/ui/kbd.tsx`: shadcn-generated `Kbd` and `KbdGroup`.
- Modify `apps/app/package.json`: add `@tanstack/react-hotkeys`.
- Modify `apps/app/src/routes/__root.tsx`: wrap with `HotkeysProvider`.
- Modify `apps/app/src/components/ui/sidebar.tsx`: replace the hand-rolled `keydown` listener with `useAppHotkey`.
- Modify `apps/app/src/components/site-header.tsx`: add shortcut help trigger and one-time notice mount.
- Modify `apps/app/src/components/ui/command-select.tsx`: render shortcut hints with `ShortcutHint`.
- Modify `apps/app/src/components/ui/dropdown-menu.tsx`: keep `DropdownMenuShortcut`, but style it to host `KbdGroup`.
- Modify `apps/app/src/features/jobs/jobs-page.tsx`: Jobs list shortcuts and inline keycap hints.
- Modify `apps/app/src/features/jobs/jobs-create-sheet.tsx`: create drawer shortcuts.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.tsx`: detail drawer shortcuts.
- Modify `apps/app/src/features/sites/sites-page.tsx`: Sites list shortcuts.
- Modify `apps/app/src/features/sites/sites-create-sheet.tsx`: site create drawer shortcuts.
- Modify `apps/app/src/features/sites/sites-detail-sheet.tsx`: site detail drawer shortcuts.
- Modify `apps/app/src/features/organizations/organization-members-page.tsx`: invite form submit shortcut and role hint.
- Modify `apps/app/src/features/organizations/organization-settings-page.tsx`: save shortcut.
- Modify `apps/app/src/features/settings/user-settings-page.tsx`: focused-form submit shortcuts.
- Modify `apps/app/src/components/ui/map.tsx`: focus-scoped map control shortcuts.
- Modify `AGENTS.md`: document that new UI routes/actions need hotkey coverage or an explicit exception.
- Add or modify focused tests beside each changed feature.

## Shortcut Set

Global:

- `Mod+B`: toggle sidebar.
- `?`: open shortcut help.
- `Mod+/`: open shortcut help.
- `G J`: go to Jobs.
- `G S`: go to Sites.
- `G M`: go to Members.
- `G O`: go to Organization settings.
- `G U`: go to User settings.

Jobs list:

- `/`: focus job search.
- `N`: new job, only when the viewer can create jobs.
- `V L`: list view.
- `V M`: map view.
- `C`: clear filters, only when filters are active.
- `Escape`: dismiss the jobs notice, only when visible.

Jobs create drawer:

- `Mod+Enter`: submit create form.
- `Escape`: cancel/close when not creating.
- `P`: open priority select.
- `S`: open site select.
- `C`: open contact select.
- `0`, `1`, `2`, `3`, `4`: set priority when the priority select is active.

Jobs detail drawer:

- `Escape`: close drawer.
- `S`: focus next-status select.
- `C`: focus comment.
- `V`: focus visit note/date.
- `L`: focus site assignment.
- `Mod+Enter`: submit the currently focused form area.
- `R`: reopen when available.

Sites:

- `N`: new site on sites list when allowed.
- `Mod+Enter`: create or save.
- `Escape`: close drawer when not saving.
- `R`: focus region select in site create/edit drawers.

Members/settings:

- `Mod+Enter`: submit the currently focused form.
- `R`: focus invite role select on members page.

Map controls:

- Scope to focused map only.
- `+`: zoom in.
- `-`: zoom out.
- `0`: reset bearing.
- `L`: locate, only when locate is enabled.
- `F`: fullscreen, only when fullscreen is enabled.

## Task 1: Install Dependencies and Add Kbd

**Prerequisite:** `AGENTS.md` now includes a "Hotkeys And UI Actions" section requiring new routes, workflow actions, command/menu items, and icon-only controls to have hotkey coverage or an explicit exception. Keep that instruction intact during implementation.

**Files:**

- Modify: `apps/app/package.json`
- Create: `apps/app/src/components/ui/kbd.tsx`
- Verify: `pnpm-lock.yaml`

- [ ] **Step 1: Add TanStack Hotkeys**

Run:

```bash
pnpm --dir apps/app add @tanstack/react-hotkeys
```

Expected: `apps/app/package.json` includes `@tanstack/react-hotkeys`, and the root `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add shadcn Kbd**

Run:

```bash
pnpm --dir apps/app dlx shadcn@latest add kbd
```

Expected: `apps/app/src/components/ui/kbd.tsx` exists and exports `Kbd` and `KbdGroup`.

- [ ] **Step 3: Normalize imports**

Open `apps/app/src/components/ui/kbd.tsx` and make sure imports use project style:

```ts
import { cn } from "#/lib/utils";
```

Expected: no `@/lib/utils` import remains.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/app/src/components/ui/kbd.tsx pnpm-lock.yaml
git commit -m "feat: add hotkeys dependencies"
```

## Task 2: Create Shortcut Registry and Display Helpers

**Files:**

- Create: `apps/app/src/hotkeys/hotkey-registry.ts`
- Create: `apps/app/src/hotkeys/hotkey-display.tsx`
- Create: `apps/app/src/hotkeys/hotkey-display.test.tsx`

- [ ] **Step 1: Write display tests**

Create `apps/app/src/hotkeys/hotkey-display.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShortcutHint } from "./hotkey-display";

describe("ShortcutHint", () => {
  it("renders a single key as a keyboard key", () => {
    render(<ShortcutHint hotkey="N" label="New job" />);

    expect(screen.getByLabelText("New job shortcut: N")).toBeVisible();
    expect(screen.getByText("N")).toBeVisible();
  });

  it("renders modifier chords as grouped keys", () => {
    render(<ShortcutHint hotkey="Mod+Enter" label="Submit form" />);

    const group = screen.getByLabelText("Submit form shortcut: Mod+Enter");
    expect(within(group).getByText(/Cmd|Ctrl/)).toBeVisible();
    expect(within(group).getByText("Enter")).toBeVisible();
  });

  it("renders sequences with separate groups", () => {
    render(<ShortcutHint hotkey="G J" label="Go to Jobs" />);

    expect(
      screen.getByLabelText("Go to Jobs shortcut: G then J")
    ).toBeVisible();
    expect(screen.getByText("G")).toBeVisible();
    expect(screen.getByText("J")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --dir apps/app exec vitest run src/hotkeys/hotkey-display.test.tsx
```

Expected: FAIL because `hotkey-display.tsx` does not exist.

- [ ] **Step 3: Add registry**

Create `apps/app/src/hotkeys/hotkey-registry.ts`:

```ts
export type HotkeyScope =
  | "global"
  | "jobs"
  | "job-create"
  | "job-detail"
  | "sites"
  | "site-create"
  | "site-detail"
  | "members"
  | "settings"
  | "map";

export type HotkeyGroup =
  | "Navigation"
  | "Layout"
  | "Jobs"
  | "Job drawer"
  | "Sites"
  | "Members"
  | "Settings"
  | "Map";

export interface HotkeyDefinition {
  readonly id: string;
  readonly group: HotkeyGroup;
  readonly hotkey: string;
  readonly label: string;
  readonly scope: HotkeyScope;
}

export const HOTKEYS = {
  help: {
    group: "Layout",
    hotkey: "?",
    id: "help",
    label: "Show keyboard shortcuts",
    scope: "global",
  },
  helpAlternate: {
    group: "Layout",
    hotkey: "Mod+/",
    id: "helpAlternate",
    label: "Show keyboard shortcuts",
    scope: "global",
  },
  toggleSidebar: {
    group: "Layout",
    hotkey: "Mod+B",
    id: "toggleSidebar",
    label: "Toggle sidebar",
    scope: "global",
  },
  goJobs: {
    group: "Navigation",
    hotkey: "G J",
    id: "goJobs",
    label: "Go to Jobs",
    scope: "global",
  },
  goSites: {
    group: "Navigation",
    hotkey: "G S",
    id: "goSites",
    label: "Go to Sites",
    scope: "global",
  },
  jobsSearch: {
    group: "Jobs",
    hotkey: "/",
    id: "jobsSearch",
    label: "Search jobs",
    scope: "jobs",
  },
  jobsNew: {
    group: "Jobs",
    hotkey: "N",
    id: "jobsNew",
    label: "Create job",
    scope: "jobs",
  },
  jobsClearFilters: {
    group: "Jobs",
    hotkey: "C",
    id: "jobsClearFilters",
    label: "Clear filters",
    scope: "jobs",
  },
  submitForm: {
    group: "Settings",
    hotkey: "Mod+Enter",
    id: "submitForm",
    label: "Submit form",
    scope: "settings",
  },
} as const satisfies Record<string, HotkeyDefinition>;

export type HotkeyId = keyof typeof HOTKEYS;
```

- [ ] **Step 4: Add display helper**

Create `apps/app/src/hotkeys/hotkey-display.tsx`:

```tsx
import { formatWithLabels } from "@tanstack/react-hotkeys";
import * as React from "react";

import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { cn } from "#/lib/utils";

export function formatHotkeyForLabel(hotkey: string) {
  return hotkey
    .split(" ")
    .map((chord) => formatWithLabels(chord))
    .join(" then ");
}

export function ShortcutHint({
  className,
  hotkey,
  label,
}: {
  readonly className?: string;
  readonly hotkey: string;
  readonly label: string;
}) {
  const sequences = hotkey.split(" ");
  const accessibleLabel = `${label} shortcut: ${formatHotkeyForLabel(hotkey)}`;

  return (
    <span
      aria-label={accessibleLabel}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {sequences.map((sequence, sequenceIndex) => (
        <React.Fragment key={`${sequence}-${sequenceIndex}`}>
          {sequenceIndex > 0 ? (
            <span aria-hidden="true" className="text-muted-foreground">
              then
            </span>
          ) : null}
          <KbdGroup>
            {formatWithLabels(sequence)
              .split("+")
              .map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
          </KbdGroup>
        </React.Fragment>
      ))}
    </span>
  );
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/hotkeys/hotkey-display.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/hotkeys/hotkey-display.tsx apps/app/src/hotkeys/hotkey-display.test.tsx
git commit -m "feat: add shortcut registry and keycap display"
```

## Task 3: Add Provider, App Hook, and Sidebar Migration

**Files:**

- Create: `apps/app/src/hotkeys/use-app-hotkey.ts`
- Modify: `apps/app/src/routes/__root.tsx`
- Modify: `apps/app/src/components/ui/sidebar.tsx`
- Modify: `apps/app/src/components/app-layout.test.tsx` or `apps/app/src/components/site-header.test.tsx`

- [ ] **Step 1: Write sidebar shortcut test**

Add a test near the existing sidebar/app layout coverage that renders the app shell and presses `Meta+B` or `Control+B`.

```tsx
import userEvent from "@testing-library/user-event";

it("toggles the sidebar with Mod+B", async () => {
  const user = userEvent.setup();
  render(
    <SidebarProvider>
      <Probe />
    </SidebarProvider>
  );

  await user.keyboard("{Meta>}b{/Meta}");

  expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed");
});
```

Expected before implementation: FAIL because the wrapper hook/provider is not installed yet, or because the test probe still sees the initial state.

- [ ] **Step 2: Create app hotkey wrapper**

Create `apps/app/src/hotkeys/use-app-hotkey.ts`:

```ts
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import * as React from "react";

import { HOTKEYS } from "./hotkey-registry";
import type { HotkeyId } from "./hotkey-registry";

export function useAppHotkey(
  id: HotkeyId,
  handler: (event: KeyboardEvent) => void,
  options: {
    readonly enabled?: boolean;
    readonly preventDefault?: boolean;
  } = {}
) {
  const definition = HOTKEYS[id];
  const enabled = options.enabled ?? true;
  const preventDefault = options.preventDefault ?? true;

  useHotkey(
    definition.hotkey,
    (event) => {
      if (preventDefault) {
        event.preventDefault();
      }
      handler(event);
    },
    { enabled }
  );
}

function toSequence(hotkey: string) {
  return hotkey.split(" ").filter((part) => part.length > 0);
}

export function useAppHotkeySequence(
  id: HotkeyId,
  handler: () => void,
  options: { readonly enabled?: boolean } = {}
) {
  const definition = HOTKEYS[id];

  useHotkeySequence(
    toSequence(definition.hotkey),
    () => {
      handler();
    },
    { enabled: options.enabled ?? true }
  );
}
```

- [ ] **Step 3: Add provider**

Modify `apps/app/src/routes/__root.tsx`:

```tsx
import { HotkeysProvider } from "@tanstack/react-hotkeys";
```

Wrap the body children inside `TooltipProvider`:

```tsx
<TooltipProvider>
  <HotkeysProvider>
    {children}
    <ClientOnlyDevelopmentDevtools />
    <Scripts />
  </HotkeysProvider>
</TooltipProvider>
```

- [ ] **Step 4: Replace sidebar effect**

Modify `apps/app/src/components/ui/sidebar.tsx`:

```ts
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
```

Replace the manual `React.useEffect` keydown block with:

```ts
useAppHotkey("toggleSidebar", () => {
  toggleSidebar();
});
```

Keep `SIDEBAR_KEYBOARD_SHORTCUT` only if tests or labels still use it. Otherwise remove it.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/components/app-layout.test.tsx src/components/site-header.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/hotkeys/use-app-hotkey.ts apps/app/src/routes/__root.tsx apps/app/src/components/ui/sidebar.tsx apps/app/src/components/app-layout.test.tsx apps/app/src/components/site-header.test.tsx
git commit -m "feat: wire hotkeys provider and sidebar shortcut"
```

## Task 4: Add Shortcut Help Overlay and One-Time Notice

**Files:**

- Create: `apps/app/src/hotkeys/shortcut-help-overlay.tsx`
- Create: `apps/app/src/hotkeys/shortcut-help-overlay.test.tsx`
- Create: `apps/app/src/hotkeys/shortcut-intro-notice.tsx`
- Modify: `apps/app/src/components/site-header.tsx`

- [ ] **Step 1: Write overlay tests**

Create `apps/app/src/hotkeys/shortcut-help-overlay.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ShortcutHelpOverlay } from "./shortcut-help-overlay";

describe("ShortcutHelpOverlay", () => {
  it("opens from the trigger and lists global shortcuts", async () => {
    const user = userEvent.setup();
    render(<ShortcutHelpOverlay activeScopes={["global"]} />);

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" })
    ).toBeVisible();
    expect(screen.getByText("Toggle sidebar")).toBeVisible();
    expect(screen.getByText("Go to Jobs")).toBeVisible();
  });

  it("only lists active scoped shortcuts", async () => {
    const user = userEvent.setup();
    render(<ShortcutHelpOverlay activeScopes={["global", "jobs"]} />);

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    expect(screen.getByText("Search jobs")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --dir apps/app exec vitest run src/hotkeys/shortcut-help-overlay.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement overlay**

Create `apps/app/src/hotkeys/shortcut-help-overlay.tsx` using the existing dialog primitives:

```tsx
"use client";

import { KeyboardIcon } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";

import { HOTKEYS } from "./hotkey-registry";
import type { HotkeyScope } from "./hotkey-registry";
import { ShortcutHint } from "./hotkey-display";
import { useAppHotkey } from "./use-app-hotkey";

export function ShortcutHelpOverlay({
  activeScopes,
}: {
  readonly activeScopes: readonly HotkeyScope[];
}) {
  const [open, setOpen] = React.useState(false);
  const activeScopeSet = React.useMemo(
    () => new Set(activeScopes),
    [activeScopes]
  );
  const shortcuts = Object.values(HOTKEYS).filter((shortcut) =>
    activeScopeSet.has(shortcut.scope)
  );

  useAppHotkey("help", () => setOpen(true));
  useAppHotkey("helpAlternate", () => setOpen(true));

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Keyboard shortcuts"
        onClick={() => setOpen(true)}
      >
        <KeyboardIcon aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-label="Keyboard shortcuts">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Shortcuts available in the current view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            {Array.from(
              new Set(shortcuts.map((shortcut) => shortcut.group))
            ).map((group) => (
              <section key={group} className="grid gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {group}
                </h3>
                <div className="grid gap-2">
                  {shortcuts
                    .filter((shortcut) => shortcut.group === group)
                    .map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
                      >
                        <span className="text-sm font-medium">
                          {shortcut.label}
                        </span>
                        <ShortcutHint
                          hotkey={shortcut.hotkey}
                          label={shortcut.label}
                        />
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Implement one-time notice**

Create `apps/app/src/hotkeys/shortcut-intro-notice.tsx`:

```tsx
"use client";

import * as React from "react";

import { Button } from "#/components/ui/button";

const STORAGE_KEY = "task-tracker-shortcut-intro-seen";

export function ShortcutIntroNotice() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) !== "true") {
      setVisible(true);
    }
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm shadow-lg"
    >
      <span className="text-muted-foreground">
        Keyboard shortcuts are available. Press ? anytime.
      </span>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => {
          window.localStorage.setItem(STORAGE_KEY, "true");
          setVisible(false);
        }}
      >
        Got it
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Mount in site header**

Modify `apps/app/src/components/site-header.tsx` to render:

```tsx
<ShortcutHelpOverlay activeScopes={["global"]} />
<ShortcutIntroNotice />
```

Later tasks can pass route-specific scopes from page components if global header context is not enough.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/hotkeys/shortcut-help-overlay.test.tsx src/components/site-header.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/hotkeys/shortcut-help-overlay.tsx apps/app/src/hotkeys/shortcut-help-overlay.test.tsx apps/app/src/hotkeys/shortcut-intro-notice.tsx apps/app/src/components/site-header.tsx
git commit -m "feat: add keyboard shortcut discovery"
```

## Task 5: Render Keycaps in Shared UI

**Files:**

- Modify: `apps/app/src/components/ui/command-select.tsx`
- Modify: `apps/app/src/components/ui/dropdown-menu.tsx`
- Add or modify: `apps/app/src/components/ui/command-select.test.tsx`

- [ ] **Step 1: Write CommandSelect keycap test**

Create `apps/app/src/components/ui/command-select.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandSelect } from "./command-select";

describe("CommandSelect", () => {
  it("renders option shortcuts as keycaps", async () => {
    const user = userEvent.setup();
    render(
      <CommandSelect
        id="priority"
        value="none"
        placeholder="Priority"
        emptyText="No priorities found."
        groups={[
          {
            label: "Priority",
            options: [{ label: "Urgent", value: "urgent", shortcut: "1" }],
          },
        ]}
        onValueChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /priority/i }));

    expect(screen.getByLabelText("Urgent shortcut: 1")).toBeVisible();
  });
});
```

- [ ] **Step 2: Update CommandSelect rendering**

Modify `apps/app/src/components/ui/command-select.tsx`:

```ts
import { ShortcutHint } from "#/hotkeys/hotkey-display";
```

Replace the raw shortcut span:

```tsx
{
  option.shortcut ? (
    <ShortcutHint
      className="order-3 ml-auto"
      hotkey={option.shortcut}
      label={option.label}
    />
  ) : null;
}
```

- [ ] **Step 3: Update DropdownMenuShortcut**

Modify `apps/app/src/components/ui/dropdown-menu.tsx` so `DropdownMenuShortcut` supports either string children or a full `ShortcutHint`:

```tsx
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
```

Do not import hotkey display here; callers should choose plain text or `ShortcutHint`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/components/ui/command-select.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/ui/command-select.tsx apps/app/src/components/ui/command-select.test.tsx apps/app/src/components/ui/dropdown-menu.tsx
git commit -m "feat: render shortcut keycaps in shared controls"
```

## Task 6: Add Global Navigation and Jobs List Shortcuts

**Files:**

- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`

- [ ] **Step 1: Add registry entries**

Extend `HOTKEYS` with:

```ts
goMembers: {
  group: "Navigation",
  hotkey: "G M",
  id: "goMembers",
  label: "Go to Members",
  scope: "global",
},
goOrganizationSettings: {
  group: "Navigation",
  hotkey: "G O",
  id: "goOrganizationSettings",
  label: "Go to Organization settings",
  scope: "global",
},
goUserSettings: {
  group: "Navigation",
  hotkey: "G U",
  id: "goUserSettings",
  label: "Go to User settings",
  scope: "global",
},
jobsViewList: {
  group: "Jobs",
  hotkey: "V L",
  id: "jobsViewList",
  label: "Show list view",
  scope: "jobs",
},
jobsViewMap: {
  group: "Jobs",
  hotkey: "V M",
  id: "jobsViewMap",
  label: "Show map view",
  scope: "jobs",
},
jobsDismissNotice: {
  group: "Jobs",
  hotkey: "Escape",
  id: "jobsDismissNotice",
  label: "Dismiss notice",
  scope: "jobs",
},
```

- [ ] **Step 2: Add global route shortcuts**

In `apps/app/src/components/app-sidebar.tsx`, use `useNavigate` and `useAppHotkeySequence`:

```ts
useAppHotkeySequence("goJobs", () => void navigate({ to: "/jobs" }));
useAppHotkeySequence("goSites", () => void navigate({ to: "/sites" }));
useAppHotkeySequence("goMembers", () => void navigate({ to: "/members" }));
useAppHotkeySequence(
  "goOrganizationSettings",
  () => void navigate({ to: "/organization/settings" })
);
useAppHotkeySequence(
  "goUserSettings",
  () => void navigate({ to: "/settings", search: { emailChange: undefined } })
);
```

- [ ] **Step 3: Add JobsPage refs and hotkeys**

In `apps/app/src/features/jobs/jobs-page.tsx`, create a search ref:

```ts
const searchInputRef = React.useRef<HTMLInputElement | null>(null);
```

Register:

```ts
useAppHotkey("jobsSearch", () => searchInputRef.current?.focus());
useAppHotkey("jobsNew", () => void navigate({ to: "/jobs/new" }), {
  enabled: canCreateJobs,
});
useAppHotkeySequence("jobsViewList", () => setViewMode("list"));
useAppHotkeySequence("jobsViewMap", () => setViewMode("map"));
useAppHotkey("jobsClearFilters", () => setFilters(defaultJobsListFilters), {
  enabled: hasCustomFilters,
});
useAppHotkey("jobsDismissNotice", () => setNotice(null), {
  enabled: Boolean(notice),
});
```

Pass the ref into `JobsCommandToolbar` and onto `InputGroupInput`.

- [ ] **Step 4: Add visible hints**

In the Jobs header, render `ShortcutHint` beside "New job" and in the search input group:

```tsx
<ShortcutHint hotkey={HOTKEYS.jobsNew.hotkey} label={HOTKEYS.jobsNew.label} />
```

Keep keycaps small and right-aligned. Do not add visible explanatory text beyond the keycaps.

- [ ] **Step 5: Write and run JobsPage keyboard tests**

Add tests for `/`, `N`, `V M`, `V L`, and `C` where practical.

Run:

```bash
pnpm --dir apps/app exec vitest run src/features/jobs/jobs-page.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/components/app-sidebar.tsx apps/app/src/features/jobs/jobs-page.tsx apps/app/src/features/jobs/jobs-page.test.tsx
git commit -m "feat: add global and jobs list shortcuts"
```

## Task 7: Add Drawer and Form Shortcuts

**Files:**

- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`
- Modify: related tests for each feature

- [ ] **Step 1: Add registry entries**

Add IDs for `drawerClose`, `jobCreatePriority`, `jobCreateSite`, `jobCreateContact`, `jobDetailStatus`, `jobDetailComment`, `jobDetailVisit`, `jobDetailSite`, `jobDetailReopen`, `siteRegion`, and reuse `submitForm` for `Mod+Enter`.

- [ ] **Step 2: Add create-job drawer shortcuts**

In `JobsCreateSheet`, use refs on the trigger buttons/selects and register:

```ts
useAppHotkey("submitForm", () => formRef.current?.requestSubmit(), {
  enabled: overlayOpen && !createResult.waiting,
});
useAppHotkey("drawerClose", () => closeSheet({ delayed: true }), {
  enabled: overlayOpen && !createResult.waiting,
});
useAppHotkey("jobCreatePriority", () => priorityTriggerRef.current?.click(), {
  enabled: overlayOpen,
});
```

For `0` to `4`, update priority directly only when the priority popover is open. Do not let numeric shortcuts fire globally while the user is typing.

- [ ] **Step 3: Add job-detail shortcuts**

In `JobsDetailSheet`, add refs for status select, comment textarea, visit note/date, and site select. Register:

```ts
useAppHotkey("drawerClose", closeSheet);
useAppHotkey("jobDetailStatus", () => statusTriggerRef.current?.click(), {
  enabled: hasAssignmentAccess,
});
useAppHotkey("jobDetailComment", () => commentTextareaRef.current?.focus());
useAppHotkey("jobDetailReopen", () => void handleReopen(), {
  enabled:
    canReopen && detail.job.status === "completed" && !reopenResult.waiting,
});
```

- [ ] **Step 4: Add site create/detail shortcuts**

In `SitesCreateSheet` and `SitesDetailSheet`, use a `formRef` and region trigger ref:

```ts
useAppHotkey("submitForm", () => formRef.current?.requestSubmit(), {
  enabled: !createResult.waiting,
});
useAppHotkey("drawerClose", () => closeSheet({ delayed: true }), {
  enabled: !createResult.waiting,
});
useAppHotkey("siteRegion", () => regionTriggerRef.current?.click());
```

Use `updateResult` instead of `createResult` in the detail sheet.

- [ ] **Step 5: Add tests**

For each drawer test file, add one keyboard test:

```tsx
await user.keyboard("{Meta>}{Enter}{/Meta}");
expect(createMutation).toHaveBeenCalled();
```

Also test `Escape` closes only when not waiting.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/features/jobs/jobs-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/sites/sites-create-sheet.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/features/jobs/jobs-create-sheet.tsx apps/app/src/features/jobs/jobs-create-sheet.test.tsx apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx apps/app/src/features/sites/sites-create-sheet.tsx apps/app/src/features/sites/sites-create-sheet.test.tsx apps/app/src/features/sites/sites-detail-sheet.tsx
git commit -m "feat: add drawer keyboard shortcuts"
```

## Task 8: Add Members, Settings, and Map Shortcuts

**Files:**

- Modify: `apps/app/src/features/organizations/organization-members-page.tsx`
- Modify: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Modify: `apps/app/src/features/settings/user-settings-page.tsx`
- Modify: `apps/app/src/components/ui/map.tsx`
- Modify: related tests

- [ ] **Step 1: Add focused form submit helper where needed**

For pages with multiple forms, submit the nearest focused form:

```ts
function submitFocusedForm() {
  const activeElement = document.activeElement;
  const form =
    activeElement instanceof HTMLElement ? activeElement.closest("form") : null;
  form?.requestSubmit();
}
```

Register `submitForm` with this helper in members/settings pages.

- [ ] **Step 2: Add role/region focus shortcuts**

Members page:

```ts
useAppHotkey("membersInviteRole", () => inviteRoleTriggerRef.current?.click());
```

Organization settings page uses only `Mod+Enter` because it has one form.

- [ ] **Step 3: Add focus-scoped map shortcuts**

In `apps/app/src/components/ui/map.tsx`, make the map control root focusable and scope shortcuts to it. Register only when the control is enabled:

```ts
useAppHotkey("mapZoomIn", handleZoomIn, { enabled: showZoom });
useAppHotkey("mapZoomOut", handleZoomOut, { enabled: showZoom });
useAppHotkey("mapResetBearing", handleResetBearing, { enabled: showCompass });
useAppHotkey("mapLocate", handleLocate, { enabled: showLocate });
useAppHotkey("mapFullscreen", handleFullscreen, { enabled: showFullscreen });
```

If TanStack supports element-scoped hotkeys directly, use that API instead of manually checking focus.

- [ ] **Step 4: Add visible hints**

Add tooltip keycaps to map control buttons and settings submit buttons where they are not visually noisy.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir apps/app exec vitest run src/features/organizations/organization-members-page.test.tsx src/features/organizations/organization-settings-page.test.tsx src/features/settings/user-settings-page.test.tsx src/features/jobs/jobs-site-pin-picker-canvas.test.tsx
pnpm --dir apps/app check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/organizations/organization-members-page.tsx apps/app/src/features/organizations/organization-members-page.test.tsx apps/app/src/features/organizations/organization-settings-page.tsx apps/app/src/features/organizations/organization-settings-page.test.tsx apps/app/src/features/settings/user-settings-page.tsx apps/app/src/features/settings/user-settings-page.test.tsx apps/app/src/components/ui/map.tsx apps/app/src/features/jobs/jobs-site-pin-picker-canvas.test.tsx
git commit -m "feat: add settings and map shortcuts"
```

## Task 9: Final Verification and Polish Pass

**Files:**

- Modify as needed: `apps/app/src/hotkeys/*`
- Modify as needed: feature files touched above

- [ ] **Step 1: Run app verification**

Run:

```bash
pnpm --dir apps/app check-types
pnpm --dir apps/app test
pnpm check
```

Expected: PASS.

- [ ] **Step 2: Boot sandbox**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: sandbox prints app and API URLs for this worktree.

- [ ] **Step 3: Manual keyboard smoke test**

In the app URL:

- Press `?`: help overlay opens.
- Press `Mod+/`: help overlay opens.
- Press `Mod+B`: sidebar toggles.
- Press `G J`: navigates to Jobs.
- Press `/`: job search focuses.
- Press `N` on Jobs: new job drawer opens when permitted.
- Press `Escape` in drawers: drawer closes when no save/create is pending.
- Press `Mod+Enter` in create/edit forms: form submits.
- Focus map, press `+` and `-`: map zooms.

- [ ] **Step 4: Check visual density**

Inspect desktop and mobile widths. Keycaps must not cause button text wrapping or toolbar overflow. If they do, hide keycaps on narrow containers with responsive classes, but keep them in tooltips and the help overlay.

- [ ] **Step 5: Commit final fixes**

```bash
git add apps/app/src docs/superpowers/plans/2026-04-27-tanstack-hotkeys-implementation.md
git commit -m "polish: verify hotkey experience"
```

## Self-Review

- Spec coverage: The plan covers TanStack Hotkeys, shadcn Kbd, Linear-style notice/discovery, global navigation, Jobs, Sites, Members, Settings, maps, and tests.
- Placeholder scan: No `TBD`, `TODO`, or "implement later" placeholders are used.
- Type consistency: `HotkeyScope`, `HotkeyGroup`, `HotkeyDefinition`, `HotkeyId`, `HOTKEYS`, `ShortcutHint`, `useAppHotkey`, and `useAppHotkeySequence` are named consistently across tasks.
