# Packages

`packages` contains shared libraries used by the app and API workspaces. Root
infrastructure lives in `../infra` with the Alchemy stack entrypoint at
`../alchemy.run.ts`.

| Workspace       | Purpose                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `identity-core` | Shared organization IDs, role schemas, organization DTO schemas, and decoders.          |
| `backend-core`  | Shared backend runtime for API and MCP: database wiring, domain services, and MCP.      |
| `jobs-core`     | Shared job-owned IDs, domain schemas, DTOs, Effect HTTP API contract, and typed errors. |
| `sites-core`    | Shared site/service-area IDs, schemas, DTOs, API groups, and typed public errors.       |
| `labels-core`   | Shared organization label IDs, schemas, DTOs, API group, and typed public errors.       |

Package contracts are documented in
[../docs/architecture/packages.md](../docs/architecture/packages.md).

Run focused package checks with filters:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter @ceird/backend-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm run check-types:infra
```

Keep shared packages free of app-only concerns. If code needs React state,
TanStack Router, Better Auth adapter wiring, or Alchemy deployment secrets, it
usually belongs in an app, the API, or root `infra` rather than a core package.
Server-side Drizzle runtime that is shared by multiple backend Workers belongs
in `@ceird/backend-core`.
