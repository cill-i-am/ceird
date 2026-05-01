# Cloudflare Alchemy POC Design

## Summary

Build a proof-of-concept Cloudflare deployment path for Task Tracker using
Alchemy as the infrastructure-as-code layer.

The POC should deploy the two existing public application surfaces:

- `apps/app` as a public TanStack Start Worker
- `apps/api` as a public API Worker

It should also provision the Cloudflare infrastructure needed by those Workers:

- Hyperdrive connected to a new PlanetScale Postgres database
- a durable auth email Queue and dead-letter Queue
- Worker bindings, vars, secrets, routes, and observability

This is intentionally a runtime and deployment POC, not a full data model
redesign. Postgres remains the source of truth for auth, organizations, jobs,
sites, contacts, visits, and activity. Durable Objects, D1, R2, and Workflows
remain future migration options once the Cloudflare runtime shape has proven
itself.

## Goals

- introduce an `infra` workspace package that owns Alchemy deployment code
- use Alchemy as the only IaC layer for the POC
- do not keep a parallel `wrangler.jsonc` configuration
- deploy `apps/app` to Cloudflare Workers through Alchemy's TanStack Start
  support
- deploy `apps/api` to Cloudflare Workers through Alchemy's Worker support
- keep the API publicly addressable because it is a product surface and will
  eventually sit beside a public MCP server
- create the PlanetScale Postgres database and roles through Alchemy
- connect Workers to PlanetScale Postgres through Cloudflare Hyperdrive
- move auth email background work from process-local scheduling to Cloudflare
  Queues
- preserve the existing Effect-first application architecture where practical
- keep local sandbox development working while adding the Cloudflare POC path
- leave a clear record of deployment assumptions, open questions, and rollback
  options

## Non-Goals

- migrating jobs data to Durable Objects in this pass
- migrating auth or jobs data to D1 in this pass
- introducing R2-backed file uploads
- building the MCP server in this pass
- hiding the API behind service bindings only
- replacing Better Auth
- replacing Drizzle migrations with a new migration system
- adding Terraform, Pulumi, raw Wrangler config, or another IaC layer beside
  Alchemy
- making this POC the production deployment path before we have tested it

## Current Context

The repo is already split into deployable application boundaries:

- `apps/app` contains the TanStack Start application.
- `apps/api` contains an Effect `HttpApi` server.
- `packages/identity-core` and `packages/jobs-core` contain shared schemas,
  branded ids, DTOs, and API contracts.
- `packages/sandbox-cli` and `packages/sandbox-core` own local worktree
  sandbox orchestration.

The API already exposes a useful web-handler seam:

- `apps/api/src/server.ts` exports `makeApiWebHandler()`

The current production-oriented API entrypoint is still Node-specific:

- `apps/api/src/index.ts` uses `NodeRuntime.runMain`
- `apps/api/src/server.ts` uses `NodeHttpServer.layerConfig(createServer, ...)`
- `apps/api/src/platform/database/database.ts` creates a `pg.Pool` from
  `DATABASE_URL`

The auth email path already has a temporary marker for durable background work:

- `apps/api/src/domains/identity/authentication/auth.ts` uses a
  `queueMicrotask`-based Better Auth background task handler
- the comment references replacing that in-process scheduler with a durable
  background queue

## External Facts

### Alchemy

As of the 2026-04-30 v2 beta review, the POC targets `alchemy@2.0.0-beta.25`
and Effect 4 beta inside `packages/infra` only.

The v2 shape is different enough from v1 that the stack should follow the new
docs directly:

- `export default Alchemy.Stack(...)`
- imports from uppercase provider modules such as `alchemy/Cloudflare`
- `main` for Workers, not v1 `entrypoint`
- `Cloudflare.Vite` for the TanStack Start app, not v1 `TanStackStart`
- `Cloudflare.Worker`, `Cloudflare.Queue`, and `Cloudflare.QueueConsumer`
- `Cloudflare.state(...)` as the explicit state layer
- `Cloudflare.providers()` as the Cloudflare provider layer

