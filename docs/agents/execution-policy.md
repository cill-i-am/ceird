# Execution Policy

The agent workflow has three roles.

## Planner

The planner turns ideas into Linear Projects, PRDs, and issue graphs. It does
not implement product code. It should use `to-prd`, `to-issues`, `triage`, and
`grill-with-docs` as needed.

## Orchestrator

The orchestrator owns a Linear Project execution loop. It reads the Project and
issue graph, dispatches worker sessions for unblocked `ready-for-agent` issues,
tracks blockers, reviews evidence, and moves Linear state forward.

The orchestrator should not implement by default. It should inspect worker PRs
against the Linear issue and parent PRD, escalate review based on risk, and send
targeted feedback back to worker sessions when spec or quality gates fail.

Run `reconcile-project` at the start of each loop and whenever Linear, PR, or CI
state may have changed outside the current thread.

## Worker

A worker owns one Linear issue. It reads the issue, parent Project/PRD, blockers,
and comments fresh before implementing. It creates a branch, implements the
vertical slice, verifies the work, opens or updates a PR, runs production-ready
checks, and records evidence back in Linear.

Use `subagent-execution` inside the worker when bounded implementation,
investigation, spec review, or quality review can be delegated safely.

## Review And Completion

The worker owns the inner review loop. The orchestrator owns the outer
acceptance gate.

Production readiness requires:

- acceptance criteria checked against the Linear issue
- parent PRD/project checked for scope and intent
- relevant review skills run based on changed files and risk
- fresh verification commands run
- PR created or updated
- CI watched until green or blocked
- Linear comment with evidence

## CI Watch

After a PR is created, check CI inline first. If checks are pending long enough
that the worker would otherwise wait idly, create a heartbeat or detached
automation to continue watching the PR. The watcher may fix actionable failures
inside the issue scope, push follow-up commits, and continue watching. It must
stop on external/provider failures, repeated flakes, unsafe scope expansion, or
human-blocked conditions.

`production-ready` should hand PR monitoring to `ci-watch` rather than embedding
long polling in the worker.

## Human Gates

Ask for human input only at real judgment gates:

- PRD ambiguity that cannot be resolved from code or Linear history
- HITL issues
- irreversible architecture or product trade-offs
- provider credentials or mutating Alchemy/provider commands
- merge approval when not explicitly delegated
- blockers where source behavior contradicts Linear intent
