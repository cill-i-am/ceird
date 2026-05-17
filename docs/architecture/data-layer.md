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

Neon Postgres is provisioned through native Alchemy resources. The parent
Alchemy stage creates the shared Neon project and protected branch, while local
and preview stages create isolated copy-on-write Neon branches from that parent
branch. Alchemy also manages the Cloudflare resources, including the Hyperdrive
config that points at the active stage branch. The required operator inputs are
bootstrap Cloudflare credentials plus a Neon API key:

1. Export bootstrap `CLOUDFLARE_ACCOUNT_ID`.
2. Export bootstrap `CLOUDFLARE_API_TOKEN`.
3. Export `GOOGLE_MAPS_API_KEY`.
4. Export `NEON_API_KEY`.
5. Set `CEIRD_ZONE_NAME`.
6. Set `AUTH_EMAIL_FROM`.
7. Run `ALCHEMY_STAGE=main pnpm alchemy deploy` to create or update the Neon
   project/branch, apply checked-in API SQL migrations, create or update the
   Hyperdrive config, Workers, queues, runtime email token, and routes.

The bootstrap Cloudflare token is not the Worker runtime email token. It is the
credential Alchemy uses to manage Cloudflare. It needs write access for the
resources in this POC, including Account API Tokens, Email Sending, Hyperdrive,
Queues, Workers Scripts, Workers Routes, and DNS for `ceird.app`.

The current stack uses Alchemy v2 native Neon and Cloudflare Hyperdrive
resources. API runtime code still uses the existing Effect 3 database layer and
checked-in Drizzle SQL migrations; migration generation with `Drizzle.Schema`
is deferred until the API Drizzle/Effect upgrade.

The API Worker receives a `DATABASE` Hyperdrive binding and resolves the runtime
Postgres URL from `env.DATABASE.connectionString`. Local Node and sandbox
runtimes still read `DATABASE_URL`.

The Worker does not run migrations. During deploy, the native Neon branch
resource applies the checked-in `apps/api/drizzle/*.sql` files before
Hyperdrive and the API Worker are reconciled.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
