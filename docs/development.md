# Development Workflow

## Prerequisites

- Node.js 22 or newer.
- pnpm 9.15.9, as declared by `packageManager` in `package.json`.
- Cloudflare and Neon credentials for Alchemy-managed stages.
- jq.

Install dependencies from the repo root:

```bash
pnpm install
```

The root `postinstall` runs `pnpm opensrc:sync`, which refreshes the gitignored
dependency source cache under `opensrc/`.

## Local Development Modes

### Root Dev

Use root dev for normal app/API development:

```bash
pnpm dev
```

Root dev delegates to `alchemy dev --env-file .env.local`. Alchemy creates or
updates the selected stage's Cloudflare Workers/Vite app, Hyperdrive config,
queues, routes, and Neon branch. By default Alchemy chooses its normal dev
stage. For linked worktrees and agent tasks, pass an explicit stage through the
Alchemy CLI:

```bash
pnpm dev -- --stage codex-my-task
```

Non-parent stages depend on the parent `main` stage because they fork Neon
branches from its shared project. If a worktree stage reports a missing
`PostgresProject` reference, plan or deploy `main` first:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main
```

Use the Alchemy CLI directly when you need a non-dev reconciliation:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage codex-my-task
```

Destroy is intentionally explicit because it deletes cloud resources for that
stage.

Codex/local worktree setup runs `scripts/setup-local-environment.sh` before
development actions. The script preserves an existing `.env.local`, copies one
from `LOCAL_ENV_SOURCE` when supplied, and otherwise copies the `.env.local`
from the primary Git worktree for linked worktrees. If no source exists, setup
fails so missing credentials are explicit.

## Testing

Run all workspace tests and root script tests:

```bash
pnpm test
```

Run package tests directly when iterating:

```bash
pnpm --filter app test
pnpm --filter api test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/identity-core test
```

Run Playwright E2E tests against an Alchemy stage:

```bash
pnpm dev -- --stage codex-my-task
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
deploy outputs are printed into local and CI logs. CI should provide
`PLAYWRIGHT_DATABASE_URL` through the environment-scoped GitHub secret.

For a package-local fallback that starts the app, API, and migration step from
Playwright instead of targeting an existing Alchemy stage:

```bash
PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e
```

## Type Checking, Linting, And Formatting

Use these before handing off substantial changes:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

`pnpm check` runs Ultracite over the workspace. `pnpm fix` applies Ultracite
fixes. `pnpm format:write` writes oxfmt formatting changes.

## Database Workflow

The API owns the Drizzle schema and migrations:

- Schema barrel: `apps/api/src/platform/database/schema.ts`
- Auth tables: `apps/api/src/domains/identity/authentication/schema.ts`
- Jobs tables: `apps/api/src/domains/jobs/schema.ts`
- Migrations: `apps/api/drizzle`
- Drizzle config: `apps/api/drizzle.config.ts`

Use the package-local Drizzle CLI fallback when you intentionally need to create
or apply SQL outside the Alchemy stage workflow. Generate a package-local
migration after schema changes:

```bash
pnpm --filter api db:generate
```

Apply package-local migrations to `DATABASE_URL`:

```bash
pnpm --filter api db:migrate
```

The native Alchemy Neon branch resource applies checked-in API SQL migrations
for each stage before Hyperdrive and the API Worker are reconciled. Verify
schema changes with API tests, then use an explicit non-production Alchemy stage
to validate the migration path when needed.

## Environment Variables

High-signal runtime variables:

| Variable                  | Used by                 | Purpose                                                          |
| ------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`            | API                     | App database connection string for package-local Node runs.      |
| `API_TEST_DATABASE_URL`   | API tests               | Base Postgres URL for API integration tests.                     |
| `TEST_DATABASE_URL`       | test helpers            | Shared fallback base Postgres URL for integration tests.         |
| `BETTER_AUTH_BASE_URL`    | API, app server helpers | Absolute Better Auth base URL, usually ending in `/api/auth`.    |
| `BETTER_AUTH_SECRET`      | API                     | Better Auth signing secret.                                      |
| `AUTH_APP_ORIGIN`         | API                     | Browser-visible app origin for redirects and auth email links.   |
| `AUTH_EMAIL_FROM`         | API, infra              | Sender email address for auth emails.                            |
| `AUTH_EMAIL_FROM_NAME`    | API, infra              | Sender display name.                                             |
| `AUTH_RATE_LIMIT_ENABLED` | API                     | Enables or disables Better Auth database-backed rate limits.     |
| `API_ORIGIN`              | app                     | Server-side API origin.                                          |
| `VITE_API_ORIGIN`         | app                     | Browser-exposed API origin.                                      |
| `PLAYWRIGHT_BASE_URL`     | E2E                     | Existing Alchemy app stage URL for Playwright tests.             |
| `PLAYWRIGHT_API_URL`      | E2E                     | Existing Alchemy API stage URL for Playwright API requests.      |
| `PLAYWRIGHT_DATABASE_URL` | E2E                     | Direct stage database URL for auth token handoff tests.          |
| `ALCHEMY_STACK_NAME`      | app, API                | Alchemy-injected runtime stack name for Worker metadata.         |
| `ALCHEMY_STAGE`           | app, API                | Alchemy-injected runtime stage for health checks and app config. |
| `GOOGLE_MAPS_API_KEY`     | API, infra              | Optional locally for live geocoding; required by deployed API.   |

Infrastructure deployment variables are documented in
[Local Development And Infrastructure](architecture/local-development-and-infra.md).
Local Alchemy provider auth uses `pnpm alchemy login`; CI supplies
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets.

When running API database integration tests against a specific database, set
`API_TEST_DATABASE_URL`:

```bash
API_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5443/ceird pnpm --filter api test -- src/domains/jobs/http.integration.test.ts
```

## Deployment

Infrastructure deployment is owned by the root Alchemy stack. The root `infra`
directory keeps typecheck and unit-test coverage for the stack helpers:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy dev --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-my-task
CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage codex-my-task
pnpm run check-types:infra
pnpm run test:infra
```

The Alchemy stack provisions Cloudflare Hyperdrive backed by Neon Postgres,
Cloudflare Workers/Vite, auth email queues, and native Neon branches that apply
checked-in API SQL migrations.
