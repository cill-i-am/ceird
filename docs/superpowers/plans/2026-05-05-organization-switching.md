# Multi-Organization Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit organization switching in the authenticated app shell so multi-organization users can change the active Better Auth organization and immediately see route data and role-scoped navigation for the new organization.

**Architecture:** Keep Better Auth as the source of truth by routing list and set-active calls through the existing `apps/app/src/features/organizations/organization-access.ts` helper boundary. Add a client-only shadcn/Base UI dropdown switcher in the sidebar header, fed by the active organization already exposed from the `_app/_org` route context. After a switch, call `router.invalidate({ sync: true })` so `_app`, `_org`, and child route loaders refresh session, active organization, role, jobs, sites, activity, members, and settings state.

**Tech Stack:** TanStack Start/Router, React 19, Better Auth organization client APIs, Effect schema decoders from `@ceird/identity-core`, shadcn-style Base UI primitives, Hugeicons, Vitest, Testing Library, TanStack hotkeys.

---

## Current Source Map

- `apps/app/src/features/organizations/organization-access.ts` already owns `authClient.organization.list`, role lookups, active organization fallback, and `synchronizeClientActiveOrganization`.
- `apps/app/src/features/organizations/organization-active-sync-boundary.tsx` already calls `synchronizeClientActiveOrganization` and `router.invalidate({ sync: true })` when the session active org is stale or missing.
- `apps/app/src/routes/_app.tsx` resolves the authenticated session and current active-org role for shell-level navigation.
- `apps/app/src/routes/_app._org.tsx` resolves `activeOrganization`, `activeOrganizationId`, `activeOrganizationSync`, `currentOrganizationRole`, and `currentUserId`.
- `apps/app/src/components/app-sidebar.tsx` owns the sidebar header, role-scoped navigation, and footer account menu.
- `apps/app/src/features/organizations/organization-route-context.ts` exposes route-match helpers for organization role state.
- `apps/app/components.json` says this project uses shadcn-style Base UI components, `#/` aliases, and Hugeicons. The switcher should reuse installed `DropdownMenu`, `SidebarMenu*`, `Skeleton`, `DotMatrixButtonLoader`, `Tooltip`, and `ShortcutHint` primitives.

## Planned File Changes

- Modify `apps/app/src/features/organizations/organization-access.ts`: add an explicit `setActiveOrganization(organizationId)` helper and make `synchronizeClientActiveOrganization` delegate to it.
- Modify `apps/app/src/features/organizations/organization-access.test.ts`: add red/green helper tests for successful and failed set-active behavior.
- Modify `apps/app/src/features/organizations/organization-route-context.ts`: add `useActiveOrganizationFromMatches()` and `useActiveOrganizationIdFromMatches()` helpers.
- Create `apps/app/src/features/organizations/organization-switcher.tsx`: client component for list loading, empty/single/multiple-org UI, switch pending/error state, hotkey registration, and router invalidation.
- Create `apps/app/src/features/organizations/organization-switcher.test.tsx`: component tests for loading, empty, single-org, failed-list, failed-switch, successful switch, and hotkey behavior.
- Modify `apps/app/src/components/app-sidebar.tsx`: mount `OrganizationSwitcher` near the Ceird/active organization identity in the sidebar header.
- Modify `apps/app/src/components/app-sidebar.test.tsx`: assert the active org is passed/rendered, and role navigation still follows route context.
- Modify `apps/app/src/hotkeys/hotkey-registry.ts`: add `openOrganizationSwitcher` as `G O` under the `Navigation` group, scoped to `global`.
- Add or modify `apps/app/src/features/organizations/organization-active-sync-boundary.test.tsx`: cover the existing invalidate-after-sync path if no direct test exists.
- Modify route tests under `apps/app/src/routes`: add role refresh assertions around `_app._org.members`, `_app._org.organization.settings`, and one data route such as `_app._org.jobs` if needed.
- Modify `docs/architecture/frontend.md`: document the sidebar organization switcher, global `G O` shortcut, and router invalidation refresh model.
- Modify `docs/architecture/organization-next-steps.md`: move multi-org switching from future work to implemented behavior and leave remaining follow-ups.

---

### Task 1: Centralize Explicit Set-Active Behavior

**Files:**

