# Documentation Routing

This subtree is a routing layer for current guides, agent workflow policy, and
historical planning context. Prefer the nearest child instruction node over this
parent file when editing documentation.

- Use `docs/architecture/AGENTS.md` for product architecture, runtime,
  persistence, package ownership, API, frontend, infrastructure, and source-backed
  guide updates.
- Use `docs/agents/AGENTS.md` for Linear, planner, worker, triage, review,
  production-ready, reconciliation, and CI-watch workflow policy.
- Treat `docs/superpowers/specs`, `docs/superpowers/plans`, and
  `docs/superpowers/progress` as historical intent and progress context. They
  remain subordinate to current source code plus the guides under
  `docs/architecture` and `docs/agents`.
- Update `docs/README.md` when adding or moving documentation that should be
  discoverable.
- Avoid broad narrative rewrites unless the underlying architecture changed.
  Small, source-backed corrections are usually more useful.
