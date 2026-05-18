# Ceird

Ceird is a greenfield ceird for trades and construction teams. The
product gives small and medium-sized businesses a focused way to manage jobs,
sites, members, activity, and organization configuration without adopting a
generic project-management workflow.

The codebase is a TypeScript monorepo built with pnpm workspaces. It contains
a TanStack Start web app, an Effect HTTP API, shared runtime schema packages,
and Alchemy infrastructure for Cloudflare and Neon.

## Quick Start

Use Node.js 22 or newer, matching Alchemy v2's supported Node runtime.

Install dependencies:

```bash
pnpm install
```

Run the normal local development stack through a cloud-backed Alchemy stage:

```bash
pnpm dev
```

Pass `--stage <stage>` when you want an explicit stage name for a linked
worktree or agent task:

```bash
pnpm dev -- --stage codex-my-task
```

Alchemy creates or updates the stage-scoped Cloudflare Workers, app,
Hyperdrive, Neon branch, queues, and routes.

Non-parent stages depend on the parent `main` stage because they fork Neon
branches from its shared project. If a worktree stage reports a missing
`PostgresProject` reference, plan or deploy `main` first:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file .env.local --stage main
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage main
```

## Workspace Map

| Path                     | Purpose                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/app`               | TanStack Start React application, routes, authenticated shell, feature UI, hotkeys, and Playwright E2E tests.                              |
| `apps/api`               | Effect HTTP API, Better Auth integration, jobs/sites/labels domain services, Drizzle schema, migrations, and Cloudflare Worker entrypoint. |
| `packages/identity-core` | Shared organization and membership schemas, role helpers, and decoders.                                                                    |
| `packages/jobs-core`     | Shared jobs schemas, DTOs, job-owned IDs, rate-card contract, job assignment endpoints, and typed job errors.                              |
| `packages/sites-core`    | Shared site and service-area IDs, schemas, DTOs, API contract groups, and typed site/service-area errors.                                  |
| `packages/labels-core`   | Shared organization label IDs, schemas, DTOs, API contract, normalization helpers, and typed label errors.                                 |
| `infra`                  | Root Alchemy v2 implementation helpers for Cloudflare Workers/Vite, Queues, Hyperdrive, and Neon Postgres.                                 |
| `scripts`                | Root development helpers, opensrc sync, and local environment scripts.                                                                     |
| `docs`                   | Codebase guides, architecture notes, implementation plans, and design specs.                                                               |
| `opensrc`                | Gitignored dependency source cache for local agent context.                                                                                |

## Common Commands

| Command                         | What it does                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Runs `alchemy dev --env-file .env.local` for the default cloud-backed stage.                                          |
| `pnpm test`                     | Runs workspace package tests, root infra tests, and root script tests.                                                |
| `pnpm check-types`              | Runs TypeScript checks for all workspaces plus the root Alchemy stack helpers.                                        |
| `pnpm lint`                     | Runs oxlint over the workspace.                                                                                       |
| `pnpm check`                    | Runs the Ultracite quality check.                                                                                     |
| `pnpm format`                   | Checks formatting with oxfmt.                                                                                         |
| `pnpm format:write`             | Writes formatting changes with oxfmt.                                                                                 |
| `pnpm --filter app e2e`         | Runs Playwright E2E tests for the web app. Use explicit app/API stage URLs as needed.                                 |
| `pnpm --filter api db:generate` | Generates package-local Drizzle SQL for API schema changes.                                                           |
| `pnpm --filter api db:migrate`  | Applies package-local API migrations outside the Alchemy stage workflow.                                              |
| `pnpm alchemy dev`              | Runs the Alchemy CLI directly; for local cloud-backed runs, include `CEIRD_CLOUDFLARE=1` and `--env-file .env.local`. |
| `pnpm alchemy deploy`           | Deploys the root Alchemy stack; local deploys use `CEIRD_CLOUDFLARE=1` and an env file.                               |

## Documentation

Start with [docs/README.md](docs/README.md) for the full documentation index.
The highest-signal guides are:

- [Development Workflow](docs/development.md)
- [System Overview](docs/architecture/system-overview.md)
- [Frontend Architecture](docs/architecture/frontend.md)
- [API Architecture](docs/architecture/api.md)
- [Shared Packages](docs/architecture/packages.md)
- [Local Development And Infrastructure](docs/architecture/local-development-and-infra.md)
- [Authentication Architecture](docs/architecture/auth.md)
- [Jobs V1 Spec](docs/architecture/jobs-v1-spec.md)
- [Data Layer Architecture](docs/architecture/data-layer.md)

## Architecture Summary

The browser app uses TanStack Router file routes and TanStack Start server-only
helpers. Authentication is owned by the API through Better Auth, while the app
forwards cookies and proxy headers during server-side lookups. Jobs data moves
through Effect `HttpApi` contracts exported by `@ceird/jobs-core`,
`@ceird/sites-core`, and `@ceird/labels-core`, so frontend clients, API
handlers, DTOs, and HTTP error responses share the same runtime schema
boundaries.

The API keeps domain behavior in Effect services. The identity domain wires
Better Auth, organization membership, invitation preview, and auth email
delivery. The jobs domain owns job workflows, rate cards, job-label assignment,
contacts, and activity recording. Sites and organization labels have their own
API domains, services, repositories, schemas, and `HttpApi` contracts.

Local multi-service development and production infrastructure are both described
in Alchemy. Alchemy provisions Cloudflare Workers/Vite, Cloudflare Queues,
Hyperdrive, and Neon Postgres branches per stage.

## Quality Gates

For routine changes, run the narrowest relevant tests first, then finish with:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

For UI workflows that need real auth cookies or API calls, run the affected
Playwright tests against an explicit Alchemy stage:

```bash
pnpm dev -- --stage codex-my-task
PLAYWRIGHT_BASE_URL=<alchemy-app-url> \
PLAYWRIGHT_API_URL=<alchemy-api-url> \
PLAYWRIGHT_DATABASE_URL=<alchemy-database-url> \
pnpm --filter app e2e
```

For local runs, read `<alchemy-database-url>` from the selected stage's
`PostgresBranch` Alchemy state rather than from stack outputs, since deploy
outputs are logged.

For database changes, generate and inspect the package-local Drizzle migration
under `apps/api/drizzle`, then update/verify the Alchemy-generated migration
state under `apps/api/drizzle/alchemy` before running API and infra tests.

## Repository Conventions

- Prefer `Config` and `Schema` at environment, HTTP, persistence, and external
  integration boundaries.
- Keep shared DTOs and branded IDs in the relevant `*-core` package.
- Use the app hotkey layer for new keyboard-accessible UI actions.
- Use local dependency source under `opensrc/` when package behavior is unclear.
- Do not commit files from `opensrc/`.
- When a task is tied to a Linear issue, use the Linear issue title as the pull
  request title, including the issue key when present.
