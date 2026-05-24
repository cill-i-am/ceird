---
name: ceird-auth-context-review
description: Use when reviewing Ceird changes that touch app auth context, organization context, route guards, session cookies, client/server auth caches, auth middleware, or app/domain boundary tests.
---

# Ceird Auth Context Review

Review Ceird auth and organization context changes for trust-boundary mistakes,
stale context, and route/data-loading regressions.

## Scope

Start by reading the current diff and the local source of truth:

- `README.md`
- `docs/README.md`
- `docs/architecture/auth.md`
- `docs/architecture/frontend.md` for app routes, loaders, server functions, and UI auth flows
- `docs/architecture/api.md` when the API or identity-domain lane is touched
- nearest `AGENTS.md`, especially type-boundary and verification rules

Use current source over historical plans. Historical specs can explain intent,
but they do not prove current behavior.

## Review Lenses

Check these areas before approving:

- **Trust boundary:** server-derived auth/session/org context must not trust
  client-supplied claims, stale route context, or unvalidated serialized data.
- **Session semantics:** optional session reads stay fail-closed without throwing
  in optional paths; strict auth/org paths throw or redirect consistently.
- **Organization selection:** active org id, membership role, admin checks, slug
  fallback, and empty-org behavior match `docs/architecture/auth.md`.
- **Cache ownership:** login, signup, sign-out, org switch, org mutation, and
  profile/session updates clear every relevant client cache without broad
  side-effect imports or circular dependencies.
- **Route loaders and guards:** parent/child route context, redirects, pending
  states, and direct product/domain API lanes do not drift apart.
- **Boundary tests:** import-boundary tests catch alias, nested relative,
  side-effect, and literal dynamic imports when the rule is meant to forbid all
  of them.
- **Forwarded request data:** cookies, origin/host, and forwarded headers are
  normalized, scoped, and not logged or exposed unnecessarily.
- **Schema and branded IDs:** payloads crossing route, server-function, API, or
  persistence boundaries are decoded with `Schema`/`Config`; branded IDs are not
  recreated with casual casts.

## Subagent Prompt

When delegating, send the changed files, base/head range, intent, relevant docs,
and this output contract:

```text
Review Ceird auth/app context correctness only. Work read-only.

Focus on trust boundaries, session/org semantics, cache invalidation, route
loader/guard behavior, forwarded request data, Schema/branded ID decoding, and
boundary-test coverage.

Return:
- Critical issues
- Important issues
- Minor issues
- Required verification
- Verdict: ready, ready with follow-ups, or not ready

For every issue include file/line, why it matters, the smallest fix, and
confidence. Do not report style nits.
```

## Verification

Prefer the narrowest checks that cover the changed path:

- auth/org app tests: `pnpm --filter app test -- <test-file>`
- app boundary tests: `pnpm --filter app test -- src/test/app-domain-boundaries.test.ts`
- app types: `pnpm --filter app check-types`
- cross-package contract changes: `pnpm check-types` plus affected package tests

For browser workflows depending on auth cookies, API calls, or database state,
use the Alchemy stage flow from `AGENTS.md` instead of a generic local server.

## Output

Lead with material findings. If there are none, say that directly and list the
verification that proves the reviewed behavior.
