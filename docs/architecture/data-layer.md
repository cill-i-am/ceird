# Data Layer Architecture

## Overview

The authentication slice uses two closely related database paths:

- regular Drizzle for Better Auth's adapter
- Effect SQL for app-owned repository code

Both target the same Postgres database, but they serve different jobs.

## Why Better Auth Uses Regular Drizzle

Better Auth's Drizzle adapter expects a normal Drizzle database instance and schema. That is the simplest and most direct integration path.

Because of that, the auth slice creates:

- a `pg` pool
- a Drizzle database backed by that pool
- the auth schema used by Better Auth

This keeps the Better Auth boundary conventional and easy to reason about.

## Why We Also Added Effect SQL

The project is Effect-first, so it still helps to establish an Effect-native database path for future app code.

The auth slice exposes:

- `@effect/sql-pg` for Effect-native Postgres access

That gives repository slices an Effect-compatible way to access the same
Postgres backend without forcing Better Auth itself through a custom
abstraction. We intentionally do not keep an `@effect/sql-drizzle` runtime
layer: app-owned repositories already use Effect SQL directly, and the v4
Effect migration path does not have a matching SQL-Drizzle package to carry
forward.

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
checked-in Drizzle SQL migrations. The infra package models that deploy-time
handoff as a `NeonMigrationSource` with the current
`checked-in-drizzle-sql` variant, so the later move to Alchemy `Drizzle.Schema`
is isolated to the Neon migration source boundary instead of being spread
through the stack.

Migration generation with `Drizzle.Schema` is deferred until the API
Drizzle/Effect upgrade. Keep the root Alchemy stack on Alchemy's Effect 4 line,
but keep API/app/shared runtime code on the current Effect 3 package line until
the Effect platform/sql/rpc packages used by the API have a compatible v4
migration target. As of this migration pass, `@effect/platform`, `@effect/sql`,
and `@effect/rpc` still publish the stable APIs this app uses against Effect 3
peers, while Alchemy v2 uses Effect 4 unstable modules internally.

The API Worker receives a `DATABASE` Hyperdrive binding and resolves the runtime
Postgres URL from `env.DATABASE.connectionString`. Package-local Node runtimes
still read `DATABASE_URL`.

The Worker does not run migrations. During deploy, the native Neon branch
resource resolves the configured `NeonMigrationSource` and applies the
checked-in `apps/api/drizzle/*.sql` files before Hyperdrive and the API Worker
are reconciled.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints
- full API/app/shared Effect 4 migration

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