Alchemy v2 does not currently expose first-class PlanetScale or Hyperdrive
resources in the package we inspected. The POC therefore uses small custom
Alchemy resources backed by Distilled SDK operations:

- `@distilled.cloud/planetscale` for PlanetScale Postgres database and role
  creation
- `@distilled.cloud/cloudflare` for Hyperdrive config creation and updates

This matches Alchemy's direction because Distilled is the Effect-native cloud
SDK layer powering Alchemy. Once Alchemy ships first-class `PlanetScale` and
`Hyperdrive` resources, the custom wrappers should become thin migration
targets rather than permanent infrastructure abstractions.

The main risk is maturity: Alchemy v2 is beta and tracks Effect 4 beta. This
repo currently uses Effect 3 in the runtime packages, so `packages/infra` must
remain version-isolated.

### PlanetScale Postgres

PlanetScale Postgres supports standard PostgreSQL drivers and requires SSL/TLS
connections. PlanetScale recommends user-defined roles for application
connections rather than using the default highly privileged role.

PlanetScale provides direct Postgres connections on port `5432` and PgBouncer
connections on port `6432`. For this POC, Hyperdrive is the Cloudflare-side
pooling layer, so the implementation plan should test the direct connection
first and only use PlanetScale PgBouncer if Hyperdrive compatibility or load
testing points that way.

### Cloudflare Hyperdrive

Cloudflare documents PlanetScale Postgres as a supported provider for
Hyperdrive. Hyperdrive supports existing Postgres databases and provides a
Worker binding that database clients can use through the generated connection
string.

For this codebase, Hyperdrive is the lowest-risk data migration path because it
allows the current Postgres schema, Drizzle migrations, and Better Auth adapter
to remain in place while the runtime moves to Workers.

## Target Topology

The POC should deploy public Worker surfaces, not a single collapsed backend.

```text
app.<domain>
  -> Cloudflare Worker running apps/app TanStack Start

api.<domain>
  -> Cloudflare Worker running apps/api Effect HttpApi
  -> Hyperdrive binding
  -> PlanetScale Postgres
  -> Auth email Queue binding

future: mcp.<domain>
  -> Cloudflare Worker running public MCP server
  -> same auth/API/data contracts as appropriate
```

The app Worker may call the API over the public API origin during the first POC.
Later we may add a service binding from app Worker to API Worker for SSR-only
internal calls, but the API must remain public and independently addressable.

## Infrastructure Ownership

Create a separate workspace package:

- `packages/infra`
- package name: `@task-tracker/infra`

Responsibilities:

- Alchemy stack entrypoint
- Cloudflare app/API Worker resources
- Hyperdrive resource or reference
- Queue and dead-letter Queue resources
- route/domain configuration
- stage-specific vars and secrets
- deployment scripts
- type declarations needed by Worker bindings

Non-responsibilities:

- runtime API business logic
- runtime app business logic
- Drizzle schema ownership
- sandbox Docker orchestration

## Runtime Ownership

### App Worker

`apps/app` remains the owner of:

- TanStack Start routes
- SSR/session-aware loaders
- browser UI
- API origin resolution

The POC should update the app build for Cloudflare Workers without replacing
the current local sandbox flow. The app should learn a Cloudflare deployment
target, not lose its existing development mode.

### API Worker

`apps/api` remains the owner of:

- Better Auth runtime
- public `/api/auth/*` routes
- public jobs/sites HTTP API
- database access
- auth email composition and delivery policy

The API should gain a Worker entrypoint that calls the existing Effect web
handler. The Node entrypoint should stay for local sandbox development until the
sandbox flow is deliberately replaced.

## Database Strategy

Keep Postgres as the POC database.

Implementation choices:

1. Load PlanetScale organization, region, default branch, cluster size, and API
   credentials as deployment inputs.
2. Create the PlanetScale Postgres database through an Alchemy custom resource
   backed by `@distilled.cloud/planetscale`.
3. Create separate Alchemy-managed PlanetScale roles for application traffic and
   Drizzle migrations through the same Distilled-backed resource module.
