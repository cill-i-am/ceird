# Agents Core Context

This package owns shared agent contracts between the domain Worker, Agent
Worker, app clients, and future bot/client surfaces.

- Keep agent thread IDs, action names, action kinds, action-run statuses,
  operation IDs, instance-name helpers, connect-token schemas, DTOs, and Effect
  `HttpApi` groups here.
- Keep executable action registry metadata source-backed and deterministic.
  Action handlers, model setup, AI streaming, durable chat state, SQL
  repositories, authorization, and audit behavior belong in `apps/domain` or
  `apps/agent`.
- Use the `./runtime` subpath for Agent Worker consumers that need runtime
  schemas and action metadata without pulling in HTTP API group construction.
- Keep proximity sideband frame schemas and opaque context-id helpers here, but
  do not expose raw current-location coordinates through visible chat text,
  persisted AI request bodies, or long-lived cache contracts.
- Model every payload crossing app, domain, Agent Worker, or tool-execution
  boundaries with `Schema`, and export inferred types from those schemas.
- When changing action contracts, update domain handlers, Agent Worker tool
  adapters, app callers, and tests in the same change.
