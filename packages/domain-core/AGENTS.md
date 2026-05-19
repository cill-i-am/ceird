# Domain Core Context

This package owns the runtime-neutral TypeScript contract for clients calling
the private `apps/domain` Worker.

- Keep this package tiny: service-binding types, request forwarding helpers, and
  boundary-neutral client contracts only.
- Do not add product repositories, authorization policy, action execution, audit
  writers, Drizzle schema/migrations, Better Auth runtime, or Cloudflare Worker
  entrypoints here.
- Keep API, MCP, future agent, bot, and generated UI clients depending on this
  package instead of importing from `apps/domain`.
- If shared DTOs or errors change, update the owning `packages/*-core` contract
  first and keep this package focused on the domain service-binding surface.
