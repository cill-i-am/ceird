# Ceird

Ceird is a greenfield task-tracker for trades and construction teams. The
product gives small and medium-sized businesses a focused way to manage jobs,
sites, members, activity, and organization configuration without adopting a
generic project-management workflow.

The codebase is a TypeScript monorepo built with pnpm and Turborepo. It contains
a TanStack Start web app, an Effect HTTP API, shared runtime schema packages, a
local sandbox CLI, and Alchemy infrastructure for Cloudflare and PlanetScale.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Run the normal local development stack through Portless:

```bash
pnpm dev
```

Run the isolated app/API/Postgres sandbox for the current worktree:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Use the sandbox workflow when developing from linked git worktrees. It starts
the app, API, and Postgres together, applies API migrations, and reports stable
URLs when Portless aliases are healthy.

## Workspace Map

| Path                     | Purpose                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/app`               | TanStack Start React application, routes, authenticated shell, feature UI, hotkeys, and Playwright E2E tests.                 |
| `apps/api`               | Effect HTTP API, Better Auth integration, jobs domain services, Drizzle schema, migrations, and Cloudflare Worker entrypoint. |
| `packages/identity-core` | Shared organization and membership schemas, role helpers, and decoders.                                                       |
| `packages/jobs-core`     | Shared jobs domain schemas, branded IDs, DTOs, API contract, and typed error classes.                                         |
| `packages/sandbox-core`  | Pure sandbox identity, naming, URL, runtime-spec, and registry/environment primitives.                                        |
| `packages/sandbox-cli`   | Effect CLI that boots, stops, inspects, and logs per-worktree Docker sandboxes.                                               |
| `packages/infra`         | Alchemy v2 infrastructure for Cloudflare Workers/Vite, Queues, Hyperdrive, and PlanetScale Postgres.                          |
| `scripts`                | Root dev helpers, Portless/Vite wrappers, opensrc sync, and local environment scripts.                                        |
| `docs`                   | Codebase guides, architecture notes, implementation plans, and design specs.                                                  |
| `opensrc`                | Gitignored dependency source cache for local agent context.                                                                   |

## Common Commands

| Command                              | What it does                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Starts app and API dev servers through root dev orchestration.                        |
| `pnpm sandbox:up`                    | Starts app, API, and Postgres for the current worktree sandbox.                       |
| `pnpm sandbox:status`                | Shows the current sandbox record and health.                                          |
| `pnpm sandbox:url`                   | Prints app, API, and database URLs for the sandbox.                                   |
| `pnpm sandbox:logs -- --service api` | Prints sandbox logs for one service; valid services are `app`, `api`, and `postgres`. |
| `pnpm sandbox:down`                  | Stops the current sandbox.                                                            |
| `pnpm test`                          | Runs package tests through Turbo and root script tests.                               |
| `pnpm check-types`                   | Runs TypeScript checks for all workspaces with a `check-types` task.                  |
| `pnpm lint`                          | Runs oxlint over the workspace.                                                       |
| `pnpm check`                         | Runs the Ultracite quality check.                                                     |
| `pnpm format`                        | Checks formatting with oxfmt.                                                         |
| `pnpm format:write`                  | Writes formatting changes with oxfmt.                                                 |
| `pnpm --filter app e2e`              | Runs Playwright E2E tests for the web app. Use this with `pnpm sandbox:up`.           |
| `pnpm --filter api db:generate`      | Generates Drizzle migrations for API schema changes.                                  |
| `pnpm --filter api db:migrate`       | Applies API migrations to the configured database.                                    |
| `pnpm infra:deploy`                  | Deploys infrastructure through the infra package wrapper.                             |

## Documentation

Start with [docs/README.md](docs/README.md) for the full documentation index.
The highest-signal guides are:

- [Development Workflow](docs/development.md)
- [System Overview](docs/architecture/system-overview.md)
- [Frontend Architecture](docs/architecture/frontend.md)
- [API Architecture](docs/architecture/api.md)
- [Shared Packages](docs/architecture/packages.md)
- [Sandbox And Infrastructure](docs/architecture/sandbox-and-infra.md)
- [Authentication Architecture](docs/architecture/auth.md)
- [Jobs V1 Spec](docs/architecture/jobs-v1-spec.md)
- [Data Layer Architecture](docs/architecture/data-layer.md)

## Architecture Summary

The browser app uses TanStack Router file routes and TanStack Start server-only
helpers. Authentication is owned by the API through Better Auth, while the app
forwards cookies and proxy headers during server-side lookups. Jobs data moves
through an Effect `HttpApi` contract exported by `@task-tracker/jobs-core`, so
frontend clients, API handlers, DTOs, and HTTP error responses share the same
runtime schema boundary.

The API keeps domain behavior in Effect services. The identity domain wires
Better Auth, organization membership, invitation preview, and auth email
delivery. The jobs domain owns authorization, actor resolution, job/site/config
services, repositories, activity recording, and optional site geocoding.

Local multi-service development is handled by the sandbox packages. Production
infrastructure is described in Alchemy and deploys Cloudflare Workers/Vite,
Cloudflare Queues, Hyperdrive, and PlanetScale Postgres.

## Quality Gates

For routine changes, run the narrowest relevant tests first, then finish with:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

For UI workflows, use the sandbox and run the affected Playwright tests:

```bash
pnpm sandbox:up
pnpm --filter app e2e
```

For database changes, generate and inspect a Drizzle migration under
`apps/api/drizzle`, then run API tests and the sandbox migration path.

## Repository Conventions

- Prefer `Config` and `Schema` at environment, HTTP, persistence, and external
  integration boundaries.
- Keep shared DTOs and branded IDs in the relevant `*-core` package.
- Use the app hotkey layer for new keyboard-accessible UI actions.
- Use local dependency source under `opensrc/` when package behavior is unclear.
- Do not commit files from `opensrc/`.
- When a task is tied to a Linear issue, use the Linear issue title as the pull
  request title, including the issue key when present.
