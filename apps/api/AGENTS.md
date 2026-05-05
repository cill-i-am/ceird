# API App Context

This app owns the Ceird HTTP API, authentication runtime, database access, and server/worker entrypoints.

- Keep Effect `HttpApi` contracts, handlers, services, repositories, and runtime `Layer` composition explicit and type-safe.
- Use `Config` and `Schema` at environment, HTTP, persistence, queue, and external-service boundaries.
- Keep Better Auth integration native where possible. Compose around Better Auth instead of hiding its contract behind broad custom wrappers.
- Keep Drizzle schema, migrations, and repository code aligned. Persistence changes should include tests that exercise the database boundary when behavior changes.
- Keep Node and Cloudflare Worker entrypoints thin. Shared API behavior should live behind reusable layers such as the web handler and domain services.
- Domain packages such as `@ceird/identity-core`, `@ceird/jobs-core`, and `@ceird/sandbox-core` own shared contracts; this app owns authorization, persistence, runtime effects, and HTTP wiring.

## Contract And Persistence Changes

- Change shared jobs endpoint shapes in `@ceird/jobs-core` first, then
  update handlers, services, repositories, app clients, and tests together.
- Public jobs errors that the app needs to branch on should come from the shared
  `Schema.TaggedError` contract, not API-local ad hoc response objects.
- Better Auth owns standard `/api/auth/*` behavior. Keep custom identity
  extensions narrow and backed by shared `identity-core` schemas where payloads
  cross app/API boundaries.
- Persistence changes should keep the owning domain schema, schema barrel,
  generated Drizzle migration, repository behavior, and integration tests in
  sync.
