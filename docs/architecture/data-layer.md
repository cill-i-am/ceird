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

## Cloudflare POC: PlanetScale Postgres And Hyperdrive

The Cloudflare Alchemy POC keeps Postgres as the source of truth.

PlanetScale database infrastructure and the Cloudflare Worker email binding are
created by Alchemy, not manually in the dashboards and not through separate CLI
steps. The required operator inputs are bootstrap credentials plus the database
sizing choices:

1. Export `PLANETSCALE_ORGANIZATION`.
2. Export `PLANETSCALE_API_TOKEN_ID`.
3. Export `PLANETSCALE_API_TOKEN`.
4. Export bootstrap `CLOUDFLARE_ACCOUNT_ID`.
5. Export bootstrap `CLOUDFLARE_API_TOKEN`.
6. Set `CEIRD_ZONE_NAME`.
7. Set `AUTH_EMAIL_FROM`.
8. Set `AUTH_EMAIL_TRANSPORT=cloudflare-binding` or omit it for the production
   default.
9. Set `CEIRD_PLANETSCALE_DATABASE_NAME`.
10. Set `CEIRD_PLANETSCALE_DEFAULT_BRANCH`.
11. Set `CEIRD_PLANETSCALE_REGION`, defaulting to `eu-west` for
    PlanetScale's Dublin region.
12. Set `CEIRD_PLANETSCALE_CLUSTER_SIZE`, defaulting to the cheapest
    Postgres size, `PS-5`.
13. Set `APPLY_MIGRATIONS=true` only when the deploy should apply Drizzle
    migrations.
14. Run `ALCHEMY_STAGE=main CEIRD_INFRA_STAGE=production pnpm infra:deploy` to
    create or update the database, roles, Hyperdrive config, Workers, queues,
    runtime email token, and routes.

The bootstrap Cloudflare token is not the Worker runtime email token. It is the
credential Alchemy uses to manage Cloudflare. It needs write access for the
resources in this POC, including Account API Tokens, Email Sending, Hyperdrive,
Queues, Workers Scripts, Workers Routes, and DNS for `ceird.app`.

The current POC uses Alchemy v2 plus custom resource wrappers backed by
Distilled SDKs. `@distilled.cloud/planetscale` owns the PlanetScale database and
role calls, while a custom Cloudflare Hyperdrive resource owns Hyperdrive REST
calls until Alchemy v2 ships a first-class Hyperdrive resource.

The API Worker receives a `DATABASE` Hyperdrive binding and resolves the runtime
Postgres URL from `env.DATABASE.connectionString`. Local Node and sandbox
runtimes still read `DATABASE_URL`.

The Worker does not run migrations. When `APPLY_MIGRATIONS=true`, a custom
`Drizzle.Migrations` Alchemy resource runs Drizzle's programmatic Node migrator
from the deployment process using the Alchemy-created PlanetScale migration
role.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
