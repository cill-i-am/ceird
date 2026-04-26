# Vaul Responsive Drawers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the jobs overlays so drawer-style surfaces use Vaul everywhere: right-side drawers on desktop, bottom drawers on mobile, and Vaul nested drawers for nested site/location flows.

**Architecture:** Keep `Dialog` available for future true blocking modals, but remove it from the jobs create flow. Add a small responsive Vaul root wrapper that chooses `direction="right"` at `md` desktop widths and `direction="bottom"` below that; nested flows use `Drawer.NestedRoot` through our local wrapper. Preserve the current form bodies and route-driven open/close behavior while replacing only the overlay primitive and shell.

**Tech Stack:** React 19, TanStack Router, Vaul 1.1.2, Tailwind CSS, Vitest, Testing Library, Playwright.

---

## Verified Vaul API

Vaul 1.1.2 exports `Drawer.Root`, `Drawer.NestedRoot`, `Drawer.Content`, `Drawer.Overlay`, `Drawer.Portal`, `Drawer.Close`, `Drawer.Title`, and `Drawer.Description`. `Drawer.Root` and `Drawer.NestedRoot` accept `direction?: "top" | "bottom" | "left" | "right"`, `open`, `onOpenChange`, `modal`, `dismissible`, and related drawer props.

Verified with:

```bash
pnpm view vaul@1.1.2 types version repository dist.tarball
npm pack vaul@1.1.2
tar -xzf vaul-1.1.2.tgz
sed -n '1,280p' package/dist/index.d.ts
```

## Scope

This plan covers the jobs overlays:

- Create job parent overlay
- New site nested overlay
- Site location nested overlay
- Job detail overlay

The mobile sidebar currently uses `components/ui/sheet.tsx`; leave that as-is in this plan so the jobs refactor stays testable and reviewable. A later cleanup can decide whether `Sheet` should become a Vaul compatibility wrapper or be deleted.

## File Structure

- Modify `apps/app/src/components/ui/drawer.tsx`
  - Owns the Vaul primitive exports.
  - Add `DrawerNestedRoot` and `DrawerHandle`.
- Create `apps/app/src/components/ui/responsive-drawer.tsx`
  - Owns viewport detection and root direction selection.
  - Exports `ResponsiveDrawer` and `useResponsiveDrawerDesktop`.
- Create `apps/app/src/components/ui/responsive-drawer.test.tsx`
  - Proves desktop uses `right`, mobile uses `bottom`, and nested roots use the nested Vaul wrapper.
- Modify `apps/app/src/features/jobs/jobs-create-sheet.tsx`
  - Replace the desktop `Dialog` parent with `ResponsiveDrawer`.
  - Replace `New site` and `Site location` dialogs with nested responsive drawers.
  - Remove the local `useResponsiveCreateDialog` helper.
- Modify `apps/app/src/features/jobs/jobs-create-sheet.test.tsx`
  - Mock drawer primitives instead of stale sheet/dialog assumptions.
  - Keep existing behavior assertions.
- Modify `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`
  - Same mock adjustment as the unit test.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
  - Replace Base UI `Sheet` usage with `ResponsiveDrawer` plus Vaul drawer shell components.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
  - Mock drawer primitives instead of sheet primitives.
