# System Overview

## Product Scope

Ceird is a job-tracking application for trades and construction teams. The
current product surface includes authentication, organizations, members,
invitations, jobs, sites, comments, labels, cost lines, collaborator access,
service areas, rate cards, activity, settings, org/user/thread-scoped agents,
and Alchemy-native local development.

The repository is still greenfield. Backward compatibility is not a constraint;
clear APIs, strong type boundaries, and simple architecture matter more than
preserving legacy shapes.

## Runtime Topology

```text
browser
  -> apps/app TanStack Start UI
  -> apps/api public HTTP adapter
  -> apps/domain private capability surface
  -> Postgres via Hyperdrive

apps/app server-side helpers
  -> apps/api public HTTP adapter
  -> apps/domain Better Auth and product endpoints

MCP clients
  -> apps/mcp standalone Effect MCP adapter at mcp.<stage>.ceird.app
  -> apps/domain OAuth/MCP router and tool execution
  -> Postgres via Hyperdrive

Agent clients
  -> apps/agent Cloudflare Agents SDK Worker at agent.<stage>.ceird.app
  -> CeirdAgent Durable Objects scoped by org/user/thread
  -> apps/domain internal action API through DOMAIN service binding
  -> Postgres via Hyperdrive

apps/domain Cloudflare Worker
  -> Effect HTTP API, Better Auth, and Effect AI MCP surfaces
  -> repositories, authorization, agent action execution, and audit
  -> Hyperdrive private binding
  -> Neon Postgres
  -> Cloudflare Queues for auth email

apps/api, apps/mcp, and apps/agent Cloudflare Workers
  -> DOMAIN service binding
```

Local development and production deployment both use the root Alchemy stack.
Alchemy provisions Cloudflare Workers/Vite, Hyperdrive, queues, routes, and
stage-scoped Neon branches. The app and API health endpoints expose the
resolved Alchemy stack and stage identity so a running Worker can be tied back
to the stage that produced it.

## Monorepo Ownership

