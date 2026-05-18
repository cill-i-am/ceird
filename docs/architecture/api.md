# API Architecture

## Scope

`apps/api` is the Ceird HTTP API and auth service. It exposes Effect HTTP APIs
for system, jobs, sites, comments-backed collaboration, labels, and
organization configuration routes, mounts Better Auth under `/api/auth/*`, owns
the API migration entrypoint, and can run as either a Node dev server or a
Cloudflare Worker.

Shared backend services, SQL repositories, database runtime helpers, and MCP
resource-server runtime live in `@ceird/backend-core`. The API imports that
package for implementation layers and keeps API-specific HTTP adapters,
authentication, CORS, request logging, queues, and migration wiring in
`apps/api`.

## Entry Points

| File                                 | Purpose                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/index.ts`                       | Node development entrypoint.                                                                     |
| `src/server.ts`                      | Effect `HttpApi` construction, system endpoints, API layer composition, and web-handler factory. |
| `src/worker.ts`                      | Thin Cloudflare Worker module adapter; runs the Effect runtime programs for fetch and queue.     |
| `src/platform/cloudflare/runtime.ts` | Cloudflare runtime composition for API fetch handling, auth queue delivery, and Worker layers.   |
| `src/platform/cloudflare/env.ts`     | Cloudflare environment decoding and binding access.                                              |
| `src/platform/database/schema.ts`    | API migration schema barrel composed from auth and shared backend schemas.                       |

System endpoints are defined in `src/server.ts`:

- `GET /` returns a plain API marker string.
- `GET /health` returns a stack- and stage-aware `HealthPayload`.

The Cloudflare Worker module in `src/worker.ts` only adapts Cloudflare's
promise-based `fetch` and `queue` handlers into Effect programs. Runtime
composition lives in `src/platform/cloudflare/runtime.ts`: it installs the
Worker config provider, builds the Hyperdrive-backed database layer, wires
Better Auth background tasks through `context.waitUntil`, uses the Google site
geocoder layer, and composes auth queue delivery with the Cloudflare email
binding transport. Keeping this runtime boundary separate makes the current
Worker compatible with Cloudflare's module handler contract while preserving
the single Effect-threaded Worker runtime in
`src/platform/cloudflare/runtime.ts`.
The health handler reads `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` through the
same Effect config path and includes both values in its response, falling back
to `local` for package-local Node runs.

The runtime reads Cloudflare bindings from `src/platform/cloudflare/env.ts`.
That file separates plain configuration vars from `ApiWorkerBindingRuntimeEnv`,
the runtime binding contract for `DATABASE`, `AUTH_EMAIL_QUEUE`, and
`AUTH_EMAIL`, while forwarding Alchemy's injected `ALCHEMY_STACK_NAME` and
`ALCHEMY_STAGE` metadata into Effect config. The root infra stack owns the
Alchemy binding resources in `infra/cloudflare-stack.ts` and derives
`ApiWorkerBindingEnv` with `Cloudflare.InferEnv`. The infra test suite imports
the API binding contract and asserts the Alchemy-inferred type has the same
keys and assignable runtime binding types. The same infra tests also compare
the stack-provided API Worker config keys against `ApiWorkerConfigEnv`. Secret
and credential values stay typed as Alchemy deploy-time redacted inputs in
`infra`, while the API runtime sees resolved strings through
Cloudflare's Worker environment. Keep those bridges green when adding Worker
resources or config vars. The API runtime intentionally stays on its Effect 3
application dependencies and does not import Alchemy or Effect 4; the root
infra helpers own those deploy-time dependencies and binding types.

`src/server.ts` does not serve MCP traffic. Requests for `/mcp` or MCP
protected-resource metadata fall through to the Effect `HttpApi` handler and
return the normal API 404 response. The standalone MCP resource is served by
`apps/mcp`, while `apps/api` remains the OAuth/OIDC authorization server through
Better Auth.

## Observability

The API enables a custom Effect HTTP request logger for both the Node server and
the Cloudflare/web-handler path. It records method, status, and redacted path
only; query strings are not logged, and `/health` is skipped to keep probe noise
out of operational logs. Typed domain HTTP handlers also wrap service calls with
`observeApiOperation`, which adds an operation log span and emits structured
fields when a jobs, rate-card, labels, sites, or service-area operation fails.
Storage failures and defects log at warning level, while expected typed domain
failures log at info level. Those fields include the API domain, service,
operation, failure tag, failure message, safe entity identifiers when present,
and failure cause when present.

Background auth email delivery uses the same structured failure vocabulary.
Password reset, verification, email-change confirmation, and organization
invitation delivery failures are reported through the authentication failure
reporters. Cloudflare queue delivery failures log the email kind, delivery key,
source tag, and source cause before retrying. Deployed Workers rely on
Cloudflare observability logs and traces configured by the infra stack.

## Authentication Domain

Authentication lives in `src/domains/identity/authentication`.

Core files:

| File                                               | Responsibility                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `auth.ts`                                          | Better Auth creation, organization plugin hooks, public invitation preview handler, CORS integration, and HTTP mounting. |
| `config.ts`                                        | Better Auth runtime config, trusted origins, cookie-domain logic, and rate-limit config.                                 |
| `schema.ts`                                        | Better Auth Drizzle tables and relations.                                                                                |
| `auth-email.ts`                                    | Auth email payloads and send orchestration.                                                                              |
| `auth-email-config.ts`                             | Auth email sender config loaded from runtime configuration.                                                              |
| `auth-email-transport.ts`                          | Auth email transport capability plus deterministic local/development and deployed Cloudflare binding provider layers.    |
| `auth-email-queue.ts`                              | Queue payload handling.                                                                                                  |
| `auth-email-scheduler.ts`                          | Background scheduling boundary for auth emails.                                                                          |
| `cloudflare-email-binding-auth-email-transport.ts` | Cloudflare Email Worker binding transport.                                                                               |

Better Auth owns standard auth routes under `/api/auth/*`. The API also exposes
a public invitation preview route matched by
`/api/public/invitations/:invitationId/preview`, returning a masked email,
organization name, and role for pending non-expired invitations.

Auth email senders depend on the `AuthEmailTransport` capability rather than a
specific provider. Package-local Node composition uses
`AuthEmailTransport.Local`, which always uses deterministic development
delivery. The deployed Worker queue composes
`AuthEmailTransport.CloudflareBinding` directly, so missing Worker bindings or
invalid sender config fail through the Effect layer/config boundary instead of
being selected by an environment variable.

Organization rules are enforced through Better Auth plugin hooks and shared
decoders from `@ceird/identity-core`. Only organization name can be
updated through the supported update path, and writable roles are decoded
against the shared role schema.

## MCP OAuth Boundary

The API configures Better Auth's OAuth Provider for Ceird MCP clients and
advertises the MCP resource URL as a valid token audience. In deployed
production, that resource is `https://mcp.ceird.app/mcp`; stage and local
Alchemy runs derive it from the configured `mcpHostname`.

The API does not validate MCP bearer tokens or run MCP tools. The `apps/mcp`
Worker validates OAuth Provider JWT bearer tokens against the configured issuer
and MCP audience, then delegates tool execution to the shared
`@ceird/backend-core/mcp` handler and domain services.

## Jobs Domain

Jobs HTTP endpoints live in `apps/api/src/domains/jobs/http.ts` and are exposed
through `@ceird/jobs-core`. Jobs services, repositories, authorization, activity
recording, ID generation, and schema live in
`packages/backend-core/src/domains/jobs`. Jobs may reference sites and
organization labels, but site definitions and label definitions are owned by
their own domains.

Core files:

| File                       | Responsibility                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds jobs and rate-card contract endpoints to Effect services and configures CORS.                                                                   |
| `service.ts`               | Backend-core main jobs use cases: list, create, patch, transition, reopen, comments, visits, job-label assignment, collaborators, costs, and options. |
| `configuration-service.ts` | Backend-core rate-card configuration.                                                                                                                 |
| `repositories.ts`          | Backend-core SQL repository layer for jobs, contacts, rate cards, activity, members, and job-label assignment rows.                                   |
| `authorization.ts`         | Backend-core role and access checks for jobs operations.                                                                                              |
| `actor-access.ts`          | Backend-core actor resolution error mapping.                                                                                                          |
| `activity-recorder.ts`     | Backend-core work item activity events.                                                                                                               |
| `schema.ts`                | Backend-core jobs-owned Drizzle tables and relations, including job-label assignment rows. Job comments are stored through the comments domain.       |
| `errors.ts`                | Backend-core domain error helpers where needed.                                                                                                       |

The jobs service flow is:

1. Load the current actor.
2. Map actor resolution failures to access-denied errors.
3. Enforce authorization for the requested operation.
4. Read or mutate through repositories.
5. Record activity for auditable changes.
6. Return DTOs defined in the owning shared core package.

Current actor resolution lives in
`packages/backend-core/src/domains/organizations` because sites, labels, jobs,
and MCP all need the same organization actor boundary. The API provides a
Better Auth-backed session resolver layer for HTTP requests. Better Auth session
data is treated as untrusted: session user and active organization IDs are
decoded into branded IDs, malformed identity data fails with a typed
actor-resolution error, and session lookup failures remain typed storage
failures instead of defects.

External organization members can have collaborator-style access to specific
jobs. Elevated internal roles can manage organization-wide configuration such
as labels, service areas, sites, and rate cards through the owning domain.

## Comments Domain

Reusable comments persistence lives in
`packages/backend-core/src/domains/comments` and shared DTO primitives live in
`@ceird/comments-core`. Ceird stores comment content in a single `comments`
table and keeps target ownership in separate join tables:

- `work_item_comments` links comments to jobs.
- `site_comments` links comments to sites.

The core `comments` row owns author, organization, body, creation timestamp,
and edit metadata (`updated_at`, `updated_by_user_id`). Target join tables own
the target foreign key and ordering timestamp. Database triggers enforce exactly
one ownership target per comment, validate that comment authors/editors are
members of the comment organization without pinning historical comments to
membership rows after a member is removed, and delete a shared comment after its
ownership row is removed.

Site comments are internal-only at the service authorization layer for now.
Site `accessNotes` remain part of the site record and are not deprecated by the
comments API.

## Jobs API Endpoints

Endpoint definitions live in `packages/jobs-core/src/http-api.ts`; API handlers
live in `apps/api/src/domains/jobs/http.ts`.

| Method   | Path                                              | Handler name                  |
| -------- | ------------------------------------------------- | ----------------------------- |
| `GET`    | `/jobs`                                           | `listJobs`                    |
| `GET`    | `/jobs/options`                                   | `getJobOptions`               |
| `GET`    | `/jobs/member-options`                            | `getJobMemberOptions`         |
| `GET`    | `/jobs/external-member-options`                   | `getJobExternalMemberOptions` |
| `POST`   | `/jobs`                                           | `createJob`                   |
| `GET`    | `/activity`                                       | `listOrganizationActivity`    |
| `GET`    | `/jobs/:workItemId`                               | `getJobDetail`                |
| `PATCH`  | `/jobs/:workItemId`                               | `patchJob`                    |
| `POST`   | `/jobs/:workItemId/transitions`                   | `transitionJob`               |
| `POST`   | `/jobs/:workItemId/reopen`                        | `reopenJob`                   |
| `POST`   | `/jobs/:workItemId/comments`                      | `addJobComment`               |
| `POST`   | `/jobs/:workItemId/visits`                        | `addJobVisit`                 |
| `POST`   | `/jobs/:workItemId/labels`                        | `assignJobLabel`              |
| `DELETE` | `/jobs/:workItemId/labels/:labelId`               | `removeJobLabel`              |
| `POST`   | `/jobs/:workItemId/cost-lines`                    | `addJobCostLine`              |
| `GET`    | `/jobs/:workItemId/collaborators`                 | `listJobCollaborators`        |
| `POST`   | `/jobs/:workItemId/collaborators`                 | `attachJobCollaborator`       |
| `PATCH`  | `/jobs/:workItemId/collaborators/:collaboratorId` | `updateJobCollaborator`       |
| `DELETE` | `/jobs/:workItemId/collaborators/:collaboratorId` | `detachJobCollaborator`       |
| `GET`    | `/rate-cards`                                     | `listRateCards`               |
| `POST`   | `/rate-cards`                                     | `createRateCard`              |
| `PATCH`  | `/rate-cards/:rateCardId`                         | `updateRateCard`              |

## Labels Domain

Labels HTTP endpoints live in `apps/api/src/domains/labels/http.ts` and are
exposed through `@ceird/labels-core`. Labels service, repository, ID generation,
and schema live in `packages/backend-core/src/domains/labels`. Labels are
organization-level definitions; jobs and sites assign those labels through join
tables and assignment behavior owned by the jobs and sites domains.

Core files:

| File               | Responsibility                                                                         |
| ------------------ | -------------------------------------------------------------------------------------- |
| `http.ts`          | Binds label contract endpoints to `LabelsService` and configures CORS.                 |
| `service.ts`       | Backend-core label list, create, update, and archive use cases with organization auth. |
| `repositories.ts`  | Backend-core SQL repository layer for the organization-owned `labels` table.           |
| `schema.ts`        | Backend-core labels Drizzle table and relations.                                       |
| `id-generation.ts` | Backend-core label ID generation.                                                      |

## Sites Domain

Sites HTTP endpoints live in `apps/api/src/domains/sites/http.ts` and are
exposed through `@ceird/sites-core`. Sites services, repositories, geocoding, ID
generation, and schema live in `packages/backend-core/src/domains/sites`. Sites
and service areas are independent organization data that jobs can reference.
Sites can also have internal comments through the comments domain. Site access
notes remain a single structured field on the site itself for operational
access instructions.

Core files:

| File                       | Responsibility                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds sites and service-area contract endpoints to Effect services and configures CORS.                  |
| `service.ts`               | Backend-core site list, create, update, options, internal comments, and site-label assignment use cases. |
| `service-areas-service.ts` | Backend-core service-area list, create, and update use cases.                                            |
| `repositories.ts`          | Backend-core SQL repository layer for sites, service areas, and site-label assignment methods.           |
| `schema.ts`                | Backend-core sites, service-area, and site-label assignment rows and relations.                          |
| `geocoder.ts`              | Backend-core site geocoding capability plus development and Google provider layers.                      |
| `id-generation.ts`         | Backend-core site and service-area ID generation.                                                        |

Site and job services depend on the `SiteGeocoder` capability, not on a
provider-specific implementation. Runtime entrypoints choose the provider layer:
package-local Node composition uses `SiteGeocoder.Local`, which selects Google
when `GOOGLE_MAPS_API_KEY` is present and falls back to deterministic
development coordinates when it is absent. The Cloudflare Worker composition
uses `SiteGeocoder.Google`, so deployed API and MCP startup fail fast without
the Google Maps key. Environment variables configure provider credentials; they
do not select provider topology. Address-level misses return the
user-correctable geocoding failure contract, while upstream
Google/configuration failures return the provider failure contract so deployed
misconfiguration fails visibly.

## Labels API Endpoints

Endpoint definitions live in `packages/labels-core/src/http-api.ts`; API
handlers live in `apps/api/src/domains/labels/http.ts`.

| Method   | Path               | Handler name  |
| -------- | ------------------ | ------------- |
| `GET`    | `/labels`          | `listLabels`  |
| `POST`   | `/labels`          | `createLabel` |
| `PATCH`  | `/labels/:labelId` | `updateLabel` |
| `DELETE` | `/labels/:labelId` | `deleteLabel` |

## Sites API Endpoints

Endpoint definitions live in `packages/sites-core/src/http-api.ts`; API
handlers live in `apps/api/src/domains/sites/http.ts`.

| Method   | Path                             | Handler name        |
| -------- | -------------------------------- | ------------------- |
| `GET`    | `/service-areas`                 | `listServiceAreas`  |
| `POST`   | `/service-areas`                 | `createServiceArea` |
| `PATCH`  | `/service-areas/:serviceAreaId`  | `updateServiceArea` |
| `GET`    | `/sites`                         | `listSites`         |
| `GET`    | `/sites/options`                 | `getSiteOptions`    |
| `POST`   | `/sites`                         | `createSite`        |
| `PATCH`  | `/sites/:siteId`                 | `updateSite`        |
| `GET`    | `/sites/:siteId/comments`        | `listSiteComments`  |
| `POST`   | `/sites/:siteId/comments`        | `addSiteComment`    |
| `POST`   | `/sites/:siteId/labels`          | `assignSiteLabel`   |
| `DELETE` | `/sites/:siteId/labels/:labelId` | `removeSiteLabel`   |

`GET /sites` is cursor-paginated with `cursor`, `limit`, and
`serviceAreaId` query parameters. Responses return `{ items, nextCursor }` and
use the stable directory order `name asc, id asc`. `GET /sites/options`
provides bundled internal form support data for workflows that need service
areas and sites together.

## Database

The API uses Drizzle with Postgres.

| Area                  | Files                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Database config       | `packages/backend-core/src/platform/database/config.ts`, `database-url.ts` |
| Database runtime      | `packages/backend-core/src/platform/database/database.ts`                  |
| Test database helpers | `packages/backend-core/src/platform/database/test-database.ts`             |
| API schema barrel     | `src/platform/database/schema.ts`                                          |
| Migrations            | `drizzle/*.sql`, `drizzle/meta/*.json`                                     |
| Alchemy snapshots     | `drizzle/alchemy/*/{migration.sql,snapshot.json}`                          |
| Drizzle CLI config    | `drizzle.config.ts`                                                        |

The API `databaseSchema` merges authentication, comments, labels, sites, and
jobs tables. Shared domain table definitions live in `@ceird/backend-core`; the
API schema barrel composes them with the Better Auth tables for migration
generation. Keep schema changes in the domain that owns the tables, then export
through the relevant package/API barrel. The Alchemy stack also loads the API
barrel through `Drizzle.Schema`. The native Neon branch applies
`apps/api/drizzle`, so the historical SQL files remain the bootstrap path and
future Alchemy-generated SQL under `drizzle/alchemy` is picked up by the same
resource. In infra this is modeled as separate generated and applied migration
directories.

The `site_labels` table joins `sites` to organization `labels` and enforces the
same organization on both sides through composite organization foreign keys.

## Errors And Runtime Schemas

Public API errors live in the package that owns the contract:
`packages/jobs-core/src/errors.ts`, `packages/sites-core/src/errors.ts`, and
`packages/labels-core/src/errors.ts`. API code should return those shared
errors when a frontend client needs typed behavior.

Use Effect `Config` for environment loading and Effect `Schema` for external
payload boundaries. Plain TypeScript types are fine for internal computed
values that never cross an untrusted boundary.

## Testing

API tests live next to source files as `*.test.ts` or `*.integration.test.ts`.
Run them with:

```bash
pnpm --filter api test
```

Database-backed integration tests create an isolated database from a base
Postgres URL. By default they use the local app database URL, but
`API_TEST_DATABASE_URL` or `TEST_DATABASE_URL` can point them at a specific
Postgres instance for focused coverage.

High-risk API changes should include tests for the service behavior,
authorization behavior, repository behavior when SQL is involved, and HTTP
contract behavior when endpoint payloads or errors change.
