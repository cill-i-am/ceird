# Infra

`@ceird/infra` defines production infrastructure with Alchemy v2.

## Commands

From the repo root:

```bash
pnpm infra:check-types
pnpm infra:deploy
pnpm infra:destroy
```

From this package:

```bash
pnpm --filter @ceird/infra check-types
pnpm --filter @ceird/infra test
pnpm --filter @ceird/infra deploy
pnpm --filter @ceird/infra destroy
pnpm --filter @ceird/infra dev
```

## Important Paths

| Path                           | Purpose                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `alchemy.run.ts`               | Alchemy stack entrypoint.                                                           |
| `src/stages.ts`                | Deployment stage config, environment decoding, and resource naming.                 |
| `src/cloudflare-stack.ts`      | Cloudflare app, API, queues, email bindings, Hyperdrive binding, and observability. |
| `src/neon.ts`                  | Neon direct connection URL validation and database resource shape.                  |
| `src/cloudflare-hyperdrive.ts` | Hyperdrive wrapper/provider.                                                        |
| `src/drizzle-migrations.ts`    | Drizzle migration deployment resource.                                              |
| `scripts/alchemy-env.mjs`      | Environment wrapper used by deploy/destroy scripts.                                 |

## Deployed Resources

The stack provisions Cloudflare Hyperdrive backed by Neon Postgres connection
URLs, a Cloudflare Worker API, a Cloudflare Vite app, an auth email queue, an
auth email dead-letter queue, and the Cloudflare Email Worker binding used by
deployed auth email delivery.

Hyperdrive is configured with a conservative origin connection limit. When
migrations are enabled, Alchemy applies that Hyperdrive configuration before
running Drizzle with `NEON_MIGRATION_DATABASE_URL` and makes the API Worker
update depend on the migration run. `NEON_DATABASE_URL` should remain the app
role used by Hyperdrive.

See [../../docs/architecture/sandbox-and-infra.md](../../docs/architecture/sandbox-and-infra.md)
for configuration variables and deployment flow.
