# Apps

`apps` contains deployable runtimes.

| Workspace | Purpose                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `app`     | TanStack Start web application. Owns routes, UI, hotkeys, app-side API clients, and Playwright E2E tests.             |
| `api`     | Effect HTTP API. Owns Better Auth, API HTTP routes, Drizzle schema/migrations, auth email queues, and Worker runtime. |
| `mcp`     | Cloudflare Worker that serves the Ceird remote MCP resource at `/mcp` using shared backend services.                  |

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
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter mcp test
```

Architecture docs:

- [../docs/architecture/frontend.md](../docs/architecture/frontend.md)
- [../docs/architecture/api.md](../docs/architecture/api.md)
- [../docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
