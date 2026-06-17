---
name: systematic-debugging
description: Root-cause debugging loop for bugs, failing tests, flakes, CI failures, performance regressions, and unexpected behavior. Use before proposing fixes when anything is broken, especially during worker implementation or CI-watch repair.
---

# Systematic Debugging

No fixes without a red-capable feedback loop and a root-cause investigation.
Skip phases only when explicitly justified.

When exploring the codebase, read `CONTEXT.md` and relevant architecture guides
so the reproduction and fix use the right domain/module language.

## Phase 1: Build A Tight Feedback Loop

If you have a **tight** pass/fail signal for the bug, you can find the cause. If
you do not, no amount of staring at code is enough.

Try feedback loops in roughly this order:

1. failing test at the seam that reaches the bug
2. curl or HTTP script against a running service
3. CLI invocation with a fixture input
4. Playwright or browser script asserting on DOM, console, or network behavior
5. replayed trace: saved request, payload, event log, or fixture
6. throwaway harness around the smallest runnable subset
7. property or fuzz loop for "sometimes wrong" behavior
8. bisection harness if the bug appeared between known states
9. differential loop between old/new versions or configs
10. human-in-the-loop script only when a human must click or inspect

Phase 1 is done only when you can name one command you have run at least once
and it is:

- **red-capable**: it drives the user's exact symptom, not just nearby code
- **deterministic**: or, for flakes, has a high enough reproduction rate
- **fast**: seconds when practical
- **agent-runnable**: unattended unless the task truly requires HITL

Tighten the loop before moving on: make it faster, sharper, and more
deterministic.

## Phase 2: Reproduce And Minimize

Run the loop and watch it fail. Confirm the failure mode matches the user's
symptom.

Then minimize the reproduction. Cut inputs, callers, config, data, and steps
one at a time, re-running the loop after each cut. Stop when every remaining
element is load-bearing: removing any one of them makes the loop pass.

## Phase 3: Hypothesize

Generate 3-5 ranked hypotheses before testing any of them. Each hypothesis must
be falsifiable:

> If <X> is the cause, then <changing Y> will make the bug disappear or
> <changing Z> will make it worse.

Show the ranked list to the user when they are present, but proceed with the
best-ranked hypothesis if they are AFK.

## Phase 4: Instrument

Each probe must map to a prediction from Phase 3. Change one variable at a time.

Prefer:

1. debugger or REPL inspection when available
2. targeted logs at boundaries that distinguish hypotheses
3. never "log everything and grep"

Tag temporary diagnostics with a unique prefix such as `[DEBUG-a4f2]` so cleanup
is a single search.

For performance regressions, establish a baseline measurement first. Use timing
harnesses, profiling, query plans, or bisection before changing code.

## Phase 5: Fix And Regression Test

Write or identify the regression test before the fix when a correct seam exists.
A correct seam exercises the real bug pattern as it occurs at the call site. If
the available seam is too shallow, note that architecture finding and fix the
bug without pretending the shallow test proves it.

Then:

1. turn the minimized repro into a failing test when practical
2. watch it fail
3. apply the root-cause fix
4. watch the regression pass
5. re-run the original Phase 1 loop

Keep the change inside the Linear issue scope when running as a worker or
CI-watch repair.

## Phase 6: Cleanup And Post-Mortem

Before declaring done:

- original repro no longer reproduces
- regression test passes, or absence of correct seam is documented
- all `[DEBUG-...]` diagnostics are removed
- throwaway harnesses/prototypes are deleted or clearly marked
- the correct hypothesis is stated in the PR, commit, or Linear evidence

Then ask what would have prevented the bug. If the answer is architectural, hand
off the specifics to `/improve-codebase-architecture` after the fix is in.

## Ceird-Specific Checks

- Effect code: prefer typed errors, `Schema`, `Config`, services, and layers;
  avoid casual thrown errors at boundaries.
- Auth/org changes: verify fail-closed behavior and server-derived context.
- Persistence: inspect generated Drizzle migrations and query shape.
- Alchemy/provider behavior: do not run mutating provider commands without
  confirmed stage and credentials.
- UI flakes: prefer condition-based waits and user-visible assertions over
  arbitrary sleeps.
