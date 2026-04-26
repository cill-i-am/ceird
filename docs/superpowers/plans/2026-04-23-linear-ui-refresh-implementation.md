# Linear-Inspired UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the app UI so auth and pre-app flows align closely with shadcn `login-02`, the authenticated shell aligns structurally with shadcn `dashboard-01`, and the overall product feels quieter, denser, and more Linear-inspired across both light and dark themes.

**Architecture:** Start by retuning the global theme and shared layout primitives, then replace the current auth/public shell with a reusable split-shell system, then reshape the authenticated shell and core pages around a smaller set of reusable primitives: page header, status strip, utility panel, and dense row list. Keep the existing route and domain behavior intact unless a UI cleanup requires small ergonomic changes.

**Tech Stack:** TanStack Start, TanStack Router, React 19, shadcn/ui components, Tailwind CSS v4, existing auth/organization feature modules, Vitest, Testing Library, Playwright, Computer Use for visual QA

---

## File Structure

**Create:**

- `apps/app/src/components/app-page-header.tsx` — reusable compact page header for signed-in product pages
- `apps/app/src/components/app-status-strip.tsx` — slim status/metadata strip for home and similar overview pages
- `apps/app/src/components/app-utility-panel.tsx` — sharp utility surface for focused secondary actions like inviting members
- `apps/app/src/components/app-row-list.tsx` — reusable dense list container and row primitives for operational lists
- `apps/app/src/features/auth/auth-split-shell.tsx` — shared split-shell primitive derived from the approved auth direction
- `apps/app/src/features/auth/auth-context-panel.tsx` — reusable right-column contextual panel for public flows
- `apps/app/src/features/auth/auth-split-shell.test.tsx` — tests for public auth shell rendering semantics
- `apps/app/src/components/app-page-header.test.tsx` — tests for the compact page-header primitive
- `apps/app/src/components/app-row-list.test.tsx` — tests for reusable row-list rendering semantics

**Modify:**

- `apps/app/src/styles.css` — retune tokens, theme variables, radii, spacing feel, and surface/background treatment
- `apps/app/src/components/ui/card.tsx` — only if needed to make focused-card usage sharper and more consistent
- `apps/app/src/components/app-layout.tsx` — align signed-in shell framing with the dashboard baseline
- `apps/app/src/components/app-sidebar.tsx` — slim the sidebar and align its information density with the new shell
- `apps/app/src/components/site-header.tsx` — simplify header layout and integrate controls more cleanly
- `apps/app/src/components/nav-main.tsx` — tighten nav rhythm if needed for the new shell
- `apps/app/src/components/nav-user.tsx` — align user menu density and spacing with the shell refresh
- `apps/app/src/features/auth/entry-shell.tsx` — either replace internally with the new auth split-shell or convert into a compatibility layer
- `apps/app/src/features/auth/login-page.tsx` — migrate to the new auth shell and tighter copy/layout
- `apps/app/src/features/auth/signup-page.tsx` — migrate to the new auth shell and tighter copy/layout
- `apps/app/src/features/auth/password-reset-request-page.tsx` — migrate to the new auth shell and status-oriented layout
- `apps/app/src/features/auth/password-reset-page.tsx` — migrate to the new auth shell and compact reset states
- `apps/app/src/features/auth/email-verification-page.tsx` — migrate to the new auth shell and reduce decorative support content
- `apps/app/src/features/organizations/accept-invitation-page.tsx` — move invitation metadata into the auth context column
- `apps/app/src/features/organizations/organization-onboarding-page.tsx` — align onboarding with the shared auth/pre-app split shell
- `apps/app/src/features/auth/authenticated-shell-home.tsx` — replace hero-card composition with page header, status strip, and calmer secondary panel
- `apps/app/src/features/organizations/organization-members-page.tsx` — replace card-per-row invitation rendering with a denser operational layout
- `apps/app/src/features/auth/login-page.test.tsx` — update login expectations for the new auth shell
- `apps/app/src/features/auth/signup-page.test.tsx` — update signup expectations for the new auth shell
- `apps/app/src/features/auth/password-reset-request-page.test.tsx` — update reset-request expectations for the new auth shell
- `apps/app/src/features/auth/password-reset-page.test.tsx` — update reset-completion expectations for the new auth shell
- `apps/app/src/features/auth/email-verification-page.test.tsx` — update verification expectations for the new auth shell
- `apps/app/src/features/auth/authenticated-shell-home.test.tsx` — update home-page expectations for the denser signed-in layout
- `apps/app/src/features/organizations/accept-invitation-page.test.tsx` — update invitation expectations for context-column metadata
- `apps/app/src/features/organizations/organization-onboarding-page.test.tsx` — update onboarding expectations for the shared split shell
- `apps/app/src/features/organizations/organization-members-page.test.tsx` — update members-page expectations for row-based invitations
- `apps/app/src/components/app-layout.test.tsx` — update shell assertions if signed-in layout structure changes
- `apps/app/src/components/app-sidebar.test.tsx` — update sidebar assertions for the slimmer shell chrome
- `apps/app/src/components/nav-user.test.tsx` — update user-menu assertions if density or wording changes
- `apps/app/e2e/auth.test.ts` — refresh selectors and assertions for the updated auth flows
- `apps/app/e2e/organization-invitations.test.ts` — refresh selectors and assertions for the updated invitation/members flow
- `apps/app/e2e/pages/login-page.ts` — update selectors for the redesigned login flow
- `apps/app/e2e/pages/signup-page.ts` — update selectors for the redesigned signup flow
- `apps/app/e2e/pages/create-organization-page.ts` — update selectors for redesigned onboarding
- `apps/app/e2e/pages/members-page.ts` — update selectors for the row-based members surface
- `apps/app/e2e/pages/wait-for-submit-hydration.ts` — adjust only if hydration timing hooks or selectors change

