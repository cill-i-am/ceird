# API Architecture

## Scope

`apps/api` is the backend service. It exposes an Effect HTTP API for system and
jobs routes, mounts Better Auth under `/api/auth/*`, owns database schema and
migrations, and can run as either a Node dev server or a Cloudflare Worker.

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
decoders from `@task-tracker/identity-core`. Only organization name can be
updated through the supported update path, and writable roles are decoded
against the shared role schema.

## Jobs Domain

Jobs live in `src/domains/jobs` and are exposed through the shared
`@task-tracker/jobs-core` `JobsApi` contract.

Core files:

| File                       | Responsibility                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`                  | Binds contract endpoints to Effect services and configures CORS.                                                           |
| `service.ts`               | Main jobs use cases: list, create, patch, transition, reopen, comments, visits, labels, collaborators, costs, and options. |
| `sites-service.ts`         | Site creation, update, and options.                                                                                        |
| `configuration-service.ts` | Service areas and rate cards.                                                                                              |
| `repositories.ts`          | SQL repository layer for jobs, sites, contacts, labels, configuration, activity, and members.                              |
| `authorization.ts`         | Role and access checks for jobs operations.                                                                                |
| `current-jobs-actor.ts`    | Current actor resolution from auth/session context.                                                                        |
| `actor-access.ts`          | Actor resolution error mapping.                                                                                            |
| `activity-recorder.ts`     | Work item activity events.                                                                                                 |
| `site-geocoder.ts`         | Site geocoding boundary.                                                                                                   |
| `site-geocoding-config.ts` | Geocoder runtime mode/config.                                                                                              |
| `schema.ts`                | Jobs Drizzle tables and relations.                                                                                         |
| `errors.ts`                | API-domain error helpers where needed.                                                                                     |

The jobs service flow is:

1. Load the current actor.
2. Map actor resolution failures to access-denied errors.
3. Enforce authorization for the requested operation.
4. Read or mutate through repositories.
5. Record activity for auditable changes.
6. Return DTOs defined in `@task-tracker/jobs-core`.

External organization members can have collaborator-style access to specific
jobs. Elevated internal roles can manage organization-wide jobs configuration
such as labels, service areas, and rate cards.

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
| `GET`    | `/job-labels`                                     | `listJobLabels`               |
| `POST`   | `/job-labels`                                     | `createJobLabel`              |
| `PATCH`  | `/job-labels/:labelId`                            | `updateJobLabel`              |
| `DELETE` | `/job-labels/:labelId`                            | `deleteJobLabel`              |
| `POST`   | `/jobs/:workItemId/cost-lines`                    | `addJobCostLine`              |
| `GET`    | `/jobs/:workItemId/collaborators`                 | `listJobCollaborators`        |
| `POST`   | `/jobs/:workItemId/collaborators`                 | `attachJobCollaborator`       |
| `PATCH`  | `/jobs/:workItemId/collaborators/:collaboratorId` | `updateJobCollaborator`       |
| `DELETE` | `/jobs/:workItemId/collaborators/:collaboratorId` | `detachJobCollaborator`       |
| `GET`    | `/service-areas`                                  | `listServiceAreas`            |
| `POST`   | `/service-areas`                                  | `createServiceArea`           |
| `PATCH`  | `/service-areas/:serviceAreaId`                   | `updateServiceArea`           |
| `GET`    | `/rate-cards`                                     | `listRateCards`               |
| `POST`   | `/rate-cards`                                     | `createRateCard`              |
| `PATCH`  | `/rate-cards/:rateCardId`                         | `updateRateCard`              |
| `GET`    | `/sites/options`                                  | `getSiteOptions`              |
| `POST`   | `/sites`                                          | `createSite`                  |
| `PATCH`  | `/sites/:siteId`                                  | `updateSite`                  |

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

`databaseSchema` merges authentication and jobs tables. Keep schema changes in
the domain that owns the tables, then export through the schema barrel.

## Errors And Runtime Schemas

Public API errors for jobs live in `packages/jobs-core/src/errors.ts` as
`Schema.TaggedError` classes annotated with HTTP status codes. API code should
return those shared errors when a frontend client needs typed behavior.

Use Effect `Config` for environment loading and Effect `Schema` for external
payload boundaries. Plain TypeScript types are fine for internal computed
values that never cross an untrusted boundary.

## Testing

API tests live next to source files as `*.test.ts` or `*.integration.test.ts`.
Run them with:

```bash
pnpm --filter api test
```

High-risk API changes should include tests for the service behavior,
authorization behavior, repository behavior when SQL is involved, and HTTP
contract behavior when endpoint payloads or errors change.
