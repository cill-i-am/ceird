# Sites Core Context

This package owns the shared sites contract.

- Keep site IDs, location domain schemas, site create/update/list/options DTOs,
  Google Places lookup DTOs, site comments, site label assignment DTOs,
  route-aware site proximity DTOs, typed site errors, and the Effect `HttpApi`
  site group here.
- Depend on `@ceird/comments-core` for base comment DTOs,
  `@ceird/labels-core` for label IDs/errors, and `@ceird/proximity-core` for
  generic route-aware proximity contracts.
- Keep Google Places provider calls, future Address Validation integration, SQL
  repositories, authorization policy, audit/activity behavior, and React state
  in `apps/domain` or `apps/app`.
- Do not move agent-only site-create shortcuts into this package. Agent action
  conveniences belong in `@ceird/agents-core` and domain action normalization.
- Use `Schema` for every site payload crossing app, domain, agent, package, or
  test boundaries, and export inferred types from those schemas.
- When changing site contracts, update domain handlers, jobs consumers, app
  clients, agent action contracts if affected, and tests in the same change.
