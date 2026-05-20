# Local Development And Infrastructure

## Alchemy-Native Local Development

Local development uses the same root Alchemy stack as deployment. Root
`pnpm dev` delegates to `alchemy dev --env-file .env.local`, which creates or
updates a cloud-backed stage with Cloudflare Workers/Vite, Hyperdrive, queues,
routes, and a Neon branch.

Authenticate Cloudflare locally through the Alchemy profile before the first
cloud-backed run:

```bash
pnpm alchemy login
```

CI uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets for
non-interactive provider auth. Preview CI also stores the existing Cloudflare
state-store credentials JSON as `ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS`
and writes it to Alchemy's expected credentials path before deploy or destroy.
Local operators should leave Cloudflare provider auth and state-store
credentials in the Alchemy profile instead of exporting those variables for
normal Alchemy runs.

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
the stage; `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` are injected into app/API
runtimes after Alchemy resolves the stack and stage. Both health endpoints
return those values as `stackName` and `stage`, falling back to `local` in
package-local Node runs. The root stack outputs `app` and `api` as stage HTTPS
origins derived from the reconciled Cloudflare Worker domains, with the
configured hostnames as pre-resolution fallbacks. Canonical domain cutover is an
explicit `CEIRD_APP_HOSTNAME` / `CEIRD_API_HOSTNAME` override so a parent-stage
deploy cannot accidentally take over a hostname owned by another Worker. Use the
Alchemy CLI directly for explicit deploy and destroy operations:

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
linked worktree. It prepares the env file before dependency installation so
Codex and other non-interactive setup runs fail quickly when credentials are
missing. When the source directory or primary worktree already has an
`opensrc/` cache, setup links that cache into the new worktree and runs
dependency installation with `CI=true` so the root `postinstall` does not repeat
a network-backed dependency-source refresh. If no cache exists, setup lets
`pnpm install` run the normal `opensrc` refresh. The script does not generate
fallback secrets; if no source env file exists, setup stops with a clear error.

Common local and Alchemy variables include:

| Variable                  | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `ALCHEMY_STACK_NAME`      | Alchemy-injected runtime stack name for Worker metadata.  |
| `ALCHEMY_STAGE`           | Alchemy-injected runtime stage for app/API health checks. |
| `AUTH_APP_ORIGIN`         | Browser app origin used by auth redirects and emails.     |
| `AUTH_EMAIL_FROM`         | Sender address for auth emails.                           |
| `AUTH_EMAIL_FROM_NAME`    | Sender display name.                                      |
| `AUTH_RATE_LIMIT_ENABLED` | Disables auth rate limiting for local and PR-preview E2E. |
| `BETTER_AUTH_BASE_URL`    | API auth URL.                                             |
| `BETTER_AUTH_SECRET`      | Stable local auth secret for package-local domain runs.   |
| `DATABASE_URL`            | Package-local domain database URL.                        |
| `GOOGLE_MAPS_API_KEY`     | Optional local Google geocoding key for site creation.    |

Package-local domain runs use deterministic development auth email delivery. That
local transport is separate from deployed Worker email delivery, which uses the
Cloudflare Email Worker binding declared by the Alchemy stack.
The Google Maps key is optional for package-local domain startup; when it is
missing or blank, the domain uses deterministic development geocoding.

## Production Infrastructure

The repo root orchestrates infrastructure with Alchemy v2. The stack entrypoint
is `alchemy.run.ts`; shared stage, Neon, Hyperdrive, queue, and output helpers
stay in `infra`, while each deployable app owns its Cloudflare Worker/Vite
resource declaration under `apps/*/infra`.

The stack provisions:

- native Alchemy Neon project and per-stage branch
- native Alchemy Cloudflare Hyperdrive for Postgres connectivity
- private Cloudflare domain Worker declared in
  `apps/domain/infra/cloudflare-worker.ts` and executed from
  `apps/domain/src/worker.ts`
- public Cloudflare API Worker declared in
  `apps/api/infra/cloudflare-worker.ts` and executed from
  `apps/api/src/worker.ts`
- public Cloudflare MCP Worker declared in
  `apps/mcp/infra/cloudflare-worker.ts` and executed from
  `apps/mcp/src/worker.ts`
- Cloudflare Vite app declared in `apps/app/infra/cloudflare-vite.ts`
- Cloudflare Queue for auth email
- Cloudflare dead-letter queue for auth email failures
- Cloudflare Email Worker binding for deployed auth email delivery

