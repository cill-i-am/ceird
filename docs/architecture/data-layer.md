# Data Layer Architecture

## Overview

The authentication slice uses three closely related database paths:

- regular Drizzle for Better Auth's adapter
- Effect SQL for existing raw domain-owned repository code
- Effect Drizzle for product repositories that can use schema-backed queries

Both target the same Postgres database, but they serve different jobs. The
agents domain follows the same pattern as jobs, sites, labels, and comments:
Drizzle owns table shape and migrations, while Effect SQL and Effect Drizzle
own Effect-native repository behavior.

## Why Better Auth Uses Regular Drizzle

Better Auth's Drizzle adapter expects a normal Drizzle database instance and schema. That is the simplest and most direct integration path.

Because of that, the auth slice creates:

- a `pg` pool
- a Drizzle database backed by that pool
- the auth schema used by Better Auth

This keeps the Better Auth boundary conventional and easy to reason about.

## Why We Also Added Effect SQL And Effect Drizzle

The project is Effect-first, so domain-owned repository code uses an
Effect-native database path.

The domain database layer exposes:

- `@effect/sql-pg` for Effect-native Postgres access
- `DomainDrizzle`, backed by `drizzle-orm/effect-postgres`, for
  Effect-native Drizzle queries

Both are derived from the same `AppDatabase` pool. `AppDatabase` owns pool
lifecycle and constructs the Better Auth `authDb`; `PgClient` borrows that
pool; `DomainDrizzle` is then created from `PgClient`. This gives repository
slices Effect-compatible access to the same Postgres backend without forcing
Better Auth itself through a custom abstraction or creating a second pool.

Do not add standalone `@effect/sql-drizzle`. That package belongs to an older
Effect/Drizzle integration line. The repo-pinned Drizzle 1.0 RC line has its
own built-in Effect Postgres driver at `drizzle-orm/effect-postgres`, and that
is the supported path for product repository Drizzle work.

## Current Guidance

Use regular Drizzle when:

- wiring Better Auth
- maintaining the Better Auth schema
- following the library's expected adapter shape

Use `DomainDrizzle` when:

- product repositories need Effect-native, schema-backed table and column
  references
- queries are ordinary CRUD, joins, upserts, bounded pagination, authorization
  predicates, or explicit projections
- a small SQL-specific expression is clearer as a Drizzle `sql` fragment than
  as raw Effect SQL
- repository failures can be mapped from `EffectDrizzleQueryError` or Drizzle
  rollback errors into the same typed storage-error surface as the old raw path

Use raw Drizzle `sql` fragments when:

- the surrounding query should remain a Drizzle query builder expression
- the fragment is parameterized through Drizzle's `sql` template
- the fragment is local to an expression such as `now()`, `count(*)::int`,
  `is not distinct from`, `nulls last`, filtered aggregate syntax, or a
  predicate that Drizzle does not model directly

Use raw `SqlClient` / Effect SQL when:

- the path is already a raw transaction slice and a partial Drizzle rewrite
  would split lock or rollback semantics across boundaries
- the SQL depends on advisory locks, explicit row locks,
  `for update skip locked`, CTE write projections, lateral joins, JSONB
  search/cursor behavior, filtered aggregates, or query plans that are clearer
  to review as SQL
- the path is Better Auth adjacent and the regular Better Auth adapter or
  auth-token revocation policy is the source of truth
- moving the query would require broader product, API, auth, organization, or
  migration-history changes

Drizzle rows should still become trustworthy at the repository boundary. The
connected-app grants repository is the current auth proof slice: it uses Drizzle
for the connected-app list projection and audited disconnect mutations, keeps
only tiny Postgres SQL fragments for null-safe reference matching, `now()`, and
token-count/max-expiry scalar aggregates, and decodes list rows, disconnect
consent rows, and `oauth_consent_revoked` audit write values through Effect
Schema before returning values to services.

Current `DomainDrizzle` migrations include organization label CRUD and
active-label reads, user preference get/upsert paths, current organization actor
membership lookup, MCP actor session/membership lookup, straightforward agent
thread create/list/find/archive/touch/actor-resolution reads, ordinary
connected-app grant list/disconnect operations, connected-app consent checks for
MCP request validation, site CRUD/options/list reads, site label read helpers,
and jobs safe-read paths such as scoped external options,
member/contact/collaborator reads, accessible-work-item ids, selected job detail
projections, and work-item label reads. These paths keep explicit column
projections and continue to map Drizzle query failures into the same domain
storage-error surfaces as their previous raw SQL implementations.

