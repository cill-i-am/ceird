# Triage States

These are canonical roles for Linear statuses or labels. The exact Linear
workspace strings may differ, but every issue should map to one state and, where
useful, one category.

## Categories

- `bug`: something is broken.
- `enhancement`: new feature or improvement.
- `chore`: internal maintenance, tooling, dependencies, or cleanup.
- `spike`: research or decision work that intentionally does not ship product
  behavior.

## States

- `needs-triage`: maintainer or planner needs to evaluate the issue.
- `needs-info`: waiting on a reporter, maintainer, external system, or missing
  design decision.
- `ready-for-agent`: fully specified and suitable for an AFK worker session.
- `ready-for-human`: requires human judgment, credentials, manual testing, or a
  product decision before implementation.
- `blocked`: cannot proceed until a listed blocker is resolved.
- `in-progress`: owned by an orchestrator or worker session.
- `in-review`: implementation exists and is under spec, quality, or CI review.
- `done`: merged or otherwise accepted, with verification evidence recorded.
- `wontfix`: explicitly not actioned.

## AFK And HITL

- **AFK** issues can be implemented by a worker session without further human
  input if dependencies are resolved.
- **HITL** issues require human input before or during implementation.

An issue can move from HITL to AFK once the required decision is captured in
Linear comments or the PRD.

## Evidence Comments

Worker, orchestrator, production-ready, and CI-watch comments should include:

- what changed or was inspected
- verification commands and results
- PR URL, branch, and commit when available
- blockers or residual risks
- whether the issue is ready for orchestrator acceptance
