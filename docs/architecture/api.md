# API Architecture

## Scope

`apps/api` is the public HTTP adapter. It keeps public root and health
responses local, then forwards all product, auth, and MCP-compatible HTTP
traffic to the private `apps/domain` Worker through a Cloudflare `DOMAIN`
service binding.

`apps/domain` is the backend/domain service. It exposes the Effect HTTP API for
jobs, sites, comments-backed collaboration, labels, organization configuration,
Better Auth under `/api/auth/*`, and MCP tool execution. It owns database
schema and migrations, authorization, repositories, action execution, audit, and
the Hyperdrive/Postgres binding.

`apps/mcp` is the standalone MCP adapter. It forwards MCP traffic to
`apps/domain` through the same `DOMAIN` service binding so MCP, public HTTP,
and future agent/bot surfaces share the same capability surface.

`apps/agent` is the Cloudflare Agents SDK runtime. It hosts `CeirdAgent`
Durable Objects for org/user/thread-scoped conversations, streams model output
through Workers AI, and executes Ceird actions by calling the private
`apps/domain` Worker through the same `DOMAIN` service binding.

## Entry Points

| Workspace     | File/path                        | Purpose                                                                                  |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/api`    | `src/index.ts`                   | Node development entrypoint for the public adapter.                                      |
| `apps/api`    | `src/server.ts`                  | Public root/health handling, request logger, and domain forwarding handler.              |
| `apps/api`    | `src/worker.ts`                  | Public API Cloudflare Worker adapter.                                                    |
| `apps/api`    | `src/platform/cloudflare/env.ts` | API Worker binding contract for `DOMAIN`.                                                |
| `apps/agent`  | `src/worker.ts`                  | Public Agent Worker adapter, connect-token gate, and Agents SDK request routing.         |
| `apps/agent`  | `src/ceird-agent.ts`             | `CeirdAgent` Durable Object runtime, system prompt, model streaming, and tool set.       |
| `apps/agent`  | `src/tools.ts`                   | AI SDK tool adapter derived from executable shared action registry metadata.             |
| `apps/agent`  | `src/domain-client.ts`           | Internal client for the domain action API over the `DOMAIN` service binding.             |
| `apps/domain` | `src/server.ts`                  | Effect `HttpApi` construction, domain route composition, and web-handler factory.        |
| `apps/domain` | `src/worker.ts`                  | Private domain Cloudflare Worker adapter and auth email queue consumer.                  |
| `apps/domain` | `src/platform/cloudflare`        | Domain Worker config, Hyperdrive, queue, email, geocoder, and runtime layer composition. |
| `apps/domain` | `src/platform/database`          | Database runtime, schema barrel, config, errors, and test helpers.                       |
| `apps/mcp`    | `src/worker.ts`                  | Public MCP adapter Worker at `mcp.<stage>.ceird.app` that forwards to `DOMAIN`.          |

Public system endpoints are defined in `apps/api/src/server.ts`:

- `GET /` returns a plain API marker string.
- `GET /health` returns a stack- and stage-aware `HealthPayload`.

The API Worker module adapts Cloudflare's promise-based `fetch` handler to
service-binding forwarding and public root/health responses. The MCP Worker is
also a forwarding adapter, but its fetch path is Effect-threaded so MCP traffic
gets structured forwarding logs, log spans, and a controlled `502` response when
the private domain service binding is unavailable. The single Effect-threaded domain runtime
boundary for product behavior lives in
`apps/domain/src/platform/cloudflare/runtime.ts`: it installs the Worker config
provider, builds the Hyperdrive-backed database layer, wires Better Auth
background tasks through `context.waitUntil`, uses the Google site geocoder
layer, and composes auth queue delivery with the Cloudflare email binding
transport. Keeping this runtime boundary private lets multiple clients share the
same domain execution and audit path.
The health handler reads `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` through the
same Effect config path and includes both values in its response, falling back
to `local` for package-local Node runs.

The API and MCP runtimes read only the `DOMAIN` service binding. The Agent
runtime reads `DOMAIN`, the `CeirdAgent` Durable Object binding, the Workers
`AI` binding, and `AGENT_INTERNAL_SECRET`. The domain runtime reads `DATABASE`,
`AUTH_EMAIL_QUEUE`, and `AUTH_EMAIL`, plus resolved configuration for Better
Auth, MCP resource metadata, agent internal calls, Google Maps, and auth email
delivery. The root infra stack owns those Alchemy binding resources in
`infra/cloudflare-stack.ts`; infra tests compare the stack-provided binding and
config keys with the runtime contracts for API, MCP, Agent, and domain Workers.
Secret and credential values stay typed as Alchemy deploy-time redacted inputs
in `infra`, while runtime apps see resolved strings through Cloudflare Worker
environment values. Runtime apps intentionally stay on their Effect 3
application dependencies and do not import Alchemy or Effect 4.

`apps/domain/src/server.ts` also intercepts MCP resource-server traffic before
falling through to the Effect `HttpApi` handler. The MCP route defaults to
`/mcp`, or to the path component of `MCP_RESOURCE_URL` when that environment
variable is set. Protected-resource metadata is served at
`/.well-known/oauth-protected-resource` and at the path-specific well-known URL,
for example `/.well-known/oauth-protected-resource/mcp`.

MCP HTTP is served through `@effect/ai`'s `McpServer.layerHttpRouter`, adapted
to the domain web-handler boundary after Better Auth OAuth bearer validation.
The standalone MCP Worker remains a forwarding adapter so generated/action UI,
Agents SDK Workers, and bot surfaces can call the same domain surface.

## Agent Runtime

Agent contracts live in `@ceird/agents-core`. That package defines thread IDs,
action run IDs, action names, action DTOs, `buildAgentInstanceName`, connect
token payloads, and the Effect `HttpApi` groups used by the domain Worker.

The domain Worker owns the durable product side of agents:

| Method | Path                                         | Purpose                                                                                          |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/agent/actions`                             | Return presentation-safe shared action manifest metadata for authenticated organization clients. |
| `GET`  | `/agent/threads`                             | List a user's threads in the active org.                                                         |
| `POST` | `/agent/threads`                             | Create or reopen an org/user/thread record.                                                      |
| `POST` | `/agent/threads/:threadId/archive`           | Archive a thread for the active user.                                                            |
| `POST` | `/agent/threads/:threadId/authorize`         | Issue a short-lived Agent connect token.                                                         |
| `POST` | `/agent/internal/threads/:threadId/activity` | Touch `lastMessageAt` from trusted Agent chat traffic.                                           |
| `POST` | `/agent/internal/actions`                    | Execute a domain-owned action for the Agent.                                                     |

