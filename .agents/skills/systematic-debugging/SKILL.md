---
name: systematic-debugging
description: Root-cause debugging loop for bugs, failing tests, flakes, build failures, CI failures, and unexpected behavior. Use before proposing fixes when anything is broken, especially during worker implementation or CI-watch repair.
---

# Systematic Debugging

No fixes without a root-cause investigation first.

## Process

### 1. Reproduce

- Read the full error, stack trace, failing assertion, or CI log.
- Identify exact command, route, request, or workflow that fails.
- Re-run the narrowest reproduction if safe.
- If the failure is not reproducible, gather more evidence before changing code.

### 2. Trace

Follow the bad value, state, request, or event across boundaries:

- app route -> server function -> API/domain Worker
- domain service -> repository -> Drizzle/Postgres
- auth/session/org context -> route guards -> API calls
- sync/agent/MCP adapter -> private domain Worker
- CI command -> package script -> test/build tool

Add temporary diagnostics only when they answer a specific question. Remove them
before finalizing unless they are useful production observability.

### 3. Compare

Find a working example in the repo or local dependency source. Compare:

- inputs and decoded schemas
- configuration and environment
- ordering and async behavior
- error handling and tagged errors
- transactions, idempotency, retries, and cleanup

### 4. Hypothesize

State one hypothesis:

> I think <root cause> because <evidence>.

Test one variable at a time. Do not bundle guesses.

### 5. Fix

- Write or identify a failing test/reproduction first when practical.
- Fix the root cause, not the symptom.
- Keep the change inside the Linear issue scope.
- Verify the original failure and relevant regression suite.

### 6. Escalate

If three fix attempts fail, stop and question the architecture or the issue
spec. Update Linear with evidence and ask for direction instead of stacking more
patches.

## Project-Specific Checks

- Effect code: prefer typed errors, `Schema`, `Config`, services, and layers;
  avoid casual thrown errors at boundaries.
- Auth/org changes: verify fail-closed behavior and server-derived context.
- Persistence: inspect generated Drizzle migrations and query shape.
- Alchemy/provider behavior: do not run mutating provider commands without
  confirmed stage and credentials.
- UI flakes: prefer condition-based waits and user-visible assertions over
  arbitrary sleeps.
