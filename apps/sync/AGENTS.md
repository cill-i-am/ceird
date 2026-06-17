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
- Keep Electric source secrets, generated database URLs, container startup
  environment, and Durable Object/container wiring in this app's runtime or
  app-owned infra boundary.
- Keep the Cloudflare Container runtime free of FUSE/object-storage mounts.
  Electric shape state lives under the container's writable storage directory;
  restarts may rebuild shape cache from Postgres rather than blocking startup on
  provider-specific filesystem mounts.
- Do not add product repositories, Drizzle schema or migrations, Better Auth
  runtime, or domain authorization policy here.