Public agent chat traffic goes to:

| Method | Path                                    | Purpose                             |
| ------ | --------------------------------------- | ----------------------------------- |
| `*`    | `/agents/CeirdAgent/:agentInstanceName` | Route to the scoped Agent instance. |

The instance name is `org:{orgId}:user:{userId}:thread:{threadId}`. The public
Agent route accepts a short-lived connect token as a bearer token or `token`
query parameter, verifies that it was signed by the domain-owned secret,
normalizes the route to the Agents SDK's kebab-case class path, and only then
delegates to Cloudflare's router. The Agent Worker disables Worker invocation
logs so short-lived URL tokens are not persisted by platform request logging.
The Agent Durable Object keeps chat/runtime state in the Agent store; product
state, authorization, thread activity timestamps, and action side effects
remain in the domain Worker.

Domain action execution is registry-driven in
`apps/domain/src/domains/agents/action-registry.ts`. Only actions marked
`executable` in `@ceird/agents-core` are required to have domain handlers;
planned actions remain in the shared manifest without being callable through
the private Agent execution boundary.
The Agent Worker derives model-callable AI SDK tools from
`AGENT_EXECUTABLE_ACTIONS`, using each action's registry-owned model name,
description, and input schema rather than maintaining a separate hand-written
tool contract.
Browser clients fetch the authenticated public manifest from
`GET /agent/actions`. The response uses the shared `{ actions: [...] }`
contract and includes display, model, kind, confirmation policy, and execution
status metadata only; input schemas and execution internals are not exposed.
Action execution remains private to `POST /agent/internal/actions`.

