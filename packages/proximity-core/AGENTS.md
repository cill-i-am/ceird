# Proximity Core Context

This package owns generic route-aware proximity contracts.

- Keep origin inputs, current-location and signed typed-origin schemas, Google
  origin lookup DTOs, route summaries, display lines, metadata, limits, provider
  literals, cost-guard scopes, typed proximity errors, and the Effect
  `HttpApi` proximity group here.
- Keep short-lived typed-origin token signing and verification helpers
  runtime-neutral. Do not persist origins, manage user preferences, or own
  provider calls in this package.
- Do not depend on `@ceird/sites-core`; site-specific Google place and location
  schemas stay in `@ceird/sites-core` to avoid package cycles.
- Keep provider clients, cache policy, quota accounting, SQL repositories,
  authorization, route ranking, and UI state in the owning domain or app code.
- Use `Schema` for all proximity payloads crossing app, domain, agent, package,
  or test boundaries, and export inferred types from those schemas.
