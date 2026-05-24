---
name: ceird-frontend-review
description: Use when completing or reviewing Ceird changes that touch apps/app, React components, TanStack Start routes, loaders, server functions, client data flows, UI state, hotkeys, accessibility, visual design, or app-side contract usage.
---

# Ceird Frontend Review

Use this as the app/frontend version of: "run Review Swarm and review for Vercel React Composition Patterns, React best practices, and TanStack Start best practices. Fix any issues that arise."

## Scope

Start from the smallest correct diff:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- mixed changes: review both
- clean working tree on a task branch: compare against the merge base with `main` or `origin/main`

List the touched frontend files before reviewing. Include shared core package changes when app clients, DTOs, route loaders, or UI validation depend on them.

Read local authority before judging patterns:

- `README.md`
- `docs/README.md`
- `docs/architecture/frontend.md`
- `docs/architecture/packages.md` for shared contract changes
- `docs/architecture/auth.md` for session, auth bridge, or organization behavior
- nearest `AGENTS.md`, especially hotkey and UI-action requirements

## Required Skill Loading

This skill is an orchestrator. Before reviewing, explicitly read and apply these
skills when their condition matches the touched files. Do not replace them with
a remembered summary.

- `review-swarm`: read `/Users/cillianbarron/.codex/skills/review-swarm/SKILL.md`
  when the user or hook asks for Review Swarm, parallel review, or multi-angle
  diff review.
- `ceird-auth-context-review`: read
  `../ceird-auth-context-review/SKILL.md` when auth/session/organization
  context, route guards, client/server auth caches, auth middleware, or app
  boundary tests changed.
- `vercel-composition-patterns`: read
  `../vercel-composition-patterns/SKILL.md` for React component architecture,
  provider design, composition APIs, boolean prop growth, or reusable component
  boundaries.
- `tanstack-start`: read `../tanstack-start/SKILL.md` for TanStack Start route
  loading, server functions, middleware, SSR, server routes, and client/server
  boundaries.
- `tanstack-react-start`: read `../tanstack-react-start/SKILL.md` for
  React-specific TanStack Start APIs, imports, `useServerFn`, and route setup.
- `tanstack-router`: read `../tanstack-router/SKILL.md` when route params,
  search params, navigation, route trees, loaders, or route type safety changed.
- `effect-best-practices`: read `../effect-best-practices/SKILL.md` when
  frontend state or data loading touches Effect Atom, `Schema`, branded IDs,
  `Config`, tagged errors, or Effect code.
- `web-design-guidelines`: read `../web-design-guidelines/SKILL.md` when visual
  UI, accessibility, responsive layout, keyboard interactions, or interaction
  polish changed.

After loading the relevant skills, follow their workflows and reference files.
If a skill's guidance conflicts with current Ceird source or architecture docs,
treat the current repo as source of truth and note the reason.

## Review Stack

Run the relevant checks for the touched code.

- **Review Swarm:** follow the loaded `review-swarm` skill for regressions,
  security/privacy, reliability/performance, and contract/test gaps. If
  sub-agents are not allowed in the current context, apply the same review roles
  locally.
- **Ceird Auth Context Review:** follow the loaded
  `ceird-auth-context-review` skill for session/org context, route guards,
  cache invalidation, server/client trust boundaries, and auth boundary tests.
- **Vercel React Composition Patterns:** follow the loaded
  `vercel-composition-patterns` skill for component boundaries, boolean prop
  growth, compound component fit, provider shape, children over render props,
  and explicit variants.
- **React Best Practices:** check state ownership, effects, memoization, refs,
  event handling, accessibility semantics, stable keys, form behavior, and
  React 19 patterns already used in the app.
- **TanStack Start Best Practices:** follow the loaded `tanstack-start`,
  `tanstack-react-start`, and when applicable `tanstack-router` skills for route
  loaders, client/server boundaries, server functions, middleware, search
  params, route typing, SSR assumptions, and avoidance of Next.js/Remix
  patterns.
- **Ceird UI Rules:** follow the loaded `web-design-guidelines` skill plus local
  `AGENTS.md` rules for hotkey registration, shortcut discoverability,
  responsive layout, text fit, icon-only controls, and app design-system
  consistency.

## Fix Policy

Unless the user asked for review-only output, fix material issues found by the review before finalizing.

Prioritize:

1. broken workflows, route/data-loading bugs, auth/session mistakes, and contract drift
2. accessibility, keyboard access, and hotkey discoverability gaps
3. React correctness issues such as stale closures, unstable keys, effect misuse, or local state in the wrong owner
4. missing tests or browser verification for changed user-facing behavior

When a finding is wrong, discard it with a short technical reason. Do not churn UI for low-value style opinions.

## Verification

Run the narrowest relevant checks first, then broaden when the change crosses packages.

- App code: `pnpm --filter app test` and `pnpm --filter app check-types`
- React quality: `pnpm --filter app react-doctor`
- UI workflows: start the sandbox and run affected Playwright tests with `PLAYWRIGHT_USE_EXTERNAL_SERVER=1` and canonical sandbox URLs
- cross-package handoff: `pnpm check-types`, `pnpm test`, `pnpm lint`, and `pnpm format`

If UI changed, inspect the app in the browser when a route is known or obvious. Check desktop and mobile when layout, navigation, forms, or responsive behavior changed.

## Final Response

Report only the high-signal outcome:

- review stack used
- material issues fixed or "no material issues found"
- verification run, including any failures or skipped checks