- Modify: `apps/app/src/features/organizations/organization-access.test.ts`
- Modify: `apps/app/src/features/organizations/organization-access.ts`

- [ ] **Step 1: Write failing helper tests**

Add `setActiveOrganization` to the import list in `organization-access.test.ts`, then add these tests inside `describe("organization access helpers", ...)`:

```ts
it("sets the client active organization through Better Auth", async () => {
  mockedIsServerEnvironment.mockReturnValue(false);

  await expect(
    setActiveOrganization(decodeOrganizationId("org_next"))
  ).resolves.toBeUndefined();

  expect(mockedSetClientActiveOrganization).toHaveBeenCalledWith({
    organizationId: "org_next",
  });
});

it("rethrows active organization switch failures", async () => {
  mockedIsServerEnvironment.mockReturnValue(false);
  mockedSetClientActiveOrganization.mockResolvedValue({
    data: null,
    error: new Error("switch failed"),
  });

  const failure = await setActiveOrganization(
    decodeOrganizationId("org_next")
  ).catch((caughtError) => caughtError);

  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain("switch failed");
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
pnpm --filter app test -- organization-access.test.ts
```

Expected: FAIL because `setActiveOrganization` is not exported.

- [ ] **Step 3: Implement the helper**

In `organization-access.ts`, export this helper near `synchronizeClientActiveOrganization`:

```ts
export async function setActiveOrganization(
  organizationId: OrganizationIdType
) {
  const result = await authClient.organization.setActive({
    organizationId,
  });

  if (result.error) {
    throw result.error;
  }
}
```

Then simplify `synchronizeClientActiveOrganization`:

```ts
export async function synchronizeClientActiveOrganization(
  activeOrganizationSync: ActiveOrganizationSync
) {
  if (!activeOrganizationSync.required) {
    return;
  }

  if (!activeOrganizationSync.targetOrganizationId) {
    return;
  }

  await setActiveOrganization(activeOrganizationSync.targetOrganizationId);
}
```

The `null` guard preserves the create-organization/no-org edge case without sending a meaningless `setActive({ organizationId: null })` during explicit switching work.

- [ ] **Step 4: Run helper tests and verify green**

Run:

```bash
pnpm --filter app test -- organization-access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-access.ts apps/app/src/features/organizations/organization-access.test.ts
git commit -m "test: cover active organization switching helper"
```

---

### Task 2: Expose Active Organization From Route Matches

**Files:**

- Modify: `apps/app/src/features/organizations/organization-route-context.ts`
- Modify: `apps/app/src/components/app-sidebar.test.tsx`

- [ ] **Step 1: Write failing sidebar test**

In `app-sidebar.test.tsx`, mock `OrganizationSwitcher` and assert the matched active organization reaches it:

```ts
const { mockedOrganizationSwitcher } = vi.hoisted(() => ({
  mockedOrganizationSwitcher: vi.fn(
    ({
      activeOrganization,
    }: {
      activeOrganization?: { id: string; name: string; slug: string } | null;
    }) => (
      <div data-testid="organization-switcher">
        {activeOrganization?.name ?? "missing organization"}
      </div>
    )
  ),
}));

vi.mock(
  import("#/features/organizations/organization-switcher"),
  () => ({
    OrganizationSwitcher: mockedOrganizationSwitcher,
  })
);
```

Update the default `_app/_org` match in `beforeEach`:

```ts
context: {
  activeOrganization: {
    id: "org_acme",
    name: "Acme Field Ops",
    slug: "acme-field-ops",
  },
  activeOrganizationId: "org_acme",
  currentOrganizationRole: "owner",
},
```

Add:

```ts
it("shows the active organization in the sidebar header", () => {
  render(<AppSidebar />);

  expect(screen.getByTestId("organization-switcher")).toHaveTextContent(
    "Acme Field Ops"
  );
  expect(mockedOrganizationSwitcher).toHaveBeenCalledWith(
    expect.objectContaining({
      activeOrganization: {
        id: "org_acme",
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      },
    }),
    undefined
  );
});
```

- [ ] **Step 2: Run test and verify red**

Run:

```bash
pnpm --filter app test -- app-sidebar.test.tsx
```

Expected: FAIL because `OrganizationSwitcher` is not mounted and route-context helpers do not expose the active org.