The domain, API, MCP, and Cloudflare Vite app share the same typed Worker
compatibility contract, including `nodejs_compat`, so runtime packages that rely
on Node.js compatibility APIs run consistently across deployable surfaces.
The private domain Worker declares the runtime resources that own state:
`DATABASE` is the native Hyperdrive resource, `AUTH_EMAIL_QUEUE` is the native
Queue resource, and `AUTH_EMAIL` is the Cloudflare Email Worker binding
descriptor. Public API and MCP Workers declare only the `DOMAIN` service binding
to that private Worker. Infra tests compare the app-owned binding/env
declarations against the runtime contracts in each app's
`src/platform/cloudflare/env.ts`.
The domain Worker module adapter runs fetch and queue Effect programs; the
single Effect-threaded domain runtime boundary lives in
`apps/domain/src/platform/cloudflare/runtime.ts`, where config, Hyperdrive, auth
queue scheduling, email binding delivery, and site geocoding are composed from
Cloudflare bindings. Alchemy imports are isolated to the app-owned resource
modules rather than request handlers or domain services. The fetch path
acquires the DB-backed web handler inside each Worker invocation so Hyperdrive
connections stay request-scoped; queues compose their email sender runtime per
batch.
The domain Worker is also configured with Better Auth env vars, MCP resource
metadata, optional MCP authorized-app cache sizing, Google Maps geocoding
credentials, observability logs, and traces.
Better Auth derives cross-subdomain cookies from the configured HTTPS app/API
origins for deployed Alchemy stages. Every stage, including `main`, defaults to
`app.<stage>.<zone>`, `api.<stage>.<zone>`, and `mcp.<stage>.<zone>`, so each stage can share auth
cookies only within its own `<stage>.<zone>` parent without relying on local
sandbox host aliases. Canonical
`app.<zone>`, `api.<zone>`, and `mcp.<zone>` hostnames require explicit
`CEIRD_APP_HOSTNAME`, `CEIRD_API_HOSTNAME`, and `CEIRD_MCP_HOSTNAME` overrides
after any existing Worker routes have been cut over intentionally; `.github/workflows/deploy-main.yml`
sets those overrides for Ceird's production `main` stage.
The app is configured with app/API origins, Cloudflare-specific Vite flags, and
Cloudflare observability logs and traces. Its API origin is derived from the API
Worker's reconciled Cloudflare domain output, with the configured API hostname
used as the fallback before the domain list is available, so the app Worker
tracks the API resource rather than reconstructing that origin independently.
The root Alchemy stack returns the same domain-derived origins as its operator
outputs for `app`, `api`, and `mcp`. The private domain Worker has no public
route and disables its workers.dev URL; public workers.dev URLs remain
underlying Cloudflare resource attributes for adapter Workers rather than the
primary deployment endpoints. It also returns the Neon branch name, Hyperdrive
name, Neon database name, and the `authEmailQueue` and
`authEmailDeadLetterQueue` names so operators and tests can inspect the runtime
resources without reconstructing stage-specific names.
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
before Hyperdrive reads the branch origin and before new domain code is uploaded.
That source is Alchemy `Drizzle.Schema`, which loads the domain schema barrel and
writes generated migration snapshots under `apps/domain/drizzle/alchemy`. The Neon
branch resource depends on that schema resource, then applies SQL from
`apps/domain/drizzle`, including historical package-local SQL files and future
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

