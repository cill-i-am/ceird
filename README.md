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

Set `ALCHEMY_STAGE=<stage>` when you want an explicit stage name for a linked
worktree or agent task. Alchemy creates or updates the stage-scoped Cloudflare
Workers, app, Hyperdrive, Neon branch, queues, and routes.

## Workspace Map

| Path                     | Purpose                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/app`               | TanStack Start React application, routes, authenticated shell, feature UI, hotkeys, and Playwright E2E tests.                              |
| `apps/api`               | Effect HTTP API, Better Auth integration, jobs/sites/labels domain services, Drizzle schema, migrations, and Cloudflare Worker entrypoint. |
| `packages/identity-core` | Shared organization and membership schemas, role helpers, and decoders.                                                                    |
| `packages/jobs-core`     | Shared jobs schemas, DTOs, job-owned IDs, rate-card contract, job assignment endpoints, and typed job errors.                              |
| `packages/sites-core`    | Shared site and service-area IDs, schemas, DTOs, API contract groups, and typed site/service-area errors.                                  |
| `packages/labels-core`   | Shared organization label IDs, schemas, DTOs, API contract, normalization helpers, and typed label errors.                                 |
| `packages/infra`         | Alchemy v2 infrastructure for Cloudflare Workers/Vite, Queues, Hyperdrive, and Neon Postgres.                                              |
| `scripts`                | Root dev helpers, Portless/Vite wrappers, opensrc sync, and local environment scripts.                                                     |
| `docs`                   | Codebase guides, architecture notes, implementation plans, and design specs.                                                               |
| `opensrc`                | Gitignored dependency source cache for local agent context.                                                                                |

## Common Commands

| Command                         | What it does                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Runs `pnpm alchemy dev` for the selected cloud-backed stage.                          |
| `pnpm test`                     | Runs workspace package tests and root script tests.                                   |
| `pnpm check-types`              | Runs TypeScript checks for all workspaces with a `check-types` task.                  |
| `pnpm lint`                     | Runs oxlint over the workspace.                                                       |
| `pnpm check`                    | Runs the Ultracite quality check.                                                     |
| `pnpm format`                   | Checks formatting with oxfmt.                                                         |
| `pnpm format:write`             | Writes formatting changes with oxfmt.                                                 |
| `pnpm --filter app e2e`         | Runs Playwright E2E tests for the web app. Use explicit app/API stage URLs as needed. |
| `pnpm --filter api db:generate` | Generates Drizzle migrations for API schema changes.                                  |
| `pnpm --filter api db:migrate`  | Applies API migrations to the configured database.                                    |
| `pnpm alchemy dev`              | Runs the root Alchemy stack for a cloud-backed development stage.                     |
| `pnpm alchemy deploy`           | Deploys the root Alchemy stack.                                                       |

## Documentation

Start with [docs/README.md](docs/README.md) for the full documentation index.
The highest-signal guides are:

- [Development Workflow](docs/development.md)
- [System Overview](docs/architecture/system-overview.md)
- [Frontend Architecture](docs/architecture/frontend.md)
- [API Architecture](docs/architecture/api.md)
- [Shared Packages](docs/architecture/packages.md)
- [Local Development And Infrastructure](docs/architecture/sandbox-and-infra.md)
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
ALCHEMY_STAGE=codex-my-task pnpm dev
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 \
PLAYWRIGHT_BASE_URL=<alchemy-app-url> \
PLAYWRIGHT_API_URL=<alchemy-api-url> \
pnpm --filter app e2e
```

For database changes, generate and inspect the package-local Drizzle migration
under `apps/api/drizzle`, then update/verify the Alchemy baseline/future
snapshots under `apps/api/drizzle/alchemy` before running API and infra tests.

## Repository Conventions

- Prefer `Config` and `Schema` at environment, HTTP, persistence, and external
  integration boundaries.
- Keep shared DTOs and branded IDs in the relevant `*-core` package.
- Use the app hotkey layer for new keyboard-accessible UI actions.
- Use local dependency source under `opensrc/` when package behavior is unclear.
- Do not commit files from `opensrc/`.
- When a task is tied to a Linear issue, use the Linear issue title as the pull
  request title, including the issue key when present.
