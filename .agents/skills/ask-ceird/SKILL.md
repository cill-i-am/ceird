---
name: ask-ceird
description: Ask which Ceird planning, orchestration, worker, review, debugging, or design skill fits the current situation. A router over the user-invoked project workflow skills.
disable-model-invocation: true
---

# Ask Ceird

Use this when the next workflow is unclear. Pick the path that matches the
user's starting point, then tell them the next skill or flow to run.

## Idea To Shipped Work

Use this when the user has an idea, feature request, product question, or rough
plan.

1. `grill-with-docs` when the idea needs sharpening against source, product
   language, or existing architecture.
2. `prototype` when a question needs a runnable answer before committing to a
   PRD: state/business logic uses a tiny terminal app; UI direction uses
   route-mounted variants.
3. `to-prd` when the idea is ready to become a Linear Project/PRD.
4. `to-issues` when the PRD is ready to become dependency-aware Linear issues.
5. `orchestrator` when ready-for-agent issues should be dispatched to
   user-visible Codex worker threads.

Keep the planning context intact through `to-issues` when possible. If the
thread is getting too full or needs to branch, run `handoff` and continue in a
fresh session with the handoff document.

## Active Linear Work

- Use `triage` for raw Linear bugs, requests, unclear issues, blocked issues, or
  work that needs state/category correction.
- Use `orchestrator` for a Linear Project execution loop, worker dispatch,
  blocker reconciliation, acceptance gates, and progress tracking.
- Use `worker` for one ready-for-agent Linear issue that should be implemented
  end to end.
- Use `production-ready` before claiming a worker issue or PR is complete.
- Use `ci-watch` after PR creation or when PR checks/comments need monitoring.
- Use `reconcile-project` when Linear, PR, blocker, or CI state may have drifted.

## Engineering Discipline

- Use `systematic-debugging` for bugs, failing tests, flaky tests, CI failures,
  and unexpected behavior.
- Use `tdd` for behavior changes where a red-green-refactor loop is practical.
- Use `improve-codebase-architecture` for codebase health and deepening
  opportunities.
- Use `codebase-design` whenever a skill or design conversation needs the
  shared module/interface/seam vocabulary.
- Use `domain-modeling` when the product/domain language itself is being
  sharpened or recorded.
- Use `grilling` for a reusable one-question-at-a-time interview loop.

## Standalone

- Use `handoff` to preserve the current conversation for another session without
  duplicating Linear, PRD, ADR, issue, or commit content.
- Use `resolving-merge-conflicts` for an in-progress merge or rebase conflict.
- Use `writing-great-skills` when editing the project skills themselves.
