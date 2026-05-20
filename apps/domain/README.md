# Domain Workspace

`apps/domain` is Ceird's private business/domain Worker. Public and interactive
clients call it through Cloudflare Service Bindings rather than owning product
repositories or database runtime directly.

## Commands

```bash
pnpm --filter domain dev
pnpm --filter domain test
pnpm --filter domain check-types
pnpm --filter domain build
pnpm --filter domain db:generate
pnpm --filter domain db:migrate
pnpm --filter domain db:studio
```

The `db:*` commands are the package-local database workflow. Stage deploys and
cloud-backed local development apply migrations through the root Alchemy stack's
native Neon branch resource.

For package-local Node development, the domain server listens on port `3002` by
default so `apps/api` can listen on `3001` and forward through `DOMAIN_ORIGIN`.

## Important Paths

| Path                                  | Purpose                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/index.ts`                        | Node development entrypoint.                                                              |
| `src/server.ts`                       | Effect API construction, domain HTTP surface, layer composition, and web handler factory. |
| `src/worker.ts`                       | Private Cloudflare Worker entrypoint and queue consumer.                                  |
| `src/platform/database`               | Database config, runtime, schema barrel, errors, and test database helpers.               |
| `src/platform/cloudflare`             | Domain Worker environment, Hyperdrive binding, queue, email, and runtime composition.     |
| `src/domains/agents`                  | Agent thread records, connect authorization, action registry, action ledger, and schema.  |
| `src/domains/identity/authentication` | Better Auth, organization hooks, auth schemas, email delivery, and auth runtime config.   |
| `src/domains/jobs`                    | Jobs services, repositories, authorization, action execution, activity audit, and schema. |
| `src/domains/sites`                   | Sites services, repositories, geocoding, label assignments, and schema.                   |
| `src/domains/labels`                  | Organization label service, repository, and schema.                                       |
| `drizzle`                             | SQL migrations and Drizzle metadata.                                                      |
| `drizzle.config.ts`                   | Drizzle CLI config.                                                                       |

## Runtime Responsibilities

The domain Worker owns:

- Better Auth routes and OAuth/MCP resource configuration.
- Product domain services for jobs, sites, labels, comments, agents, and activity.
- Authorization policy and actor resolution.
- Action execution for public HTTP, MCP, and Agent clients.
- Audit/activity records.
- Drizzle schema, migrations, Postgres/Hyperdrive runtime, and repositories.
- Auth email scheduling and queue delivery.

## Architecture

See [../../docs/architecture/api.md](../../docs/architecture/api.md),
[../../docs/architecture/auth.md](../../docs/architecture/auth.md), and
[../../docs/architecture/data-layer.md](../../docs/architecture/data-layer.md).
