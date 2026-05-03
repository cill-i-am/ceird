# Apps

`apps` contains deployable runtimes.

| Workspace | Purpose                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app`     | TanStack Start web application. Owns routes, UI, hotkeys, app-side API clients, and Playwright E2E tests.                 |
| `api`     | Effect HTTP API. Owns Better Auth, jobs services, repositories, Drizzle schema/migrations, and Cloudflare Worker runtime. |

Use root commands for cross-service work:

```bash
pnpm dev
pnpm sandbox:up
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
```

Architecture docs:

- [../docs/architecture/frontend.md](../docs/architecture/frontend.md)
- [../docs/architecture/api.md](../docs/architecture/api.md)
- [../docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
