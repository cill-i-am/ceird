# Jobs Core Context

This package owns shared jobs, activity, visits, comments, labels, and
collaborator contracts.

- Keep branded IDs, domain constants, DTO schemas, error schemas, and the Effect
  `HttpApi` contract here.
- Do not add domain persistence, authorization, repository code, browser state, or UI behavior to this package.
- Use `Schema` for all payloads that cross domain, app, persistence, or test boundaries, and export inferred types from those schemas.
- Keep calculations deterministic and side-effect free. Push runtime effects into `apps/domain` or feature-local app code.
- When changing a DTO or route contract, update domain HTTP handlers, app clients, and tests in the same change so consumers stay aligned.
