# Data Layer Architecture

## Overview

The authentication slice uses two closely related database paths:

- regular Drizzle for Better Auth's adapter
- Effect SQL for domain-owned repository code

Both target the same Postgres database, but they serve different jobs. The
agents domain follows the same pattern as jobs, sites, labels, and comments:
Drizzle owns table shape and migrations, while Effect SQL owns repository
behavior.

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
layer: domain-owned repositories already use Effect SQL directly, and the v4
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
   Cloudflare zone. `CEIRD_AGENT_HOSTNAME` can override the stage-scoped Agent
   Worker hostname when intentionally cutting over a public agent domain.
3. Run
   `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main`
   to create or update the Neon project/branch, refresh Alchemy Drizzle
   migration snapshots, apply domain SQL migrations, create or update the
   Hyperdrive config, Workers, Agent Durable Object namespace, Workers AI
   binding, queues, Email Worker binding, and routes.

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are still used for
non-interactive CI provider auth through GitHub secrets. They are deployment
automation inputs, not normal local setup. The Worker runtime email delivery
path uses the deployed Cloudflare Email Worker binding; package-local domain runs
use deterministic development email delivery.

The current stack uses Alchemy v2 native Neon and Cloudflare Hyperdrive
resources. Domain runtime code uses the Effect 4 database layer and
`@effect/sql-pg`, while deploy-time migration drift is tracked with Alchemy
`Drizzle.Schema`. The root `infra` directory models that handoff as an
`alchemy-drizzle-schema`
`NeonMigrationSource`, pointing at the `infra/domain-drizzle-schema.ts` wrapper.
That wrapper loads the domain schema barrel at
`apps/domain/src/platform/database/schema.ts` through the TypeScript resolver
Alchemy needs at deploy time. The checked-in Alchemy migration snapshots live
under `apps/domain/drizzle-alchemy`. The parent native Neon branch applies the
full `apps/domain/drizzle` directory so existing package-local SQL migrations
remain the bootstrap sequence. Forked local and preview branches are created from
that parent and apply only `apps/domain/drizzle-alchemy`, so future
Alchemy-generated SQL can bring the fork forward without replaying historical
bootstrap migrations. The infra contract names those paths separately as
`generatedMigrationsDir` and `appliedMigrationsDir` so the dependency on
`Drizzle.Schema` is explicit without losing parent-stage migration coverage.
That Alchemy baseline is intentionally a parent-stage snapshot. Feature branches
that add package-local migrations should not advance the baseline to their new
schema before the parent has those tables, because that makes preview branches
skip the generated SQL diff.
The Alchemy migration stream lives outside `apps/domain/drizzle` because the
parent stage scans the package-local migration tree recursively. When a feature
branch needs a checked-in child-branch delta, give the `drizzle-alchemy`
migration the same directory name as the canonical `apps/domain/drizzle`
migration. Existing preview branches can apply the SQL, and branches forked
after the parent deploy can skip it through the copied `neon_migrations` record.

The root Alchemy stack, runtime apps, and shared domain packages now use the
same Effect 4 beta line. Runtime code imports Effect 4 HTTP, SQL, AI, and
platform APIs from their current stable or unstable package locations, while
app-owned Cloudflare resource declarations import Alchemy only from
`apps/*/infra` modules.

The private domain Worker receives a `DATABASE` Hyperdrive binding and resolves
the runtime Postgres URL from `env.DATABASE.connectionString`. Public API and
MCP Workers receive only the `DOMAIN` service binding. The public Agent Worker
receives `DOMAIN`, the `CeirdAgent` Durable Object namespace, Workers AI, and
the same internal agent secret used by the domain Worker. Package-local Node
runtimes still read `DATABASE_URL`.

The domain database layer creates request-scoped Postgres pools and Drizzle
clients from the configured URL. Normal request handling does not run a
standalone `select 1` preflight query; health checks and diagnostics should own
explicit database probes. When a request materializes the database layer, it
logs `db.initMs` and `db.preflightQuery: false` with the active request id when
one is present.

Domain database integration tests use
`apps/domain/src/platform/database/test-database.ts` to create an isolated
throwaway database from a configured base Postgres URL, apply the checked-in
domain SQL migrations, and drop the throwaway database during cleanup. Normal
workspace test runs keep these tests optional: when `API_TEST_DATABASE_URL`,
`AUTH_TEST_DATABASE_URL`, `TEST_DATABASE_URL`, and `DATABASE_URL` are absent or
unreachable, the integration cases skip instead of requiring cloud credentials.

The root `pnpm test:domain:integration` command is the strict opt-in path for
local and CI runs that have credentials. It either uses an explicit test
database URL from the environment or reads the selected Alchemy stage's
`PostgresBranch` state, then exports the URL to the domain test process as
`API_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and `TEST_DATABASE_URL` with
`CEIRD_REQUIRE_TEST_DATABASE=1`. In strict mode, an unreachable database is a
test failure rather than a skip. The helper keeps the configured database name
as its admin connection instead of assuming a `/postgres` database, which keeps
Neon stage URLs such as the `ceird` database usable for creating the isolated
test databases.

The Worker does not run migrations. During deploy, the native Neon branch
resource depends on `Drizzle.Schema`, then applies SQL files from
the stage-specific `appliedMigrationsDir` before Hyperdrive and the domain
Worker are reconciled.

## Agents Tables

The agents domain owns two Postgres tables:

- `agent_threads` stores the domain-visible thread record keyed by organization,
  user, and thread id. It is indexed by organization, user, status, and update
  time for efficient user thread listing.
- `agent_action_runs` stores the action execution ledger keyed by thread and
  operation id. It records input, result, error metadata, status, and timestamps
  so mutating Agent tools can replay successful duplicate calls without running
  the side effect twice. The ledger marks abandoned running rows older than 15
  minutes as failed on replay, which gives crashed Agent requests a terminal
  recovery path without re-running the side effect.

Live chat/runtime state remains in the Cloudflare Agents SDK Durable Object
store. Product state, authorization, idempotency, and audit remain in Postgres
behind the domain Worker.

## Deferred Decisions

The following are intentionally left for later:

- shared application-level repositories outside the domain Worker
- broader domain data services
- auth-specific Effect wrappers
- app-facing typed auth endpoints
- full domain/API/app/shared Effect 4 migration

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
