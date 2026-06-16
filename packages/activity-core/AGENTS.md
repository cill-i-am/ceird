# Activity Core Context

This package owns shared, runtime-neutral activity feed contracts.

- Keep global activity ids, event/target/status literals, DTO schemas, and
  retention constants here.
- Do not add SQL, repository logic, authorization policy, browser state, or UI
  behavior to this package.
- Use `Schema` for payloads that cross domain, sync, app, persistence, or test
  boundaries.
- Keep product-facing activity separate from auth/security audit semantics.
