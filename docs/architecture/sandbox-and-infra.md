# Sandbox And Infrastructure

## Local Sandbox

The sandbox gives each worktree an isolated app/API/Postgres runtime. It is the
preferred development path for linked git worktrees and for browser workflows
that need real auth cookies, API calls, and database state.

Root commands wrap the sandbox CLI:

```bash
pnpm sandbox:up
pnpm sandbox:status
pnpm sandbox:list
pnpm sandbox:url
pnpm sandbox:url -- --format json
pnpm sandbox:logs -- --service api
pnpm sandbox:down
```

Valid log services are `app`, `api`, and `postgres`. The JSON URL format is the
stable script interface for wrappers that need the current worktree's app, API,
or Postgres URL.

## Sandbox Startup Flow

`packages/sandbox-cli/src/lifecycle.ts` coordinates startup:

1. Derive or validate the sandbox name. Inferred names come from the current
   Git branch. Detached checkouts must pass `--name`; startup fails before any
   Docker or Portless work when neither a branch nor an explicit name is
   available.
2. Load `.env`, `.env.local`, and process environment values.
3. Resolve Docker runtime assets.
4. Allocate app, API, and Postgres ports.
5. Check Portless alias health.
6. Build a runtime spec with URLs, env vars, volumes, and compose project name.
7. Persist a provisional registry record.
8. Start Docker Compose.
9. Apply API Drizzle migrations.
10. Wait for app/API/Postgres health.
11. Persist a ready or degraded registry record.

When Portless aliases are healthy, URLs use the
`*.ceird.localhost:1355` proxy. When aliases are unavailable, the CLI
reports loopback fallback URLs.

## Sandbox-Aware Tests

Host-side API integration tests do not start Docker by themselves. The root
`pnpm test:with-sandbox` and `pnpm api:test:with-sandbox` wrappers start the
current worktree sandbox, read `pnpm sandbox:url -- --format json`, export the
sandbox Postgres URL as `API_TEST_DATABASE_URL`, and then run the requested test
command. Browser E2E runs against an existing sandbox should use the canonical
HTTPS app/API URLs from `pnpm sandbox:url`, not the loopback fallback URLs, so
auth cookies and origin checks match the sandbox hostnames.

Use those wrappers when an agent or developer needs database-backed API
integration coverage from the host. Plain `pnpm test` remains available for
quick package checks and will skip database-backed integration cases when no
test Postgres URL is reachable.

## Sandbox Runtime

Docker assets live in `packages/sandbox-cli/docker`.

`sandbox.compose.yaml` starts:

- `postgres`, using `postgres:16-alpine`
- `api`, running the workspace API in a sandbox dev image
- `app`, running the workspace app in the same sandbox dev image

The API receives auth, email, database, geocoder, sandbox, and Cloudflare
environment values. The app receives API origin, Vite API origin, host/port, and
sandbox identifiers. Both app and API mount the current worktree into
`/workspace` and share external pnpm and root `node_modules` volumes.

The API health endpoint is `GET /health`; the app health route is `/health`.

## Sandbox Environment

`packages/sandbox-core/src/node/env.ts` reads `.env`, `.env.local`, and process
environment, then decodes only the keys requested by the CLI. Missing required
keys fail preflight before Docker starts.

Fresh linked worktrees usually do not contain gitignored env files. The local
environment setup script copies `.env.local` from an explicit
`LOCAL_ENV_SOURCE` first, then from the primary Git worktree associated with the
linked worktree. The script does not generate fallback secrets; if no source env
file exists, setup stops with a clear error.

Common sandbox variables include:

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `AUTH_APP_ORIGIN`         | Browser app origin used by auth redirects and emails.    |
| `AUTH_EMAIL_FROM`         | Sender address for auth emails.                          |
| `AUTH_EMAIL_FROM_NAME`    | Sender display name.                                     |
| `AUTH_RATE_LIMIT_ENABLED` | Disabled during automation to avoid local auth lockouts. |
| `BETTER_AUTH_BASE_URL`    | API auth URL.                                            |
| `BETTER_AUTH_SECRET`      | Stable sandbox auth secret.                              |
| `CLOUDFLARE_ACCOUNT_ID`   | Optional local Cloudflare email API account ID.          |
| `CLOUDFLARE_API_TOKEN`    | Optional local Cloudflare email API token.               |
| `DATABASE_URL`            | Sandbox Postgres URL.                                    |
| `CEIRD_SANDBOX`           | Marks sandbox runtime.                                   |
| `GOOGLE_MAPS_API_KEY`     | Optional local Google geocoding key for site creation.   |

