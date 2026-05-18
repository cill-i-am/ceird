# Local Development And Infrastructure

## Alchemy-Native Local Development

Local development uses the same root Alchemy stack as deployment. Root
`pnpm dev` delegates to `alchemy dev --env-file .env.local`, which creates or
updates a cloud-backed stage with Cloudflare Workers/Vite, the standalone MCP
Worker, Hyperdrive, queues, routes, and a Neon branch.

Authenticate Cloudflare locally through the Alchemy profile before the first
cloud-backed run:

```bash
pnpm alchemy login
```

CI uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets for
non-interactive provider auth. Local operators should leave Cloudflare provider
auth in the Alchemy profile instead of exporting those variables for normal
Alchemy runs.

Use an explicit stage for linked worktrees and agent tasks:

```bash
pnpm dev -- --stage codex-my-task
```

Non-parent stages require the parent stage to exist because they reference the
shared Neon project from `CEIRD_NEON_PARENT_STAGE`, which defaults to `main`.
If a child-stage plan fails with a missing `PostgresProject` reference, plan or
deploy the parent stage first:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main
```

The Alchemy stack and stage are the identities for state, resource names,
Worker health payloads, and Neon branches. Use the `--stage` CLI flag to choose
the stage; `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` are injected into app, API,
and MCP runtimes after Alchemy resolves the stack and stage. The app and API
health endpoints return those values as `stackName` and `stage`, falling back to
`local` in package-local Node runs. The root stack outputs `app`, `api`, and
`mcp` as stage HTTPS origins derived from the reconciled Cloudflare Worker
domains, with the configured hostnames as pre-resolution fallbacks. Canonical
domain cutover is an explicit `CEIRD_APP_HOSTNAME` / `CEIRD_API_HOSTNAME` /
`CEIRD_MCP_HOSTNAME` override so a parent-stage deploy cannot accidentally take
over a hostname owned by another Worker. Use the Alchemy CLI directly for
explicit deploy and destroy operations:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage codex-my-task
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
| `ALCHEMY_STACK_NAME`      | Alchemy-injected runtime stack name for Worker metadata. |
| `ALCHEMY_STAGE`           | Alchemy-injected runtime stage for Worker metadata.      |
| `AUTH_APP_ORIGIN`         | Browser app origin used by auth redirects and emails.    |
| `AUTH_EMAIL_FROM`         | Sender address for auth emails.                          |
| `AUTH_EMAIL_FROM_NAME`    | Sender display name.                                     |
| `AUTH_RATE_LIMIT_ENABLED` | Disabled during automation to avoid local auth lockouts. |
| `BETTER_AUTH_BASE_URL`    | API auth URL.                                            |
| `BETTER_AUTH_SECRET`      | Stable local auth secret for package-local API runs.     |
| `DATABASE_URL`            | Package-local API database URL.                          |
| `GOOGLE_MAPS_API_KEY`     | Optional local Google geocoding key for site creation.   |
| `MCP_RESOURCE_URL`        | Absolute MCP resource URL, usually ending in `/mcp`.     |
| `OAUTH_ISSUER_URL`        | OAuth issuer URL for MCP bearer-token verification.      |

Package-local API runs use deterministic development auth email delivery. That
local transport is separate from deployed Worker email delivery, which uses the
Cloudflare Email Worker binding declared by the Alchemy stack.
The Google Maps key is optional for package-local API startup; when it is
missing or blank, the API uses deterministic development geocoding.

## Production Infrastructure

The repo root defines infrastructure with Alchemy v2. The stack entrypoint is
`alchemy.run.ts`, with implementation helpers in `infra`.

The stack provisions:

- native Alchemy Neon project and per-stage branch
- native Alchemy Cloudflare Hyperdrive for Postgres connectivity
- Cloudflare Worker API from `apps/api/src/worker.ts`
- Cloudflare Worker MCP resource server from `apps/mcp/src/worker.ts`
- Cloudflare Vite app from `apps/app`
- Cloudflare Queue for auth email
- Cloudflare dead-letter queue for auth email failures
- Cloudflare Email Worker binding for deployed auth email delivery

The API Worker, MCP Worker, and Cloudflare Vite app share the same typed Worker
compatibility contract, including `nodejs_compat`, so runtime packages that rely
on Node.js compatibility APIs run consistently across deployable surfaces.
The API Worker declares its Cloudflare runtime resources through the
`Cloudflare.Worker` `bindings` prop in `infra/cloudflare-stack.ts`.
`DATABASE` is the native Hyperdrive resource, `AUTH_EMAIL_QUEUE` is the native
Queue resource, and `AUTH_EMAIL` is the Cloudflare Email Worker binding
descriptor. The root infra helpers derive `ApiWorkerBindingEnv` with
`Cloudflare.InferEnv`; its tests compare that type against the API package's
`ApiWorkerBindingRuntimeEnv` contract in
`apps/api/src/platform/cloudflare/env.ts`. The Worker module adapter in
`apps/api/src/worker.ts` only runs the fetch and queue Effect programs; the
single Effect-threaded Worker runtime boundary lives in
`apps/api/src/platform/cloudflare/runtime.ts`, where config, Hyperdrive, auth
queue scheduling, email binding delivery, and site geocoding are composed from
Cloudflare bindings without making the API runtime import Alchemy.
The API Worker is also configured with Better Auth env vars, Google Maps
geocoding credentials, MCP OAuth audience/issuer vars, observability logs, and
traces. Its configured env helper has an explicit `ApiWorkerConfiguredEnv` type,
and infra tests compare the stack-provided config keys with the API runtime's
`ApiWorkerConfigEnv` while allowing redacted Alchemy inputs to resolve to
strings at runtime.
The MCP Worker declares its own `DATABASE` Hyperdrive binding and configured
env contract in `apps/mcp/src/platform/cloudflare/env.ts`. The infra stack sets
`BETTER_AUTH_BASE_URL` and `OAUTH_ISSUER_URL` to the API auth base URL, sets
`MCP_RESOURCE_URL` from the configured MCP hostname, and enables Cloudflare
observability logs and traces for the Worker.
Better Auth derives cross-subdomain cookies from the configured HTTPS app/API
origins for deployed Alchemy stages. Every stage, including `main`, defaults to
`app.<stage>.<zone>` and `api.<stage>.<zone>`, so each stage can share auth
cookies only within its own `<stage>.<zone>` parent without relying on local
sandbox host aliases. Canonical
`app.<zone>`, `api.<zone>`, and `mcp.<zone>` hostnames require explicit
`CEIRD_APP_HOSTNAME` / `CEIRD_API_HOSTNAME` / `CEIRD_MCP_HOSTNAME` overrides
after any existing Worker routes have been cut over intentionally;
`.github/workflows/deploy-main.yml` sets those overrides for Ceird's production
`main` stage, including `mcp.ceird.app`.
The app is configured with app/API origins, Cloudflare-specific Vite flags, and
Cloudflare observability logs and traces. Its API origin is derived from the API
Worker's reconciled Cloudflare domain output, with the configured API hostname
used as the fallback before the domain list is available, so the app Worker
tracks the API resource rather than reconstructing that origin independently.
The root Alchemy stack returns the same domain-derived origins as its operator
outputs for `app`, `api`, and `mcp`; workers.dev URLs remain underlying
Cloudflare resource attributes rather than the primary deployment endpoints. It also
returns the Neon branch name, Hyperdrive name, Neon database name, and the
`authEmailQueue` and `authEmailDeadLetterQueue` names so operators and tests can
inspect the runtime resources without reconstructing stage-specific names.
It intentionally does not return the Neon connection URI as a stack output,
because deploy outputs are printed into local and CI logs. When a local
database-backed E2E run needs `PLAYWRIGHT_DATABASE_URL`, inspect the deployed
branch state instead. The `PostgresBranch` inspection examples use `jq` to read
Alchemy's persisted JSON state:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy state get ceird <stage> PostgresBranch --env-file .env.local --stage <stage> \
  | jq -r '.attr.connectionUri.__redacted__ // .attr.connectionUri'
```