After the TSK-164 final pass, production domain repositories retain 58
`yield* sql` raw Effect SQL call sites across eight files. The unused
organization-wide raw site-label helper was removed in this pass. The jobs
repository site-label read helper remains raw after Preview/E2E showed the
mixed raw-write plus Drizzle-detail refresh path was not a safe whole-slice
migration. The retained raw inventory is:

| Area                                   | Retained raw shape                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent current-thread prepare           | transaction-scoped advisory lock plus current active-thread lookup                                                                                            | `pg_advisory_xact_lock` protects idempotent prepare; the lock and lookup should remain one reviewed raw transaction slice.                                                                                                                                                            |
| Agent action-run ledger                | insert-or-replay, terminal success/failure updates, stale recovery, and terminal-race lookup                                                                  | Idempotency, replay, and abandoned-running-row recovery are ledger semantics. Keeping the whole ledger raw avoids splitting race behavior across query boundaries.                                                                                                                    |
| Auth rate-limit cleanup                | batched delete using `for update skip locked`                                                                                                                 | Concurrent cleanup workers must claim bounded victim rows without blocking request writes. The SQL shape is the concurrency control.                                                                                                                                                  |
| Comments repository                    | comment list reads plus CTE ownership writes for work-item and site comments                                                                                  | Comment ownership rows and inserted comments are coupled through CTE projections, site comment creation locks the active site, and Jobs/Sites comments maintain product-safe Electric body projections. Migrate only as a whole comments repository slice with focused comment tests. |
| Jobs repository write and lock helpers | linked-reference validation, collaborator writes, job create/patch/transition/reopen, comments, activity, visits, contact creation, and `for update` variants | These methods participate in service-level transaction workflows or write-side invariants. Partial Drizzle rewrites would make lock and rollback semantics harder to review.                                                                                                          |
| Job and site label assignments         | active-label CTEs, `for share`, insert/delete projections, changed-count results, and jobs detail/proximity site-label reads                                  | Assignment endpoints need atomic existence checks and changed-count projections. Jobs detail/proximity keeps the related site-label read raw until the whole post-write detail refresh path can move safely.                                                                          |
| Jobs list/activity/search              | dynamic filters, external-collaborator predicates, cursor comparisons, and text search                                                                        | These are plan-sensitive, predicate-heavy read paths that remain easier to audit as SQL until a whole query-builder rewrite has equivalent tests.                                                                                                                                     |
| Jobs dashboard and proximity           | filtered aggregates, dashboard top rows, routeable-site predicates, exclusion counts, candidate caps, and search predicates                                   | The SQL encodes Postgres-specific aggregate and route-candidate behavior. Mechanical Drizzle translation would add risk without improving clarity.                                                                                                                                    |
| Sites proximity and active-job stats   | filtered aggregates, priority ranking, concat/search behavior, routeable-site predicates, and candidate caps                                                  | The remaining site raw reads are aggregate/query-plan-sensitive and intentionally mirror the jobs proximity/dashboard patterns.                                                                                                                                                       |
| Organization security activity         | JSONB metadata search, target joins, microsecond cursor formatting, and cursor predicates                                                                     | The audit log list is JSONB and cursor heavy. Raw SQL keeps target search and stable cursor formatting visible in one query.                                                                                                                                                          |

Repository services should map `EffectDrizzleQueryError`, Drizzle transaction
rollback failures, and `SqlError` into their typed storage-error surface instead
of leaking unknown failures.

Electric mutation confirmation metadata is sourced from the domain database
runtime, not from browser writes. The domain
`electric-mutation-confirmation.ts` helper wraps the write in the same
`SqlClient.withTransaction` boundary and reads
`pg_current_xact_id()::xid::text` before commit, returning the 32-bit xid as the
Electric adapter `txid`. The local Postgres integration test verifies that the
value read inside the wrapped write and the returned confirmation metadata are
the same transaction id. Deployed Neon/Hyperdrive runtime uses the same
`@effect/sql-pg` pool path through the `DATABASE` Hyperdrive binding; provider
stage mutation is not required to exercise this helper.
Domain-owned label writes and Sites create/update/label-assignment writes wrap
their persistence work in this helper and return shared DTOs that include the
canonical entity plus `mutation.txid`. Browser command layers use that metadata
alongside synced collection observation; they do not derive ids, authorization,
enrichment, or label invariants locally. Sites workspace shapes currently expose
product rows rather than Electric txid stream metadata, so its UI must describe
confirmed writes as Electric row-state observation, or already-reflected state
for idempotent races, and must not present row-state heuristics as proof that
Electric observed a specific txid.

## Cloudflare Neon Postgres And Hyperdrive

The Cloudflare Alchemy stack keeps Postgres as the source of truth.

