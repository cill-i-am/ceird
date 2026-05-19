# Apps Context

This subtree contains deployable runtime surfaces rather than reusable packages.

- Keep app-local runtime wiring, route composition, and Worker entrypoints inside
  the app that owns them.
- `apps/domain` owns Ceird business/domain runtime: persistence,
  authorization, action execution, audit/activity, auth, schema/migrations, and
  the private capability surface.
- Public and interactive apps such as `apps/api`, `apps/mcp`, future agents,
  bots, and generated UI surfaces should stay protocol adapters over
  `apps/domain` through service bindings or typed clients.
- Share DTO schemas, branded IDs, service-binding contracts, and reusable
  runtime-neutral helpers through `packages/*-core` instead of importing across
  sibling apps for business behavior.
- Keep Alchemy local development and Cloudflare deployment paths aligned when
  app boundaries change.
- When changing cross-app behavior, update the shared package contract first,
  then update consumers, infrastructure tests, and runtime tests together.