The native Neon branch resource applies the configured `NeonMigrationSource`
before Hyperdrive reads the branch origin and before new API code is uploaded.
That source is Alchemy `Drizzle.Schema`, which loads the API schema barrel and
writes generated migration snapshots under `apps/api/drizzle/alchemy`. The Neon
branch resource depends on that schema resource, then applies SQL from
`apps/api/drizzle`, including historical package-local SQL files and future
Alchemy-generated SQL files under the nested Alchemy directory.
The root provider layer also keeps a no-op legacy `Drizzle.Migrations`
tombstone provider so existing Cloudflare state entries from the pre-native
migration wrapper can be planned and deleted cleanly. New migrations are owned
by `Drizzle.Schema` and `Neon.Branch`.

## Infra Configuration

`infra/stages.ts` receives the resolved Alchemy stage from the
current Stack service and loads the remaining deployment config from
environment variables. Do not set a separate infra stage; the Alchemy `--stage`
value is the environment identity for state, resource names, and future Neon
branch names.

| Variable                                   | Default         | Purpose                                                                                              |
| ------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `CEIRD_ZONE_NAME`                          | `ceird.app`     | Cloudflare zone.                                                                                     |
| `CEIRD_APP_HOSTNAME`                       | stage-scoped    | App hostname override.                                                                               |
| `CEIRD_API_HOSTNAME`                       | stage-scoped    | API hostname override.                                                                               |
| `CEIRD_MCP_HOSTNAME`                       | stage-scoped    | MCP hostname override.                                                                               |
| `AUTH_EMAIL_FROM`                          | required        | Sender email address.                                                                                |
| `AUTH_EMAIL_FROM_NAME`                     | `Ceird`         | Sender display name.                                                                                 |
| `GOOGLE_MAPS_API_KEY`                      | required        | Google Maps Geocoding API key for deployed API.                                                      |
| `CEIRD_HYPERDRIVE_NAME`                    | stage-dependent | Hyperdrive config name; the parent stage defaults to the adopted `ceird-production-postgres` config. |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` | `5`             | Soft maximum Hyperdrive origin database connections.                                                 |
| `CEIRD_NEON_DATABASE_NAME`                 | `ceird`         | Database created in the parent Neon project.                                                         |
| `CEIRD_NEON_DEFAULT_BRANCH_NAME`           | `base`          | Unmigrated default branch created with the Neon project.                                             |
| `CEIRD_NEON_HISTORY_RETENTION_SECONDS`     | `21600`         | Parent Neon project WAL history retention window.                                                    |
| `CEIRD_NEON_PARENT_BRANCH_PROTECTED`       | `false`         | Set to `true` to protect the parent branch when the Neon plan allows it.                             |
| `CEIRD_NEON_PARENT_BRANCH_NAME`            | `main`          | Parent branch used by non-parent stages.                                                             |
| `CEIRD_NEON_PARENT_STAGE`                  | `main`          | Stage that owns the shared Neon project and parent branch.                                           |
| `CEIRD_NEON_PG_VERSION`                    | `17`            | Neon Postgres major version.                                                                         |
| `CEIRD_NEON_REGION`                        | `aws-eu-west-2` | Neon project region.                                                                                 |
| `CEIRD_NEON_ROLE_NAME`                     | `ceird`         | Initial Neon database owner role.                                                                    |
| `NEON_API_KEY`                             | provider secret | Neon API key consumed by Alchemy's Neon provider.                                                    |
| `NEON_ORG_ID`                              | optional        | Neon organization ID for project creation.                                                           |

Resource names use `ceird-<normalized-alchemy-stage>-<suffix>`. Branch-shaped
stages are normalized to provider-safe lowercase slugs with deterministic hash
suffixes when needed.

The parent stage deliberately defaults `CEIRD_HYPERDRIVE_NAME` to
`ceird-production-postgres` so the native Alchemy resource adopts the existing
Cloudflare Hyperdrive config instead of renaming or replacing it during the v2
migration. New non-parent stages default to stage-scoped Hyperdrive names such
as `ceird-codex-alchemy-v2-native-migration-postgres`.

The parent stage creates a shared Neon project with an unmigrated `base`
default branch and a `main` branch. Parent branch protection is opt-in through
`CEIRD_NEON_PARENT_BRANCH_PROTECTED` because not every Neon plan can create
additional protected branches. The parent project also declares
`CEIRD_NEON_HISTORY_RETENTION_SECONDS` explicitly so Alchemy does not repeatedly
try to normalize Neon's provider-reported retention window. Other stages
reference the parent-stage project and create their own branch from `main`.
The branch migration input is modeled in `infra` as
`NeonMigrationSource`; the `alchemy-drizzle-schema` source points Alchemy
`Drizzle.Schema` at the root-owned `infra/api-drizzle-schema.ts` wrapper. That
wrapper loads the API schema barrel at `apps/api/src/platform/database/schema.ts`
through the same TypeScript resolver Alchemy needs at deploy time. Its
`generatedMigrationsDir` is `apps/api/drizzle/alchemy`, while its
`appliedMigrationsDir` is `apps/api/drizzle`. Keeping those roles explicit lets
Alchemy regenerate future SQL before the Neon branch runs the recursive parent
migration tree that still contains the historical package-local SQL files.

## Deployment Commands

From the repo root:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy dev --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage codex-my-task
pnpm run check-types:infra
pnpm run test:infra
```

Use the Stripe Projects CLI guidance in `AGENTS.md` when managing third-party
service access for this project.
