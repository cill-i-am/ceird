# MCP Workspace

`apps/mcp` is Ceird's standalone MCP protocol adapter. It is intentionally thin:
the Worker forwards MCP requests to the private `apps/domain` Worker through the
typed `DOMAIN` service binding from `@ceird/domain-core`.

## Commands

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm --filter mcp build
```

## Important Paths

| Path                      | Purpose                                               |
| ------------------------- | ----------------------------------------------------- |
| `src/worker.ts`           | Cloudflare Worker entrypoint.                         |
| `src/platform/cloudflare` | Effect runtime and env contract for private `DOMAIN`. |

## Runtime Behavior

The MCP Worker is public at `mcp.<stage>.ceird.app`, with production configured
as `mcp.ceird.app`. It uses the typed `DOMAIN` service binding rather than
public HTTP to call `apps/domain`.

The adapter keeps protocol transport work local:

- forwards the original MCP request to the domain Worker
- logs method, status, and path without query strings
- adds Effect log spans and structured annotations for Cloudflare logs/traces
- returns a typed `502` JSON error if the private domain service binding cannot
  be reached

Cloudflare observability for logs, invocation logs, and traces is configured in
`infra/cloudflare-stack.ts`.

The MCP protocol surface, OAuth verification, tool execution, authorization,
and audit behavior are owned by `apps/domain` for now, so generated clients and
future agent surfaces call the same capability surface.
