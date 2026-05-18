# MCP Worker

`apps/mcp` is the Cloudflare Worker that serves Ceird's remote MCP resource.
The production resource URL is `https://mcp.ceird.app/mcp`; OAuth remains owned
by the API at `https://api.ceird.app/api/auth`.

Focused checks:

```bash
pnpm --filter mcp test
pnpm --filter mcp check-types
pnpm --filter mcp build
```

Local cloud-backed runs are owned by the root Alchemy workflow. Use `pnpm dev`
or `pnpm dev -- --stage <stage>` from the repository root rather than a
standalone MCP dev script.
