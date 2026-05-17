# API Architecture

## Scope

`apps/api` is the backend service. It exposes Effect HTTP APIs for system,
jobs, sites, comments-backed collaboration, labels, and organization
configuration routes, mounts Better Auth under `/api/auth/*`, owns database
schema and migrations, and can run as either a Node dev server or a Cloudflare
Worker.

## Entry Points

| File                                | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/index.ts`                      | Node development entrypoint.                                                                     |
| `src/server.ts`                     | Effect `HttpApi` construction, system endpoints, API layer composition, and web-handler factory. |
| `src/worker.ts`                     | Cloudflare Worker entrypoint and request handling.                                               |
| `src/platform/cloudflare/env.ts`    | Cloudflare environment decoding and binding access.                                              |
| `src/platform/database/database.ts` | Database runtime layer.                                                                          |
| `src/platform/database/schema.ts`   | Combined Drizzle schema barrel.                                                                  |

System endpoints are defined in `src/server.ts`:

- `GET /` returns a plain API marker string.
- `GET /health` returns a sandbox-compatible `HealthPayload`.

`src/server.ts` also intercepts MCP resource-server traffic before falling
through to the Effect `HttpApi` handler. The MCP route defaults to `/mcp`, or
to the path component of `MCP_RESOURCE_URL` when that environment variable is
set. Protected-resource metadata is served at
`/.well-known/oauth-protected-resource` and at the path-specific well-known URL,
for example `/.well-known/oauth-protected-resource/mcp`.

MCP HTTP is served through `@effect/ai`'s `McpServer.layerHttpRouter`, adapted
to the API web-handler boundary after Better Auth OAuth bearer validation. Ceird
intentionally does not mount an `xmcp` generated worker or use the packaged xmcp
Better Auth adapter in the API runtime.

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
| `auth-email-config.ts`                             | Auth email sender config and Cloudflare credential loading.                                                              |
| `auth-email-transport.ts`                          | Auth email transport capability plus development, local, Cloudflare API, and Cloudflare binding provider layers.         |
| `auth-email-queue.ts`                              | Queue payload handling.                                                                                                  |
| `auth-email-scheduler.ts`                          | Background scheduling boundary for auth emails.                                                                          |
| `cloudflare-auth-email-transport.ts`               | Cloudflare API email transport.                                                                                          |
| `cloudflare-email-binding-auth-email-transport.ts` | Cloudflare Email Worker binding transport.                                                                               |

Better Auth owns standard auth routes under `/api/auth/*`. The API also exposes
a public invitation preview route matched by
`/api/public/invitations/:invitationId/preview`, returning a masked email,
organization name, and role for pending non-expired invitations.

Auth email senders depend on the `AuthEmailTransport` capability rather than a
specific provider. Local Node and sandbox composition use
`AuthEmailTransport.Local`, which selects the Cloudflare API provider only when
both Cloudflare credentials are present and otherwise falls back to deterministic
development delivery. The deployed Worker queue composes
`AuthEmailTransport.CloudflareBinding` directly, so missing Worker bindings or
invalid sender config fail through the Effect layer/config boundary instead of
being selected by an environment variable.

Organization rules are enforced through Better Auth plugin hooks and shared
decoders from `@ceird/identity-core`. Only organization name can be
updated through the supported update path, and writable roles are decoded
against the shared role schema.

## MCP Resource Server

MCP tools live in `src/domains/mcp` as Effect AI `Tool` and `Toolkit`
registrations. They call the same domain services as the HTTP API. The MCP
resource server validates the bearer token through Better Auth's OAuth Provider
support before the request reaches the Effect AI router. Tool execution receives
the verified request identity through an Effect request-runtime context, resolves
the current organization actor from the token's Better Auth session id and
subject, and then lets the existing labels, sites, jobs, and configuration
authorization rules decide access.

Initial MCP tools:

| Tool                       | Domain service method                  | Scope         |
| -------------------------- | -------------------------------------- | ------------- |
| `ceird.labels.list`        | `LabelsService.list`                   | `ceird:read`  |
| `ceird.sites.options`      | `SitesService.getOptions`              | `ceird:read`  |
| `ceird.jobs.list`          | `JobsService.list`                     | `ceird:read`  |
| `ceird.jobs.detail`        | `JobsService.getDetail`                | `ceird:read`  |
| `ceird.jobs.options`       | `JobsService.getOptions`               | `ceird:read`  |
| `ceird.jobs.activity.list` | `JobsService.listOrganizationActivity` | `ceird:admin` |
| `ceird.rate_cards.list`    | `ConfigurationService.listRateCards`   | `ceird:admin` |
| `ceird.jobs.add_comment`   | `JobsService.addComment`               | `ceird:write` |
| `ceird.jobs.assign_label`  | `JobsService.assignLabel`              | `ceird:write` |
| `ceird.jobs.remove_label`  | `JobsService.removeLabel`              | `ceird:write` |

`ceird:admin` satisfies all MCP tool scope checks. `ceird:write` does not imply
read access, and `ceird:read` does not imply write access. All tools fail closed
when the bearer token lacks a Better Auth session id, lacks a subject, or lacks
the required Ceird scope.

## Jobs Domain

Jobs live in `src/domains/jobs` and are exposed through `@ceird/jobs-core`.
Jobs may reference sites and organization labels, but site definitions and
label definitions are owned by their own API domains.

Core files:

| File                       | Responsibility                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds jobs and rate-card contract endpoints to Effect services and configures CORS.                                                      |
| `service.ts`               | Main jobs use cases: list, create, patch, transition, reopen, comments, visits, job-label assignment, collaborators, costs, and options. |
| `configuration-service.ts` | Rate-card configuration.                                                                                                                 |
| `repositories.ts`          | SQL repository layer for jobs, contacts, rate cards, activity, members, and job-label assignment rows.                                   |
| `authorization.ts`         | Role and access checks for jobs operations.                                                                                              |
| `actor-access.ts`          | Actor resolution error mapping.                                                                                                          |
| `activity-recorder.ts`     | Work item activity events.                                                                                                               |
| `schema.ts`                | Jobs-owned Drizzle tables and relations, including job-label assignment rows. Job comments are stored through the comments domain.       |
| `errors.ts`                | API-domain error helpers where needed.                                                                                                   |

The jobs service flow is:

1. Load the current actor.
2. Map actor resolution failures to access-denied errors.
3. Enforce authorization for the requested operation.
4. Read or mutate through repositories.
5. Record activity for auditable changes.
6. Return DTOs defined in the owning shared core package.

Current actor resolution lives in `src/domains/organizations` because sites,
labels, and jobs all need the same organization actor boundary. Better Auth
session data is treated as untrusted: session user and active organization IDs
are decoded into branded IDs, malformed identity data fails with a typed
actor-resolution error, and session lookup failures remain typed storage
failures instead of defects.

External organization members can have collaborator-style access to specific
jobs. Elevated internal roles can manage organization-wide configuration such
as labels, service areas, sites, and rate cards through the owning domain.

## Comments Domain

Reusable comments persistence lives in `src/domains/comments` and shared DTO
primitives live in `@ceird/comments-core`. The API stores comment content in a
single `comments` table and keeps target ownership in separate join tables:

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

Labels live in `src/domains/labels` and are exposed through
`@ceird/labels-core`. Labels are organization-level definitions; jobs and sites
assign those labels through join tables and assignment behavior owned by the
jobs and sites domains.

Core files:

| File               | Responsibility                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| `http.ts`          | Binds label contract endpoints to `LabelsService` and configures CORS.    |
| `service.ts`       | Label list, create, update, and archive use cases with organization auth. |
| `repositories.ts`  | SQL repository layer for the organization-owned `labels` table.           |
| `schema.ts`        | Labels Drizzle table and relations.                                       |
| `id-generation.ts` | Label ID generation.                                                      |

## Sites Domain

Sites live in `src/domains/sites` and are exposed through
`@ceird/sites-core`. Sites and service areas are independent organization data
that jobs can reference. Sites can also have internal comments through the
comments domain. Site access notes remain a single structured field on the site
itself for operational access instructions.

Core files:

| File                       | Responsibility                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds sites and service-area contract endpoints to Effect services and configures CORS.     |
| `service.ts`               | Site list, create, update, options, internal comments, and site-label assignment use cases. |
| `service-areas-service.ts` | Service-area list, create, and update use cases.                                            |
| `repositories.ts`          | SQL repository layer for sites, service areas, and site-label assignment methods.           |
| `schema.ts`                | Sites, service-area, and site-label assignment rows and relations.                          |
| `geocoder.ts`              | Site geocoding capability plus development and Google provider layers.                      |
| `id-generation.ts`         | Site and service-area ID generation.                                                        |

Site and job services depend on the `SiteGeocoder` capability, not on a
provider-specific implementation. Runtime entrypoints choose the provider layer:
local Node/sandbox composition uses `SiteGeocoder.Local`, which selects Google
when `GOOGLE_MAPS_API_KEY` is present and falls back to deterministic
development coordinates when it is absent. The Cloudflare Worker composition
uses `SiteGeocoder.Google`, so deployed API startup fails fast without the
Google Maps key. Environment variables configure provider credentials; they do
not select provider topology. Address-level misses return the user-correctable
geocoding failure contract, while upstream Google/configuration failures return
the provider failure contract so deployed misconfiguration fails visibly.

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

| Area                  | Files                                                |
| --------------------- | ---------------------------------------------------- |
| Database config       | `src/platform/database/config.ts`, `database-url.ts` |
| Database runtime      | `src/platform/database/database.ts`                  |
| Test database helpers | `src/platform/database/test-database.ts`             |
| Schema barrel         | `src/platform/database/schema.ts`                    |
| Migrations            | `drizzle/*.sql`, `drizzle/meta/*.json`               |
| Drizzle CLI config    | `drizzle.config.ts`                                  |

`databaseSchema` merges authentication, comments, labels, sites, and jobs
tables. Keep schema changes in the domain that owns the tables, then export
through the schema barrel.

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

When database-backed integration coverage is required from the host, run the
sandbox-aware wrapper:

```bash
pnpm api:test:with-sandbox
```

Database-backed integration tests create an isolated database from a base
Postgres URL. By default they use the local app database URL, but
`API_TEST_DATABASE_URL` or `TEST_DATABASE_URL` can point them at any sandbox
Postgres port.

High-risk API changes should include tests for the service behavior,
authorization behavior, repository behavior when SQL is involved, and HTTP
contract behavior when endpoint payloads or errors change.
