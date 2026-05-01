# Jobs Core Context

This package owns shared jobs, sites, activity, and field-work domain contracts.

- Keep branded IDs, domain constants, DTO schemas, error schemas, cost calculations, and the Effect `HttpApi` contract here.
- Do not add API persistence, authorization, repository code, browser state, or UI behavior to this package.
- Use `Schema` for all payloads that cross API, app, persistence, or test boundaries, and export inferred types from those schemas.
- Keep calculations deterministic and side-effect free. Push runtime effects into `apps/api` or feature-local app code.
- When changing a DTO or route contract, update API handlers, app clients, and tests in the same change so consumers stay aligned.
