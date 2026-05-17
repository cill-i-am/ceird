# Development Workflow

## Prerequisites

- Node.js 22 or newer.
- pnpm 9.15.9, as declared by `packageManager` in `package.json`.
- Cloudflare and Neon credentials for Alchemy-managed stages.

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

Root dev delegates to `pnpm alchemy dev`. Alchemy creates or updates the
selected stage's Cloudflare Workers/Vite app, Hyperdrive config, queues, routes,
and Neon branch. By default Alchemy chooses its normal dev stage. For linked
worktrees and agent tasks, set an explicit stage:

```bash
ALCHEMY_STAGE=codex-my-task pnpm dev
```

Use the root Alchemy wrapper directly when you need a non-dev reconciliation:

```bash
ALCHEMY_STAGE=codex-my-task pnpm alchemy deploy
ALCHEMY_STAGE=codex-my-task pnpm alchemy destroy
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
ALCHEMY_STAGE=codex-my-task pnpm dev
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
PLAYWRIGHT_BASE_URL=<alchemy-app-url> \
PLAYWRIGHT_API_URL=<alchemy-api-url> \
pnpm --filter app e2e
```

Prefer the app/API URLs emitted by Alchemy for the selected stage so auth
cookies and origin checks match the deployed surfaces. Some auth E2E tests also
read Better Auth verification tokens from Postgres; point
`PLAYWRIGHT_DATABASE_URL` at an appropriate test database only for those tests.

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

Generate a migration after schema changes:

```bash
pnpm --filter api db:generate
```

Apply migrations to the configured database:

```bash
pnpm --filter api db:migrate
```

The native Alchemy Neon branch resource applies checked-in API SQL migrations
for each stage before Hyperdrive and the API Worker are reconciled. Verify
schema changes with API tests, then use an explicit non-production Alchemy stage
to validate the migration path when needed.

## Environment Variables

High-signal runtime variables:

| Variable                  | Used by                 | Purpose                                                         |
| ------------------------- | ----------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`            | API                     | App database connection string for package-local Node runs.     |
| `API_TEST_DATABASE_URL`   | API tests               | Base Postgres URL for API integration tests.                    |
| `TEST_DATABASE_URL`       | test helpers            | Shared fallback base Postgres URL for integration tests.        |
| `BETTER_AUTH_BASE_URL`    | API, app server helpers | Absolute Better Auth base URL, usually ending in `/api/auth`.   |
| `BETTER_AUTH_SECRET`      | API                     | Better Auth signing secret.                                     |
| `AUTH_APP_ORIGIN`         | API                     | Browser-visible app origin for redirects and auth email links.  |
| `AUTH_EMAIL_FROM`         | API, infra              | Sender email address for auth emails.                           |
| `AUTH_EMAIL_FROM_NAME`    | API, infra              | Sender display name.                                            |
| `CLOUDFLARE_ACCOUNT_ID`   | API, infra              | Optional locally for real auth email delivery.                  |
| `CLOUDFLARE_API_TOKEN`    | API, infra              | Optional locally for real auth email delivery.                  |
| `AUTH_RATE_LIMIT_ENABLED` | API                     | Enables or disables Better Auth database-backed rate limits.    |
| `API_ORIGIN`              | app                     | Server-side API origin.                                         |
| `VITE_API_ORIGIN`         | app                     | Browser-exposed API origin.                                     |
| `ALCHEMY_STAGE`           | infra, app, API         | Stage identity for Alchemy state, resources, and health checks. |
| `GOOGLE_MAPS_API_KEY`     | API, infra              | Optional locally for live geocoding; required by deployed API.  |
| `CLOUDFLARE_ACCOUNT_ID`   | API, infra              | Required for Cloudflare API email transport.                    |
| `CLOUDFLARE_API_TOKEN`    | API, infra              | Required for Cloudflare API email transport.                    |

Infrastructure deployment variables are documented in
[Local Development And Infrastructure](architecture/sandbox-and-infra.md).

When running API database integration tests against a specific database, set
`API_TEST_DATABASE_URL`:

```bash
API_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5443/ceird pnpm --filter api test -- src/domains/jobs/http.integration.test.ts
```

## Deployment

Infrastructure deployment is owned by the root Alchemy stack, with helpers in
`packages/infra`:

```bash
pnpm alchemy dev
pnpm alchemy deploy
pnpm alchemy destroy
pnpm infra:check-types
```

The Alchemy stack provisions Cloudflare Hyperdrive backed by Neon Postgres,
Cloudflare Workers/Vite, auth email queues, and native Neon branches that apply
checked-in API SQL migrations.
