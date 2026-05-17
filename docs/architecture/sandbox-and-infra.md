# Local Development And Infrastructure

## Alchemy-Native Local Development

Local development uses the same root Alchemy stack as deployment. Root
`pnpm dev` delegates to `pnpm alchemy dev`, which creates or updates a
cloud-backed stage with Cloudflare Workers/Vite, Hyperdrive, queues, routes, and
a Neon branch.

Use an explicit stage for linked worktrees and agent tasks:

```bash
ALCHEMY_STAGE=codex-my-task pnpm dev
```

The Alchemy stage is the identity for state, resource names, Worker health
payloads, and Neon branches. The root wrapper also accepts explicit deploy and
destroy operations:

```bash
ALCHEMY_STAGE=codex-my-task pnpm alchemy deploy
ALCHEMY_STAGE=codex-my-task pnpm alchemy destroy
```

Destroy is intentionally explicit because it deletes cloud resources for the
selected stage.

## Local Environment

Fresh linked worktrees usually do not contain gitignored env files. The local
environment setup script copies `.env.local` from an explicit
`LOCAL_ENV_SOURCE` first, then from the primary Git worktree associated with the
linked worktree. The script does not generate fallback secrets; if no source env
file exists, setup stops with a clear error.

Common local and Alchemy variables include:

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `ALCHEMY_STAGE`           | Alchemy stage used for state, resources, and branches.   |
| `AUTH_APP_ORIGIN`         | Browser app origin used by auth redirects and emails.    |
| `AUTH_EMAIL_FROM`         | Sender address for auth emails.                          |
| `AUTH_EMAIL_FROM_NAME`    | Sender display name.                                     |
| `AUTH_RATE_LIMIT_ENABLED` | Disabled during automation to avoid local auth lockouts. |
| `BETTER_AUTH_BASE_URL`    | API auth URL.                                            |
| `BETTER_AUTH_SECRET`      | Stable local auth secret for package-local API runs.     |
| `CLOUDFLARE_ACCOUNT_ID`   | Optional local Cloudflare email API account ID.          |
| `CLOUDFLARE_API_TOKEN`    | Optional local Cloudflare email API token.               |
| `DATABASE_URL`            | Package-local API database URL.                          |
| `GOOGLE_MAPS_API_KEY`     | Optional local Google geocoding key for site creation.   |

Cloudflare email API credentials are optional. When both are present, local API
runtimes use the Cloudflare email API; when either is absent or blank, auth
email delivery uses the deterministic development transport.
The Google Maps key is optional for package-local API startup; when it is
missing or blank, the API uses deterministic development geocoding.

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
The API Worker declares its Cloudflare runtime resources through the
`Cloudflare.Worker` `bindings` prop in `packages/infra/src/cloudflare-stack.ts`.
`DATABASE` is the native Hyperdrive resource, `AUTH_EMAIL_QUEUE` is the native
Queue resource, and `AUTH_EMAIL` is the Cloudflare Email Worker binding
descriptor. The infra package derives `ApiWorkerBindingEnv` with
`Cloudflare.InferEnv`; its tests compare that type against the API package's
`ApiWorkerBindingRuntimeEnv` contract in
`apps/api/src/platform/cloudflare/env.ts`. That keeps the temporary async
Worker bridge type-checked without making the API runtime depend on Alchemy or
Effect 4 before the Worker runtime itself is migrated.
The API Worker is also configured with Better Auth env vars, Google Maps
geocoding credentials, observability logs, and traces.
The app is configured with app/API origins, Cloudflare-specific Vite flags, and
Cloudflare observability logs and traces.

The native Neon branch resource applies the configured `NeonMigrationSource`
before Hyperdrive reads the branch origin and before new API code is uploaded.
That source is Alchemy `Drizzle.Schema`, which loads the API schema barrel and
writes migration snapshots under `apps/api/drizzle/alchemy`. The Neon branch
resource depends on that schema resource, then applies SQL from
`apps/api/drizzle`, including historical package-local SQL files and future
Alchemy-generated SQL files under the nested Alchemy directory.

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
The branch migration input is modeled in `packages/infra` as
`NeonMigrationSource`; the `alchemy-drizzle-schema` source points Alchemy
`Drizzle.Schema` at `apps/api/src/platform/database/schema.ts`, stores
Drizzle's baseline/future snapshots in `apps/api/drizzle/alchemy`, and passes
`apps/api/drizzle` through to the native Neon branch `migrationsDir`.

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
