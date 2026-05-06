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
| `src/planet-scale.ts`          | PlanetScale Postgres resources.                                                     |
| `src/cloudflare-hyperdrive.ts` | Hyperdrive wrapper/provider.                                                        |
| `src/drizzle-migrations.ts`    | Drizzle migration deployment resource.                                              |
| `scripts/alchemy-env.mjs`      | Environment wrapper used by deploy/destroy scripts.                                 |

## Deployed Resources

The stack provisions PlanetScale Postgres, Cloudflare Hyperdrive, a Cloudflare
Worker API, a Cloudflare Vite app, an auth email queue, an auth email dead-letter
queue, and optional Cloudflare email credentials or bindings depending on
`AUTH_EMAIL_TRANSPORT`.

Hyperdrive is configured with a conservative origin connection limit. When
migrations are enabled, Alchemy applies that Hyperdrive configuration before
running Drizzle and makes the API Worker update depend on the migration run.

See [../../docs/architecture/sandbox-and-infra.md](../../docs/architecture/sandbox-and-infra.md)
for configuration variables and deployment flow.
