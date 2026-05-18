# Backend Core

`@ceird/backend-core` owns backend-only runtime code that is shared by
`apps/api` and `apps/mcp`.

It contains database runtime wiring, non-auth domain services, repositories,
server-side schemas, and the MCP resource-server modules. API-specific HTTP
adapters, CORS handling, request logging, Better Auth adapter wiring, and
Cloudflare entrypoints stay in `apps/api`.

Run focused checks with:

```bash
pnpm --filter @ceird/backend-core test
pnpm --filter @ceird/backend-core check-types
```
