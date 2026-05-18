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

## Cloudflare Neon Postgres And Hyperdrive

The Cloudflare Alchemy stack keeps Postgres as the source of truth.

Neon Postgres is provisioned through native Alchemy resources. The parent
Alchemy stage creates the shared Neon project and parent branch, while local
and preview stages create isolated copy-on-write Neon branches from that parent
branch. Parent branch protection is opt-in through
`CEIRD_NEON_PARENT_BRANCH_PROTECTED` because not every Neon plan can create
additional protected branches. The parent project declares
`CEIRD_NEON_HISTORY_RETENTION_SECONDS` explicitly so Neon's provider-reported
retention window does not produce repeat parent-project plans. Alchemy also
manages the Cloudflare resources, including the Hyperdrive config that points
at the active stage branch. The parent stage defaults the Hyperdrive config
name to the adopted `ceird-production-postgres` resource, while non-parent
stages use stage-scoped names. Local operators authenticate the Cloudflare
provider through an Alchemy profile:

1. Run `pnpm alchemy login` once for the local Alchemy profile that will manage
   Cloudflare resources.
2. Set deployment config in `.env.local` or another Alchemy env file:
   `GOOGLE_MAPS_API_KEY`, `NEON_API_KEY`, and `AUTH_EMAIL_FROM`.
   `CEIRD_ZONE_NAME` defaults to `ceird.app` and can be overridden for another
   Cloudflare zone.
3. Run
   `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main`
   to create or update the Neon project/branch, refresh Alchemy Drizzle
   migration snapshots, apply API SQL migrations, create or update the
   Hyperdrive config, Workers, queues, Email Worker binding, and routes.

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are still used for
non-interactive CI provider auth through GitHub secrets. They are deployment
automation inputs, not normal local setup. The Worker runtime email delivery
path uses the deployed Cloudflare Email Worker binding; package-local API runs
use deterministic development email delivery.

The current stack uses Alchemy v2 native Neon and Cloudflare Hyperdrive
resources. API runtime code still uses the existing Effect 3 database layer;
deploy-time migration drift is tracked with Alchemy `Drizzle.Schema`. The root `infra`
directory models that handoff as an `alchemy-drizzle-schema`
`NeonMigrationSource`, pointing at the `infra/api-drizzle-schema.ts` wrapper.
That wrapper loads the API schema barrel at
`apps/api/src/platform/database/schema.ts` through the TypeScript resolver
Alchemy needs at deploy time. The checked-in Alchemy migration snapshots live
under `apps/api/drizzle/alchemy`. The native Neon branch still applies the
parent `apps/api/drizzle` directory so existing package-local SQL migrations
remain the bootstrap sequence and future Alchemy-generated SQL is applied from
the nested Alchemy directory. The infra contract names those paths separately as
`generatedMigrationsDir` and `appliedMigrationsDir` so the dependency on
`Drizzle.Schema` is explicit without losing historical migration coverage.

Keep the root Alchemy stack on Alchemy's Effect 4 line, but keep API/app/shared
runtime code on the current Effect 3 package line until the Effect
platform/sql/rpc packages used by the API have a compatible v4 migration target.
As of this migration pass, `@effect/platform`, `@effect/sql`, and
`@effect/rpc` still publish the stable APIs this app uses against Effect 3
peers, while Alchemy v2 uses Effect 4 unstable modules internally.

The API Worker receives a `DATABASE` Hyperdrive binding and resolves the runtime
Postgres URL from `env.DATABASE.connectionString`. Package-local Node runtimes
still read `DATABASE_URL`.

The Worker does not run migrations. During deploy, the native Neon branch
resource depends on `Drizzle.Schema`, then applies SQL files from
`apps/api/drizzle` before Hyperdrive and the API Worker are reconciled.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints
- full API/app/shared Effect 4 migration

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
