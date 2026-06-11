---
name: reconcile-project
description: Reconcile a Linear Project's issues, PRs, blockers, CI status, worker evidence, and parent PRD so the orchestrator can recover stale or drifted work. Use at the start of orchestration loops or when project state may have changed.
---

# Reconcile Project

Make Linear truthful before dispatching or accepting more work.

## Read

- Linear Project/PRD, child issues, blockers, comments, assignees, statuses
- linked PRs and CI status
- worker/orchestrator evidence comments
- relevant source or architecture docs when spec drift is suspected

## Checks

Find and repair or report:

- blocker completed but dependent issue still blocked
- issue ready for agent but missing acceptance criteria or verification
- worker assigned but stale with no recent evidence
- PR opened but Linear not linked
- PR merged but issue not moved to done
- PR failed CI but no `ci-watch` is active
- issue marked done without production-ready evidence
- parent PRD changed after issue dispatch
- issue scope no longer matches parent PRD or source reality
- duplicate or obsolete issues

## Actions

Use Linear updates for durable state:

- add or correct blockers
- move state to `needs-info`, `blocked`, `ready-for-agent`, `in-review`, or
  `done`
- add comments with evidence
- mark obsolete issues with rationale
- trigger or recommend `ci-watch` for PRs with pending/failing CI

Do not implement code. Do not close or mark done without evidence.

## Output

Report:

- issues made dispatchable
- issues blocked and why
- PRs needing CI watch or review
- stale worker sessions
- spec drift or HITL decisions needed
