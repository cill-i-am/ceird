# Documentation Index

This directory documents the current Ceird codebase. The `architecture` guides
describe how the major systems fit together; `superpowers/specs` and
`superpowers/plans` preserve historical design and implementation context.

## Start Here

- [Development Workflow](development.md) explains install, local dev, sandbox,
  testing, formatting, migrations, and deployment commands.
- [System Overview](architecture/system-overview.md) maps the monorepo,
  runtime services, request flow, data flow, and code ownership boundaries.
- [Frontend Architecture](architecture/frontend.md) explains the TanStack Start
  app, routes, feature folders, hotkeys, auth bridge, and UI testing approach.
- [API Architecture](architecture/api.md) explains the Effect API, Better Auth
  integration, jobs domain, database schema, errors, and Cloudflare Worker.
- [Shared Packages](architecture/packages.md) explains each package under
  `packages/` and what code belongs there.
- [Sandbox And Infrastructure](architecture/sandbox-and-infra.md) explains the
  per-worktree sandbox, Docker runtime, Portless aliases, Alchemy stack, and
  production infrastructure.

## Existing Architecture Notes

- [Authentication Architecture](architecture/auth.md)
- [Authentication Extension Rules](architecture/auth-next-steps.md)
- [Data Layer Architecture](architecture/data-layer.md)
- [Jobs V1 Spec](architecture/jobs-v1-spec.md)
- [Organization Next Steps](architecture/organization-next-steps.md)
- [Cloudflare Alchemy Mainline CI](architecture/cloudflare-ci.md)
- [Legacy MVP Field Audit](architecture/legacy-mvp-field-audit.md)

## Historical Specs And Plans

`docs/superpowers/specs` contains feature design specs. `docs/superpowers/plans`
contains implementation plans that were written before or during feature work.
Use these documents for intent and decision history, but verify current behavior
against source code before treating them as authoritative.

## Documentation Maintenance

When code changes affect a boundary, update the matching guide in the same
change:

- Routes, UI architecture, hotkeys, or client/server data loading:
  `architecture/frontend.md`
- API endpoints, services, repositories, auth behavior, migrations, or runtime
  configuration: `architecture/api.md`
- Shared schemas, DTOs, IDs, errors, or package ownership:
  `architecture/packages.md`
- Sandbox commands, Docker runtime, env loading, Portless behavior, or deploy
  infrastructure: `architecture/sandbox-and-infra.md`
- Cross-system behavior or workspace layout: `architecture/system-overview.md`

Prefer short, source-backed updates over broad rewrite notes. Link to exact code
paths when a reader will need implementation details.
