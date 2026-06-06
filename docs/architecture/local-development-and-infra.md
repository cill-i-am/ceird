# Local Development And Infrastructure

## Alchemy-Native Local Development

Local development uses the same root Alchemy stack as deployment. Root
`pnpm dev` runs `scripts/alchemy-dev.mjs`, which loads `.env.local`, selects
the Alchemy profile `ceird-env`, enables Cloudflare-backed Alchemy, derives a
branch stage for linked worktrees, and starts `alchemy dev`. The selected stage
creates or updates Cloudflare Workers/Vite, the Agent Worker, the sync Worker,
the Electric SQL Cloudflare Container, Hyperdrive, queues, routes, and a Neon
branch.

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

Before starting a provider-backed worktree for the first time, run:

```bash
pnpm alchemy:doctor -- --stage codex-my-task
```

The doctor is read-only. It checks stage derivation, the env file, required
provider variables, the Node runtime, and the audited Alchemy package version
before any `alchemy dev`, `deploy`, or `destroy` command can mutate providers.

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

In local dev, Alchemy's Workerd proxy owns the browser-facing URLs. Stack
outputs and app env origins use local proxy URLs such as
`http://app.localhost:1337`, `http://api.localhost:1337`,
`http://agent.localhost:1337`, and `http://mcp.localhost:1337` when the local
provider supplies them; deployed stages still output HTTPS origins from the
reconciled Cloudflare Worker domains.
The wrapper keeps Alchemy's confirmation prompt enabled by default. Use
`pnpm dev -- --stage <stage> --yes` only for an intentional non-interactive run
against a known stage.

The Alchemy stack and stage are the identities for state, resource names,
Worker health payloads, and Neon branches. Use the `--stage` CLI flag to choose
the stage; `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` are injected into app/API
runtimes after Alchemy resolves the stack and stage. Worker health endpoints
return those values as `stackName` and `stage`, falling back to `local` in
package-local Node runs. The root stack outputs `app`, `api`, `mcp`, `agent`,
and `sync` as stage HTTPS origins derived from the reconciled Cloudflare Worker
domains, with the configured hostnames as pre-resolution fallbacks. Canonical
domain cutover is an explicit `CEIRD_APP_HOSTNAME` / `CEIRD_API_HOSTNAME` /
`CEIRD_MCP_HOSTNAME` / `CEIRD_AGENT_HOSTNAME` / `CEIRD_SYNC_HOSTNAME` override
so a parent-stage deploy cannot accidentally take over a hostname owned by
another Worker. Use the Alchemy CLI directly for explicit deploy and destroy
operations:

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