Current domain actions exposed to the Agent runtime are:

| Action                            | Kind        |
| --------------------------------- | ----------- |
| `ceird.labels.list`               | read        |
| `ceird.labels.create`             | write       |
| `ceird.labels.update`             | write       |
| `ceird.labels.delete`             | destructive |
| `ceird.sites.options`             | read        |
| `ceird.sites.list`                | read        |
| `ceird.sites.create`              | write       |
| `ceird.sites.update`              | write       |
| `ceird.sites.comments.list`       | read        |
| `ceird.sites.comments.add`        | write       |
| `ceird.sites.assign_label`        | write       |
| `ceird.sites.remove_label`        | destructive |
| `ceird.service_areas.list`        | read        |
| `ceird.service_areas.create`      | write       |
| `ceird.service_areas.update`      | write       |
| `ceird.jobs.options`              | read        |
| `ceird.jobs.list`                 | read        |
| `ceird.jobs.detail`               | read        |
| `ceird.jobs.create`               | write       |
| `ceird.jobs.update`               | write       |
| `ceird.jobs.transition`           | write       |
| `ceird.jobs.reopen`               | write       |
| `ceird.jobs.activity.list`        | read        |
| `ceird.jobs.add_comment`          | write       |
| `ceird.jobs.visits.add`           | write       |
| `ceird.jobs.assign_label`         | write       |
| `ceird.jobs.remove_label`         | destructive |
| `ceird.jobs.cost_lines.add`       | write       |
| `ceird.jobs.collaborators.list`   | read        |
| `ceird.jobs.collaborators.attach` | write       |
| `ceird.jobs.collaborators.update` | write       |
| `ceird.jobs.collaborators.detach` | destructive |
| `ceird.rate_cards.list`           | read        |
| `ceird.rate_cards.create`         | write       |
| `ceird.rate_cards.update`         | write       |

Read tools are available to the model by default. Write and destructive tools
are hidden unless `AGENT_MUTATION_TOOLS_ENABLED=true`, which is reserved for a
confirmation-capable client flow so prompt-only execution cannot mutate data.

Rate-card agent actions route through the same
`ConfigurationService.listRateCards`, `ConfigurationService.createRateCard`,
and `ConfigurationService.updateRateCard` methods used by the HTTP
configuration API.

Every action call includes a domain operation id. The domain action-run ledger
stores `thread_id`, `action_name`, `operation_id`, status, input hash/size,
write-action results, and error metadata. Repeated successful mutating calls
with the same thread and operation id return the original result, while
repeated failed or in-flight calls are rejected instead of re-executed. Read
action results are not durably copied into the ledger; a successful replay
re-runs the read. The actual action implementations use the domain
authorization, repository, and activity-recording paths rather than bypassing
domain behavior.

The public API adapter does not forward `/agent/internal/*`; that surface is
intended for private Worker service-binding calls from `apps/agent` to
`apps/domain`.

## Observability

The API enables a custom Effect HTTP request logger for the Node server and
structured forwarding logs in the Cloudflare Worker adapter. Both paths record
method, status, and redacted path only; query strings are not logged, and
`/health` is skipped to keep probe noise out of operational logs. Typed domain
HTTP handlers also wrap service calls with `observeApiOperation`, which adds an
operation log span and emits structured fields when a jobs, rate-card, labels,
sites, or service-area operation fails.
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
The standalone MCP Worker emits its own forwarding log for each domain call
with method, status, and path-only URL metadata, then relies on the domain
Worker for OAuth, tool execution, authorization, and domain audit logs.

## Authentication Domain

Authentication lives in `apps/domain/src/domains/identity/authentication`.

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

Better Auth owns standard auth routes under `/api/auth/*`. The domain Worker
also exposes a public invitation preview route matched by
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

## MCP Resource Server