Cloudflare email API credentials are optional. When both are present, local API
runtimes use the Cloudflare email API; when either is absent or blank, auth
email delivery uses the deterministic development transport.
The Google Maps key is optional for sandbox startup; when it is missing or
blank, the API uses deterministic development geocoding.

## Production Infrastructure

The repo root defines infrastructure with Alchemy v2. The stack entrypoint is
`alchemy.run.ts`, with implementation helpers in `packages/infra/src`.

The stack provisions:

- native Alchemy Neon project and per-stage branch
- native Alchemy Cloudflare Hyperdrive for Postgres connectivity
- Cloudflare Worker API from `apps/api/src/worker.ts`
- Cloudflare Vite app from `apps/app`
- Cloudflare Queue for auth email
- Cloudflare dead-letter queue for auth email failures
- Cloudflare Email Worker binding for deployed auth email delivery

The API Worker and Cloudflare Vite app share the same typed Worker
compatibility contract, including `nodejs_compat`, so runtime packages that rely
on Node.js compatibility APIs run consistently across both deployable surfaces.
The API Worker is also configured with Better Auth env vars, database
Hyperdrive binding, auth email queue binding, Google Maps geocoding credentials,
observability logs, and traces.
The app is configured with app/API origins, Cloudflare-specific Vite flags, and
Cloudflare observability logs and traces.

The native Neon branch resource applies the checked-in API SQL migrations before
Hyperdrive reads the branch origin and before new API code is uploaded.

## Infra Configuration

`packages/infra/src/stages.ts` receives the resolved Alchemy stage from the
current Stack service and loads the remaining deployment config from
environment variables. Do not set a separate infra stage; the Alchemy `--stage`
value is the environment identity for state, resource names, and future Neon
branch names.

| Variable                                   | Default         | Purpose                                                    |
| ------------------------------------------ | --------------- | ---------------------------------------------------------- |
| `CEIRD_ZONE_NAME`                          | required        | Cloudflare zone.                                           |
| `CEIRD_APP_HOSTNAME`                       | `app.<zone>`    | App hostname.                                              |
| `CEIRD_API_HOSTNAME`                       | `api.<zone>`    | API hostname.                                              |
| `AUTH_EMAIL_FROM`                          | required        | Sender email address.                                      |
| `AUTH_EMAIL_FROM_NAME`                     | `Ceird`         | Sender display name.                                       |
| `GOOGLE_MAPS_API_KEY`                      | required        | Google Maps Geocoding API key for deployed API.            |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` | `5`             | Soft maximum Hyperdrive origin database connections.       |
| `CEIRD_NEON_DATABASE_NAME`                 | `ceird`         | Database created in the parent Neon project.               |
| `CEIRD_NEON_DEFAULT_BRANCH_NAME`           | `base`          | Unmigrated default branch created with the Neon project.   |
| `CEIRD_NEON_MIGRATIONS_DIR`                | API drizzle dir | SQL migration directory applied by the Neon branch.        |
| `CEIRD_NEON_PARENT_BRANCH_NAME`            | `main`          | Parent branch used by non-parent stages.                   |
| `CEIRD_NEON_PARENT_STAGE`                  | `main`          | Stage that owns the shared Neon project and parent branch. |
| `CEIRD_NEON_PG_VERSION`                    | `17`            | Neon Postgres major version.                               |
| `CEIRD_NEON_REGION`                        | `aws-eu-west-2` | Neon project region.                                       |
| `CEIRD_NEON_ROLE_NAME`                     | `ceird`         | Initial Neon database owner role.                          |
| `NEON_API_KEY`                             | provider secret | Neon API key consumed by Alchemy's Neon provider.          |
| `NEON_ORG_ID`                              | optional        | Neon organization ID for project creation.                 |

Resource names use `ceird-<normalized-alchemy-stage>-<suffix>`. Branch-shaped
stages are normalized to provider-safe lowercase slugs with deterministic hash
suffixes when needed.

The parent stage creates a shared Neon project with an unmigrated `base`
default branch and a protected `main` branch. Other stages reference the
parent-stage project and create their own branch from `main`.

## Deployment Commands

From the repo root:

```bash
pnpm alchemy dev
pnpm alchemy deploy
pnpm alchemy destroy
pnpm infra:check-types
pnpm infra:deploy
pnpm infra:destroy
```

From the infra package:

```bash
pnpm --filter @ceird/infra check-types
pnpm --filter @ceird/infra dev
pnpm --filter @ceird/infra deploy
pnpm --filter @ceird/infra destroy
```

Use the Stripe Projects CLI guidance in `AGENTS.md` when managing third-party
service access for this project.
