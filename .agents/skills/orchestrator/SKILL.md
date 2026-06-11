---
name: orchestrator
description: Run a Linear Project execution loop by dispatching worker Codex sessions for unblocked issues, checking their PRs against the Linear spec, reconciling drift, and updating Linear. Use when asked to coordinate a project, fan out issues, manage blockers, or keep a Linear project moving.
---

# Orchestrator

The orchestrator coordinates work. It does not implement by default.

## Read First

- `docs/agents/linear-workflow.md`
- `docs/agents/triage-states.md`
- `docs/agents/execution-policy.md`
- `docs/agents/domain.md`
- parent Linear Initiative/Project/PRD and child issues

Use the Linear skill/app for Linear reads and writes. Use Codex thread tools
when available to create or steer worker sessions.

## Loop

1. **Load project state.** Read the Project/PRD, issues, blockers, comments,
   statuses, linked PRs, and recent worker evidence.
2. **Reconcile.** Run `reconcile-project` before dispatching new work.
3. **Build the dependency graph.** Use Linear blocker relations as the graph.
   Do not infer blockers only from prose unless you also update Linear.
4. **Pick dispatchable issues.** Prefer unblocked `ready-for-agent` AFK issues
   that maximize downstream unblocking. Skip HITL issues until the human
   decision is captured.
5. **Spawn workers.** One issue per worker session. Include the Linear issue,
   parent PRD/Project, blockers, relevant comments, branch naming convention,
   and instruction to use the `worker` skill. Set reasoning effort explicitly.
6. **Track status.** Move assigned issues to `in-progress` and comment with the
   worker thread/session, branch expectation, and dispatch time.
7. **Review returns.** For each worker report or PR, run the acceptance gates
   below before moving Linear forward.

## Acceptance Gates

### Spec Gate

Verify the PR against fresh Linear state, not the worker's memory:

- issue acceptance criteria satisfied
- parent PRD/Project intent preserved
- blockers respected
- comments and HITL decisions since dispatch honored
- out-of-scope boundaries respected
- no missing UX/API/persistence/test piece for the vertical slice

For medium or high risk, dispatch a read-only spec reviewer subagent with the
Linear issue, parent PRD summary, PR diff, and instruction to find mismatches,
omissions, or scope drift.

### Quality Gate

Require worker evidence from `production-ready`:

- relevant review stack completed
- verification commands and results recorded
- PR linked
- CI green or blocked with evidence

Escalate to read-only `review-swarm`, `backend-review`, `frontend-review`, or
`auth-context-review` when risk is high or worker evidence is weak.

## Feedback

If a gate fails, send targeted feedback to the worker session or Linear issue.
Do not rewrite the code yourself unless the user explicitly changes your role.

## Done

Move an issue to `done` only when:

- spec gate passes
- quality gate passes
- CI is green or the accepted completion path does not require CI
- Linear has a final evidence comment with PR, verification, and residual risk
