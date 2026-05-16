# System Overview

## Product Scope

Ceird is a job-tracking application for trades and construction teams. The
current product surface includes authentication, organizations, members,
invitations, jobs, sites, comments, labels, cost lines, collaborator access,
service areas, rate cards, activity, settings, and a local sandbox workflow.

The repository is still greenfield. Backward compatibility is not a constraint;
clear APIs, strong type boundaries, and simple architecture matter more than
preserving legacy shapes.

## Runtime Topology

```text
browser
  -> apps/app TanStack Start UI
  -> apps/api Effect HTTP API
  -> Postgres

apps/app server-side helpers
  -> apps/api Better Auth endpoints
  -> apps/api Jobs API endpoints

apps/api Cloudflare Worker
  -> Hyperdrive
  -> PlanetScale Postgres
  -> Cloudflare Queues for auth email
```

Local sandbox development runs the app, API, and Postgres through Docker
Compose. Production deployment uses Alchemy to provision Cloudflare and
PlanetScale resources.

## Monorepo Ownership

| Area                     | Owns                                                                                                                   | Should not own                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/app`               | Browser routes, UI state, server-only app helpers, feature components, command bar, hotkeys, and E2E tests.            | Database schema, API business rules, shared DTO definitions. |
| `apps/api`               | HTTP handlers, Better Auth wiring, Effect services, repositories, migrations, Worker entrypoint, and database runtime. | Browser UI, app-specific layout concerns.                    |
| `packages/comments-core` | Shared comment ID, body, base DTO, editable DTO, and add-comment schemas.                                              | Target ownership, authorization, repositories, or UI state.  |
| `packages/identity-core` | Organization IDs, organization role schemas, input decoders, and shared identity DTOs.                                 | Better Auth adapter setup or persistence.                    |
| `packages/jobs-core`     | Jobs branded IDs, domain schemas, DTO schemas, Effect `HttpApi` contract, and typed HTTP errors.                       | Repository SQL or React state.                               |
| `packages/sandbox-core`  | Pure sandbox naming, identity, ports, URLs, health payload, env decoding, runtime spec, and registry types.            | Process execution or Docker commands.                        |
| `packages/sandbox-cli`   | CLI command parsing, Docker Compose lifecycle, health waiting, registry persistence, and user-facing sandbox output.   | App/API domain behavior.                                     |
| `packages/infra`         | Production infrastructure resources and deployment config.                                                             | Local dev orchestration.                                     |

## Request And Data Flow

Jobs requests use a shared contract:

1. `packages/jobs-core/src/http-api.ts` defines endpoint names, paths, payload
   schemas, response schemas, and typed errors.
2. `apps/api/src/domains/jobs/http.ts` binds that contract to `JobsService`,
   `SitesService`, and `ConfigurationService`.
3. `apps/app/src/features/jobs/jobs-client.ts` creates an Effect
   `HttpApiClient` from the same `JobsApi` contract.
4. Browser-side jobs state calls the client directly. Server-side route loading
   uses TanStack Start helpers that forward cookies and trusted proxy headers.
5. API services resolve the current actor, authorize the action, call
   repositories, record activity where needed, and return DTOs from the shared
   package.

Authentication requests mostly use Better Auth endpoints under `/api/auth/*`.
The API owns Better Auth configuration, organization hooks, auth email
scheduling, CORS, trusted origins, and cookie behavior. The app owns forms,
redirects, route guards, and server-side session lookups.

## Persistence Model

The API exports a combined Drizzle schema from
`apps/api/src/platform/database/schema.ts`:

- `authSchema` contains Better Auth users, sessions, accounts,
  verifications, rate limits, organizations, members, and invitations.
- `commentsSchema` contains shared comment rows and target ownership rows for
  jobs and sites.
- `jobsSchema` contains rate cards, contacts, work items, activity, visits,
  labels, collaborators, and cost lines.
- `sitesSchema` contains sites and service areas. Site access notes remain on
  the site record; site comments are separate internal collaboration records.
- `databaseSchema` merges both for the full database runtime.
- `appSchema` exposes the app-domain subset for app-specific repositories.

Migrations live in `apps/api/drizzle`. The sandbox applies them during startup.

## Boundary Rules

- Use Effect `Schema` and `Config` at environment, HTTP, persistence, and
  external integration boundaries.
- Keep domain-specific branded IDs in the relevant core package.
- Keep DTO schemas next to the API contract when both frontend and backend
  consume them.
- Keep internal TypeScript-only types inside implementation modules when they
  do not cross a runtime boundary.
- Let the API own business invariants and authorization. The app can mirror
  constraints for UX but must not be the only enforcement point.

## Source Of Truth Documents

- Authentication details: [auth.md](auth.md)
- Jobs product and API detail: [jobs-v1-spec.md](jobs-v1-spec.md)
- Data-layer rationale: [data-layer.md](data-layer.md)
- Local and deployed runtime: [sandbox-and-infra.md](sandbox-and-infra.md)
