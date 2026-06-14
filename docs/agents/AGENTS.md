# Agent Workflow Documentation Context

This subtree owns Ceird's agent workflow policy. Put durable documentation here
when it governs Linear planning, triage, worker execution, orchestrator
responsibilities, review gates, production readiness, reconciliation, or
CI/comment watching.

- Treat Linear as the source of truth for active PRDs, Projects, Initiatives,
  issues, blockers, comments, execution evidence, and workflow state.
- Keep planner, orchestrator, worker, triage, review, production-ready,
  reconciliation, and CI-watch policy in this subtree rather than in broad
  product architecture guides.
- Before changing workflow policy, read `linear-workflow.md`,
  `triage-states.md`, `execution-policy.md`, and `domain.md`, then update the
  nearest file that owns the policy being changed.
- Keep workflow docs grounded in current repository conventions and source-backed
  architecture terms from `docs/architecture/`; do not duplicate architecture
  guides here.
- Treat `docs/superpowers/specs`, `docs/superpowers/plans`, and
  `docs/superpowers/progress` as subordinate historical context. They can
  explain intent, but they do not override current workflow policy or source.
- Record durable process decisions here when they affect future agents. Keep
  one-off execution notes in Linear comments instead.
