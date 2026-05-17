# Infra

`@ceird/infra` defines production infrastructure with Alchemy v2.

## Commands

From the repo root:

```bash
pnpm alchemy dev
pnpm alchemy deploy
pnpm alchemy destroy
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

| Path                      | Purpose                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `../../alchemy.run.ts`    | Root Alchemy stack entrypoint.                                                      |
| `src/stages.ts`           | Deployment stage config, environment decoding, and resource naming.                 |
| `src/cloudflare-stack.ts` | Cloudflare app, API, queues, email bindings, Hyperdrive binding, and observability. |
| `src/neon.ts`             | Native Neon project/branch layout and resource creation.                            |
| `scripts/alchemy-env.mjs` | Environment wrapper used by deploy/destroy scripts.                                 |

## Deployed Resources

The stack provisions a native Alchemy Neon project for the parent stage, a
per-stage Neon branch that applies the checked-in API SQL migrations, native
Alchemy Cloudflare Hyperdrive backed by that branch, a Cloudflare Worker API, a
Cloudflare Vite app, auth email queues, and the Cloudflare Email Worker binding
used by deployed auth email delivery.

Hyperdrive is configured with a conservative origin connection limit and reads
its origin directly from the typed Neon branch output.

See [../../docs/architecture/sandbox-and-infra.md](../../docs/architecture/sandbox-and-infra.md)
for configuration variables and deployment flow.
