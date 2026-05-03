# Packages

`packages` contains shared libraries and infrastructure tooling used by the app
and API workspaces.

| Workspace       | Purpose                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `identity-core` | Shared organization IDs, role schemas, organization DTO schemas, and decoders.            |
| `jobs-core`     | Shared jobs IDs, domain schemas, DTOs, Effect HTTP API contract, and typed public errors. |
| `sandbox-core`  | Pure sandbox naming, identity, URL, environment, runtime-spec, and registry primitives.   |
| `sandbox-cli`   | Effect CLI for per-worktree app/API/Postgres sandboxes.                                   |
| `infra`         | Alchemy infrastructure for Cloudflare, Hyperdrive, Queues, and PlanetScale.               |

Package contracts are documented in
[../docs/architecture/packages.md](../docs/architecture/packages.md).

Run focused package checks with filters:

```bash
pnpm --filter @task-tracker/identity-core test
pnpm --filter @task-tracker/jobs-core test
pnpm --filter @task-tracker/sandbox-core test
pnpm --filter @task-tracker/sandbox-cli test
pnpm --filter @task-tracker/infra check-types
```

Keep shared packages free of app-only concerns. If code needs React state,
TanStack Router, Better Auth adapter wiring, Drizzle SQL, Docker process
execution, or deployment secrets, it usually belongs in an app, the API, the
sandbox CLI, or infra rather than a core package.
