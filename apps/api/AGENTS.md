# API App Context

This app owns the Task Tracker HTTP API, authentication runtime, database access, and server/worker entrypoints.

- Keep Effect `HttpApi` contracts, handlers, services, repositories, and runtime `Layer` composition explicit and type-safe.
- Use `Config` and `Schema` at environment, HTTP, persistence, queue, and external-service boundaries.
- Keep Better Auth integration native where possible. Compose around Better Auth instead of hiding its contract behind broad custom wrappers.
- Keep Drizzle schema, migrations, and repository code aligned. Persistence changes should include tests that exercise the database boundary when behavior changes.
- Keep Node and Cloudflare Worker entrypoints thin. Shared API behavior should live behind reusable layers such as the web handler and domain services.
- Domain packages such as `@task-tracker/identity-core`, `@task-tracker/jobs-core`, and `@task-tracker/sandbox-core` own shared contracts; this app owns authorization, persistence, runtime effects, and HTTP wiring.
