# Linear Workflow

Linear is the durable source of truth for active product work.

## Object Model

- **Initiative**: strategic product theme or larger investment area.
- **Project**: PRD-sized deliverable with a goal, scope, success criteria,
  sequencing, and links to child issues.
- **PRD**: the project-level specification. Prefer a Linear document attached to
  the Project when documentation tools are available; otherwise use the Project
  description or a linked PRD issue/comment.
- **Issue**: one independently assignable vertical slice. It should be narrow
  enough for one worker session and complete enough to demo or verify on its own.
- **Issue relations**: Linear blockers define the execution graph. Do not encode
  blockers only in prose.
- **Comments**: durable execution evidence, blocker explanations, decisions,
  verification output summaries, pull request links, and CI-watch updates.

## PRD Expectations

PRDs should include:

- problem statement and user impact
- goals and non-goals
- user stories
- acceptance criteria
- implementation decisions that are stable enough to guide issue slicing
- test seams and verification expectations
- rollout, migration, or operational risks
- open questions and HITL decisions
- links to relevant architecture guides in `docs/architecture`

Avoid volatile file-path instructions in PRDs unless the path itself is part of
the contract. Use interfaces, modules, data contracts, and user-visible behavior
as the stable language.

## Issue Expectations

Each Linear issue should include:

- parent Project or PRD link
- concise vertical-slice description
- acceptance criteria
- explicit blockers and blocked-by relations
- AFK or HITL classification
- expected verification commands or evidence
- risk tier and likely review stack
- out-of-scope boundaries
- PR title guidance when the Linear title needs to map directly to GitHub

Issues must be self-contained enough for a fresh Codex worker session that has
not seen the planning conversation.

## Pull Requests

When a task is associated with a Linear issue, use the Linear issue title as the
pull request title, including the issue key when it is part of the title. Link
the PR back to Linear in an issue comment, and link Linear in the PR body.

Do not mark a Linear issue complete merely because a PR exists. Completion
requires production readiness, CI green status, and orchestrator acceptance.
