# Development Workflow

## Prerequisites

- Node.js 18 or newer.
- pnpm 9.15.9, as declared by `packageManager` in `package.json`.
- Docker for sandbox development and Playwright E2E tests.
- Portless for stable local aliases. The sandbox falls back to loopback URLs
  when aliases are unavailable.

Install dependencies from the repo root:

```bash
pnpm install
```

The root `postinstall` runs `pnpm opensrc:sync`, which refreshes the gitignored
dependency source cache under `opensrc/`.

## Local Development Modes

### Root Dev

Use root dev for normal app/API development in the main worktree:

```bash
pnpm dev
```

The app package runs through `scripts/vite-portless-dev.mjs` and registers the
default app alias. The API package runs through `tsx watch src/index.ts` behind
Portless.

### Worktree Sandbox

Use the sandbox when developing from a linked git worktree or when a browser
workflow needs the app, API, and Postgres together:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

The sandbox command derives a name from the current worktree path unless
`--name` is supplied, allocates app/API/Postgres ports, starts Docker Compose,
applies API migrations, waits for health checks, persists a sandbox record, and
prints URLs.

Useful commands:

```bash
pnpm sandbox:status
pnpm sandbox:list
pnpm sandbox:logs -- --service app
pnpm sandbox:logs -- --service api
pnpm sandbox:logs -- --service postgres
pnpm sandbox:down
```

The sandbox reads required shared environment from `.env`, `.env.local`, and
the process environment. Missing required keys are reported before Docker
startup. Optional Cloudflare auth email credentials are only used when the
configured transport needs them.

## Testing

Run all workspace tests and root script tests:

```bash
pnpm test
```

Run package tests directly when iterating:

```bash
pnpm --filter app test
pnpm --filter api test
pnpm --filter @task-tracker/jobs-core test
pnpm --filter @task-tracker/identity-core test
pnpm --filter @task-tracker/sandbox-core test
pnpm --filter @task-tracker/sandbox-cli test
```

Run Playwright E2E tests against the sandbox:

```bash
pnpm sandbox:up
pnpm --filter app e2e
```

The sandbox and Playwright web server set `AUTH_RATE_LIMIT_ENABLED=false` for
automation so repeated auth tests do not lock themselves out while still using
the real Better Auth browser workflow.

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

The sandbox applies API migrations during `pnpm sandbox:up`, so use the sandbox
to verify that migrations work from a clean service startup.

## Environment Variables

High-signal runtime variables:

| Variable                  | Used by                 | Purpose                                                        |
| ------------------------- | ----------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`            | API, sandbox            | App database connection string.                                |
| `BETTER_AUTH_BASE_URL`    | API, app server helpers | Absolute Better Auth base URL, usually ending in `/api/auth`.  |
| `BETTER_AUTH_SECRET`      | API                     | Better Auth signing secret.                                    |
| `AUTH_APP_ORIGIN`         | API                     | Browser-visible app origin for redirects and auth email links. |
| `AUTH_EMAIL_TRANSPORT`    | API, infra              | `noop`, `cloudflare-api`, or `cloudflare-binding`.             |
| `AUTH_EMAIL_FROM`         | API, infra              | Sender email address for auth emails.                          |
| `AUTH_EMAIL_FROM_NAME`    | API, infra              | Sender display name.                                           |
| `AUTH_RATE_LIMIT_ENABLED` | API                     | Enables or disables Better Auth database-backed rate limits.   |
| `API_ORIGIN`              | app                     | Server-side API origin.                                        |
| `VITE_API_ORIGIN`         | app                     | Browser-exposed API origin.                                    |
| `SITE_GEOCODER_MODE`      | API sandbox             | Selects site geocoding behavior.                               |
| `CLOUDFLARE_ACCOUNT_ID`   | API, infra              | Required for Cloudflare API email transport.                   |
| `CLOUDFLARE_API_TOKEN`    | API, infra              | Required for Cloudflare API email transport.                   |

Infrastructure deployment variables are documented in
[Sandbox And Infrastructure](architecture/sandbox-and-infra.md).

## Deployment

Infrastructure deployment is owned by `packages/infra` and wrapped by root
scripts:

```bash
pnpm infra:check-types
pnpm infra:deploy
pnpm infra:destroy
```

The Alchemy stack provisions PlanetScale Postgres, Cloudflare Hyperdrive,
Cloudflare Workers/Vite, and auth email queues. Set `APPLY_MIGRATIONS=true` or
`TASK_TRACKER_APPLY_MIGRATIONS=true` when the deploy should run Drizzle
migrations through the infra stack.
