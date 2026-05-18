# Root Infra

Root `infra` contains the implementation helpers for `../alchemy.run.ts`.
It is not a workspace package; the repo root owns Alchemy dependencies,
typechecking, and tests.

## Commands

From the repo root:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy dev --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage codex-my-task
pnpm run check-types:infra
pnpm run test:infra
```

## Important Paths

| Path                  | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `../alchemy.run.ts`   | Root Alchemy stack entrypoint.                                                           |
| `stages.ts`           | Deployment stage config, environment decoding, and resource naming.                      |
| `cloudflare-stack.ts` | Cloudflare app, API, MCP, queues, email bindings, Hyperdrive binding, and observability. |
| `neon.ts`             | Native Neon project/branch layout and resource creation.                                 |
| `legacy-alchemy.ts`   | Temporary tombstone provider for pre-native Alchemy state cleanup.                       |
| `tsconfig.infra.json` | Root TypeScript project for stack helpers and tests.                                     |

## Deployed Resources

The stack provisions a native Alchemy Neon project for the parent stage, a
per-stage Neon branch that applies the checked-in API SQL migrations, native
Alchemy Cloudflare Hyperdrive backed by that branch, a Cloudflare Worker API, a
standalone Cloudflare Worker MCP resource server, a Cloudflare Vite app, auth
email queues, and the Cloudflare Email Worker binding used by deployed auth
email delivery.

Hyperdrive is configured with a conservative origin connection limit and reads
its origin directly from the typed Neon branch output. The parent stage defaults
to the adopted `ceird-production-postgres` Hyperdrive name; non-parent stages
use stage-scoped names unless `CEIRD_HYPERDRIVE_NAME` is set.

The root stack outputs `app`, `api`, and `mcp` as stage HTTPS origins derived
from the reconciled Cloudflare Worker domains. The configured app/API/MCP
hostnames are used as fallbacks while the domain lists are resolving. Use
`CEIRD_APP_HOSTNAME` / `CEIRD_API_HOSTNAME` / `CEIRD_MCP_HOSTNAME` only for an
intentional canonical domain cutover; the main deploy workflow sets them to
`app.ceird.app`, `api.ceird.app`, and `mcp.ceird.app` for production.
It does not output the Neon connection URI; inspect `PostgresBranch` state when
a local operator needs the direct database URL for Playwright.

See [../docs/architecture/local-development-and-infra.md](../docs/architecture/local-development-and-infra.md)
for configuration variables and deployment flow.