- [ ] **Step 3: Add route-context helpers**

In `organization-route-context.ts`, add:

```ts
export function useActiveOrganizationFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.activeOrganization,
  });
}

export function useActiveOrganizationIdFromMatches() {
  return useMatch({
    from: "/_app/_org",
    shouldThrow: false,
    select: (match) => match.context.activeOrganizationId,
  });
}
```

- [ ] **Step 4: Mount a temporary switcher placeholder**

Create the file enough for the sidebar import to compile:

```tsx
"use client";
import type { OrganizationSummary } from "./organization-access";

export function OrganizationSwitcher({
  activeOrganization,
}: {
  readonly activeOrganization?: OrganizationSummary | null;
}) {
  return <div>{activeOrganization?.name ?? "No organization"}</div>;
}
```

In `app-sidebar.tsx`, import `OrganizationSwitcher` and `useActiveOrganizationFromMatches`, then render the switcher in `SidebarHeader` below the Ceird brand button:

```tsx
const activeOrganization = useActiveOrganizationFromMatches();

// inside <SidebarHeader>, after the brand <SidebarMenuItem>
<SidebarMenuItem>
  <OrganizationSwitcher activeOrganization={activeOrganization ?? null} />
</SidebarMenuItem>;
```

- [ ] **Step 5: Run sidebar tests and verify green**

Run:

```bash
pnpm --filter app test -- app-sidebar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/organizations/organization-route-context.ts apps/app/src/features/organizations/organization-switcher.tsx apps/app/src/components/app-sidebar.tsx apps/app/src/components/app-sidebar.test.tsx
git commit -m "feat: expose active organization in sidebar"
```

---

### Task 3: Build the Switcher Loading and List States

**Files:**

- Create: `apps/app/src/features/organizations/organization-switcher.test.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`

- [ ] **Step 1: Write failing component tests**

Mock `listOrganizations`, `setActiveOrganization`, `useRouter`, and sidebar/dropdown primitives the same way `nav-user.test.tsx` does. Include these tests:

```tsx
it("shows a loading state while organizations are loading", () => {
  mockedListOrganizations.mockReturnValue(new Promise(() => {}));

  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  expect(
    screen.getByRole("button", { name: /acme field ops/i })
  ).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText(/loading organizations/i)).toBeInTheDocument();
});

it("renders an empty disabled state when the user has no organizations", async () => {
  mockedListOrganizations.mockResolvedValue([]);

  renderSwitcher(null);

  expect(await screen.findByText(/no organizations/i)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /no active organization/i })
  ).toBeDisabled();
});

it("renders a single organization without switch actions", async () => {
  mockedListOrganizations.mockResolvedValue([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
  ]);

  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  expect(
    await screen.findByRole("button", { name: /acme field ops/i })
  ).toBeDisabled();
  expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
});

it("shows list failures with a retry action", async () => {
  mockedListOrganizations.mockRejectedValueOnce(new Error("network down"));
  mockedListOrganizations.mockResolvedValueOnce([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
    { id: "org_beta", name: "Beta Builds", slug: "beta" },
  ]);

  const user = userEvent.setup();
  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  expect(
    await screen.findByText(/couldn't load organizations/i)
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /retry/i }));

  expect(
    await screen.findByRole("menuitemradio", { name: /beta builds/i })
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx
```

Expected: FAIL because the placeholder component has no loading/list/error behavior.

- [ ] **Step 3: Implement list state UI**

Use installed shadcn-style primitives:

```tsx
"use client";
import type { OrganizationId, OrganizationSummary } from "@ceird/identity-core";
import {
  Building03Icon,
  RefreshIcon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import * as React from "react";

import { DotMatrixButtonLoader } from "#/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { SidebarMenuButton } from "#/components/ui/sidebar";
import { Skeleton } from "#/components/ui/skeleton";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";

import {
  listOrganizations,
  setActiveOrganization,
} from "./organization-access";
```

Implement state with exact transitions:

