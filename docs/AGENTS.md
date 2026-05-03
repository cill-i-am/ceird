# Documentation Context

This subtree owns current architecture guides plus historical specs and plans.

- Keep `docs/architecture/*` source-backed and current with the code. Prefer
  concise updates that point to concrete files, commands, or ownership
  boundaries.
- Treat `docs/superpowers/specs` and `docs/superpowers/plans` as historical
  intent. Do not assume they describe current behavior without checking source.
- When documenting a feature, place durable architecture in
  `docs/architecture/`; keep one-off implementation plans under
  `docs/superpowers/plans`.
- Update `docs/README.md` when adding or moving documentation that should be
  discoverable.
- Avoid broad narrative rewrites unless the underlying architecture changed.
  Small, source-backed corrections are usually more useful.