## Task 1: Retune The Global Visual System

**Files:**

- Modify: `apps/app/src/styles.css`
- Modify: `apps/app/src/components/ui/card.tsx` only if token changes alone are not enough

- [ ] **Step 1: Review the current theme tokens and identify the minimum token shifts needed**

Focus on:

- background and surface contrast
- border sharpness
- radius scale
- accent restraint
- light/dark parity

Do not start by restyling individual pages.

- [ ] **Step 2: Update the global theme tokens in `apps/app/src/styles.css`**

Implement:

- crisper light theme surfaces
- more intentional dark theme surfaces
- slightly smaller-feeling radii
- reduced visual softness
- calmer background treatment that supports the product shell without reading like a marketing background

- [ ] **Step 3: Audit focused-surface styling**

If token changes alone are not enough, update the shared card styling so
intentionally isolated surfaces like auth forms or utility panels feel sharp
and consistent with the new system. If the token changes already produce the
right feel, leave `apps/app/src/components/ui/card.tsx` unchanged.

- [ ] **Step 4: Run targeted checks**

Run:

```bash
pnpm --filter app exec vitest run src/components/app-layout.test.tsx src/components/app-sidebar.test.tsx src/components/nav-user.test.tsx
```

Expected: existing shell tests still pass or fail only where the redesign intentionally changes structure.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/styles.css apps/app/src/components/ui/card.tsx
git commit -m "style(app): retune global UI tokens"
```

## Task 2: Build The Shared Auth Split-Shell System

**Files:**

- Create: `apps/app/src/features/auth/auth-split-shell.tsx`
- Create: `apps/app/src/features/auth/auth-context-panel.tsx`
- Create: `apps/app/src/features/auth/auth-split-shell.test.tsx`
- Modify: `apps/app/src/features/auth/entry-shell.tsx`

- [ ] **Step 1: Write a focused shell test**

Add a test that proves the shared auth shell:

- renders a focused action column and a context column
- does not require a support-card grid
- supports invitation/status context without page-specific hacks

- [ ] **Step 2: Implement the new shared auth shell primitives**

Build a reusable split-shell that:

- keeps the form/action surface compact
- supports quiet navigation links
- supports one context panel or custom right-column content
- collapses cleanly on mobile

- [ ] **Step 3: Convert `entry-shell.tsx`**

Pick one:

- replace its internals with the new split-shell system while keeping the public API stable enough for migration, or
- shrink it into a compatibility wrapper and move new usage to the new primitives directly

Prefer the option that minimizes churn while keeping the end state clean.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/auth-split-shell.test.tsx src/features/auth/login-page.test.tsx src/features/auth/signup-page.test.tsx
```

