# Development Workflow

## Prerequisites

- Node.js 24 or newer.
- pnpm 10.34.3, as declared by `packageManager` in `package.json`.
- Cloudflare and Neon credentials for Alchemy-managed stages.
- jq.

Install dependencies from the repo root:

```bash
pnpm install
```

The root `postinstall` runs `pnpm opensrc:sync`, which refreshes the shared
dependency source cache at `${OPENSRC_HOME:-~/.opensrc}`. The cache is global
by default, so linked worktrees reuse fetched package sources without
worktree-local symlinks.

## Local Development Modes

### Root Dev

Use root dev for normal app/API development:

```bash
pnpm dev
```

Root dev delegates through `scripts/alchemy-dev.mjs`, which loads `.env.local`,
enables Cloudflare-backed Alchemy, and starts `alchemy dev`. In linked
worktrees the wrapper derives a branch stage such as `codex-my-task`; pass an
explicit stage when you want a different name:

```bash
pnpm dev -- --stage codex-my-task
```

Alchemy creates or updates the selected stage's Cloudflare Workers/Vite app,
Agent Worker, Hyperdrive config, queues, and Neon branch. Local Workerd serves
the running stack on dynamic loopback ports. The root wrapper layers Portless
aliases over those ports so browser-facing origins are predictable and
stage-scoped. For stage `codex-my-task`, use:

- `https://app.codex-my-task.ceird.localhost`
- `https://api.codex-my-task.ceird.localhost`
- `https://agent.codex-my-task.ceird.localhost`
- `https://mcp.codex-my-task.ceird.localhost`
- `https://sync.codex-my-task.ceird.localhost`

Portless is installed as a root dev dependency. If dependencies are not
installed or `PORTLESS=0` is set, Alchemy still starts for raw debugging, but
browser auth and cookies are only supported through the stage-scoped Portless
app URL.
The wrapper keeps Alchemy's confirmation prompt enabled by default. For a
known stage in a non-interactive workflow, pass `--yes` after the Alchemy args:

```bash
pnpm dev -- --stage codex-my-task --yes
```

Non-parent stages depend on the parent `main` stage because they fork Neon
branches from its shared project. If a worktree stage reports a missing
`PostgresProject` reference, plan or deploy `main` first:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --profile ceird-env --env-file .env.local --stage main
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --profile ceird-env --env-file .env.local --stage main
```

Use the Alchemy CLI directly when you need a non-dev reconciliation:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --profile ceird-env --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --profile ceird-env --env-file .env.local --stage codex-my-task
```

Destroy is intentionally explicit because it deletes cloud resources for that
stage.

Codex-managed worktrees copy ignored local env files listed in
`.worktreeinclude`, including `.env`, `.env.local`, and `.env.*.local`, before
the local environment setup runs. `scripts/setup-local-environment.sh` then
checks that `.env.local` is present before dependency installation so missing
credentials are explicit. The script uses the global `opensrc` cache at
`${OPENSRC_HOME:-~/.opensrc}` and then runs a normal
`pnpm install --frozen-lockfile`; the root `postinstall` refreshes the shared
cache and worktrees benefit from cache hits without linking `opensrc/`.

## Testing

Run all workspace tests and root script tests:

```bash
pnpm test
```

Run package tests directly when iterating:

```bash
pnpm --filter app test
pnpm --filter api test
pnpm --filter agent test
pnpm --filter domain test
pnpm --filter @ceird/agents-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/identity-core test
```

Domain integration tests that need Postgres skip cleanly during normal
`pnpm test` runs when no reachable test database is configured. Use the explicit
opt-in command when you want auth, HTTP, repository, migration, and
request-scoped actor coverage to run against a real database and fail if the
database cannot be reached:

```bash
pnpm test:domain:integration -- --stage codex-my-task
```

That command is read-only from Alchemy's perspective: it reads the selected
stage's `PostgresBranch` state, extracts the Neon connection URI without
printing it, sets `API_TEST_DATABASE_URL`, `AUTH_TEST_DATABASE_URL`, and
`TEST_DATABASE_URL` for the child test process, and enables strict test database
mode. It does not create, update, deploy, or destroy Alchemy resources. The
stage must already exist and have its domain migrations applied.

