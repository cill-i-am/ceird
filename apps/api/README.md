# API Workspace

`apps/api` is Ceird's public HTTP adapter. It owns the public API Worker
entrypoint, local root and health responses, request logging, and the Cloudflare
service binding to the private domain Worker.

## Commands

```bash
pnpm --filter api dev
pnpm --filter api test
pnpm --filter api check-types
pnpm --filter api build
```

For full cloud-backed app/API/MCP/domain/Postgres development, prefer the root
Alchemy stage:

```bash
pnpm dev -- --stage codex-my-task
```

For package-local Node development, the API adapter listens on port `3001` by
default and forwards to `DOMAIN_ORIGIN`, which defaults to
`http://127.0.0.1:3002`.

## Important Paths

| Path                         | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `src/index.ts`               | Node development entrypoint.                                   |
| `src/server.ts`              | Public adapter web handler, root/health routes, and logging.   |
| `src/worker.ts`              | Cloudflare Worker entrypoint.                                  |
| `infra/cloudflare-worker.ts` | App-owned Alchemy Worker declaration and binding/env contract. |
| `src/platform/cloudflare`    | API Worker env contract for the private `DOMAIN` service.      |

## Runtime Responsibilities

The API owns:

- Public `GET /` and `GET /health` responses.
- Public HTTP routing as an adapter over the private domain Worker.
- The `DOMAIN` service binding adapter using `@ceird/domain-core`.

Product repositories, Better Auth runtime behavior, authorization, action
execution, audit/activity recording, Drizzle schema, migrations, and Postgres
access live in `apps/domain`.

## Architecture

See [../../docs/architecture/api.md](../../docs/architecture/api.md) for the
public adapter map and [../../docs/architecture/data-layer.md](../../docs/architecture/data-layer.md)
for persistence ownership.