- Modify `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
  - Same mock adjustment as the unit test.
- Review `apps/app/e2e/pages/jobs-page.ts`
  - The role-based locators should continue to work because Vaul uses Radix Dialog semantics. Only adjust if the accessible names change, which they should not.

---

### Task 1: Expose Vaul Nested Drawer Primitives

**Files:**

- Modify: `apps/app/src/components/ui/drawer.tsx`

- [ ] **Step 1: Add nested root and handle wrappers**

Modify `apps/app/src/components/ui/drawer.tsx` so it includes these functions next to the existing primitive wrappers:

```tsx
function DrawerNestedRoot({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.NestedRoot>) {
  return (
    <DrawerPrimitive.NestedRoot data-slot="drawer-nested-root" {...props} />
  );
}

function DrawerHandle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Handle>) {
  return (
    <DrawerPrimitive.Handle
      data-slot="drawer-handle"
      className={cn("mx-auto mt-4", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Export the new wrappers**

Add `DrawerNestedRoot` and `DrawerHandle` to the existing export block:

```tsx
export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerNestedRoot,
  DrawerHandle,
};
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/components/ui/drawer.tsx
git commit -m "feat: expose vaul nested drawer primitives"
```

---

### Task 2: Add Responsive Vaul Drawer Root

**Files:**

- Create: `apps/app/src/components/ui/responsive-drawer.tsx`
- Create: `apps/app/src/components/ui/responsive-drawer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/app/src/components/ui/responsive-drawer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { ResponsiveDrawer } from "./responsive-drawer";

type DrawerRootMockProps = {
  readonly children?: ReactNode;
  readonly direction?: string;
  readonly open?: boolean;
};

vi.mock("#/components/ui/drawer", () => ({
  Drawer: ({ children, direction, open }: DrawerRootMockProps) =>
    open === false ? null : (
      <div
        data-direction={direction}
        data-kind="root"
        data-testid="drawer-root"
      >
        {children}
      </div>
    ),
  DrawerNestedRoot: ({ children, direction, open }: DrawerRootMockProps) =>
    open === false ? null : (
      <div
        data-direction={direction}
        data-kind="nested"
        data-testid="drawer-root"
      >
        {children}
      </div>
    ),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("ResponsiveDrawer", () => {
  it("uses a right-side drawer on desktop", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "root"
    );
  });

  it("uses a bottom drawer on mobile", () => {
    setViewportWidth(390);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "bottom"
    );
  });

  it("uses the nested Vaul root when nested", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer nested open>
        <p>Nested body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "nested"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
pnpm --filter app test -- src/components/ui/responsive-drawer.test.tsx
```

Expected: FAIL because `responsive-drawer.tsx` does not exist.

- [ ] **Step 3: Implement the responsive root**

Create `apps/app/src/components/ui/responsive-drawer.tsx`:

```tsx
"use client";

import * as React from "react";

import { Drawer, DrawerNestedRoot } from "#/components/ui/drawer";

const RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH = 768;

type DrawerDirection = "top" | "bottom" | "left" | "right";
type DrawerRootProps = React.ComponentProps<typeof Drawer>;

type ResponsiveDrawerProps = Omit<DrawerRootProps, "direction"> & {
  readonly desktopDirection?: Extract<DrawerDirection, "left" | "right">;
  readonly mobileDirection?: Extract<DrawerDirection, "top" | "bottom">;
  readonly nested?: boolean;
};

function ResponsiveDrawer({
  desktopDirection = "right",
  mobileDirection = "bottom",
  nested = false,
  ...props
}: ResponsiveDrawerProps) {
  const isDesktop = useResponsiveDrawerDesktop();
  const direction = isDesktop ? desktopDirection : mobileDirection;
  const Root = nested ? DrawerNestedRoot : Drawer;

  return <Root direction={direction} {...props} />;
}

function useResponsiveDrawerDesktop() {
  return React.useSyncExternalStore(
    subscribeToResponsiveDrawerViewport,
    getResponsiveDrawerViewportSnapshot,
    () => true
  );
}

function subscribeToResponsiveDrawerViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  window.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function getResponsiveDrawerViewportSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH;
}

export { ResponsiveDrawer, useResponsiveDrawerDesktop };
```

- [ ] **Step 4: Run the new tests and verify they pass**

Run:

```bash
pnpm --filter app test -- src/components/ui/responsive-drawer.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/ui/responsive-drawer.tsx apps/app/src/components/ui/responsive-drawer.test.tsx
git commit -m "feat: add responsive vaul drawer root"
```

---

### Task 3: Refactor the Create Job Overlay to Vaul

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`

- [ ] **Step 1: Update test mocks first**

In both create-sheet test files, replace stale `#/components/ui/sheet` mocks with drawer/responsive drawer mocks. Keep the existing behavior tests unchanged.

Use this mock shape in `apps/app/src/features/jobs/jobs-create-sheet.test.tsx` and `apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx`:

```tsx
vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("#/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
```

- [ ] **Step 2: Run create-sheet tests and verify the current implementation still passes before the refactor**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-create-sheet.test.tsx src/features/jobs/jobs-create-sheet.integration.test.tsx
```

Expected: PASS. These mocks are intentionally compatible with the new overlay shell but should not change the existing form assertions.

- [ ] **Step 3: Replace imports in the create sheet**

In `apps/app/src/features/jobs/jobs-create-sheet.tsx`, remove:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
```

Keep the drawer component import, and add `DrawerDescription` and `DrawerFooter`:

```tsx
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
```

- [ ] **Step 4: Convert the parent create overlay**

Replace the full `ResponsiveCreateOverlay` function with:

```tsx
function ResponsiveCreateOverlay({
  children,
  onOpenChange,
  open,
}: {
  readonly children: React.ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] w-full p-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-3xl">
        <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
          <DrawerTitle>New job</DrawerTitle>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </ResponsiveDrawer>
  );
}
```

Delete the now-unused local helpers:

```tsx
function useResponsiveCreateDialog() {
  return React.useSyncExternalStore(
    subscribeToCreateDialogViewport,
    getCreateDialogViewportSnapshot,
    () => true
  );
}

function subscribeToCreateDialogViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  window.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function getCreateDialogViewportSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= 768;
}
```

- [ ] **Step 5: Convert the `New site` dialog to a nested drawer**

Replace the opening and closing shell around the existing New site content.

Replace:

```tsx
<Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
  <DialogContent className="flex max-h-[min(680px,calc(100vh-2rem))] grid-rows-none flex-col gap-0 overflow-hidden rounded-[1.25rem] p-0 sm:max-w-2xl">
    <DialogHeader className="border-b px-6 py-4">...</DialogHeader>
    ...
  </DialogContent>
</Dialog>
```

With:

```tsx
<ResponsiveDrawer
  nested
  open={siteDialogOpen}
  onOpenChange={(nextOpen) => {
    setSiteDialogOpen(nextOpen);

    if (!nextOpen) {
      setLocationDialogOpen(false);
    }
  }}
>
  <DrawerContent className="max-h-[92vh] w-full p-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
    <DrawerHeader className="border-b px-5 py-4 text-left md:px-6">
      <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
        Site
      </Badge>
      <DrawerTitle>New site</DrawerTitle>
      <DrawerDescription>
        Capture the place once. Pin it if the map matters.
      </DrawerDescription>
    </DrawerHeader>

    {/* Move the existing New site body and footer JSX here unchanged. */}
  </DrawerContent>
</ResponsiveDrawer>
```

Inside that moved content, keep every existing field, button, error state, and event handler unchanged. The only expected JSX renames in the moved block are `DialogHeader` to `DrawerHeader`, `DialogTitle` to `DrawerTitle`, and `DialogDescription` to `DrawerDescription`.

- [ ] **Step 6: Move and convert the `Site location` dialog inside the site drawer**

Move the location overlay JSX so it is rendered inside the `New site` drawer content, after the existing New site footer. This makes `Site location` nested under `New site`, not just a sibling nested under `New job`.

Replace its shell with:

```tsx
<ResponsiveDrawer
  nested
  open={locationDialogOpen}
  onOpenChange={setLocationDialogOpen}
>
  <DrawerContent className="max-h-[92vh] w-full p-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-3xl">
    <DrawerHeader className="border-b px-5 py-4 text-left md:px-6">
      <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
        Location
      </Badge>
      <DrawerTitle>Site location</DrawerTitle>
      <DrawerDescription>
        Add the address, then place the pin if helpful.
      </DrawerDescription>
    </DrawerHeader>

    {/* Move the existing Site location body and footer JSX here unchanged. */}
  </DrawerContent>
</ResponsiveDrawer>
```

Keep the map, address fields, coordinate fields, and `Done` button logic unchanged.

- [ ] **Step 7: Remove unused dialog symbols**

Run:

```bash
rg -n "Dialog|DialogContent|DialogHeader|DialogTitle|DialogDescription|useResponsiveCreateDialog|subscribeToCreateDialogViewport|getCreateDialogViewportSnapshot" apps/app/src/features/jobs/jobs-create-sheet.tsx
```

Expected: no output.

- [ ] **Step 8: Run create tests**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-create-sheet.test.tsx src/features/jobs/jobs-create-sheet.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/app/src/features/jobs/jobs-create-sheet.tsx apps/app/src/features/jobs/jobs-create-sheet.test.tsx apps/app/src/features/jobs/jobs-create-sheet.integration.test.tsx
git commit -m "feat: use vaul drawers for job creation overlays"
```

---

### Task 4: Refactor the Job Detail Sheet to Vaul

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`

- [ ] **Step 1: Update test mocks first**

In both detail-sheet test files, replace the `#/components/ui/sheet` mock with:

```tsx
vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("#/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
```

- [ ] **Step 2: Run detail tests and verify the current implementation still passes before the refactor**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-detail-sheet.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Replace imports in the detail sheet**

In `apps/app/src/features/jobs/jobs-detail-sheet.tsx`, remove:

```tsx
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
```

Add:

```tsx
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
```

- [ ] **Step 4: Replace the outer sheet shell**

Replace:

```tsx
<Sheet
  open
  onOpenChange={(open) => {
    if (!open) {
      closeSheet();
    }
  }}
>
  <SheetContent side="right" className="w-full sm:max-w-2xl">
    ...
  </SheetContent>
</Sheet>
```

With:

```tsx
<ResponsiveDrawer
  open
  onOpenChange={(open) => {
    if (!open) {
      closeSheet();
    }
  }}
>
  <DrawerContent className="max-h-[92vh] w-full p-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
    ...
  </DrawerContent>
</ResponsiveDrawer>
```

Rename the shell components inside the existing content:

```tsx
SheetHeader -> DrawerHeader
SheetTitle -> DrawerTitle
SheetDescription -> DrawerDescription
SheetFooter -> DrawerFooter
```

Keep the existing job detail body, status controls, comments, visits, and close button logic unchanged.

- [ ] **Step 5: Remove unused sheet symbols**

Run:

```bash
rg -n "Sheet|SheetContent|SheetHeader|SheetTitle|SheetDescription|SheetFooter" apps/app/src/features/jobs/jobs-detail-sheet.tsx
```

Expected: no output.

- [ ] **Step 6: Run detail tests**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-detail-sheet.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/jobs/jobs-detail-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.test.tsx apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx
git commit -m "feat: use responsive vaul drawer for job details"
```

---

### Task 5: Verify Overlay Behavior End to End

**Files:**

- Review: `apps/app/e2e/pages/jobs-page.ts`
- No expected code change unless role/name locators fail.

- [ ] **Step 1: Run all app tests**

Run:

```bash
pnpm --filter app test
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 2: Boot the sandbox**

Run from the repo root:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: the CLI prints the app URL and API URL for this worktree.

- [ ] **Step 3: Run the jobs E2E spec**

Run:

```bash
pnpm --filter app e2e -- jobs.test.ts
```

Expected: PASS.

- [ ] **Step 4: Manually verify desktop**

Open the app URL from `pnpm sandbox:url` at a desktop viewport width.

Verify:

- Clicking `New job` opens a right-side drawer named `New job`.
- Selecting `Create a new site` opens a nested right-side drawer named `New site`.
- Clicking `Edit location` opens a nested right-side drawer named `Site location`.
- Closing `Site location` returns to `New site`.
- Closing `New site` returns to `New job`.
- Closing `New job` navigates back to `/jobs`.
- Opening a job detail route opens a right-side drawer and closing it navigates back to `/jobs`.

- [ ] **Step 5: Manually verify mobile**

Use a mobile viewport width below 768px.

Verify:

- `New job` opens from the bottom.
- `New site` opens as a nested bottom drawer.
- `Site location` opens as a nested bottom drawer.
- Inputs remain usable when the software keyboard would appear.
- Job detail opens from the bottom.

- [ ] **Step 6: Shut down the sandbox**

Run:

```bash
pnpm sandbox:down
```

Expected: sandbox services stop for the worktree.

- [ ] **Step 7: Final commit**

Only if `apps/app/e2e/pages/jobs-page.ts` changed:

```bash
git add apps/app/e2e/pages/jobs-page.ts
git commit -m "test: keep jobs drawer e2e locators current"
```

If no E2E file changed, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan converts current jobs desktop modals to Vaul right-side drawers, mobile surfaces to Vaul bottom drawers, and nested site/location overlays to Vaul nested drawers.
- Placeholder scan: The only preserved inner-content instructions explicitly say to move the existing tested JSX unchanged; the overlay shell code is specified exactly.
- Type consistency: `ResponsiveDrawer` uses the same root prop shape as `Drawer`, removes only direct `direction`, and delegates nested mode to `DrawerNestedRoot`.
- Residual risk: Vaul nested drawers require the nested root to be rendered inside an existing Vaul drawer context. The plan moves `Site location` inside `New site` to preserve nested hierarchy.
