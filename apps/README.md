# Apps

`apps` contains deployable runtimes.

| Workspace | Purpose                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `app`     | TanStack Start web application. Owns routes, UI, hotkeys, app-side API clients, and Playwright E2E tests.                  |
| `api`     | Public HTTP adapter Worker. Owns root/health responses and forwards domain requests through the `DOMAIN` service binding.  |
| `agent`   | Public Cloudflare Agents SDK Worker. Owns `CeirdAgent` Durable Objects, chat runtime state, and action tool calls.         |
| `domain`  | Private business/domain Worker. Owns product services, repositories, authorization, audit, auth, and Postgres persistence. |
| `mcp`     | Standalone MCP adapter Worker. Forwards MCP traffic through the same private `DOMAIN` service binding.                     |
| `sync`    | Public Electric SQL sync Worker. Authorizes domain shapes through `DOMAIN` and forwards to the Electric container.         |

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
pnpm --filter agent test
pnpm --filter domain test
pnpm --filter domain db:generate
pnpm --filter domain db:migrate
pnpm --filter mcp test
pnpm --filter sync test
```

Architecture docs:

- [../docs/architecture/frontend.md](../docs/architecture/frontend.md)
- [../docs/architecture/api.md](../docs/architecture/api.md)
- [../docs/architecture/system-overview.md](../docs/architecture/system-overview.md)
