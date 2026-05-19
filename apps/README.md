# Apps

`apps` contains deployable runtimes.

| Workspace | Purpose                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app`     | TanStack Start web application. Owns routes, UI, hotkeys, app-side API clients, and Playwright E2E tests.                  |
| `api`     | Public HTTP adapter Worker. Owns root/health responses and forwards domain requests through the `DOMAIN` service binding.  |
| `domain`  | Private business/domain Worker. Owns product services, repositories, authorization, audit, auth, and Postgres persistence. |
| `mcp`     | Standalone MCP adapter Worker. Forwards MCP traffic through the same private `DOMAIN` service binding.                     |

Use root commands for cross-service work:

```bash
pnpm dev
pnpm test
pnpm check-types
```

Use package filters for focused iteration:

```bash
pnpm --filter app test
pnpm --filter app e2e
pnpm --filter api test
pnpm --filter domain test
pnpm --filter domain db:generate
pnpm --filter domain db:migrate
pnpm --filter mcp test
```

Architecture docs:

- [../docs/architecture/frontend.md](../docs/architecture/frontend.md)
- [../docs/architecture/api.md](../docs/architecture/api.md)
- [../docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
