# Labels Core Context

This package owns the shared organization-label contract.

- Keep label IDs, label name schemas and normalization, create/update/list DTOs,
  typed label errors, and the Effect `HttpApi` label group here.
- Label definitions are organization-level data. Job-label and site-label
  assignment endpoints belong to the job and site contracts that own those
  targets.
- Do not add SQL repositories, authorization policy, audit/activity behavior,
  React state, or app-specific label presentation here.
- Use `Schema` for every label payload or error crossing app, domain, package,
  or test boundaries, and export inferred types from those schemas.
- When changing label DTOs or public errors, update domain label handlers, jobs
  or sites assignment consumers, app clients, and tests in the same change.
