---
name: ci-watch
description: Watch a GitHub PR's CI and comments after creation, inspect failing checks and review feedback, fix actionable in-scope failures, push follow-up commits, update Linear, and continue until green/resolved or genuinely blocked. Use after production-ready opens a PR or when asked to monitor/fix CI or PR comments.
---

# CI Watch

Own PR checks and PR feedback until they are green/resolved or genuinely
blocked.

## Inputs

- PR URL or current branch PR
- Linear issue key and parent Project when available
- issue scope and out-of-scope boundaries
- current branch and head SHA when known

Use GitHub tooling for PR/check/log inspection. Use the GitHub `gh-fix-ci` skill
or its bundled scripts when GitHub Actions checks fail.

## Loop

1. Resolve the PR from URL or current branch.
2. Run `gh auth status`; stop if GitHub auth is unavailable.
3. Check GitHub PR comments, review threads, review decisions, and new Linear
   comments. Address actionable in-scope comments before claiming the PR is
   ready; reply or update Linear when a comment is out of scope or blocked.
4. Check PR status with `gh pr checks`.
5. If checks or review comments are pending:
   - poll inline for a short window when useful
   - if waiting would waste the worker session, create or update a 2-3 minute
     heartbeat automation for the worker thread and continue this loop there
   - update Linear with the watcher status and the current pending checks or
     comments
6. If a GitHub Actions check fails:
   - inspect logs
   - identify root cause using `systematic-debugging`
   - fix only if the change stays inside the Linear issue/PR scope
   - run relevant local verification
   - commit and push
   - update Linear with failure, fix, and verification evidence
   - continue watching
7. If all required checks pass and actionable comments are resolved:
   - update Linear with green/comment-resolved status and evidence
   - report ready for orchestrator acceptance

## Block Conditions

Stop and update Linear when:

- failure is external/provider/credential related
- failure is unrelated to the PR or already failing on base
- repeated flake fails after one rerun or configured retry budget
- fix requires out-of-scope files
- GitHub auth/logs/comments are unavailable
- PR review feedback requires human judgment or out-of-scope product changes
- CI failure requires human judgment or secrets

## Automation Prompt

When creating an automation, include:

- repo path
- PR URL
- Linear issue key
- current branch
- current head SHA
- max retry/fix attempts
- instruction to check GitHub checks, PR comments, review threads, review
  decisions, and Linear comments
- instruction to fix actionable in-scope failures/comments and push follow-up
  commits
- instruction to update Linear on green/failure/comment/block
- instruction to stop when green or blocked

Prefer a 2-3 minute heartbeat for an active worker PR. Use a longer or detached
automation only when the user or environment requires it.

Do not create duplicate watchers for the same PR; update or reuse an existing
automation when possible.
