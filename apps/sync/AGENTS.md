# Sync App Context

This app owns Ceird's public Electric SQL sync adapter and Electric container
runtime.

- Keep sync Worker behavior focused on Electric-compatible shape endpoints,
  CORS, request identity forwarding, short-lived authorization caching, and
  forwarding to the `ElectricSql` Durable Object/container.
- Authorize shapes through the private `DOMAIN` service binding before
  forwarding. Do not accept caller-supplied Electric `table`, `where`,
  `params[...]`, or `secret` values.
- Treat `@ceird/domain-core` as the source of truth for allowed sync shape
  names, authorization paths, authorization payloads, and typed sync errors.
  Product authorization decisions still belong in `apps/domain`.
- Keep Electric source secrets, generated database URLs, R2 storage
  credentials, container startup environment, and Durable Object/container
  wiring in this app's runtime or app-owned infra boundary.
- Preserve the R2-backed Electric storage contract: container disk is
  ephemeral, and durable shape logs/state live under the mounted storage path.
- Do not add product repositories, Drizzle schema or migrations, Better Auth
  runtime, or domain authorization policy here.