You can also point the same command at an explicit Postgres URL:

```bash
API_TEST_DATABASE_URL=postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require pnpm test:domain:integration
```

Pass extra Vitest filters after a second `--`:

```bash
pnpm test:domain:integration -- --stage codex-my-task -- -t organization
```

CI's Build workflow includes a separate required domain integration job that
starts a Postgres service and runs the same strict command. The ordinary
`pnpm --filter domain test` matrix entry is still allowed to skip
database-backed cases when no database URL is configured; the strict CI job is
the gate that proves those cases ran against Postgres.

Run Playwright E2E tests against an Alchemy stage:

```bash
pnpm dev -- --stage codex-my-task --yes
PLAYWRIGHT_BASE_URL=<alchemy-app-url> \
PLAYWRIGHT_API_URL=<alchemy-api-url> \
PLAYWRIGHT_DATABASE_URL=<alchemy-database-url> \
pnpm --filter app e2e
```

Prefer the app/API URLs emitted by Alchemy for the selected stage so auth
cookies and origin checks match the deployed surfaces. Some auth E2E tests also
read Better Auth verification tokens from Postgres; point
`PLAYWRIGHT_DATABASE_URL` at the same stage database when running the full E2E
suite.
For a local operator run after the stage has been deployed, read the direct
database URL from the Alchemy `PostgresBranch` state instead of adding it to
stack outputs:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy state get ceird <stage> PostgresBranch --env-file .env.local --stage <stage> \
  | jq -r '.attr.connectionUri.__redacted__ // .attr.connectionUri'
```

The connection URI is intentionally not returned as a stack output because
deploy outputs are printed into local and CI logs. Cloud E2E jobs read the
target stage's `PostgresBranch` state, mask the connection URI, and export it
only for the Playwright job.

For a package-local fallback that starts the app, API, domain, and migration
step from Playwright instead of targeting an existing Alchemy stage:

```bash
PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e
```

## Type Checking, Linting, And Formatting

Use these before handing off substantial changes:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm knip
pnpm format
```

`pnpm knip` runs the same dependency hygiene check used by CI. `pnpm check`
runs Ultracite over the workspace. `pnpm fix` applies Ultracite fixes.
`pnpm format:write` writes oxfmt formatting changes.

## Database Workflow

The private domain Worker owns the Drizzle schema and migrations:

- Schema barrel: `apps/domain/src/platform/database/schema.ts`
- Auth tables: `apps/domain/src/domains/identity/authentication/schema.ts`
- Agent tables: `apps/domain/src/domains/agents/schema.ts`
- Jobs tables: `apps/domain/src/domains/jobs/schema.ts`
- Migrations: `apps/domain/drizzle`
- Drizzle config: `apps/domain/drizzle.config.ts`

Use the package-local Drizzle CLI fallback when you intentionally need to create
or apply SQL outside the Alchemy stage workflow. Generate a package-local
migration after schema changes:

```bash
pnpm --filter domain db:generate
```

Apply package-local migrations to `DATABASE_URL`:

```bash
pnpm --filter domain db:migrate
```

The native Alchemy Neon branch resource applies checked-in domain SQL migrations
for each stage before Hyperdrive and the domain Worker are reconciled. Verify
schema changes with domain tests, then use an explicit non-production Alchemy stage
to validate the migration path when needed.

## Environment Variables

High-signal runtime variables:

