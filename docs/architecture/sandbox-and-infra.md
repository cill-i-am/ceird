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

1. Derive or validate the sandbox name. Inferred names prefer the current Git
   branch, then fall back to the worktree path for detached checkouts.
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
command.

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
| `AUTH_EMAIL_TRANSPORT`    | `noop`, `cloudflare-api`, or `cloudflare-binding`.       |
| `AUTH_RATE_LIMIT_ENABLED` | Disabled during automation to avoid local auth lockouts. |
| `BETTER_AUTH_BASE_URL`    | API auth URL.                                            |
| `BETTER_AUTH_SECRET`      | Stable sandbox auth secret.                              |
| `DATABASE_URL`            | Sandbox Postgres URL.                                    |
| `SITE_GEOCODER_MODE`      | Site geocoder behavior for local runs.                   |
| `CEIRD_SANDBOX`           | Marks sandbox runtime.                                   |

Cloudflare email API credentials are optional unless
`AUTH_EMAIL_TRANSPORT=cloudflare-api`.

## Production Infrastructure

`packages/infra` defines infrastructure with Alchemy v2. The stack entrypoint is
`packages/infra/alchemy.run.ts`.

The stack provisions:

- PlanetScale Postgres database, roles, and connection URLs
- Cloudflare Hyperdrive for Postgres connectivity
- Cloudflare Worker API from `apps/api/src/worker.ts`
- Cloudflare Vite app from `apps/app`
- Cloudflare Queue for auth email
- Cloudflare dead-letter queue for auth email failures
- Optional Cloudflare account API token for `cloudflare-api` email transport
- Optional Cloudflare Email Worker binding for `cloudflare-binding` transport

The API Worker and Cloudflare Vite app share the same typed Worker
compatibility contract, including `nodejs_compat`, so runtime packages that rely
on Node.js compatibility APIs run consistently across both deployable surfaces.
The API Worker is also configured with Better Auth env vars, Sentry env vars,
site geocoder mode, optional Google Maps key, database Hyperdrive binding, auth
email queue binding, observability logs, and traces. The app is configured with
app/API origins and Cloudflare-specific Vite flags, Cloudflare observability
logs and traces, browser Sentry tracing, Sentry structured logs, and Session
Replay. Browser Sentry and API Node Sentry are kept out of Cloudflare Worker
startup paths; Cloudflare Workers use the Cloudflare Sentry SDK and shared
telemetry sanitizers before events leave the app or API.

Cloudflare Worker source maps are handled by Alchemy's Worker bundling path
rather than Wrangler config. The pinned `alchemy@2.0.0-beta.28` Worker resource
builds hidden source maps and sends `.map` files as Worker script modules with
the `application/source-map` content type during the multipart upload. There is
no separate `upload_source_maps` flag in our Alchemy resource config.

The production Hyperdrive configuration sets a conservative origin connection
limit before deploy-time migrations run. Drizzle migrations depend on that
Hyperdrive resource and the API Worker depends on the migration run when
`CEIRD_APPLY_MIGRATIONS=true`, so schema changes run after the connection pool
budget is applied and before new API code is uploaded.

## Infra Configuration

`packages/infra/src/stages.ts` loads deployment config from `CEIRD_*` names.

| Variable                                   | Default              | Purpose                                                |
| ------------------------------------------ | -------------------- | ------------------------------------------------------ |
| `CEIRD_INFRA_STAGE`                        | `production`         | `preview` or `production`.                             |
| `CEIRD_ZONE_NAME`                          | required             | Cloudflare zone.                                       |
| `CEIRD_APP_HOSTNAME`                       | `app.<zone>`         | App hostname.                                          |
| `CEIRD_API_HOSTNAME`                       | `api.<zone>`         | API hostname.                                          |
| `AUTH_EMAIL_FROM`                          | required             | Sender email address.                                  |
| `AUTH_EMAIL_FROM_NAME`                     | `Ceird`              | Sender display name.                                   |
| `AUTH_EMAIL_TRANSPORT`                     | `cloudflare-binding` | Auth email transport mode.                             |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` | `5`                  | Soft maximum Hyperdrive origin database connections.   |
| `PLANETSCALE_ORGANIZATION`                 | required             | PlanetScale organization.                              |
| `CEIRD_PLANETSCALE_DATABASE_NAME`          | `ceird-<stage>`      | PlanetScale database name.                             |
| `CEIRD_PLANETSCALE_DEFAULT_BRANCH`         | `main`               | PlanetScale branch.                                    |
| `CEIRD_PLANETSCALE_REGION`                 | `eu-west`            | PlanetScale region slug.                               |
| `CEIRD_PLANETSCALE_CLUSTER_SIZE`           | `PS-5`               | PlanetScale cluster size.                              |
| `SENTRY_DSN`                               | Ceird API DSN        | Sentry project DSN for the API Worker.                 |
| `SENTRY_TRACES_SAMPLE_RATE`                | `1`                  | Sentry trace sample rate from 0 to 1.                  |
| `SITE_GEOCODER_MODE`                       | `stub`               | API site geocoding mode, either `stub` or `google`.    |
| `GOOGLE_MAPS_API_KEY`                      | required for google  | Google geocoding key when `SITE_GEOCODER_MODE=google`. |
| `CEIRD_APPLY_MIGRATIONS`                   | `false`              | Run API Drizzle migrations during deploy.              |

Resource names use `ceird-<stage>-<suffix>`.

## Deployment Commands

From the repo root:

```bash
pnpm infra:check-types
pnpm infra:deploy
pnpm infra:destroy
```

From the infra package:

```bash
pnpm --filter @ceird/infra check-types
pnpm --filter @ceird/infra deploy
pnpm --filter @ceird/infra destroy
pnpm --filter @ceird/infra dev
```

Use the Stripe Projects CLI guidance in `AGENTS.md` when managing third-party
service access for this project.
