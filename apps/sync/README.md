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

Alchemy provisions the sync Worker at `sync.<stage>.<zone>` and deploys the
Electric SQL container alongside it. Package-local sync tests use dependency
injection for the domain authorization and Electric forwarding boundaries.

Electric requires its shape-log storage to survive service restarts. Alchemy
provisions a stage-scoped R2 bucket and bucket-scoped R2 API token, then passes
the derived S3 credentials to the Cloudflare Container as secrets. The container
mounts that bucket at `/var/lib/electric` with TigrisFS, verifies that the
mountpoint is active and writable with a startup probe, and only then starts
Electric. Electric is configured with `ELECTRIC_STORAGE=fast_file`,
`ELECTRIC_PERSISTENT_STATE=file`, `ELECTRIC_STORAGE_DIR=/var/lib/electric`, and
`ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE=true` so its active-shape SQLite database is
safe on the R2-backed network filesystem. Cloudflare still treats Container disk
as ephemeral, so the durable state lives in R2 rather than on the VM filesystem.
The sync Worker also receives an Alchemy-derived Durable Object `locationHint`
from the stage Neon region so the singleton Electric container is placed near
Postgres.

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