4. Provision a Cloudflare Hyperdrive config through an Alchemy custom resource
   backed by `@distilled.cloud/cloudflare`.
5. Bind Hyperdrive to the API Worker as `DATABASE`.
6. In the API Worker, derive the runtime Postgres connection string from
   `env.DATABASE.connectionString`.
7. Programmatically run Drizzle migrations with Drizzle's Node migrator from
   the Alchemy deployment process when `APPLY_MIGRATIONS=true`, using the
   Alchemy-created migration role.
8. Skip the migration step when `APPLY_MIGRATIONS=false` so infra-only deploys
   cannot mutate schema accidentally.

The POC should not attempt to run migrations inside the Worker.

## Auth Email Queue Strategy

The current auth email composition should stay in the identity/authentication
domain. The change is the scheduling boundary.

Target flow:

1. Better Auth invokes an auth email hook during signup, verification, password
   reset, email change, or invitation.
2. The API builds a validated domain payload using the existing
   `AuthEmailSender` input schemas.
3. Instead of scheduling a process-local task, the API enqueues an
   `AuthEmailQueueMessage`.
4. The API Worker consumes the Queue through a `queue()` handler.
5. The queue consumer sends through the existing Cloudflare auth email
   transport.
6. Failed messages retry through Queue settings and eventually land in a DLQ.

Queue payloads should be schema-decoded at the consumer boundary.

## Configuration Strategy

Alchemy owns Cloudflare resource configuration and Worker bindings.

Runtime code should read actual Worker bindings from the request/queue handler
environment, not from generated Wrangler config.

Existing local sandbox configuration can continue to use environment variables:

- `DATABASE_URL`
- `BETTER_AUTH_BASE_URL`
- `AUTH_APP_ORIGIN`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_FROM_NAME`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Worker runtime should prefer bindings:

- `DATABASE` for Hyperdrive
- `AUTH_EMAIL_QUEUE` for auth email scheduling

Worker runtime can still use vars/secrets for scalar values:

- `BETTER_AUTH_BASE_URL`
- `AUTH_APP_ORIGIN`
- `BETTER_AUTH_SECRET`
- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_FROM_NAME`
- Cloudflare email credentials, until replaced by a Worker-native email binding

## Security

The API remains public. That means the deployment should plan for public API
hardening instead of treating app SSR as the only caller.

POC security defaults:

- use least-privilege PlanetScale app role
- keep database credentials secret in Alchemy/Cloudflare
- keep `BETTER_AUTH_SECRET` secret
- do not expose Hyperdrive origin credentials to the app Worker
- use credentialed CORS only for trusted app origins
- add Cloudflare observability from the first deployed Worker

Later security additions:

- Turnstile on signup/signin/password reset abuse paths
- Cloudflare Rate Limit binding or WAF rules
- API Shield from an OpenAPI export once the public API contract stabilizes
- separate MCP auth/token scopes

## Open Questions

- What Cloudflare account and zone should the POC use?
- What POC domain names should be used for app and API?
- Which PlanetScale organization, region, branch name, and cluster size should
  the Alchemy-managed POC database use?
- Is PlanetScale billing enabled for that organization? If not, the stack
  should fail clearly rather than silently falling back to manual database
  creation.
- Should the API Worker use the existing Cloudflare REST email transport during
  the POC, or should auth email sending move to a Worker-native email binding
  at the same time as Queues?
- Should app SSR call the API through the public origin first, or should the
  POC include an app-to-api service binding while keeping the API public?

## Recommendation

Use Alchemy for the POC.

Keep it isolated in `packages/infra`, pin exact versions, and do not introduce
parallel Wrangler config. The first success criterion is end-to-end deployment:

- app Worker loads
- API Worker responds to `/health`
- API Worker reaches PlanetScale through Hyperdrive
- Drizzle migrations apply to PlanetScale during Alchemy deploy when
  `APPLY_MIGRATIONS=true`
- auth email work is enqueued and consumed through Cloudflare Queues

Only after that succeeds should we evaluate deeper Cloudflare-native storage
changes such as per-organization Durable Objects.
