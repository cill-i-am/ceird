# API Architecture

## Scope

`apps/api` is the backend service. It exposes Effect HTTP APIs for system,
jobs, sites, labels, and organization configuration routes, mounts Better Auth
under `/api/auth/*`, owns database schema and migrations, and can run as either
a Node dev server or a Cloudflare Worker.

## Entry Points

| File                                | Purpose                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/index.ts`                      | Node development entrypoint.                                                                |
| `src/server.ts`                     | Runtime-neutral `HttpApi` construction, system endpoints, API composition, and web handler. |
| `src/server-node.ts`                | Node HTTP server wiring and Node-only Sentry layer.                                         |
| `src/worker.ts`                     | Cloudflare Worker entrypoint and request handling.                                          |
| `src/platform/cloudflare/env.ts`    | Cloudflare environment decoding and binding access.                                         |
| `src/platform/database/database.ts` | Database runtime layer.                                                                     |
| `src/platform/database/schema.ts`   | Combined Drizzle schema barrel.                                                             |

System endpoints are defined in `src/server.ts`:

- `GET /` returns a plain API marker string.
- `GET /health` returns a sandbox-compatible `HealthPayload`.

## Observability

Sentry is available for the API in both the Node entrypoint and the
Cloudflare Worker. Runtime config is decoded from `SENTRY_DSN`,
`SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and `SENTRY_TRACES_SAMPLE_RATE`. When a
DSN is present, the Node API installs Sentry's Effect tracer, metrics layer, and
Effect logger from the Node-only entrypoint. The Cloudflare Worker keeps its
entrypoint free of the Node Sentry SDK, uses the Cloudflare Sentry SDK wrapper
for request and queue handler errors, and installs a Cloudflare-backed Effect
logger for structured API logs. Sentry events and logs are scrubbed before
export so request query strings, cookies, tokens, secrets, passwords, and auth
email delivery keys are filtered.

Production API deploys set `SENTRY_RELEASE` to the deployed Git SHA and upload
the Cloudflare Worker bundle/source maps to the `ceird-api` Sentry project. The
API Worker build uses the Sentry Rollup plugin through the patched Alchemy
Worker bundling hook, so debug IDs are injected before the same bundle is sent
to Cloudflare. The deploy workflow checks out full Git history so Sentry can
associate commits with the release, and the upload step records a production
deploy for the release.

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
source tag, and source cause before retrying. When auth email work is queued
from a traced request, the queue payload carries the current Sentry trace
headers and the Worker queue handler continues that trace inside an explicit
`queue.process` span. Messages that reach the auth email dead-letter queue are
captured to Sentry at error level with queue name, message ID, attempts, and
email kind before the DLQ message is acknowledged.

## Authentication Domain

Authentication lives in `src/domains/identity/authentication`.

Core files:

| File                                               | Responsibility                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `auth.ts`                                          | Better Auth creation, organization plugin hooks, public invitation preview handler, CORS integration, and HTTP mounting. |
| `config.ts`                                        | Better Auth runtime config, trusted origins, cookie-domain logic, and rate-limit config.                                 |
| `schema.ts`                                        | Better Auth Drizzle tables and relations.                                                                                |
| `auth-email.ts`                                    | Auth email payloads and send orchestration.                                                                              |
| `auth-email-config.ts`                             | Email transport config for `noop`, `cloudflare-api`, and `cloudflare-binding`.                                           |
| `auth-email-queue.ts`                              | Queue payload handling.                                                                                                  |
| `auth-email-scheduler.ts`                          | Background scheduling boundary for auth emails.                                                                          |
| `cloudflare-auth-email-transport.ts`               | Cloudflare API email transport.                                                                                          |
| `cloudflare-email-binding-auth-email-transport.ts` | Cloudflare Email Worker binding transport.                                                                               |

Better Auth owns standard auth routes under `/api/auth/*`. The API also exposes
a public invitation preview route matched by
`/api/public/invitations/:invitationId/preview`, returning a masked email,
organization name, and role for pending non-expired invitations.

Organization rules are enforced through Better Auth plugin hooks and shared
decoders from `@ceird/identity-core`. Only organization name can be
updated through the supported update path, and writable roles are decoded
against the shared role schema.

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
| `schema.ts`                | Jobs-owned Drizzle tables and relations, including job-label assignment rows.                                                            |
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
`@ceird/labels-core`. Labels are organization-level definitions; job-specific
label behavior is limited to assigning or removing those labels on a job.

Core files:

| File               | Responsibility                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `http.ts`          | Binds label contract endpoints to `LabelsService` and configures CORS.      |
| `service.ts`       | Label list, create, update, and archive use cases with organization auth.   |
| `repositories.ts`  | SQL repository layer for the `labels` table and cleanup of job assignments. |
| `schema.ts`        | Labels Drizzle table and relations.                                         |
| `id-generation.ts` | Label ID generation.                                                        |

## Sites Domain

Sites live in `src/domains/sites` and are exposed through
`@ceird/sites-core`. Sites and service areas are independent organization data
that jobs can reference. Site geocoding is selected with `SITE_GEOCODER_MODE`;
production infrastructure defaults to `stub` until a `GOOGLE_MAPS_API_KEY` is
provided for `google` mode.

Core files:

| File                       | Responsibility                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds sites and service-area contract endpoints to Effect services and configures CORS. |
| `service.ts`               | Site create, update, and options use cases.                                             |
| `service-areas-service.ts` | Service-area list, create, and update use cases.                                        |
| `repositories.ts`          | SQL repository layer for sites, service areas, and site-contact links.                  |
| `schema.ts`                | Sites and service-area Drizzle tables and relations.                                    |
| `geocoder.ts`              | Site geocoding boundary.                                                                |
| `geocoding-config.ts`      | Geocoder runtime mode/config.                                                           |
| `id-generation.ts`         | Site and service-area ID generation.                                                    |

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

| Method  | Path                            | Handler name        |
| ------- | ------------------------------- | ------------------- |
| `GET`   | `/service-areas`                | `listServiceAreas`  |
| `POST`  | `/service-areas`                | `createServiceArea` |
| `PATCH` | `/service-areas/:serviceAreaId` | `updateServiceArea` |
| `GET`   | `/sites/options`                | `getSiteOptions`    |
| `POST`  | `/sites`                        | `createSite`        |
| `PATCH` | `/sites/:siteId`                | `updateSite`        |

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

`databaseSchema` merges authentication, labels, sites, and jobs tables. Keep
schema changes in the domain that owns the tables, then export through the
schema barrel.

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
