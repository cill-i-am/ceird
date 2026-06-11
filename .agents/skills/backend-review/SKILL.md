---
name: backend-review
description: Use when completing or reviewing changes that touch apps/api, apps/domain, Effect services, shared core packages, Drizzle schema or migrations, Postgres queries, API contracts, auth runtime, infrastructure, or backend TypeScript.
---

# Backend Review

Use this as the backend/API production-readiness review stack.

## Scope

Start from the smallest correct diff:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- mixed changes: review both
- clean working tree on a task branch: compare against the merge base with
  `main` or `origin/main`

List touched backend files before reviewing. Include shared core package changes
because they affect API contracts, app clients, DTOs, and runtime decoders.

Read local authority before judging patterns:

- `README.md`
- `docs/README.md`
- `docs/architecture/api.md`
- `docs/architecture/data-layer.md` for persistence changes
- `docs/architecture/packages.md` for shared package or contract changes
- `docs/architecture/auth.md` for auth/session changes

## Required Skill Loading

This skill is an orchestrator. Before reviewing, explicitly read and apply these
skills when their condition matches the touched files:

- `review-swarm`: `/Users/cillianbarron/.codex/skills/review-swarm/SKILL.md`
  for parallel or multi-angle diff review.
- `auth-context-review`: `../auth-context-review/SKILL.md` for auth/session/
  organization context, auth middleware, forwarded auth request data, app/API
  auth lanes, or auth boundary tests.
- `effect-review`: `../effect-review/SKILL.md` for Effect services,
  repositories, errors, tests, observability, or Effect Atom code.
- `effect-best-practices`: `../effect-best-practices/SKILL.md` for
  `Effect.Service`, dependencies, layers, `Schema.TaggedError`, branded IDs,
  `Config`, `Schema`, structured logging, `Option`, and boundary types.
- `drizzle-orm`: `../drizzle-orm/SKILL.md` for schema, relations, migrations,
  query builder usage, inferred row types, or repository queries.
- `postgres`: `../postgres/SKILL.md` for schema design, indexes, constraints,
  query shape, transactions, connection behavior, or migration safety.

If a subordinate skill conflicts with current source or architecture docs, treat
the current repo as source of truth and note the reason.

## Review Stack

Run only the lenses relevant to the touched code:

- **Review Swarm:** regressions, security/privacy, reliability/performance, and
  contract/test gaps.
- **Auth Context Review:** session/org semantics, forwarded request data,
  app/API auth lanes, Schema/branded ID boundaries, and auth boundary tests.
- **Effect Review:** services, repositories, layers, errors, tests,
  observability, and Effect Atom code.
- **Effect Best Practices:** services, dependencies, layers, tagged errors,
  branded IDs, config, schemas, structured logging, options, and boundary types.
- **Drizzle/Postgres:** schema design, migrations, indexes, constraints, query
  shape, inferred row types, transactions, and connection behavior.

## Fix Policy

Unless the user asked for review-only output, fix material issues before
finalizing.

Prioritize:

1. correctness, security, data integrity, and contract bugs
2. type-safety holes at HTTP, persistence, config, and external boundaries
3. missing tests for changed behavior
4. docs updates required by `AGENTS.md`

Discard false positives with a short technical reason. Do not churn code for
low-value style opinions.

## Verification

Run narrow checks first, then broaden when the change crosses packages:

- API code: `pnpm --filter api test` and `pnpm --filter api check-types`
- domain code: `pnpm --filter domain test` and `pnpm --filter domain check-types`
- shared package: matching package tests and `pnpm check-types`
- Drizzle schema: generate and inspect the migration under `apps/domain/drizzle`
- handoff-ready changes: `pnpm check-types`, `pnpm test`, `pnpm lint`, and
  `pnpm format`

For browser or auth-cookie workflows that depend on backend changes, use the
Alchemy stage flow from `AGENTS.md`.

## Final Response

Report only:

- review stack used
- material issues fixed or "no material issues found"
- verification run, including failures or skipped checks
