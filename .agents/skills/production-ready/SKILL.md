---
name: production-ready
description: Final gate before claiming a Linear issue or PR is done. Runs spec checks, diff-scope review stacks, fresh verification, PR creation/update, CI watching, and Linear evidence. Use before final worker reports, PR handoff, or moving Linear work to done.
---

# Production Ready

Evidence before completion. A worker may not claim done until this gate passes
or reports a real blocker.

## Read First

- `docs/agents/execution-policy.md`
- `docs/agents/linear-workflow.md`
- `docs/agents/triage-states.md`
- `.codex/hooks/stop_review_prompt.mjs` for current diff classification logic
- the Linear issue, parent Project/PRD, and linked PR if one exists

## Gate

### 1. Spec Checklist

Read Linear fresh and check:

- acceptance criteria
- parent PRD/Project intent
- blockers and HITL decisions
- out-of-scope boundaries
- comments since worker assignment

Report gaps before running broad review. Fix only if the fix is within scope.

### 2. Detect Review Scope

Use the same shape as the stop hook:

- dirty working tree first: unstaged, staged, and untracked files
- otherwise branch diff against `origin/main`/`main`
- ignore review infrastructure such as `.agents/`, `.codex/`, `AGENTS.md`, and
  `skills-lock.json` for product review routing
- classify backend/API/shared-core files separately from frontend/app/shared-core
  files

### 3. Run Required Review Stack

Run the relevant skill bodies before finalizing:

- backend/API/shared packages/infra: `backend-review`
- frontend/app/UI/routes/client data: `frontend-review`
- auth/session/org/trust boundaries: `auth-context-review`
- broad or risky diffs: `review-swarm`
- cleanup before wrap-up: `simplify`

Also load subordinate skills named inside those review skills when their
conditions match, such as `effect-review`, `effect-best-practices`,
`drizzle-orm`, `postgres`, `vercel-composition-patterns`, `tanstack-start`,
`tanstack-router`, and `web-design-guidelines`.

Fix material issues unless the user or orchestrator requested review-only mode.
Discard false positives with a short technical reason.

### 4. Fresh Verification

Run the narrowest relevant checks, then broaden when the change crosses
packages or contracts:

- focused package tests
- package typecheck
- browser/Playwright verification for UI workflows
- Drizzle migration generation/inspection for schema changes
- `pnpm check-types`, `pnpm test`, `pnpm lint`, `pnpm format` for
  cross-package or handoff-ready changes

Do not claim success without fresh command output.

### 5. PR And Linear Evidence

Open or update the PR when code is ready. Use the Linear issue title as the PR
title when it includes the issue key. Comment in Linear with:

- PR URL
- branch and commits
- review stack used
- verification commands and results
- initial GitHub PR comment/review-thread status
- CI/comment watcher automation if checks or comments are pending
- known risks or blockers

### 6. CI Watch

After PR creation, run `ci-watch` before the worker final report. It owns
pending checks, GitHub PR comments/review threads, new Linear comments,
actionable CI/comment fixes, follow-up commits, automation handoff, and Linear
CI evidence.

If CI or comments are still pending after a short inline watch, create or update
a 2-3 minute heartbeat automation for the worker thread. The prompt must include
the PR URL, Linear issue key, branch, head SHA, pending checks/comments,
retry/fix budget, Linear update requirement, and stop condition. Reuse an
existing watcher for the same PR.

Do not move Linear to done until CI is green or the orchestrator explicitly
accepts a non-CI completion path.

## Completion Report

Final output must include:

- spec gate result
- review stack used
- verification evidence
- PR URL
- CI status
- Linear update status
- blockers or residual risk
