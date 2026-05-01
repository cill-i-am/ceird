# Apps Context

This subtree contains deployable runtime surfaces rather than reusable packages.

- Keep app-local runtime wiring, route composition, and deployment entrypoints inside the app that owns them.
- Share domain contracts, DTO schemas, branded IDs, and reusable runtime-neutral helpers through `packages/` instead of importing across sibling apps.
- Treat `apps/app` and `apps/api` as separate deployable workloads that must keep local sandbox development and Cloudflare deployment paths aligned.
- Prefer thin adapters at runtime boundaries: app routes, API handlers, worker entrypoints, and health checks should delegate to typed services and shared contracts.
- When changing cross-app behavior, update the shared package contract first, then update both consumers and their tests.
