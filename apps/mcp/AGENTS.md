# MCP App Context

This app is a standalone MCP protocol adapter over the private Ceird domain
Worker.

- Keep the Worker thin and service-binding based.
- Keep request handling Effect-threaded with structured logs and safe paths
  that omit query strings.
- Do not add product repositories, database access, authorization policy, audit
  writers, or Ceird action execution here.
- MCP-specific transport concerns belong here only when they are not shared by
  other clients. Shared action behavior belongs in `apps/domain`.
- The public MCP hostname must not proxy the full domain HTTP surface. Keep
  forwarding restricted to `/mcp` and MCP protected-resource metadata routes
  unless the architecture docs change first.