MCP tools live in `apps/domain/src/domains/mcp` as Effect AI `Tool` and
`Toolkit` registrations. They call the same domain services as the HTTP API.
The MCP
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

Jobs live in `apps/domain/src/domains/jobs` and are exposed through
`@ceird/jobs-core`.
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

Current actor resolution lives in `apps/domain/src/domains/organizations`
because sites,
labels, and jobs all need the same organization actor boundary. Better Auth
session data is treated as untrusted: session user and active organization IDs
are decoded into branded IDs, malformed identity data fails with a typed
actor-resolution error, and session lookup failures remain typed storage
failures instead of defects.

External organization members can have collaborator-style access to specific
jobs. Elevated internal roles can manage organization-wide configuration such
as labels, service areas, sites, and rate cards through the owning domain.

## Comments Domain

Reusable comments persistence lives in `apps/domain/src/domains/comments` and shared DTO
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
live in `apps/domain/src/domains/jobs/http.ts`.

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

Labels live in `apps/domain/src/domains/labels` and are exposed through
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

Sites live in `apps/domain/src/domains/sites` and are exposed through
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
package-local Node composition uses `SiteGeocoder.Local`, which selects Google
when `GOOGLE_MAPS_API_KEY` is present and falls back to deterministic
development coordinates when it is absent. The Cloudflare Worker composition
uses `SiteGeocoder.Google`, so deployed domain startup fails fast without the
Google Maps key. Environment variables configure provider credentials; they do
not select provider topology. Address-level misses return the user-correctable
geocoding failure contract, while upstream Google/configuration failures return
the provider failure contract so deployed misconfiguration fails visibly.

## Labels API Endpoints

Endpoint definitions live in `packages/labels-core/src/http-api.ts`; API
handlers live in `apps/domain/src/domains/labels/http.ts`.

| Method   | Path               | Handler name  |
| -------- | ------------------ | ------------- |
| `GET`    | `/labels`          | `listLabels`  |
| `POST`   | `/labels`          | `createLabel` |
| `PATCH`  | `/labels/:labelId` | `updateLabel` |
| `DELETE` | `/labels/:labelId` | `deleteLabel` |

## Sites API Endpoints

Endpoint definitions live in `packages/sites-core/src/http-api.ts`; API
handlers live in `apps/domain/src/domains/sites/http.ts`.

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

The domain Worker uses Drizzle with Postgres.

| Area                  | Files                                                |
| --------------------- | ---------------------------------------------------- |
| Database config       | `src/platform/database/config.ts`, `database-url.ts` |
| Database runtime      | `src/platform/database/database.ts`                  |
| Test database helpers | `src/platform/database/test-database.ts`             |
| Schema barrel         | `src/platform/database/schema.ts`                    |
| Migrations            | `drizzle/*/migration.sql`, `drizzle/*/snapshot.json` |
| Alchemy snapshots     | `drizzle/alchemy/*/{migration.sql,snapshot.json}`    |
| Drizzle CLI config    | `drizzle.config.ts`                                  |

`databaseSchema` in `apps/domain/src/platform/database/schema.ts` merges
authentication, comments, labels, sites, jobs, and agents tables. Keep schema
changes in the domain that owns the tables, then export through the schema
barrel. The Alchemy stack also loads this barrel through `Drizzle.Schema`. The
native Neon branch applies `apps/domain/drizzle`, so the historical migration
folders remain the bootstrap path and future Alchemy-generated SQL under
`drizzle/alchemy` is picked up by the same resource. In infra this is modeled
as separate generated and applied migration directories.

The `site_labels` table joins `sites` to organization `labels` and enforces the
same organization on both sides through composite organization foreign keys.
The `agent_threads` and `agent_action_runs` tables are owned by the agents
domain and indexed for the common org/user thread listing path and idempotent
action replay lookups.

## Errors And Runtime Schemas

Public API errors live in the package that owns the contract:
`packages/jobs-core/src/errors.ts`, `packages/sites-core/src/errors.ts`, and
`packages/labels-core/src/errors.ts`. Domain code should return those shared
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