Neon Postgres is provisioned through native Alchemy resources. The parent
Alchemy stage creates the shared Neon project with logical replication enabled
for Electric SQL and the parent branch, while local and preview stages create
isolated copy-on-write Neon branches from that parent branch. Parent branch
protection is opt-in through
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
   `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --profile ceird-env --env-file .env.local --stage main`
   to create or update the Neon project/branch, refresh Alchemy Drizzle
   migration snapshots, apply domain SQL migrations, create or update the
   Hyperdrive config, Workers, Agent Durable Object namespace, Workers AI
   binding, queues, Email Worker binding, and routes.

`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`, and `CLOUDFLARE_EMAIL` are still
used for non-interactive CI provider auth through GitHub secrets. They are
deployment automation inputs, not normal local setup. The Worker runtime email
delivery path uses the deployed Cloudflare Email Worker binding; package-local
domain runs use deterministic development email delivery.

The current stack uses Alchemy v2 native Neon and Cloudflare Hyperdrive
resources. Domain runtime code uses the Effect 4 database layer,
`@effect/sql-pg`, and the `DomainDrizzle` service from
`drizzle-orm/effect-postgres`, while deploy-time migration drift is tracked
with Alchemy `Drizzle.Schema`. The root `infra` directory models that handoff
as an `alchemy-drizzle-schema`
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

The global activity feed uses the domain-owned `activity_events` read model and
the named `activity-events` Electric shape. The table is intentionally bounded:
domain authorization injects `organization_id = $1 AND retained_until > $2` for
the public shape, with `$2` set to the domain Worker's current time.
`retained_until` already encodes the 30-day retention rule, so the public shape
excludes stale rows even if cleanup has not run yet. Repository writes also
prune rows past that `retained_until` window and clamp each organization to the
latest 5,000 feed rows; that ordered cap is enforced in repository retention
because it is not representable as a fixed Electric shape predicate. Browser
collections consume that named recent-retained projection through the data-plane
Electric factory and shared health surface; they do not request arbitrary
Electric predicates for feed windowing.

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

The domain database layer creates Postgres pools and Drizzle clients from the
configured URL. In the Worker path these pools are scoped to the request handler
and are capped at one client with connection, query, statement, and idle
transaction timeouts, so Worker concurrency does not fan out beyond the
conservative Hyperdrive origin connection limit. Normal request handling does
not run a standalone `select 1` preflight query; health checks and diagnostics
should own explicit database probes. When a request materializes the database
layer, it logs `db.initMs` and `db.preflightQuery: false` with the active request
id when one is present.

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
The Build workflow also runs this strict command in a dedicated
`domain-integration-tests` job backed by a GitHub Actions Postgres service.
The final `build` job depends on that job, so Build cannot pass if the
database-backed domain integration suite skips or fails.

The Worker does not run migrations. During deploy, the native Neon branch
resource depends on `Drizzle.Schema`, then applies SQL files from
the stage-specific `appliedMigrationsDir` before Hyperdrive and the domain
Worker are reconciled.

The domain Worker owns scheduled maintenance that needs the same database path
as request handling. Auth rate-limit retention runs from the Worker's
Cloudflare Cron Trigger instead of from Better Auth request handlers or
database-side cron. The scheduled handler resolves Postgres through the same
Hyperdrive binding or explicit local `DATABASE_URL` fallback as normal Worker
invocations, then runs the cleanup through the shared Effect SQL runtime. The
`rate_limit` cleanup query is bounded by batch size and max-batch config and is
supported by the `(last_request, id)` index so old limiter rows can be found in
delete order without scanning current counters.

## Electric SQL Sync

Electric SQL is deployed as a Cloudflare Container owned by `apps/sync`. The
container reads the same stage Neon branch as the domain Worker through a
`DATABASE_URL` supplied at container start, while the public sync Worker holds
the matching `ELECTRIC_SOURCE_SECRET`. Both secrets are generated or supplied
through the Alchemy stack and are not emitted as stack outputs. The shared
parent Neon project must have logical replication enabled so Electric can
create replication slots and consume Postgres WAL changes on every child
branch.

Electric stores shape logs and metadata under the Cloudflare Container's
writable filesystem at `/var/lib/electric`. Cloudflare Container disk can be
recreated, so restarts may force Electric to rebuild shape state from Postgres
instead of resuming from a durable object-store mount. This is intentional: the
Cloudflare Containers runtime does not expose a usable FUSE device for the
previous R2-over-FUSE design, and blocking startup on that mount prevents sync
from serving any shapes. Local `alchemy dev` stages still run the sync Worker
against the stage Neon branch, but they do not create the Cloudflare Container
application. Alchemy local Workers run in workerd with local Durable Object
namespaces, and the cloud Containers API can only attach a container to a cloud
Durable Object namespace. In deployed stages, including pull-request previews
and ephemeral push-to-main cloud E2E stages, the app stack provisions the
Electric Container and passes only the stage Neon connection URL plus generated
Electric source secret into the Sync Worker as secrets. The `ElectricSql`
Durable Object passes those values to the Cloudflare Container as startup
environment variables, so the Containers application configuration does not
need account-secret references. `ElectricSql` must remain
an exported `cloudflare:workers` `DurableObject` subclass whose class name
matches the Alchemy container `className`; Cloudflare validates that class as
the container-enabled Durable Object when the Containers application is
attached.

