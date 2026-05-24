---
name: ceird-backend-review
description: Use when completing or reviewing Ceird changes that touch apps/api, Effect services, shared core packages, Drizzle schema or migrations, Postgres queries, API contracts, auth runtime, infrastructure, or sandbox/backend TypeScript.
---

# Ceird Backend Review

Use this as the backend/API version of: "run Review Swarm, Effect Review, Effect Best Practices, Drizzle ORM, and Postgres best practices. Fix any issues that arise."

## Scope

Start from the smallest correct diff:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- mixed changes: review both
- clean working tree on a task branch: compare against the merge base with `main` or `origin/main`

List the touched backend files before reviewing. Include shared core package changes because they affect API contracts, app clients, DTOs, and runtime decoders.

Read local authority before judging patterns:

- `README.md`
- `docs/README.md`
- `docs/architecture/api.md`
- `docs/architecture/data-layer.md` for persistence changes
- `docs/architecture/packages.md` for shared package or contract changes
- `docs/architecture/auth.md` for auth/session changes

## Required Skill Loading

This skill is an orchestrator. Before reviewing, explicitly read and apply these
skills when their condition matches the touched files. Do not replace them with
a remembered summary.

- `review-swarm`: read `/Users/cillianbarron/.codex/skills/review-swarm/SKILL.md`
  when the user or hook asks for Review Swarm, parallel review, or multi-angle
  diff review.
- `ceird-auth-context-review`: read
  `../ceird-auth-context-review/SKILL.md` when auth/session/organization
  context, auth middleware, forwarded auth request data, app/API auth lanes, or
  auth boundary tests changed.
- `effect-review`: read `../effect-review/SKILL.md` for Effect services,
  repositories, errors, tests, observability, or Effect Atom code.
- `effect-best-practices`: read `../effect-best-practices/SKILL.md` for any
  Effect service, `Schema`, `Config`, layer, tagged error, branded ID, or
  Effect Atom code.
- `drizzle-orm`: read `../drizzle-orm/SKILL.md` for schema, relations,
  migrations, query builder usage, inferred row types, or repository queries.
- `postgres`: read `../postgres/SKILL.md` for schema design, indexes,
  constraints, query shape, transactions, connection behavior, or migration
  safety.

After loading the relevant skills, follow their workflows and reference files.
If a skill's guidance conflicts with current Ceird source or architecture docs,
treat the current repo as source of truth and note the reason.

## Review Stack

Run the relevant checks for the touched code. Do not force database findings onto changes that do not touch persistence.

- **Review Swarm:** follow the loaded `review-swarm` skill for regressions,
  security/privacy, reliability/performance, and contract/test gaps. If
  sub-agents are not allowed in the current context, apply the same review roles
  locally.
- **Ceird Auth Context Review:** follow the loaded
  `ceird-auth-context-review` skill for session/org semantics, forwarded
  request data, app/API auth lanes, Schema/branded ID boundaries, and auth
  boundary tests.
- **Effect Review:** follow the loaded `effect-review` skill for Effect
  services, repositories, layers, errors, tests, observability, and Effect Atom
  code.
- **Effect Best Practices:** follow the loaded `effect-best-practices` skill for
  `Effect.Service`, dependencies, layers, `Schema.TaggedError`, branded IDs,
  `Config`, `Schema`, structured logging, `Option`, and boundary types.
- **Drizzle ORM:** follow the loaded `drizzle-orm` skill for schema, relations,
  query builder usage, inferred row types, migrations, and repository queries.
- **Postgres Best Practices:** follow the loaded `postgres` skill for schema
  design, indexes, constraints, query shape, transactions, connection behavior,
  and migration safety.

## Fix Policy

Unless the user asked for review-only output, fix material issues found by the review before finalizing.

Prioritize:

1. correctness, security, data integrity, and contract bugs
2. type-safety holes at HTTP, persistence, config, and external boundaries
3. missing tests for changed behavior
4. docs updates required by `AGENTS.md`

When a finding is wrong, discard it with a short technical reason. Do not churn code for low-value style opinions.

## Verification

Run the narrowest relevant checks first, then broaden when the change crosses packages.

- API code: `pnpm --filter api test` and `pnpm --filter api check-types`
- shared package: matching package tests and `pnpm check-types`
- Drizzle schema: `pnpm --filter api db:generate`, inspect `apps/api/drizzle`, then verify API tests or sandbox migration path
- cross-package handoff: `pnpm check-types`, `pnpm test`, `pnpm lint`, and `pnpm format`

For browser or auth-cookie workflows that depend on backend changes, use the sandbox flow from `AGENTS.md` and the canonical sandbox URLs.

## Final Response

Report only the high-signal outcome:

- review stack used
- material issues fixed or "no material issues found"
- verification run, including any failures or skipped checks
