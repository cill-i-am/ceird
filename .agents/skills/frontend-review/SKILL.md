---
name: frontend-review
description: Use when completing or reviewing changes that touch apps/app, React components, TanStack Start routes, loaders, server functions, client data flows, UI state, hotkeys, accessibility, visual design, or app-side contract usage.
---

# Frontend Review

Use this as the app/frontend production-readiness review stack.

## Scope

Start from the smallest correct diff:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- mixed changes: review both
- clean working tree on a task branch: compare against the merge base with
  `main` or `origin/main`

List touched frontend files before reviewing. Include shared core package
changes when app clients, DTOs, route loaders, or UI validation depend on them.

Read local authority before judging patterns:

- `README.md`
- `docs/README.md`
- `docs/architecture/frontend.md`
- `docs/architecture/packages.md` for shared contract changes
- `docs/architecture/auth.md` for session, auth bridge, or organization behavior
- nearest `AGENTS.md`, especially hotkey and UI-action requirements

## Required Skill Loading

This skill is an orchestrator. Before reviewing, explicitly read and apply these
skills when their condition matches the touched files:

- `review-swarm`: `/Users/cillianbarron/.codex/skills/review-swarm/SKILL.md`
  for parallel or multi-angle diff review.
- `auth-context-review`: `../auth-context-review/SKILL.md` for auth/session/
  organization context, route guards, client/server auth caches, auth
  middleware, or app boundary tests.
- `vercel-composition-patterns`: `../vercel-composition-patterns/SKILL.md` for
  React composition APIs, provider design, component boundaries, and prop growth.
- `tanstack-start`: `../tanstack-start/SKILL.md` for route loading, server
  functions, middleware, SSR, server routes, and client/server boundaries.
- `tanstack-react-start`: `../tanstack-react-start/SKILL.md` for React-specific
  TanStack Start APIs, imports, `useServerFn`, and route setup.
- `tanstack-router`: `../tanstack-router/SKILL.md` for route params, search
  params, navigation, route trees, loaders, or route type safety.
- `effect-best-practices`: `../effect-best-practices/SKILL.md` when frontend
  state or data loading touches Effect Atom, `Schema`, branded IDs, `Config`,
  tagged errors, or Effect code.
- `web-design-guidelines`: `../web-design-guidelines/SKILL.md` for visual UI,
  accessibility, responsive layout, keyboard interactions, and polish.

If a subordinate skill conflicts with current source or architecture docs, treat
the current repo as source of truth and note the reason.

## Review Stack

Run only the lenses relevant to the touched code:

- **Review Swarm:** regressions, security/privacy, reliability/performance, and
  contract/test gaps.
- **Auth Context Review:** session/org context, route guards, cache
  invalidation, server/client trust boundaries, and auth boundary tests.
- **React Composition:** component boundaries, boolean prop growth, compound
  component fit, provider shape, children over render props, and variants.
- **React Correctness:** state ownership, effects, memoization, refs, events,
  stable keys, forms, accessibility semantics, and React 19 patterns.
- **TanStack Start/Router:** loaders, server functions, middleware, search
  params, route typing, SSR assumptions, and client/server boundaries.
- **UI Rules:** hotkey registration, shortcut discoverability, responsive layout,
  text fit, icon-only controls, app design-system consistency, and browser proof.

## Fix Policy

Unless the user asked for review-only output, fix material issues before
finalizing.

Prioritize:

1. broken workflows, route/data-loading bugs, auth/session mistakes, contract drift
2. accessibility, keyboard access, and hotkey discoverability gaps
3. React correctness issues such as stale closures, unstable keys, effect misuse
4. missing tests or browser verification for changed user-facing behavior

Discard false positives with a short technical reason. Do not churn UI for
low-value style opinions.

## Verification

Run narrow checks first, then broaden when the change crosses packages:

- app code: `pnpm --filter app test` and `pnpm --filter app check-types`
- React quality: `pnpm --filter app react-doctor`
- UI workflows: affected Playwright tests against an explicit Alchemy stage when
  auth cookies, API calls, or database state matter
- handoff-ready changes: `pnpm check-types`, `pnpm test`, `pnpm lint`, and
  `pnpm format`

If UI changed, inspect the app in the browser when a route is known or obvious.
Check desktop and mobile when layout, navigation, forms, or responsive behavior
changed.

## Final Response

Report only:

- review stack used
- material issues fixed or "no material issues found"
- verification run, including failures or skipped checks
