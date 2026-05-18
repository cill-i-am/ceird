# System Overview

## Product Scope

Ceird is a job-tracking application for trades and construction teams. The
current product surface includes authentication, organizations, members,
invitations, jobs, sites, comments, labels, cost lines, collaborator access,
service areas, rate cards, activity, settings, and Alchemy-native local
development.

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

MCP clients
  -> apps/api Better Auth OAuth protected resource
  -> apps/api @effect/ai MCP router
  -> apps/api Effect domain services
  -> Postgres

apps/api Cloudflare Worker
  -> Effect HTTP API and Effect AI MCP HTTP surfaces
  -> Hyperdrive
  -> Neon Postgres
  -> Cloudflare Queues for auth email
```

Local development and production deployment both use the root Alchemy stack.
Alchemy provisions Cloudflare Workers/Vite, Hyperdrive, queues, routes, and
stage-scoped Neon branches. The app and API health endpoints expose the
resolved Alchemy stack and stage identity so a running Worker can be tied back
to the stage that produced it.

## Monorepo Ownership

| Area                     | Owns                                                                                                                   | Should not own                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/app`               | Browser routes, UI state, server-only app helpers, feature components, command bar, hotkeys, and E2E tests.            | Database schema, API business rules, shared DTO definitions. |
| `apps/api`               | HTTP handlers, Better Auth wiring, Effect services, repositories, migrations, Worker entrypoint, and database runtime. | Browser UI, app-specific layout concerns.                    |
| `packages/comments-core` | Shared comment ID, body, base DTO, editable DTO, and add-comment schemas.                                              | Target ownership, authorization, repositories, or UI state.  |
| `packages/identity-core` | Organization IDs, organization role schemas, input decoders, and shared identity DTOs.                                 | Better Auth adapter setup or persistence.                    |
| `packages/jobs-core`     | Jobs branded IDs, domain schemas, DTO schemas, Effect `HttpApi` contract, and typed HTTP errors.                       | Repository SQL or React state.                               |
| `infra`                  | Root Alchemy stage config, Cloudflare resources, Neon branches, Hyperdrive, queues, and deployment helpers.            | App/API domain behavior.                                     |

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

MCP clients discover the protected-resource metadata, authorize through Better
Auth OAuth, and send the resulting bearer token to the configured MCP resource
URL. The API validates that token before handing the request to the Effect AI MCP
router. MCP tools are not a separate service or auth system; they run against the
same Effect domain services, organization actor resolution, and authorization
rules as the HTTP API.

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
- `databaseSchema` merges authentication, comments, labels, sites, and jobs for
  the full database runtime.

Migrations live in `apps/api/drizzle`. Package-local Drizzle CLI migrations
remain there for development history, while the Alchemy deploy path uses
`Drizzle.Schema` through `infra/api-drizzle-schema.ts` to maintain checked-in
snapshots under `apps/api/drizzle/alchemy`. The native Neon branch resource
applies `apps/api/drizzle`, so historical SQL and future Alchemy-generated SQL
share the same deploy-time migration table.

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
- Local and deployed runtime:
  [local-development-and-infra.md](local-development-and-infra.md)
