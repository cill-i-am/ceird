# Packages

`packages` contains shared libraries and infrastructure tooling used by the app
and API workspaces.

| Workspace       | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `identity-core` | Shared organization IDs, role schemas, organization DTO schemas, and decoders.          |
| `jobs-core`     | Shared job-owned IDs, domain schemas, DTOs, Effect HTTP API contract, and typed errors. |
| `sites-core`    | Shared site/service-area IDs, schemas, DTOs, API groups, and typed public errors.       |
| `labels-core`   | Shared organization label IDs, schemas, DTOs, API group, and typed public errors.       |
| `sandbox-core`  | Pure sandbox naming, identity, URL, environment, runtime-spec, and registry primitives. |
| `sandbox-cli`   | Effect CLI for per-worktree app/API/Postgres sandboxes.                                 |
| `infra`         | Alchemy infrastructure for Cloudflare, Hyperdrive, Queues, and PlanetScale.             |

Package contracts are documented in
[../docs/architecture/packages.md](../docs/architecture/packages.md).

Run focused package checks with filters:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm --filter @ceird/sandbox-core test
pnpm --filter @ceird/sandbox-cli test
pnpm --filter @ceird/infra check-types
```

Keep shared packages free of app-only concerns. If code needs React state,
TanStack Router, Better Auth adapter wiring, Drizzle SQL, Docker process
execution, or deployment secrets, it usually belongs in an app, the API, the
sandbox CLI, or infra rather than a core package.
