# Architecture Documentation Context

This subtree owns current, source-backed product architecture guides. Put durable
documentation here when it explains how Ceird runtime systems, module
boundaries, data contracts, persistence, infrastructure, or ownership seams work
today.

- Start from current source code, `README.md`, `docs/README.md`, and the
  nearest architecture guide before changing a guide.
- Keep architecture guides tied to concrete code paths, commands, service
  boundaries, package ownership, request flows, persistence behavior, or
  deployment/runtime behavior.
- Update the nearest architecture guide when code changes affect routes, API or
  service contracts, auth behavior, migrations, shared package boundaries, local
  development, infrastructure, sync, agent runtime integration, or cross-system
  ownership.
- Keep workflow process, Linear policy, worker/orchestrator responsibilities,
  review gates, and CI-watch rules in `docs/agents/`.
- Treat `docs/superpowers/specs` and `docs/superpowers/plans` as historical
  decision context only. Verify their claims against current source before
  promoting anything into an architecture guide.
- Prefer concise, source-backed corrections over broad rewrite notes. If a guide
  is obsolete, replace the stale section with the current contract instead of
  preserving compatibility prose.
