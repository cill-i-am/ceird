# Domain App Context

This app owns Ceird's private business/domain Worker.

- Keep Effect `HttpApi` contracts, handlers, services, repositories, and
  runtime `Layer` composition explicit and type-safe.
- Use `Config` and `Schema` at environment, HTTP, persistence, queue, and
  external-service boundaries.
- Keep Better Auth integration native where possible. Compose around Better Auth
  instead of hiding its contract behind broad custom wrappers.
- Keep Drizzle schema, migrations, repository code, and Alchemy schema loading
  aligned.
- This app owns authorization, persistence, agent thread records, action
  execution, audit/activity recording, auth email scheduling, and product
  domain services.
- `apps/api`, `apps/mcp`, `apps/agent`, and future bot surfaces should be
  protocol adapters over this app rather than importing its repositories
  directly.

## Contract And Persistence Changes

- Change shared jobs endpoint shapes in `@ceird/jobs-core` first, then update
  handlers, services, repositories, app clients, and tests together.
- Public jobs errors that clients branch on should come from shared
  `Schema.TaggedError` contracts, not app-local ad hoc response objects.
- Better Auth owns standard `/api/auth/*` behavior. Keep custom identity
  extensions narrow and backed by shared `identity-core` schemas where payloads
  cross app/domain boundaries.
- Persistence changes should keep the owning domain schema, schema barrel,
  generated Drizzle migration, repository behavior, and integration tests in
  sync.