```ts
type ListState =
  | {
      readonly status: "loading";
      readonly organizations: readonly OrganizationSummary[];
    }
  | {
      readonly status: "ready";
      readonly organizations: readonly OrganizationSummary[];
    }
  | {
      readonly status: "error";
      readonly organizations: readonly OrganizationSummary[];
    };

type SwitchState =
  | { readonly status: "idle"; readonly organizationId: null }
  | { readonly status: "switching"; readonly organizationId: OrganizationId }
  | { readonly status: "error"; readonly organizationId: OrganizationId };
```

Render rules:

- `activeOrganization === null`: disabled `SidebarMenuButton` named `No active organization`.
- `listState.status === "loading"`: show current org name plus `aria-busy`, and a `Skeleton`/`Loading organizations` row in the dropdown.
- `listState.status === "error"`: show `Couldn't load organizations.` and a `Retry` `DropdownMenuItem`.
- `organizations.length === 0`: disabled trigger, visible `No organizations`.
- `organizations.length === 1`: disabled trigger with the organization name and muted `Only organization`.
- `organizations.length > 1`: enabled trigger with `DropdownMenuRadioGroup`, one `DropdownMenuRadioItem` per organization, current org checked.

- [ ] **Step 4: Run tests and verify green**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-switcher.tsx apps/app/src/features/organizations/organization-switcher.test.tsx
git commit -m "feat: add organization switcher list states"
```

---

### Task 4: Implement Switching, Router Invalidation, and Failure Recovery

**Files:**

- Modify: `apps/app/src/features/organizations/organization-switcher.test.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`

- [ ] **Step 1: Write failing switch tests**

Add:

```tsx
it("switches organizations and invalidates router state synchronously", async () => {
  mockedListOrganizations.mockResolvedValue([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
    { id: "org_beta", name: "Beta Builds", slug: "beta" },
  ]);
  mockedSetActiveOrganization.mockResolvedValue();
  mockedRouterInvalidate.mockResolvedValue();

  const user = userEvent.setup();
  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  await user.click(
    await screen.findByRole("menuitemradio", { name: /beta builds/i })
  );

  expect(mockedSetActiveOrganization).toHaveBeenCalledWith("org_beta");
  expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  expect(
    screen.queryByText(/couldn't switch organizations/i)
  ).not.toBeInTheDocument();
});

it("keeps the current organization visible when switching fails", async () => {
  mockedListOrganizations.mockResolvedValue([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
    { id: "org_beta", name: "Beta Builds", slug: "beta" },
  ]);
  mockedSetActiveOrganization.mockRejectedValue(new Error("switch failed"));

  const user = userEvent.setup();
  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  await user.click(
    await screen.findByRole("menuitemradio", { name: /beta builds/i })
  );

  expect(mockedRouterInvalidate).not.toHaveBeenCalled();
  expect(
    await screen.findByText(/couldn't switch organizations/i)
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /acme field ops/i })
  ).toBeInTheDocument();
});

