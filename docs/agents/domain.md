# Domain Context

Current source code and architecture guides are authoritative. Historical plans
are decision context only.

## Current Sources

Start with:

- `README.md`
- `docs/README.md`
- `docs/architecture/system-overview.md`
- the relevant guide under `docs/architecture/`
- the nearest `AGENTS.md`

Use the architecture guides for current system boundaries, route/API contracts,
auth behavior, persistence, shared packages, infrastructure, and local
development rules.

## Historical Context

`docs/superpowers/specs`, `docs/superpowers/plans`, and
`docs/superpowers/progress` preserve historical intent and progress notes. They
can explain why a decision was made, but they do not prove current behavior.
Verify against current source before relying on them.

## Domain Language

When creating PRDs, issues, reviews, or implementation reports, prefer the
project's current product and architecture vocabulary:

- organization, member, invitation, session, active organization
- site, job, work item, label, comment, activity
- agent thread, agent action run
- public app/API adapter, private domain Worker, sync Worker, Agent Worker
- shared core package, domain package, app feature module

If a term is ambiguous, ask or record the chosen meaning in the relevant Linear
PRD or architecture guide rather than inventing a parallel vocabulary.

`CONTEXT.md` is the product glossary. Keep it free of implementation details,
plans, and scratch notes. Use `domain-modeling` when a task actively changes the
domain language; merely reading `CONTEXT.md` for vocabulary does not require
that skill.

Use `codebase-design` for architecture vocabulary such as module, interface,
seam, adapter, depth, leverage, and locality. Do not duplicate that vocabulary
inside workflow skills.
