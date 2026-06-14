# Comments Core Context

This package owns shared comment primitives that target-specific packages
compose into their own job and site contracts.

- Keep comment IDs, body schemas, author fields, base comment DTOs, editable
  comment DTOs, and add-comment input/response schemas here.
- Keep target ownership out of this package. Job comments belong to
  `@ceird/jobs-core`; site comments belong to `@ceird/sites-core`.
- Do not add authorization policy, SQL ownership rows, repositories, activity
  writers, HTTP endpoint groups, or UI state here.
- Use `Schema` for comment payloads that cross package, app, domain, or test
  boundaries, and export inferred types next to the schemas.
- Keep comment validation generic enough for every target that uses shared
  comments. Target-specific rules should live in the target package or domain
  service.