Expected: the shell primitive is verified before migrating every public page.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/auth-split-shell.tsx apps/app/src/features/auth/auth-context-panel.tsx apps/app/src/features/auth/auth-split-shell.test.tsx apps/app/src/features/auth/entry-shell.tsx
git commit -m "feat(app): add shared auth split shell"
```

## Task 3: Migrate Auth And Pre-App Flows To The New Public UI

**Files:**

- Modify: `apps/app/src/features/auth/login-page.tsx`
- Modify: `apps/app/src/features/auth/signup-page.tsx`
- Modify: `apps/app/src/features/auth/password-reset-request-page.tsx`
- Modify: `apps/app/src/features/auth/password-reset-page.tsx`
- Modify: `apps/app/src/features/auth/email-verification-page.tsx`
- Modify: `apps/app/src/features/organizations/accept-invitation-page.tsx`
- Modify: `apps/app/src/features/organizations/organization-onboarding-page.tsx`
- Modify: `apps/app/src/features/auth/login-page.test.tsx`
- Modify: `apps/app/src/features/auth/signup-page.test.tsx`
- Modify: `apps/app/src/features/auth/password-reset-request-page.test.tsx`
- Modify: `apps/app/src/features/auth/password-reset-page.test.tsx`
- Modify: `apps/app/src/features/auth/email-verification-page.test.tsx`
- Modify: `apps/app/src/features/organizations/accept-invitation-page.test.tsx`
- Modify: `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`

- [ ] **Step 1: Migrate login and signup**

Keep them closest to `login-02`:

- compact left action column
- one focused form surface
- quieter switch links
- trimmed copy
- contextual right column instead of a support-card grid

- [ ] **Step 2: Migrate forgot/reset and verification states**

Make them more status-oriented:

- single clear state surface
- minimal surrounding explanation
- direct recovery/navigation actions

- [ ] **Step 3: Migrate invitation acceptance and organization onboarding**

Ensure:

- invitation metadata lives in the right-column context area
- onboarding feels continuous with the rest of the pre-app flow
- neither screen falls back to card stacks

- [ ] **Step 4: Update tests**

Refresh unit/component tests for changed headings, semantics, and structure
without overfitting them to pixel-level layout details.

- [ ] **Step 5: Run the auth/public test suite**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth src/features/organizations/accept-invitation-page.test.tsx src/features/organizations/organization-onboarding-page.test.tsx
```

Expected: public-flow logic remains green after the visual migration.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/auth apps/app/src/features/organizations/accept-invitation-page.tsx apps/app/src/features/organizations/organization-onboarding-page.tsx
git commit -m "feat(app): refresh auth and onboarding flows"
```

## Task 4: Refactor The Authenticated Shell Around The Dashboard Baseline

**Files:**

- Create: `apps/app/src/components/app-page-header.tsx`
- Create: `apps/app/src/components/app-status-strip.tsx`
- Create: `apps/app/src/components/app-utility-panel.tsx`
- Create: `apps/app/src/components/app-row-list.tsx`
- Create: `apps/app/src/components/app-page-header.test.tsx`
- Create: `apps/app/src/components/app-row-list.test.tsx`
- Modify: `apps/app/src/components/app-layout.tsx`
- Modify: `apps/app/src/components/app-sidebar.tsx`
- Modify: `apps/app/src/components/site-header.tsx`
- Modify: `apps/app/src/components/nav-main.tsx`
- Modify: `apps/app/src/components/nav-user.tsx`

- [ ] **Step 1: Create the signed-in page primitives**

Build the reusable pieces needed for denser product pages:

- compact page header
- slim status strip
- utility panel
- row list

- [ ] **Step 2: Tighten the shell chrome**

Update sidebar and header so they feel closer to `dashboard-01`:

- slimmer framing
- cleaner spacing
- less visual bulk
- integrated controls

- [ ] **Step 3: Keep mobile behavior intentional**

Ensure sidebar toggling, header controls, and shell spacing still work well on
small screens instead of only on desktop screenshots.

- [ ] **Step 4: Run shell-component tests**

Run:

```bash
pnpm --filter app exec vitest run src/components/app-layout.test.tsx src/components/app-sidebar.test.tsx src/components/nav-user.test.tsx
```

Expected: the shell remains structurally correct after the redesign.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components/app-layout.tsx apps/app/src/components/app-sidebar.tsx apps/app/src/components/site-header.tsx apps/app/src/components/nav-main.tsx apps/app/src/components/nav-user.tsx apps/app/src/components/app-page-header.tsx apps/app/src/components/app-status-strip.tsx apps/app/src/components/app-utility-panel.tsx apps/app/src/components/app-row-list.tsx
git commit -m "feat(app): refresh authenticated shell layout"
```