| Variable                                            | Purpose                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ALCHEMY_STACK_NAME`                                | Alchemy-injected runtime stack name for Worker metadata.                                                         |
| `ALCHEMY_STAGE`                                     | Alchemy-injected runtime stage for Worker health checks.                                                         |
| `AUTH_APP_ORIGIN`                                   | Browser app origin used by auth redirects and emails.                                                            |
| `AUTH_COOKIE_DOMAIN`                                | Optional parent domain for sharing auth cookies across system and tenant hosts.                                  |
| `AUTH_COOKIE_PREFIX`                                | Optional Better Auth cookie prefix, usually stage-derived in Alchemy.                                            |
| `AUTH_CAPTCHA_ENABLED`                              | Enables Cloudflare Turnstile for selected Better Auth public auth endpoints.                                     |
| `AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE`             | Optional strict loopback or `.localhost` Turnstile verify endpoint override for tests or local stubs.            |
| `AUTH_CAPTCHA_TURNSTILE_SECRET_KEY`                 | Domain-only Turnstile secret key used by Better Auth's captcha plugin.                                           |
| `AUTH_EMAIL_FROM`                                   | Sender address for auth emails.                                                                                  |
| `AUTH_EMAIL_FROM_NAME`                              | Sender display name.                                                                                             |
| `AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED`            | Optional password compromise check override; local Alchemy Workers default it to `false`.                        |
| `AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE` | Optional strict loopback or `.localhost` HIBP range API override for deterministic local verification.           |
| `AUTH_RATE_LIMIT_ENABLED`                           | Disables auth rate limiting for local, PR-preview, and ephemeral CI E2E.                                         |
| `AUTH_TRUSTED_ORIGINS`                              | Optional comma-delimited auth CORS/trusted-origin additions, including tenant hosts.                             |
| `BETTER_AUTH_BASE_URL`                              | API auth URL.                                                                                                    |
| `BETTER_AUTH_SECRET`                                | Stable local auth secret for package-local domain runs.                                                          |
| `BETTER_AUTH_SECRETS`                               | Optional versioned Better Auth rotation secrets as comma-delimited `<version>:<secret>` entries.                 |
| `DATABASE_URL`                                      | Package-local domain database URL.                                                                               |
| `GOOGLE_MAPS_API_KEY`                               | Optional local Google Places key for site autocomplete/place details and fallback key for route-aware proximity. |
| `GOOGLE_MAPS_ROUTES_API_KEY`                        | Optional dedicated Google Routes key for route-aware proximity; falls back to `GOOGLE_MAPS_API_KEY` when absent. |
| `AGENT_ACTION_RUN_STALE_AFTER_SECONDS`              | Agent action ledger stale-running recovery window.                                                               |
| `AGENT_INTERNAL_SECRET`                             | Internal domain/Agent shared secret for package-local runs.                                                      |
| `AGENT_AI_GATEWAY_ID`                               | Alchemy-managed Cloudflare AI Gateway ID used by the Agent Worker model provider.                                |
| `AGENT_ORIGIN`                                      | Server-side app Agent Worker origin.                                                                             |
| `VITE_AGENT_ORIGIN`                                 | Browser-exposed Agent Worker origin used by the global chat client.                                              |
| `AGENT_MUTATION_TOOLS_ENABLED`                      | Enables write/destructive Agent tools when a confirmation-capable client is present.                             |
| `SYNC_ORIGIN`                                       | Server-side app sync Worker origin.                                                                              |
| `VITE_SYNC_ORIGIN`                                  | Browser-exposed sync Worker origin reserved for Electric/TanStack DB clients.                                    |
| `VITE_AUTH_CAPTCHA_ENABLED`                         | Browser flag mirroring `AUTH_CAPTCHA_ENABLED` for selected auth forms.                                           |
| `VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY`              | Public Turnstile site key exposed only to the app Worker/browser.                                                |
| `ELECTRIC_SQL_LOCATION_HINT`                        | Cloudflare Durable Object placement hint derived from the stage Neon region.                                     |
| `ELECTRIC_SOURCE_SECRET`                            | Sync Worker and Electric shared source secret, generated by Alchemy for deployed stages.                         |
| `CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID`              | Electric R2 S3 access key consumed by non-local app-stack deploys.                                               |
| `CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY`          | Electric R2 S3 secret key consumed by non-local app-stack deploys.                                               |
| `CEIRD_ELECTRIC_STORAGE_BACKEND`                    | Container storage backend selector; deployed Alchemy stages set this to `r2`.                                    |
| `CEIRD_ELECTRIC_STORAGE_MOUNT`                      | Electric container mount path for R2-backed shape storage; defaults to `/var/lib/electric`.                      |
| `CEIRD_SYNC_HOSTNAME`                               | Optional stage sync hostname override.                                                                           |
| `CEIRD_ELECTRIC_CONTAINER_INSTANCE_TYPE`            | Cloudflare Container size; defaults to `dev` outside production and `basic` for the parent stage.                |
| `CEIRD_WORKER_ANALYTICS_SAMPLE_RATE`                | Analytics Engine sample rate shared by app-owned Workers; defaults to `0.1`.                                     |

Package-local domain runs use deterministic development auth email delivery. That
local transport is separate from deployed Worker email delivery, which uses the
Cloudflare Email Worker binding declared by the Alchemy stack.
The Google Maps key is optional for package-local domain startup; when it is
missing or blank, the domain uses deterministic development location
autocomplete and place details. Route-aware proximity reads
`GOOGLE_MAPS_ROUTES_API_KEY` lazily when a route computation is requested and
otherwise falls back to `GOOGLE_MAPS_API_KEY`; missing route configuration does
not block unrelated local API startup, but route endpoints fail with a typed
provider error until a key is supplied.

Package-local Playwright runs set `AGENT_INTERNAL_SECRET` so the domain app can
mount its Agent HTTP groups even when a test begins with auth or product
routes. They also pass `AGENT_ORIGIN` and `VITE_AGENT_ORIGIN`; by default
`PLAYWRIGHT_AGENT_URL` falls back to the package-local app origin so Agent HTTP
and WebSocket paths can be mocked in focused app E2E tests without starting a
separate Agent Worker process.

Electric SQL local development follows the Alchemy-native path. Running
`pnpm dev -- --stage <stage>` reconciles the stage sync Worker and Cloudflare
Container, injects `VITE_SYNC_ORIGIN` into the app, points Electric at the
stage Neon branch, and provisions the stage R2 bucket used for Electric's FUSE
storage mount. Local Alchemy dev stages also create a stage-scoped R2 API token
for the container. Deployed stages consume the
`CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID` and
`CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY` secrets created by the separate
GitHub credential stack, keeping routine app deploy credentials out of API token
management. Pull-request previews and push-to-main cloud E2E stages receive the
same Electric storage secret names through their protected GitHub environments,
so they reconcile the Sync Worker, Electric Container, and stage-scoped R2 bucket
before E2E runs. The app stack passes those credential values, the Neon branch
URL, and the generated Electric source secret into the Sync Worker as secrets;
the `ElectricSql` Durable Object supplies them to the Cloudflare Container as
startup environment variables when it starts Electric.
Deployed stages fail closed when Electric storage secrets are absent.

There is no separate local Docker service in the default workflow; local
cloud-backed stages exercise the same Worker, Durable Object, Container, R2,
and Neon resources as production with stage-scoped names.
Package-local sync tests inject fake domain authorization and Electric
forwarding boundaries, while end-to-end sync testing should target an explicit
Alchemy stage sync origin. Non-production stages default the Cloudflare
Container to the `dev` instance type; override
`CEIRD_ELECTRIC_CONTAINER_INSTANCE_TYPE` only when a stage needs a larger
container.
The app's current route-scoped TanStack DB collections still use the existing
query-backed adapters; local Electric client work should target the injected
`VITE_SYNC_ORIGIN` after the app installs `@tanstack/electric-db-collection`.

## Production Infrastructure

The repo root orchestrates infrastructure with Alchemy v2. The stack entrypoint
is `alchemy.run.ts`; shared stage, Neon, Hyperdrive, queue, and output helpers
stay in `infra`, while each deployable app owns its Cloudflare Worker/Vite
resource declaration under `apps/*/infra`.

The stack provisions:

- native Alchemy Neon project and per-stage branch
- native Alchemy Cloudflare Hyperdrive for Postgres connectivity
- native Alchemy Cloudflare R2 bucket for Electric shape storage; local dev
  stages mint their own bucket-scoped token, while CI/deployed stages consume
  Electric R2 credentials from GitHub environment secrets managed by the
  separate credential stack; the Sync Worker injects runtime container secrets
  through Durable Object container startup environment variables
- private Cloudflare domain Worker declared in
  `apps/domain/infra/cloudflare-worker.ts` and executed from
  `apps/domain/src/worker.ts`
- public Cloudflare API Worker declared in
  `apps/api/infra/cloudflare-worker.ts` and executed from
  `apps/api/src/worker.ts`
- public Cloudflare MCP Worker declared in
  `apps/mcp/infra/cloudflare-worker.ts` and executed from
  `apps/mcp/src/worker.ts`
- public Cloudflare Agent Worker declared in
  `apps/agent/infra/cloudflare-worker.ts` and executed from
  `apps/agent/src/worker.ts`
- public Cloudflare sync Worker and Electric SQL Cloudflare Container declared
  in `apps/sync/infra/cloudflare-worker.ts` and executed from
  `apps/sync/src/worker.ts`
- Cloudflare Vite app declared in `apps/app/infra/cloudflare-vite.ts`
- Cloudflare Queue for auth email
- Cloudflare dead-letter queue for auth email failures
- Cloudflare Email Worker binding for deployed auth email delivery

Alchemy local Workerd does not support every deployed provider binding. In
local dev, the domain Worker omits `AUTH_EMAIL`, `AUTH_EMAIL_QUEUE`, and the
Hyperdrive binding, injects the selected Neon branch connection URI as a
redacted Worker `DATABASE_URL` env value, and uses the domain's deterministic
email scheduler instead of the Cloudflare Queue consumer. Deployed stages keep
Hyperdrive, Queue, and Email Worker bindings.

Local Vite app Workers are not deployed edge scripts, so local dev also skips
tenant wildcard DNS, tenant Worker routes, reserved host bypass routes, and the
auth-email queue consumer. Deploy and preview stages reconcile those resources.

The Agent Worker uses shared Worker trace/log settings, but disables
Cloudflare invocation URL logging while the query-token fallback exists. It
binds native Workers AI through an Alchemy-managed Cloudflare AI Gateway with
gateway authentication enabled and prompt-log collection disabled. Browser
clients should prefer bearer connect tokens; when the query-token fallback is
used, the Agent Worker strips it before routing into the
Agents SDK runtime. Its browser CORS allowlist is derived from the neutral app
origin plus the tenant wildcard origin pattern, so Agent SDK HTTP/WebSocket
traffic continues to work after an authenticated user is redirected onto an
organization tenant host.

The Agent Worker bundle currently depends on packages that ship only a
`main` entry even though the Alchemy Cloudflare Rolldown plugin resolves Worker
bundles through Worker/browser/module fields. Root `pnpm.patchedDependencies`
adds `module` metadata for those packages so CI/deploy bundles include them
instead of emitting unresolved bare Worker imports.
The `agents` package also hard-imports `cloudflare:email` from its root export;
root `pnpm.patchedDependencies` removes that eager import because Ceird does
not route inbound Agent email and local Workerd cannot provide the email module.

The domain, API, MCP, Agent, sync, and Cloudflare Vite app share the same typed
Worker compatibility contract, including `nodejs_compat`, so runtime packages
that rely on Node.js compatibility APIs run consistently across deployable
surfaces.
The private domain Worker declares the runtime resources that own state:
`DATABASE` is the native Hyperdrive resource, `AUTH_EMAIL_QUEUE` is the native
Queue resource, and `AUTH_EMAIL` is the Cloudflare Email Worker binding
descriptor. Public API and MCP Workers declare only the `DOMAIN` service binding
to that private Worker. The public Agent Worker declares `DOMAIN`, Workers AI,
and its `CeirdAgent` Durable Object namespace in its app-owned infra module.
All app-owned Workers also receive the native Analytics Engine binding
`ANALYTICS`; request data points are sampled by
`CEIRD_WORKER_ANALYTICS_SAMPLE_RATE`, which defaults to `0.1`, and recorded
through the Effect-native `WorkerObservability` service.
The public sync Worker declares `DOMAIN` plus the `ElectricSql` Durable Object
namespace, and its Alchemy module also declares the Cloudflare Container that
runs Electric SQL. The root stack declares the stage R2 bucket that the
container mounts at `/var/lib/electric` before Electric starts. Local dev stages
mint a bucket-scoped token in the app stack; CI and deployed stages consume
Electric R2 S3 credentials from the GitHub credential stack. The root stack also
derives the `ElectricSql` Durable Object placement hint from the Neon region.
The private domain Worker is additionally configured with Cloudflare Smart
Placement because it is the only Worker that owns database access through
Hyperdrive. Infra tests compare the app-owned binding/env declarations against
the runtime contracts in each app's `src/platform/cloudflare/env.ts`.
The domain Worker module adapter runs fetch and queue Effect programs; the
single Effect-threaded domain runtime boundary lives in
`apps/domain/src/platform/cloudflare/runtime.ts`, where config, Hyperdrive, auth
queue scheduling, email binding delivery, and Google Places site location
resolution are composed from Cloudflare bindings. Alchemy imports are isolated to the app-owned resource
modules rather than request handlers or domain services. The fetch path
acquires the DB-backed web handler inside each Worker invocation so Hyperdrive
connections stay request-scoped; queues compose their email sender runtime per
batch.
The domain and Agent Workers are also configured with trusted app-origin env
vars; the domain Worker additionally receives Better Auth env vars, MCP
resource metadata, optional MCP authorized-app cache sizing, Google Maps Places
credentials, observability logs, and traces. Alchemy injects
`AUTH_TRUSTED_ORIGINS` from the system app origin plus the tenant wildcard
origin pattern, while keeping `AUTH_APP_ORIGIN` as the neutral system app origin
for redirects and emails. Every stage, including `main`, defaults to
`app.<stage>.<zone>`, `api.<stage>.<zone>`, `mcp.<stage>.<zone>`,
`agent.<stage>.<zone>`, and `sync.<stage>.<zone>`. Deployed Alchemy stages inject
`AUTH_COOKIE_DOMAIN` from the tenant base domain so system and tenant hosts
share a session after organization creation or switching, while preview and
branch stages rely on the stage-derived `AUTH_COOKIE_PREFIX` to prevent
accepting another stage's session cookies under the shared apex.
Canonical `app.<zone>`, `api.<zone>`, `mcp.<zone>`, `agent.<zone>`, and
`sync.<zone>` hostnames require explicit `CEIRD_APP_HOSTNAME`,
`CEIRD_API_HOSTNAME`, `CEIRD_MCP_HOSTNAME`, `CEIRD_AGENT_HOSTNAME`, and
`CEIRD_SYNC_HOSTNAME` overrides after any existing Worker routes have been cut
over intentionally; `.github/workflows/deploy-main.yml` sets production
overrides for Ceird's `main` stage.
The app is configured with app/API/Agent/sync origins, Cloudflare-specific Vite
flags, and Cloudflare observability logs and traces. Its API, Agent, and sync
origins are derived from the reconciled Cloudflare domain outputs, with the
configured hostnames used as fallbacks before the domain lists are available,
so the app Worker tracks those resources rather than reconstructing origins
independently.
The root Alchemy stack returns the same domain-derived origins as its operator
outputs for `app`, `api`, `mcp`, `agent`, and `sync`. The private domain Worker
has no public route and disables its workers.dev URL; public workers.dev URLs remain
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
writes generated migration snapshots under `apps/domain/drizzle-alchemy`. The Neon
branch resource depends on that schema resource, then applies SQL from the
stage-specific `appliedMigrationsDir`. Parent stages use the full
`apps/domain/drizzle` bootstrap tree. Child stages fork from the parent and apply
only `apps/domain/drizzle-alchemy`, avoiding a replay of historical package-local
SQL files that already exist on the forked branch.
The checked-in Alchemy baseline must describe the currently deployed parent
stage, not feature-branch schema that has not reached the parent yet. When a
feature branch adds package-local migrations, check in the matching child-stage
SQL under `apps/domain/drizzle-alchemy` with the same migration directory name.
That lets current child branches apply the delta and later branches skip it once
the parent has the same `neon_migrations` record.
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

| Variable                                            | Default         | Purpose                                                                                                                                                                                       |
| --------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CEIRD_ZONE_NAME`                                   | `ceird.app`     | Cloudflare zone.                                                                                                                                                                              |
| `CEIRD_APP_HOSTNAME`                                | stage-scoped    | App hostname override.                                                                                                                                                                        |
| `CEIRD_API_HOSTNAME`                                | stage-scoped    | API hostname override.                                                                                                                                                                        |
| `CEIRD_AGENT_HOSTNAME`                              | stage-scoped    | Agent hostname override.                                                                                                                                                                      |
| `CEIRD_MCP_HOSTNAME`                                | stage-scoped    | MCP hostname override.                                                                                                                                                                        |
| `CEIRD_SYNC_HOSTNAME`                               | stage-scoped    | Sync hostname override.                                                                                                                                                                       |
| `CEIRD_ELECTRIC_CONTAINER_INSTANCE_TYPE`            | stage-dependent | Cloudflare Container instance type; defaults to `basic` for the parent stage and `dev` otherwise.                                                                                             |
| `CEIRD_WORKER_ANALYTICS_SAMPLE_RATE`                | `0.1`           | Shared Analytics Engine sample rate for app-owned Workers.                                                                                                                                    |
| `CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES`        | `512`           | Optional domain Worker MCP authorized-app cache entry limit.                                                                                                                                  |
| `CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS`        | `1800`          | Optional domain Worker MCP authorized-app cache TTL.                                                                                                                                          |
| `AUTH_CAPTCHA_ENABLED`                              | unset           | Enables Cloudflare Turnstile on selected Better Auth public auth endpoints. When `true`, both the Turnstile secret and site key must be configured.                                           |
| `AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE`             | unset           | Optional strict loopback or `.localhost` Turnstile verify endpoint override for deterministic tests or local provider stubs. Production should use Better Auth's default Cloudflare verifier. |
| `AUTH_CAPTCHA_TURNSTILE_SECRET_KEY`                 | unset           | Redacted Turnstile secret passed only to the domain Worker for Better Auth captcha verification.                                                                                              |
| `AUTH_CAPTCHA_TURNSTILE_SITE_KEY`                   | unset           | Public Turnstile site key used to emit `VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY` to the app Worker when captcha is enabled.                                                                      |
| `AUTH_EMAIL_FROM`                                   | required        | Sender email address.                                                                                                                                                                         |
| `AUTH_EMAIL_FROM_NAME`                              | `Ceird`         | Sender display name.                                                                                                                                                                          |
| `AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED`            | unset           | Optional password compromise check override; domain config enables the check by default unless `CEIRD_LOCAL_DEV=true` or the auth base URL is strict loopback or `.localhost`.                |
| `AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE` | unset           | Optional strict loopback or `.localhost` HIBP range API override for deterministic local verification. Production should use the default HIBP provider.                                       |
| `AUTH_RATE_LIMIT_ENABLED`                           | stage-dependent | Auth rate limiting flag; defaults to `false` for `pr-<number>` stages and `true` otherwise. CI also overrides it to `false` for `ci-<run>-<attempt>` stages.                                  |
| `BETTER_AUTH_SECRETS`                               | unset           | Optional redacted Better Auth rotation material formatted as comma-delimited `<version>:<secret>` entries.                                                                                    |
| `GOOGLE_MAPS_API_KEY`                               | required        | Google Maps key for deployed domain Worker Places/location lookup and fallback route-aware proximity calls.                                                                                   |
| `GOOGLE_MAPS_ROUTES_API_KEY`                        | optional        | Dedicated Google Routes key for deployed route-aware proximity calls; falls back to `GOOGLE_MAPS_API_KEY` when absent.                                                                        |
| `CEIRD_HYPERDRIVE_NAME`                             | stage-dependent | Hyperdrive config name; the parent stage defaults to the adopted `ceird-production-postgres` config.                                                                                          |
| `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT`          | `5`             | Soft maximum Hyperdrive origin database connections.                                                                                                                                          |
| `CEIRD_NEON_DATABASE_NAME`                          | `ceird`         | Database created in the parent Neon project.                                                                                                                                                  |
| `CEIRD_NEON_DEFAULT_BRANCH_NAME`                    | `base`          | Unmigrated default branch created with the Neon project.                                                                                                                                      |
| `CEIRD_NEON_HISTORY_RETENTION_SECONDS`              | `21600`         | Parent Neon project WAL history retention window.                                                                                                                                             |
| `CEIRD_NEON_PARENT_BRANCH_PROTECTED`                | `false`         | Set to `true` to protect the parent branch when the Neon plan allows it.                                                                                                                      |
| `CEIRD_NEON_PARENT_BRANCH_NAME`                     | `main`          | Parent branch used by non-parent stages.                                                                                                                                                      |
| `CEIRD_NEON_PARENT_STAGE`                           | `main`          | Stage that owns the shared Neon project and parent branch.                                                                                                                                    |
| `CEIRD_NEON_PG_VERSION`                             | `17`            | Neon Postgres major version.                                                                                                                                                                  |
| `CEIRD_NEON_REGION`                                 | `aws-eu-west-2` | Neon project region.                                                                                                                                                                          |
| `CEIRD_NEON_ROLE_NAME`                              | `ceird`         | Initial Neon database owner role.                                                                                                                                                             |
| `NEON_API_KEY`                                      | provider secret | Neon API key consumed by Alchemy's Neon provider.                                                                                                                                             |
| `NEON_ORG_ID`                                       | optional        | Neon organization ID for project creation.                                                                                                                                                    |

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
`generatedMigrationsDir` is always `apps/domain/drizzle-alchemy`. Parent stages
use `apps/domain/drizzle` as `appliedMigrationsDir` for bootstrap coverage;
child stages use `apps/domain/drizzle-alchemy` as `appliedMigrationsDir` because
they inherit the historical schema from the parent branch.

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

Main and both preview environments include the Cloudflare state-store
credentials secret so deploy, audit, and cleanup jobs can use the existing state
store directly instead of re-running Alchemy's Cloudflare bootstrap flow.

Preview stages are ordinary non-parent stages. They use the default
stage-scoped hostnames (`app.pr-<number>.ceird.app`,
`api.pr-<number>.ceird.app`, `mcp.pr-<number>.ceird.app`,
`agent.pr-<number>.ceird.app`, and `sync.pr-<number>.ceird.app`),
stage-scoped Cloudflare resources, and a Neon branch forked from the parent
`main` branch through the existing
`PostgresProject.ref` model. The workflow reads the preview branch connection
URI from Alchemy `PostgresBranch` state for `PLAYWRIGHT_DATABASE_URL`; the value
is masked before it is exported to the Playwright step and is still omitted from
root stack outputs. Preview Playwright targets the reconciled Agent Worker with
`PLAYWRIGHT_AGENT_URL` and exposes `PLAYWRIGHT_SYNC_URL` for sync-aware tests.
After deploy, CI waits for the app, API, Agent, and Sync preview `/health`
endpoints, an unauthenticated Sync authorization probe that should return `401`,
and an API auth-session probe that forwards through the private domain Worker
before starting Playwright. This avoids transient route, domain, TLS, or service
binding propagation failures on freshly created preview hostnames. The domain Worker
disables auth rate limiting by default only for `pr-<number>` stages so repeated
E2E runs against the persistent preview database do not accumulate lockout
counters; set `AUTH_RATE_LIMIT_ENABLED=true` explicitly if a preview needs to
exercise production rate-limit behavior.

Fork pull requests do not run the secret-bearing preview jobs. They continue to
run the non-deploying build, lint, format, and typecheck jobs without
Cloudflare or Neon secrets.

Pushes to `main` run a separate ephemeral cloud E2E stage named
`ci-<run-number>-<attempt>` from the `Build` workflow. That workflow overrides
the default nested stage hostnames with first-level `ceird.app` labels such as
`app-ci-123-1.ceird.app` and `api-ci-123-1.ceird.app`, reads the stage database
URI from Alchemy state for Playwright, disables auth rate limiting for the
temporary stage, and destroys the stage after the E2E shards finish.

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
