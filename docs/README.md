# Documentation Index

This directory documents the current Ceird app and platform: the TanStack Start
web app, public adapters, private domain Worker, Agent runtime, shared
packages, Electric sync runtime, and Alchemy-managed infrastructure. The `architecture` guides
describe how the major systems fit together; `superpowers/specs` and
`superpowers/plans` preserve historical design and implementation context.

## Start Here

- [Development Workflow](development.md) explains install, local dev,
  testing, formatting, migrations, and deployment commands.
- [System Overview](architecture/system-overview.md) maps the monorepo,
  runtime services, request flow, data flow, and code ownership boundaries.
- [Frontend Architecture](architecture/frontend.md) explains the TanStack Start
  app, routes, feature folders, hotkeys, auth bridge, and UI testing approach.
- [TanStack DB Data Plane](architecture/tanstack-db-data-plane.md) explains
  scoped Query Collections, Start loader seeding, feature data-plane modules,
  and command mutation journaling.
- [API Architecture](architecture/api.md) explains the public API and MCP
  adapters, private domain Worker, public Agent Worker, Better Auth
  integration, domain actions, database schema, errors, and Cloudflare Workers.
- [Shared Packages](architecture/packages.md) explains each package under
  `packages/` and what code belongs there.
- [Local Development And Infrastructure](architecture/local-development-and-infra.md)
  explains Alchemy stages, local environment setup, the root Alchemy stack, and
  production infrastructure.
- [Planned Features](planned-features/README.md) tracks locked product and
  design decisions before implementation starts.

## Existing Architecture Notes

- [Authentication Architecture](architecture/auth.md)
- [Authentication Extension Rules](architecture/auth-next-steps.md)
- [Auth And Organization Permission Matrix](architecture/auth-organization-permission-matrix.md)
- [Better Auth Decision Log](architecture/better-auth-decision-log.md)
- [Better Auth Feature Adoption](architecture/better-auth-feature-adoption.md)
- [Better Auth Implementation Gaps](architecture/better-auth-implementation-gaps.md)
- [Better Auth MCP And Agent Auth Evaluation](architecture/better-auth-mcp-agent-auth-evaluation.md)
- [Data Layer Architecture](architecture/data-layer.md)
- [Jobs V1 Spec](architecture/jobs-v1-spec.md)
- [Organization Next Steps](architecture/organization-next-steps.md)
- [Cloudflare Alchemy Mainline CI](architecture/cloudflare-ci.md)
- [Alchemy Reference Architecture](architecture/alchemy-reference-architecture.md)
- [Alchemy Usage Audit](architecture/alchemy-usage-audit-2026-05-29.md)
- [Legacy MVP Field Audit](architecture/legacy-mvp-field-audit.md)

## Historical Specs And Plans

`docs/superpowers/specs` contains feature design specs. `docs/superpowers/plans`
contains implementation plans that were written before or during feature work.
Use these documents for intent and decision history, but verify current behavior
against source code before treating them as authoritative.

`docs/superpowers/progress` contains living progress notes for long-running
agent goals, including feature exploration, design direction, implementation
status, and validation notes that should be updated on each run.

Current route-aware proximity implementation plans:

- [Route-Aware Proximity Logic](superpowers/plans/2026-06-06-route-aware-proximity-logic.md)
- [Route-Aware Proximity UI](superpowers/plans/2026-06-06-route-aware-proximity-ui.md)

## Documentation Maintenance

When code changes affect a boundary, update the matching guide in the same
change:

- Routes, UI architecture, hotkeys, or client/server data loading:
  `architecture/frontend.md`
- API/domain/MCP/agent endpoints, services, repositories, auth behavior,
  migrations, or runtime configuration: `architecture/api.md`
- Shared schemas, DTOs, IDs, errors, or package ownership:
  `architecture/packages.md`
- Alchemy stages, local environment setup, or deploy infrastructure:
  `architecture/local-development-and-infra.md`
- Cross-system behavior or workspace layout: `architecture/system-overview.md`

Prefer short, source-backed updates over broad rewrite notes. Link to exact code
paths when a reader will need implementation details.