| Variable                                   | Used by             | Purpose                                                                                                          |
| ------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | domain              | App database connection string for package-local Node runs.                                                      |
| `API_TEST_DATABASE_URL`                    | domain tests        | Base Postgres URL for domain integration tests.                                                                  |
| `AUTH_TEST_DATABASE_URL`                   | domain auth tests   | Optional auth-specific base Postgres URL for auth integration tests.                                             |
| `TEST_DATABASE_URL`                        | test helpers        | Shared fallback base Postgres URL for integration tests.                                                         |
| `CEIRD_REQUIRE_TEST_DATABASE`              | domain tests        | Forces database-backed integration tests to fail instead of skip when the database is unavailable.               |
| `BETTER_AUTH_BASE_URL`                     | domain, app helpers | Absolute Better Auth base URL, usually ending in `/api/auth`.                                                    |
| `BETTER_AUTH_SECRET`                       | domain              | Better Auth signing secret.                                                                                      |
| `AUTH_APP_ORIGIN`                          | domain              | Browser-visible app origin for redirects and auth email links.                                                   |
| `AUTH_EMAIL_FROM`                          | domain, infra       | Sender email address for auth emails.                                                                            |
| `AUTH_EMAIL_FROM_NAME`                     | domain, infra       | Sender display name.                                                                                             |
| `AUTH_RATE_LIMIT_ENABLED`                  | domain              | Enables or disables Better Auth database-backed rate limits.                                                     |
| `AGENT_ACTION_RUN_STALE_AFTER_SECONDS`     | domain              | Timeout before abandoned Agent action runs can be failed.                                                        |
| `AGENT_INTERNAL_SECRET`                    | domain, agent       | Internal shared secret for domain-owned Agent action calls.                                                      |
| `AGENT_MUTATION_TOOLS_ENABLED`             | agent               | Exact `true` in all Alchemy environments; write/destructive execution is browser-approval and Domain-auth gated. |
| `API_ORIGIN`                               | app                 | Server-side API origin.                                                                                          |
| `VITE_API_ORIGIN`                          | app                 | Browser-exposed API origin.                                                                                      |
| `PLAYWRIGHT_BASE_URL`                      | E2E                 | Existing Alchemy app stage URL for Playwright tests.                                                             |
| `PLAYWRIGHT_API_URL`                       | E2E                 | Existing Alchemy API stage URL for Playwright API requests.                                                      |
| `PLAYWRIGHT_DATABASE_URL`                  | E2E                 | Direct stage database URL for auth token handoff tests.                                                          |
| `ALCHEMY_STACK_NAME`                       | app, API, agent     | Alchemy-injected runtime stack name for Worker metadata.                                                         |
| `ALCHEMY_STAGE`                            | app, API, agent     | Alchemy-injected runtime stage for health checks and app config.                                                 |
| `GOOGLE_MAPS_API_KEY`                      | domain, infra       | Optional locally for live geocoding; required by deployed domain.                                                |
| `GOOGLE_MAPS_ROUTES_API_KEY`               | domain, infra       | Optional dedicated Google Routes key for route-aware proximity; falls back to `GOOGLE_MAPS_API_KEY`.             |
| `PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS`       | domain              | Optional local runtime TTL for typed-origin proof tokens; defaults to 15 minutes.                                |
| `CEIRD_PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS` | infra               | Optional deployed override that maps to the domain Worker runtime TTL.                                           |

Infrastructure deployment variables are documented in
[Local Development And Infrastructure](architecture/local-development-and-infra.md).
Local Alchemy provider auth uses `pnpm alchemy login`; CI supplies
`CLOUDFLARE_ACCOUNT_ID`, Cloudflare credentials, and state-store credentials as
GitHub secrets. All deploy and cleanup jobs use `CLOUDFLARE_API_KEY` plus
`CLOUDFLARE_EMAIL`; do not also store `CLOUDFLARE_API_TOKEN`.

When running an individual domain database integration file against a specific
database, set `API_TEST_DATABASE_URL`:

```bash
API_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5443/ceird pnpm --filter domain test -- src/domains/jobs/http.integration.test.ts
```

## Deployment

Infrastructure deployment is owned by the root Alchemy stack. The root `infra`
directory keeps typecheck and unit-test coverage for the stack helpers:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy dev --profile ceird-env --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --profile ceird-env --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --profile ceird-env --env-file .env.local --stage codex-my-task
pnpm run check-types:infra
pnpm run test:infra
```

The Alchemy stack provisions Cloudflare Hyperdrive backed by Neon Postgres,
Cloudflare Workers/Vite, Agent Durable Objects, Workers AI, auth email queues,
and native Neon branches that apply checked-in domain SQL migrations.