The container runs with `CEIRD_ELECTRIC_STORAGE_BACKEND=local`,
`ELECTRIC_STORAGE=fast_file`, `ELECTRIC_PERSISTENT_STATE=file`, and
`ELECTRIC_STORAGE_DIR=/var/lib/electric`. It also sets
`ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE=true` for the single Electric writer process.
The sync Worker resolves the singleton `ElectricSql` Durable Object with a
stage-derived jurisdiction and `locationHint` based on the Neon region so the
container is constrained to the EU for European database stages and placed near
the database. Switching a stage from the default namespace to
`jurisdiction("eu")` creates a separate named Durable Object, which is how a
stage stops reusing an earlier `primary` object that Cloudflare already placed
elsewhere. The durability tradeoff is now explicit: restart and reschedule
evidence should watch shape warmup/catch-up latency, but startup must not
depend on provider-specific filesystem mounts.

Sync is domain-layer only. Better Auth tables, sessions, accounts, rate limits,
organizations, members, and invitations are not exposed as Electric shapes.
The shape registry in `@ceird/domain-core` names the non-auth domain tables
that browser sync clients may request. The domain Worker authorizes each shape
through `/sync/internal/shapes/:shapeName/authorize`, using the same current
organization actor resolution as the HTTP API. Most shapes receive an
`organization_id = $1` predicate. Agent thread and action-run shapes add
`user_id = $2` so users only sync their own agent records. The
`activity-events` shape adds `retained_until > $2` with a server current-time
cutoff so the public feed sync path cannot mirror stale tenant history when
cleanup lags.

The public sync Worker accepts Electric-compatible shape requests at
`/v1/shape?shape=<name>` and `/v1/shapes/<name>`. It strips caller-controlled
Electric source parameters, then injects the authorized table, predicate,
parameters, and source secret before forwarding to the `ElectricSql` Durable
Object and container. Postgres remains the source of truth; Electric provides
client-facing shape replication for selected domain tables.
To reduce repeated session and membership checks on hot polling paths, the sync
Worker keeps a v1 authorization cache in warm isolate memory only. Successful
domain authorization payloads are cached for
`SYNC_AUTHORIZATION_CACHE_TTL_SECONDS`, which defaults to 10 seconds and is
bounded to 0-60 seconds. The cache key includes the requested shape and a
SHA-256 fingerprint of auth-bearing request identity material, including
cookies or bearer tokens when present, plus routing context such as origin,
referer, host, and explicit organization headers. Raw cookies and bearer tokens
are never stored. Cache values retain the authorized user id, organization id,
scope, table, predicate, and params returned by the domain Worker, and cached
entries are only reused for the same requested shape. Authorization failures,
malformed payloads, unknown shapes, and domain/service errors are never cached;
expired or absent grants call the domain Worker live and keep fail-closed
behavior. The `activity-events` shape is not cached because its retained cutoff
is time-sensitive and must be refreshed for each public shape request. Active
membership invalidation is intentionally out of scope for v1, so revocation
exposure is bounded by the short TTL.
Pull-request previews and ephemeral push-to-main cloud E2E now provision the
full Worker, Durable Object, Electric Container, and Neon path. Their deploy
workflows run an authenticated sync canary through `PLAYWRIGHT_SYNC_URL` after
reading the stage database URL from Alchemy state: the canary verifies a
throwaway user, creates and activates a stage-local organization, then requests
the `jobs` shape through Electric. Local Alchemy dev still runs without the
Cloudflare Container application; its local `ElectricSql` Durable Object fails
explicitly with `electric_container_unavailable` if a shape request reaches the
container bridge.

The deployed sync path is ready for Electric/TanStack DB clients, but the app's
existing route-scoped TanStack DB collections remain query-backed in this
change. `VITE_SYNC_ORIGIN` is injected so browser collections can move to
`@tanstack/electric-db-collection` once that package is installed in the app
workspace and each collection has an explicit fallback/write reconciliation
plan.

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

That keeps the current implementation simple while still leaving a clean path toward a more Effect-native backend as the project grows.