## Task 5: Rebuild The Home And Members Pages Around Denser Product Patterns

**Files:**

- Modify: `apps/app/src/features/auth/authenticated-shell-home.tsx`
- Modify: `apps/app/src/features/organizations/organization-members-page.tsx`
- Modify: `apps/app/src/features/auth/authenticated-shell-home.test.tsx`
- Modify: `apps/app/src/features/organizations/organization-members-page.test.tsx`

- [ ] **Step 1: Refactor the home page**

Reshape it into:

- compact page header
- slim status strip
- short next-actions list
- one secondary context panel

Avoid reintroducing a hero card with nested cards.

- [ ] **Step 2: Refactor the members page**

Reshape it into:

- compact page header
- invite utility panel
- dense row-based invitation list

Replace card-per-row invitation rendering with tighter operational rows and
inline metadata.

- [ ] **Step 3: Update tests**

Refresh unit tests to assert the new information architecture without overfitting
to styling details.

- [ ] **Step 4: Run page and organization tests**

Run:

```bash
pnpm --filter app exec vitest run src/features/auth/authenticated-shell-home.test.tsx src/features/organizations/organization-members-page.test.tsx
```

Expected: the redesigned pages still satisfy their functional contracts.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features/auth/authenticated-shell-home.tsx apps/app/src/features/organizations/organization-members-page.tsx
git commit -m "feat(app): redesign home and members surfaces"
```

## Task 6: Verify Theme Parity, End-To-End Flows, And Visual Quality

**Files:**

- Modify: `apps/app/e2e/auth.test.ts`
- Modify: `apps/app/e2e/organization-invitations.test.ts`
- Modify: `apps/app/e2e/pages/login-page.ts`
- Modify: `apps/app/e2e/pages/signup-page.ts`
- Modify: `apps/app/e2e/pages/create-organization-page.ts`
- Modify: `apps/app/e2e/pages/members-page.ts`
- Modify: `apps/app/e2e/pages/wait-for-submit-hydration.ts`

- [ ] **Step 1: Update Playwright selectors and page objects**

Adjust E2E coverage for changed headings, buttons, and layout structure.

- [ ] **Step 2: Run app tests**

Run:

```bash
pnpm --filter app test
pnpm --filter app e2e
```

Expected: the refreshed UI keeps unit and E2E coverage green.

- [ ] **Step 3: Perform visual QA in both themes**

Use browser automation and Computer Use to walk:

- login
- signup
- forgot password
- reset password
- email verification
- invitation acceptance
- organization onboarding
- home
- members

Check for:

- fewer cards
- tighter copy
- better scanability
- consistent shell quality
- intentional light/dark parity
- mobile resilience

- [ ] **Step 4: Fix any final polish issues**

Address any last-pass issues found in QA:

- spacing rhythm
- overflow or wrapping problems
- button hierarchy mistakes
- dark-theme contrast regressions
- mobile stacking issues

- [ ] **Step 5: Commit**

```bash
git add apps/app/e2e
git commit -m "test(app): verify refreshed UI flows"
```

## Notes For Execution

- Prefer refactoring shared primitives before touching every page.
- Keep copy edits tight and operational; do not replace one form of verbosity
  with another.
- Do not add dashboard filler content just to match a reference block.
- When a surface still feels too card-heavy, flatten first before decorating.
- Treat dark mode as first-class throughout implementation rather than as a
  final inversion pass.

## Definition Of Done

The plan is complete when:

- public auth and pre-app flows visually align with the approved `login-02`
  direction
- the signed-in shell structurally aligns with the approved `dashboard-01`
  direction
- home and members pages no longer rely on stacked card-heavy layouts
- both light and dark themes feel intentional
- automated tests pass
- Computer Use QA confirms the full app feels materially closer to the approved
  Linear-inspired product direction

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-linear-ui-refresh-implementation.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, and keep the rollout tightly staged.
2. Inline Execution - Execute tasks in this session using `executing-plans`, with checkpoints for review.