| Variable                                     | Default         | Purpose                                                                                              |
| -------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `CEIRD_ZONE_NAME`                            | `ceird.app`     | Cloudflare zone.                                                                                     |
| `CEIRD_APP_HOSTNAME`                         | stage-scoped    | App hostname override.                                                                               |
| `CEIRD_API_HOSTNAME`                         | stage-scoped    | API hostname override.                                                                               |
| `CEIRD_MCP_HOSTNAME`                         | stage-scoped    | MCP hostname override.                                                                               |
| `CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES` | `512`           | Optional domain Worker MCP authorized-app cache entry limit.                                         |
| `CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS` | `1800`          | Optional domain Worker MCP authorized-app cache TTL.                                                 |
| `AUTH_EMAIL_FROM`                            | required        | Sender email address.                                                                                |
| `AUTH_EMAIL_FROM_NAME`                       | `Ceird`         | Sender display name.                                                                                 |
| `AUTH_RATE_LIMIT_ENABLED`                    | stage-dependent | Auth rate limiting flag; defaults to `false` for `pr-<number>` stages and `true` otherwise.          |
| `GOOGLE_MAPS_API_KEY`                        | required        | Google Maps Geocoding API key for deployed domain Worker.                                            |
| `CEIRD_HYPERDRIVE_NAME`                      | stage-dependent | Hyperdrive config name; the parent stage defaults to the adopted `ceird-production-postgres` config. |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT`   | `5`             | Soft maximum Hyperdrive origin database connections.                                                 |
| `CEIRD_NEON_DATABASE_NAME`                   | `ceird`         | Database created in the parent Neon project.                                                         |
| `CEIRD_NEON_DEFAULT_BRANCH_NAME`             | `base`          | Unmigrated default branch created with the Neon project.                                             |
| `CEIRD_NEON_HISTORY_RETENTION_SECONDS`       | `21600`         | Parent Neon project WAL history retention window.                                                    |
| `CEIRD_NEON_PARENT_BRANCH_PROTECTED`         | `false`         | Set to `true` to protect the parent branch when the Neon plan allows it.                             |
| `CEIRD_NEON_PARENT_BRANCH_NAME`              | `main`          | Parent branch used by non-parent stages.                                                             |
| `CEIRD_NEON_PARENT_STAGE`                    | `main`          | Stage that owns the shared Neon project and parent branch.                                           |
| `CEIRD_NEON_PG_VERSION`                      | `17`            | Neon Postgres major version.                                                                         |
| `CEIRD_NEON_REGION`                          | `aws-eu-west-2` | Neon project region.                                                                                 |
| `CEIRD_NEON_ROLE_NAME`                       | `ceird`         | Initial Neon database owner role.                                                                    |
| `NEON_API_KEY`                               | provider secret | Neon API key consumed by Alchemy's Neon provider.                                                    |
| `NEON_ORG_ID`                                | optional        | Neon organization ID for project creation.                                                           |

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
`Drizzle.Schema` at the root-owned `infra/domain-drizzle-schema.ts` wrapper. That
wrapper loads the domain schema barrel at `apps/domain/src/platform/database/schema.ts`
through the same TypeScript resolver Alchemy needs at deploy time. Its
`generatedMigrationsDir` is `apps/domain/drizzle/alchemy`, while its
`appliedMigrationsDir` is `apps/domain/drizzle`. Keeping those roles explicit lets
Alchemy regenerate future SQL before the Neon branch runs the recursive parent
migration tree that still contains the historical package-local SQL files.

## Pull Request Preview Infrastructure

Same-repository pull requests use persistent Alchemy preview stages named
`pr-<number>`. The preview workflow leaves the stage online across pushes so
Playwright can test the same Cloudflare app/API surfaces that reviewers use,
then destroys the stage when the PR closes. Deploy jobs run in the protected
`preview-deploy` GitHub environment; cleanup runs in an unblocked
`preview-cleanup` environment and also supports manual `workflow_dispatch`
cleanup by PR number. After app and API health checks pass, the deploy job
creates or updates one pull request comment with links to the stage-scoped app
and API URLs.

Both preview environments include the Cloudflare state-store credentials secret
so preview deploy and cleanup can use the existing state store directly instead
of re-running Alchemy's Cloudflare bootstrap flow.

Preview stages are ordinary non-parent stages. They use the default
stage-scoped hostnames (`app.pr-<number>.ceird.app` and
`api.pr-<number>.ceird.app`), stage-scoped Cloudflare resources, and a Neon
branch forked from the parent `main` branch through the existing
`PostgresProject.ref` model. The workflow reads the preview branch connection
URI from Alchemy `PostgresBranch` state for `PLAYWRIGHT_DATABASE_URL`; the value
is masked before it is exported to the Playwright step and is still omitted from
root stack outputs. After deploy, CI waits for both preview `/health` endpoints
and an API auth-session probe that forwards through the private domain Worker
before starting Playwright. This avoids transient route, domain, TLS, or service
binding propagation failures on freshly created preview hostnames. The domain
Worker disables auth rate limiting by default only for `pr-<number>` stages so
repeated E2E runs against the persistent preview database do not accumulate
lockout counters; set `AUTH_RATE_LIMIT_ENABLED=true` explicitly if a preview
needs to exercise production rate-limit behavior.

Fork pull requests do not run the secret-bearing preview jobs. They continue to
run the non-deploying build, lint, format, and typecheck jobs without
Cloudflare or Neon secrets.

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
