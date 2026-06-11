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
