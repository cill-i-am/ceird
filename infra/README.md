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

| Path                            | Purpose                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `../alchemy.run.ts`             | Root Alchemy stack entrypoint.                                                                                 |
| `stages.ts`                     | Deployment stage config, environment decoding, and resource naming.                                            |
| `cloudflare-stack.ts`           | Cloudflare app, API, MCP, Agent, domain Worker, queues, email bindings, Hyperdrive binding, and observability. |
| `cloudflare-worker-defaults.ts` | Shared Worker compatibility and observability defaults used by app-owned Worker declarations.                  |
| `neon.ts`                       | Native Neon project/branch layout and resource creation.                                                       |
| `legacy-alchemy.ts`             | Temporary tombstone provider for pre-native Alchemy state cleanup.                                             |
| `tsconfig.infra.json`           | Root TypeScript project for stack helpers and tests.                                                           |

## Deployed Resources

The stack provisions a native Alchemy Neon project for the parent stage, a
per-stage Neon branch that applies the stage-specific domain SQL migrations,
native Alchemy Cloudflare Hyperdrive backed by that branch, a private Cloudflare
domain Worker, public API, MCP, and Agent adapter Workers, a Cloudflare Vite
app, auth email queues, and the Cloudflare Email Worker binding used by deployed
auth email delivery.

Hyperdrive is configured with a conservative origin connection limit and reads
its origin directly from the typed Neon branch output. The parent stage defaults
to the adopted `ceird-production-postgres` Hyperdrive name; non-parent stages
use stage-scoped names unless `CEIRD_HYPERDRIVE_NAME` is set.

The root stack outputs `app`, `api`, `mcp`, and `agent` as stage HTTPS origins
derived from the reconciled public Cloudflare Worker domains. It also outputs
tenant routing details: `tenantRoutePattern`,
`tenantWildcardDnsRecordId`, and
`tenantReservedHostBypassRoutePatterns`. The configured app/API/MCP/Agent
hostnames are used as fallbacks while the domain lists are resolving. Use
`CEIRD_APP_HOSTNAME`, `CEIRD_API_HOSTNAME`, `CEIRD_MCP_HOSTNAME`, and
`CEIRD_AGENT_HOSTNAME` only for an intentional canonical domain cutover; the
main deploy workflow sets them to the exact production system custom domains
`app.ceird.app`, `api.ceird.app`, `mcp.ceird.app`, and `agent.ceird.app`.

Tenant hosts are app Worker routes, not Cloudflare custom domains per
organization. Production tenants use `{orgSlug}.ceird.app`; non-production
tenants use `{orgSlug}--{tenantStageAlias}.ceird.app`. The stack manages one
shared wildcard DNS record for `*.ceird.app` and one Alchemy-owned Worker route
for the active tenant pattern, such as `*.ceird.app/*` in production or
`*--pr-123.ceird.app/*` for a PR preview. Destroying a PR stage removes that
stage route but leaves the shared wildcard DNS record in place; preview CI also
deletes the known route pattern directly after destroy as a stale-state
fallback. Production adds
reserved-host bypass routes with no script for `app.ceird.app`,
`api.ceird.app`, `agent.ceird.app`, and `mcp.ceird.app` so the tenant wildcard
does not intercept system traffic. The shared organization slug contract also
reserves `app`, `api`, `agent`, and `mcp`, preventing tenant URLs from colliding
with those exact production hostnames.
Domain Worker MCP authorized-app cache overrides are loaded in `infra/stages.ts`
and passed through the app-owned Worker env module; the root stack does not own
those runtime defaults. Worker compatibility flags and observability settings
are intentionally shared in `infra/cloudflare-worker-defaults.ts` because they
are platform-wide deployment defaults rather than app-specific behavior. The
Agent Worker keeps those shared trace/log defaults but disables invocation URL
logging while query-token connect fallback remains supported.
It does not output the Neon connection URI; inspect `PostgresBranch` state when
a local operator needs the direct database URL for Playwright.

See [../docs/architecture/local-development-and-infra.md](../docs/architecture/local-development-and-infra.md)
for configuration variables and deployment flow.