it("does not call setActive for the already active organization", async () => {
  mockedListOrganizations.mockResolvedValue([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
    { id: "org_beta", name: "Beta Builds", slug: "beta" },
  ]);

  const user = userEvent.setup();
  renderSwitcher({ id: "org_acme", name: "Acme Field Ops", slug: "acme" });

  await user.click(
    await screen.findByRole("menuitemradio", { name: /acme field ops/i })
  );

  expect(mockedSetActiveOrganization).not.toHaveBeenCalled();
  expect(mockedRouterInvalidate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx
```

Expected: FAIL because switching is not wired.

- [ ] **Step 3: Implement switching**

Add a single `handleSwitchOrganization` path:

```ts
const router = useRouter();

async function handleSwitchOrganization(nextOrganizationId: OrganizationId) {
  if (activeOrganization?.id === nextOrganizationId) {
    return;
  }

  setSwitchState({ status: "switching", organizationId: nextOrganizationId });

  try {
    await setActiveOrganization(nextOrganizationId);
    await router.invalidate({ sync: true });
    setOpen(false);
    setSwitchState({ status: "idle", organizationId: null });
  } catch {
    setSwitchState({ status: "error", organizationId: nextOrganizationId });
  }
}
```

In each radio item, call it from `onClick` or the group `onValueChange` after decoding the selected id from the loaded organizations list:

```tsx
<DropdownMenuRadioGroup
  value={activeOrganization?.id ?? ""}
  onValueChange={(organizationId) => {
    const nextOrganization = organizations.find(
      (organization) => organization.id === organizationId
    );

    if (nextOrganization) {
      void handleSwitchOrganization(nextOrganization.id);
    }
  }}
>
```

Disable all switch items while `switchState.status === "switching"`. Show `DotMatrixButtonLoader` beside the switching organization label.

- [ ] **Step 4: Run tests and verify green**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-switcher.tsx apps/app/src/features/organizations/organization-switcher.test.tsx
git commit -m "feat: switch active organizations from sidebar"
```

---

### Task 5: Add Keyboard Access

**Files:**

- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.test.tsx`
- Modify: `apps/app/src/hotkeys/route-hotkeys.test.tsx` or `apps/app/src/hotkeys/shortcut-help-overlay.test.tsx`

- [ ] **Step 1: Write failing hotkey tests**

In `organization-switcher.test.tsx`:

```tsx
it("opens the switcher with G O when multiple organizations are available", async () => {
  mockedListOrganizations.mockResolvedValue([
    { id: "org_acme", name: "Acme Field Ops", slug: "acme" },
    { id: "org_beta", name: "Beta Builds", slug: "beta" },
  ]);

  const user = userEvent.setup();
  render(
    <HotkeysProvider>
      <OrganizationSwitcher
        activeOrganization={{
          id: "org_acme",
          name: "Acme Field Ops",
          slug: "acme",
        }}
      />
    </HotkeysProvider>
  );

  await screen.findByRole("button", { name: /acme field ops/i });
  await user.keyboard("go");

  expect(
    await screen.findByRole("menuitemradio", { name: /beta builds/i })
  ).toBeInTheDocument();
});
```

Add a help-overlay assertion wherever the project already checks registered global shortcuts:

```tsx
<RegisteredShortcutSequence id="openOrganizationSwitcher" />
```

Expect the overlay to include `Switch organization`.

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx shortcut-help-overlay.test.tsx
```

Expected: FAIL because the hotkey id is not registered.

- [ ] **Step 3: Register and display the hotkey**

In `hotkey-registry.ts`, add:

```ts
openOrganizationSwitcher: {
  group: "Navigation",
  hotkey: "G O",
  id: "openOrganizationSwitcher",
  label: "Switch organization",
  scope: "global",
  when: "Multiple organizations are available",
},
```

In `organization-switcher.tsx`:

```ts
const canSwitchOrganizations =
  listState.status === "ready" && listState.organizations.length > 1;

useAppHotkeySequence(
  "openOrganizationSwitcher",
  () => {
    setOpen(true);
  },
  { enabled: canSwitchOrganizations && switchState.status !== "switching" }
);
```

Show discoverability in the dropdown label or trigger tooltip:

```tsx
<DropdownMenuShortcut>
  <ShortcutHint
    hotkey={HOTKEYS.openOrganizationSwitcher.hotkey}
    label={HOTKEYS.openOrganizationSwitcher.label}
  />
</DropdownMenuShortcut>
```

- [ ] **Step 4: Run tests and verify green**

Run:

```bash
pnpm --filter app test -- organization-switcher.test.tsx shortcut-help-overlay.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/features/organizations/organization-switcher.tsx apps/app/src/features/organizations/organization-switcher.test.tsx apps/app/src/hotkeys/shortcut-help-overlay.test.tsx
git commit -m "feat: add organization switcher shortcut"
```

---

### Task 6: Preserve Role-Scoped Navigation and Route Refresh

**Files:**

- Modify: `apps/app/src/routes/-_app._org.members.test.tsx`
- Modify: `apps/app/src/routes/-_app._org.organization.settings.test.tsx`
- Modify: `apps/app/src/routes/-_app._org.jobs.test.tsx`
- Create or modify: `apps/app/src/features/organizations/organization-active-sync-boundary.test.tsx`

- [ ] **Step 1: Write route refresh and role tests**

Add a test for the sync boundary if it does not already exist:

```tsx
it("synchronizes the active organization and invalidates router state", async () => {
  mockedSynchronizeClientActiveOrganization.mockResolvedValue();
  mockedRouterInvalidate.mockResolvedValue();

  render(
    <OrganizationActiveSyncBoundary
      activeOrganizationSync={{
        required: true,
        targetOrganizationId: decodeOrganizationId("org_next"),
      }}
    >
      <div>Loaded app</div>
    </OrganizationActiveSyncBoundary>
  );

  expect(screen.getByText(/loading your organization/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(mockedSynchronizeClientActiveOrganization).toHaveBeenCalledWith({
      required: true,
      targetOrganizationId: "org_next",
    });
  });
  expect(mockedRouterInvalidate).toHaveBeenCalledWith({ sync: true });
  expect(await screen.findByText("Loaded app")).toBeInTheDocument();
});
```

In route loader tests, make the post-switch role behavior explicit:

```ts
it("keeps members unavailable after switching to an external organization", async () => {
  const { loadMembersRouteData } = await import("./_app._org.members");

  expect(() =>
    loadMembersRouteData({
      activeOrganizationSync: readySync,
      currentOrganizationRole: "external",
    })
  ).toThrowError(expect.objectContaining({ options: { to: "/" } }));
});
```

For organization settings, assert `owner`/`admin` pass and `member`/`external` redirect after `activeOrganizationSync.required` is false. For jobs, assert `external` still loads jobs but internal-only options stay absent if the existing test seam exposes that behavior.

- [ ] **Step 2: Run focused route tests and verify red if coverage is missing**

Run:

```bash
pnpm --filter app test -- organization-active-sync-boundary.test.tsx -_app._org.members.test.tsx -_app._org.organization.settings.test.tsx -_app._org.jobs.test.tsx
```

Expected: New tests fail only where the current files lack the assertion or test harness.

- [ ] **Step 3: Adjust route/helper behavior only if tests expose a bug**

Expected implementation should already work because `router.invalidate({ sync: true })` reruns `_app` and `_app/_org` loaders. If a route keeps stale role data in component state, key that state by `activeOrganizationId` as existing jobs/sites route content already does:

```tsx
<Provider
  key={activeOrganizationId}
  initialValues={[
    [jobsListStateAtom, seedJobsListState(activeOrganizationId, list)],
    [jobsOptionsStateAtom, seedJobsOptionsState(activeOrganizationId, options)],
  ]}
>
```

Do not add custom auth endpoints or app-owned session caches.

- [ ] **Step 4: Run route tests and verify green**

Run:

```bash
pnpm --filter app test -- organization-active-sync-boundary.test.tsx -_app._org.members.test.tsx -_app._org.organization.settings.test.tsx -_app._org.jobs.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/organizations/organization-active-sync-boundary.test.tsx apps/app/src/routes/-_app._org.members.test.tsx apps/app/src/routes/-_app._org.organization.settings.test.tsx apps/app/src/routes/-_app._org.jobs.test.tsx
git commit -m "test: lock organization switch role refresh"
```

---

### Task 7: Polish Sidebar Composition

**Files:**

- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`
- Modify: `apps/app/src/components/app-sidebar.test.tsx`

- [ ] **Step 1: Write failing composition assertions**

Extend `app-sidebar.test.tsx`:

```ts
it("keeps external users pointed at jobs while still showing the active organization", () => {
  mockedMatches.value = [
    {
      id: "/_app/_org",
      routeId: "/_app/_org",
      context: {
        activeOrganization: {
          id: "org_external",
          name: "External Client",
          slug: "external-client",
        },
        activeOrganizationId: "org_external",
        currentOrganizationRole: "external",
      },
    },
  ];

  render(<AppSidebar />);

  expect(screen.getByTestId("organization-switcher")).toHaveTextContent(
    "External Client"
  );
  expect(screen.getByRole("link", { name: /ceird/i })).toHaveAttribute(
    "href",
    "/jobs"
  );
  expect(screen.getByRole("link", { name: /jobs/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run sidebar tests and verify red/green**

Run:

```bash
pnpm --filter app test -- app-sidebar.test.tsx organization-switcher.test.tsx
```

Expected: PASS after composition is correct. If it fails, adjust only sidebar placement and props.

- [ ] **Step 3: Finalize UI composition**

Keep the Ceird brand button as the home/jobs link. Put the switcher immediately below it:

```tsx
<SidebarHeader className="p-3">
  <SidebarMenu>
    <SidebarMenuItem>{/* existing Ceird brand button */}</SidebarMenuItem>
    <SidebarMenuItem>
      <OrganizationSwitcher activeOrganization={activeOrganization ?? null} />
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarHeader>
```

The switcher trigger should be a `SidebarMenuButton` with a `Building03Icon`, active organization name, slug or `Organization`, and `UnfoldMoreIcon` only when switching is available. Use `gap-*`, semantic tokens, `cn()`, `size-*`, and existing icon sizing conventions.

- [ ] **Step 4: Run focused UI tests**

Run:

```bash
pnpm --filter app test -- app-sidebar.test.tsx nav-user.test.tsx organization-switcher.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/app-sidebar.tsx apps/app/src/components/app-sidebar.test.tsx apps/app/src/features/organizations/organization-switcher.tsx
git commit -m "style: place organization switcher in sidebar"
```

---

### Task 8: Update Architecture Docs

**Files:**

- Modify: `docs/architecture/frontend.md`
- Modify: `docs/architecture/organization-next-steps.md`

- [ ] **Step 1: Update frontend architecture**

In `docs/architecture/frontend.md`, add to **Application Shell**:

```md
The sidebar header shows the active organization on organization-scoped routes.
Multi-organization users can open the organization switcher from the sidebar or
with `G O`. The switcher calls Better Auth's organization list and set-active
client APIs through `features/organizations/organization-access.ts`, then calls
`router.invalidate({ sync: true })` after a successful switch so `_app`,
`_app/_org`, and child route loaders refresh session, active organization, role,
and organization-owned data together.
```

Add to **Hotkeys**:

```md
`G O` opens the organization switcher only when more than one organization is
available.
```

- [ ] **Step 2: Update organization next steps**

Replace the **Multi-Organization Switching** section with:

```md
## Multi-Organization Switching

Implemented behavior:

- the authenticated sidebar shows the active organization on organization
  routes
- users with multiple organizations can switch explicitly through Better Auth's
  native organization client APIs
- switching invalidates TanStack Router state synchronously so organization
  data and role-scoped navigation refresh together
- the switcher handles loading, empty, single-organization, failed-list, and
  failed-switch states

Remaining follow-up:

- consider richer organization search if accounts commonly belong to many
  organizations
```

- [ ] **Step 3: Run docs format check**

Run:

```bash
pnpm format
```

Expected: PASS, or only known unrelated formatting failures.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/frontend.md docs/architecture/organization-next-steps.md
git commit -m "docs: document organization switching"
```

---

### Task 9: Final Verification

**Files:**

- All changed files

- [ ] **Step 1: Run focused app tests**

Run:

```bash
pnpm --filter app test -- organization-access.test.ts organization-switcher.test.tsx app-sidebar.test.tsx organization-active-sync-boundary.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full app tests**

Run:

```bash
pnpm --filter app test
```

Expected: PASS.

- [ ] **Step 3: Run app type check**

Run:

```bash
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 4: Run workspace lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Run workspace format check**

Run:

```bash
pnpm format
```

Expected: PASS.

- [ ] **Step 6: Optional sandbox smoke test**

If the implementation changes visible sidebar behavior beyond the tested component seams, run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Open the app URL, sign in as a user with multiple organizations, switch orgs from the sidebar, and verify jobs/sites/members/settings refresh and unauthorized admin routes redirect after switching to a non-admin organization.

- [ ] **Step 7: Commit final fixes**

```bash
git add apps/app/src docs/architecture
git commit -m "feat: add organization switching"
```

---

## Self-Review

**Spec coverage:** The plan uses `authClient.organization.list` and `authClient.organization.setActive` only through `organization-access.ts`; reuses organization access helpers and route context; adds a sidebar switcher with shadcn-style primitives; invalidates router state after switching; preserves role-scoped navigation through route reloads; covers loading, empty, single-org, failed-list, and failed-switch states; adds `G O` keyboard access; updates docs.

**No custom auth endpoints:** No task adds API routes, custom auth endpoints, or app-owned session caches.

**Type boundaries:** Organization IDs and summaries continue to come from `@ceird/identity-core` decoders via existing helper functions. The switcher does not decode external payloads directly.

**Risk notes:** The switcher appears only when `_app/_org` route context supplies an active organization. User settings remains authenticated but not organization-scoped, so the sidebar can omit the switcher there unless future product work wants shell-wide org identity.