| Area                     | Owns                                                                                                                            | Should not own                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/app`               | Browser routes, UI state, server-only app helpers, feature components, command bar, hotkeys, and E2E tests.                     | Database schema, API business rules, shared DTO definitions.   |
| `apps/api`               | Public HTTP adapter, root/health responses, request logging, and `DOMAIN` service binding.                                      | Product repositories, auth runtime, migrations, or database.   |
| `apps/domain`            | Better Auth, product services, repositories, authorization, action execution, audit/activity, migrations, and database runtime. | Public route ownership or browser UI.                          |
| `apps/mcp`               | Standalone Effect MCP adapter Worker, `DOMAIN` service binding, forwarding logs, and public MCP domain.                         | Product repositories, auth policy, action execution, or DB.    |
| `packages/comments-core` | Shared comment ID, body, base DTO, editable DTO, and add-comment schemas.                                                       | Target ownership, authorization, repositories, or UI state.    |
| `packages/identity-core` | Organization IDs, organization role schemas, input decoders, and shared identity DTOs.                                          | Better Auth adapter setup or persistence.                      |
| `packages/jobs-core`     | Jobs branded IDs, domain schemas, DTO schemas, Effect `HttpApi` contract, and typed HTTP errors.                                | Repository SQL or React state.                                 |
| `infra`                  | Root Alchemy stage orchestration, shared Cloudflare resources, Neon branches, Hyperdrive, queues, and deployment helpers.       | App-owned Worker/Vite declarations or app/API domain behavior. |

## Request And Data Flow

Jobs requests use a shared contract:

1. `packages/jobs-core/src/http-api.ts` defines endpoint names, paths, payload
   schemas, response schemas, and typed errors.
2. `apps/domain/src/domains/jobs/http.ts` binds that contract to `JobsService`,
   `SitesService`, and `ConfigurationService`.
3. `apps/app/src/features/jobs/jobs-client.ts` creates an Effect
   `HttpApiClient` from the same `JobsApi` contract.
4. Browser-side jobs state calls the client directly. Server-side route loading
   uses TanStack Start helpers that forward cookies and trusted proxy headers.
5. Domain services resolve the current actor, authorize the action, call
   repositories, record activity where needed, and return DTOs from the shared
   package.

Authentication requests mostly use Better Auth endpoints under `/api/auth/*`.
The domain Worker owns Better Auth configuration, organization hooks, auth email
scheduling, CORS, trusted origins, and cookie behavior. The API Worker forwards
public HTTP traffic to that private surface. The app owns forms, redirects,
route guards, and server-side session lookups.

MCP clients discover the protected-resource metadata, authorize through Better
Auth OAuth, and send the resulting bearer token to the configured MCP resource
URL. The standalone MCP Worker is a protocol adapter over the domain Worker,
where OAuth verification, the Effect AI MCP router, tool execution, organization
actor resolution, and authorization rules run against the same services as the
HTTP API.

Agent threads are domain-owned records keyed by organization, user, and thread.
The domain Worker creates/list/archives threads, issues short-lived connect
tokens, and records action runs with an operation id. The Agent Worker verifies
the connect token before routing to the `CeirdAgent` Durable Object instance,
keeps live chat/runtime state in the Agent store, touches thread activity in
the domain Worker for each chat turn, and executes Ceird tools by calling the
domain Worker's internal action API. Read tools are model-available by default;
mutating tools are gated until a client confirmation flow can approve them
outside the model prompt. Mutating actions use the domain action-run ledger for
idempotent replay protection and reuse the same authorization and
activity-recording paths as the HTTP API. The ledger is a small begin/complete
record, not an outer transaction around the whole action; domain services keep
their own transaction boundaries, and abandoned running rows time out to a
terminal failed state on replay.

## Persistence Model

The domain Worker exports a combined Drizzle schema from
`apps/domain/src/platform/database/schema.ts`:

- `authSchema` contains Better Auth users, sessions, accounts,
  verifications, rate limits, organizations, members, and invitations.
- `commentsSchema` contains shared comment rows and target ownership rows for
  jobs and sites.
- `jobsSchema` contains rate cards, contacts, work items, activity, visits,
  labels, collaborators, and cost lines.
- `sitesSchema` contains sites and service areas. Site access notes remain on
  the site record; site comments are separate internal collaboration records.
- `agentsSchema` contains agent threads and the agent action-run ledger.
- `databaseSchema` merges authentication, comments, labels, sites, jobs, and
  agents for the full database runtime.

Migrations live in `apps/domain/drizzle`. Package-local Drizzle CLI migrations
remain there for development history, while the Alchemy deploy path uses
`Drizzle.Schema` through `infra/domain-drizzle-schema.ts` to maintain checked-in
snapshots under `apps/domain/drizzle-alchemy`. The native Neon branch resource
applies `apps/domain/drizzle` only for the parent stage bootstrap. Forked local
and preview stages branch from that parent and apply only
`apps/domain/drizzle-alchemy`, which lets Alchemy-generated deltas run without
replaying historical bootstrap SQL against an already-populated branch.

## Boundary Rules

- Use Effect `Schema` and `Config` at environment, HTTP, persistence, and
  external integration boundaries.
- Keep domain-specific branded IDs in the relevant core package.
- Keep DTO schemas next to the API contract when both frontend and backend
  consume them.
- Keep internal TypeScript-only types inside implementation modules when they
  do not cross a runtime boundary.
- Let the domain Worker own business invariants and authorization. Public
  adapters and the app can mirror constraints for UX but must not be the only
  enforcement point.

## Source Of Truth Documents

- Authentication details: [auth.md](auth.md)
- Jobs product and API detail: [jobs-v1-spec.md](jobs-v1-spec.md)
- Data-layer rationale: [data-layer.md](data-layer.md)
- Local and deployed runtime:
  [local-development-and-infra.md](local-development-and-infra.md)
