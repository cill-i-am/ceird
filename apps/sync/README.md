# Sync Workspace

`apps/sync` is Ceird's Electric SQL sync adapter. It owns the public sync Worker
and the Cloudflare Container runtime that runs Electric.

## Commands

```bash
pnpm --filter sync test
pnpm --filter sync check-types
pnpm --filter sync build
```

For full cloud-backed local development, prefer the root Alchemy stage:

```bash
pnpm dev -- --stage codex-my-task
```

Alchemy runs the sync Worker locally at the injected `VITE_SYNC_ORIGIN` and
keeps the stage Neon resources ready. Local `alchemy dev` deliberately skips
the Cloudflare Container application because Cloudflare can only attach
Containers to cloud Durable Object namespaces, while local Alchemy Workers use
workerd-only Durable Object namespaces. Package-local sync tests use dependency
injection for the domain authorization and Electric forwarding boundaries.

Deployed Alchemy stages run Electric with local writable container storage at
`/var/lib/electric`. Electric is configured with `ELECTRIC_STORAGE=fast_file`,
`ELECTRIC_PERSISTENT_STATE=file`, `ELECTRIC_STORAGE_DIR=/var/lib/electric`, and
`ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE=true`. Cloudflare Container disk can be
recreated, so restarts may rebuild shape logs from Postgres instead of relying
on an object-storage mount. The sync Worker receives the generated stage Neon
connection URL and Electric source secret as secrets, then supplies them to the
container at startup. It also receives an Alchemy-derived Durable Object
`jurisdiction` and `locationHint` from the stage Neon region so the singleton
Electric container is constrained to the EU for European database stages and
placed near Postgres in deployed stages. The exported `ElectricSql` runtime
class must remain a
`cloudflare:workers` `DurableObject` subclass and its class name must match the
Alchemy container binding; this is the class Cloudflare marks as
container-enabled during application attachment.

The sync Worker keeps a short-lived authorization cache in warm isolate memory
only. Successful domain authorization payloads are cached for
`SYNC_AUTHORIZATION_CACHE_TTL_SECONDS`, which defaults to `10` and may be set
from `0` to `60` seconds. Cache keys include the shape name and a SHA-256
fingerprint of auth-bearing request identity material such as cookies or bearer
tokens, plus routing context; raw cookies and tokens are never stored. Failed,
malformed, or unavailable authorization responses are not cached, so absent or
expired grants fall back to the live domain authorization path and fail closed.
The `activity-events` shape bypasses this cache because its retained cutoff is a
server current-time parameter that must be refreshed on every request.

## Important Paths

| Path                                                    | Purpose                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/worker.ts`                                         | Cloudflare Worker entrypoint and `ElectricSql` Durable Object export.     |
| `src/platform/cloudflare/runtime.ts`                    | Effect-native sync request handling, authorization, CORS, and forwarding. |
| `src/platform/cloudflare/electric-sql-do.ts`            | Durable Object bridge from Worker requests to the container TCP port.     |
| `src/platform/cloudflare/electric-container-runtime.ts` | Node container entrypoint that starts Electric SQL.                       |
| `src/platform/cloudflare/env.ts`                        | Sync Worker runtime binding and env contract.                             |
| `infra/cloudflare-worker.ts`                            | App-owned Alchemy Worker and Cloudflare Container declaration.            |

## Runtime Responsibilities

The sync Worker owns:

- Public Electric shape endpoints under `/v1/shape` and `/v1/shapes/:shape`.
- CORS for the system app origin and stage tenant origin pattern.
- Private shape authorization through the domain Worker's `DOMAIN` binding.
- Server-side injection of Electric `table`, `where`, `params[...]`, and
  `secret` values.
- Removal of caller-controlled Electric source parameters before forwarding.
- Forwarding authorized requests to the `ElectricSql` Durable Object and
  Cloudflare Container.

The sync Worker does not own product authorization, repositories, schema, auth,
or migrations. Those remain in `apps/domain`.

## Architecture

See [../../docs/architecture/api.md](../../docs/architecture/api.md),
[../../docs/architecture/data-layer.md](../../docs/architecture/data-layer.md),
and
[../../docs/architecture/local-development-and-infra.md](../../docs/architecture/local-development-and-infra.md).
