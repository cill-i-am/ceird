# Agent Workflow

This directory is the source of truth for project agent workflows. Skills should
read these files before creating Linear work, dispatching Codex sessions,
marking work complete, or reviewing production readiness.

- [Linear Workflow](linear-workflow.md) defines how Initiatives, Projects,
  PRDs, issues, statuses, comments, and pull requests fit together.
- [Triage States](triage-states.md) defines the canonical work states and
  labels used by planning, triage, orchestration, and worker sessions.
- [Domain Context](domain.md) tells skills where to find current source-backed
  architecture and domain language.
- [Execution Policy](execution-policy.md) defines orchestrator, worker,
  sub-agent execution, production-readiness, CI-watch, and reconciliation
  expectations.

## Shared Skill Primitives

Ceird's project workflow skills compose a few reusable primitives:

- `grilling`: one-question-at-a-time interview loop.
- `domain-modeling`: active `CONTEXT.md` glossary and durable decision upkeep.
- `codebase-design`: shared module/interface/seam/deep-module vocabulary.
- `systematic-debugging`: tight red-capable feedback-loop debugging.

User-invoked orchestration skills such as `ask-ceird`,
`improve-codebase-architecture`, `prototype`, `handoff`, and the Linear
planner/orchestrator/worker skills should call these primitives instead of
duplicating their rules.
