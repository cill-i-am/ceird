# Execution Policy

The agent workflow has three roles.

## Planner

The planner turns ideas into Linear Projects, PRDs, and issue graphs. It does
not implement product code. It should use `ask-ceird`, `grill-with-docs`,
`prototype`, `to-prd`, `to-issues`, and `triage` as needed.

## Orchestrator

The orchestrator owns a Linear Project execution loop. It reads the Project and
issue graph, dispatches user-visible Codex worker threads for unblocked
`ready-for-agent` issues, tracks blockers, reviews evidence, and moves Linear
state forward.

When the user asks to orchestrate a Linear Project, treat that as an explicit
request to create user-visible Codex worker threads for dispatchable Linear
issues unless the user says to use internal subagents instead. Prefer
`create_thread` for issue workers. Create one new Codex thread per Linear issue,
with a worktree environment and explicit reasoning effort.

If `create_thread` is not in the active tool list, search for the thread tool
before considering a fallback. Do not silently substitute internal subagents for
issue workers because the thread tool was not loaded yet.

Use multi-agent subagents only for read-only reviews, bounded side
investigations, or when the user explicitly asks for subagents.

The orchestrator should not implement by default. It should inspect worker PRs
against the Linear issue and parent PRD, escalate review based on risk, and send
targeted feedback back to worker threads when spec or quality gates fail.

Run `reconcile-project` at the start of each loop and whenever Linear, PR, or CI
state may have changed outside the current thread.

## Worker

A worker owns one Linear issue. It reads the issue, parent Project/PRD, blockers,
and comments fresh before implementing. It creates a branch, implements the
vertical slice, verifies the work, opens or updates a PR, runs production-ready
checks, watches CI and PR/Linear comments until green/resolved or blocked, and
records evidence back in Linear.

Use `subagent-execution` inside the worker when bounded implementation,
investigation, spec review, or quality review can be delegated safely. Use
`systematic-debugging` for bugs, failing checks, flakes, and unexpected
behavior before proposing fixes.

## Review And Completion

The worker owns the inner review loop. The orchestrator owns the outer
acceptance gate.

Production readiness requires:

- acceptance criteria checked against the Linear issue
- parent PRD/project checked for scope and intent
- relevant review skills run based on changed files and risk
- fresh verification commands run
- PR created or updated
- CI and PR/Linear comments watched until green/resolved or blocked
- Linear comment with evidence

## CI Watch

After a PR is created, check CI, GitHub PR comments/review threads/review
decisions, and new Linear comments inline first. If checks or comments are
pending long enough that the worker would otherwise wait idly, create or update
a 2-3 minute heartbeat automation for the worker thread to continue watching the
PR. The watcher may fix actionable failures or comments inside the issue scope,
push follow-up commits, reply/update evidence, and continue watching. It must
stop on external/provider failures, repeated flakes, unsafe scope expansion,
human-blocked conditions, or unavailable GitHub/Linear access.

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
