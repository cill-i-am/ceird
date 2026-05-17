# Data Layer Architecture

## Overview

The authentication slice uses two closely related database paths:

- regular Drizzle for Better Auth's adapter
- Effect SQL plus `@effect/sql-drizzle` for future Effect-native slice code

Both target the same Postgres database, but they serve different jobs.

## Why Better Auth Uses Regular Drizzle

Better Auth's Drizzle adapter expects a normal Drizzle database instance and schema. That is the simplest and most direct integration path.

Because of that, the auth slice creates:

- a `pg` pool
- a Drizzle database backed by that pool
- the auth schema used by Better Auth

This keeps the Better Auth boundary conventional and easy to reason about.

## Why We Also Added Effect SQL And SQL-Drizzle

The project is Effect-first, so it still helps to establish an Effect-native database path for future app code.

The auth slice exposes:

- `@effect/sql-pg` for Effect-native Postgres access
- `@effect/sql-drizzle` for Drizzle-flavored queries inside Effect code

That gives later slices an Effect-compatible way to access the same Postgres backend without forcing Better Auth itself through a custom abstraction.

## Current Guidance

Use regular Drizzle when:

- wiring Better Auth
- maintaining the Better Auth schema
- following the library's expected adapter shape

Use the Effect SQL layers when:

- new backend slices need Effect-native query composition
- a service already lives naturally inside Effect layers
- observability, dependency injection, or Effect-based composition matters

## Cloudflare POC: Neon Postgres And Hyperdrive

The Cloudflare Alchemy POC keeps Postgres as the source of truth.

Neon Postgres is provisioned outside this repository and supplied to deploys as
connection URL secrets. Alchemy manages the Cloudflare resources, including the
Hyperdrive config that points at the Neon app database URL. The required
operator inputs are bootstrap Cloudflare credentials plus database connection
URLs:

1. Export bootstrap `CLOUDFLARE_ACCOUNT_ID`.
2. Export bootstrap `CLOUDFLARE_API_TOKEN`.
3. Export `GOOGLE_MAPS_API_KEY`.
4. Export `NEON_DATABASE_URL`.
5. Export `NEON_MIGRATION_DATABASE_URL` when `CEIRD_APPLY_MIGRATIONS=true`.
   This should be a separate direct Neon connection URL for a migration-capable
   role on the same host and database as the app role.
6. Set `CEIRD_ZONE_NAME`.
7. Set `AUTH_EMAIL_FROM`.
8. Set `CEIRD_APPLY_MIGRATIONS=true` only when the deploy should apply Drizzle
   migrations.
9. Run `ALCHEMY_STAGE=main CEIRD_INFRA_STAGE=production pnpm infra:deploy` to
   create or update the Hyperdrive config, Workers, queues,
   runtime email token, and routes.

The bootstrap Cloudflare token is not the Worker runtime email token. It is the
credential Alchemy uses to manage Cloudflare. It needs write access for the
resources in this POC, including Account API Tokens, Email Sending, Hyperdrive,
Queues, Workers Scripts, Workers Routes, and DNS for `ceird.app`.

The current POC uses Alchemy v2 plus custom resource wrappers. Neon owns the
database lifecycle outside the stack, while a custom Cloudflare Hyperdrive
resource owns Hyperdrive REST calls until Alchemy v2 ships a first-class
Hyperdrive resource.

The API Worker receives a `DATABASE` Hyperdrive binding and resolves the runtime
Postgres URL from `env.DATABASE.connectionString`. Local Node and sandbox
runtimes still read `DATABASE_URL`.

The Worker does not run migrations. When `CEIRD_APPLY_MIGRATIONS=true`, a custom
`Drizzle.Migrations` Alchemy resource runs Drizzle's programmatic Node migrator
from the deployment process using `NEON_MIGRATION_DATABASE_URL`. When migrations
are disabled, the migration role falls back to `NEON_DATABASE_URL` only to keep
the stack shape simple; no deploy-time schema changes are attempted.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
