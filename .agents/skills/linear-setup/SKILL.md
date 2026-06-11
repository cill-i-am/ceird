---
name: linear-setup
description: Set up or refresh this repo's Linear-native agent workflow docs and AGENTS.md pointers. Use before first use of to-prd, to-issues, triage, orchestrator, worker, production-ready, ci-watch, or when Linear teams/statuses/domain-doc rules change.
---

# Linear Setup

Configure the repo context that the Linear-native skills assume.

## Read

- `AGENTS.md`
- `docs/agents/*` if present
- `docs/README.md`
- Linear teams, Projects, labels/statuses, and Initiatives when tools are
  available

## Ensure

The repo should have:

- `docs/agents/linear-workflow.md`
- `docs/agents/triage-states.md`
- `docs/agents/domain.md`
- `docs/agents/execution-policy.md`
- `docs/agents/README.md`
- an `## Agent Skills` section in `AGENTS.md` pointing at those docs
- `docs/README.md` linking to `docs/agents/README.md`

## Process

1. Inspect the current files and Linear workspace context.
2. Identify missing or stale workflow docs.
3. If changing configured Linear team/status/label names, show the proposed
   mapping before editing.
4. Update the docs and `AGENTS.md` in place. Do not duplicate sections.
5. Report which skills will use the refreshed setup.

## Output

Keep the report short:

- files created or updated
- Linear team/status/label assumptions
- any missing Linear access or follow-up needed
