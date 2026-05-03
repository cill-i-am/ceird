# API Workspace

`apps/api` is the backend service for Ceird. It runs as a Node development
server locally and as a Cloudflare Worker in deployed environments.

## Commands

```bash
pnpm --filter api dev
pnpm --filter api sandbox:dev
pnpm --filter api test
pnpm --filter api check-types
pnpm --filter api build
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:studio
```

For full app/API/Postgres development, prefer the root sandbox:

```bash
pnpm sandbox:up
pnpm sandbox:logs -- --service api
```

## Important Paths

| Path                                  | Purpose                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`                        | Node development entrypoint.                                                                                             |
| `src/server.ts`                       | Effect API construction, system routes, API layer composition, and web handler factory.                                  |
| `src/worker.ts`                       | Cloudflare Worker entrypoint.                                                                                            |
| `src/platform/database`               | Database config, runtime, schema barrel, errors, and test database helpers.                                              |
| `src/platform/cloudflare`             | Cloudflare environment and binding helpers.                                                                              |
| `src/domains/identity/authentication` | Better Auth, organization hooks, auth schemas, email delivery, and auth runtime config.                                  |
| `src/domains/jobs`                    | Jobs HTTP handlers, services, repositories, authorization, actor access, activity recording, geocoding, and jobs schema. |
| `drizzle`                             | SQL migrations and Drizzle metadata.                                                                                     |
| `drizzle.config.ts`                   | Drizzle CLI config.                                                                                                      |

## Runtime Responsibilities

The API owns:

- Better Auth routes under `/api/auth/*`.
- Public invitation preview under `/api/public/invitations/:invitationId/preview`.
- System routes `GET /` and `GET /health`.
- Jobs, sites, labels, cost lines, collaborators, activity, service areas, and
  rate-card endpoints defined by `@task-tracker/jobs-core`.
- Database schema and migrations.
- Authorization and business invariants for app-domain mutations.
- Auth email scheduling and transport integration.

## Architecture

See [../../docs/architecture/api.md](../../docs/architecture/api.md) for the
endpoint map, service boundaries, database model, error strategy, and testing
guidance.

Related docs:

- [../../docs/architecture/auth.md](../../docs/architecture/auth.md)
- [../../docs/architecture/jobs-v1-spec.md](../../docs/architecture/jobs-v1-spec.md)
- [../../docs/architecture/data-layer.md](../../docs/architecture/data-layer.md)
- [../../docs/architecture/sandbox-and-infra.md](../../docs/architecture/sandbox-and-infra.md)
