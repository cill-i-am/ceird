---
name: ci-watch
description: Watch a GitHub PR's CI after creation, inspect failing checks, fix actionable in-scope failures, push follow-up commits, update Linear, and continue until green or genuinely blocked. Use after production-ready opens a PR or when asked to monitor/fix CI.
---

# CI Watch

Own PR checks until they are green or genuinely blocked.

## Inputs

- PR URL or current branch PR
- Linear issue key and parent Project when available
- issue scope and out-of-scope boundaries

Use GitHub tooling for PR/check/log inspection. Use the GitHub `gh-fix-ci` skill
or its bundled scripts when GitHub Actions checks fail.

## Loop

1. Resolve the PR from URL or current branch.
2. Run `gh auth status`; stop if GitHub auth is unavailable.
3. Check PR status with `gh pr checks`.
4. If checks are pending:
   - poll inline for a short window when useful
   - if waiting would waste the worker session, create a heartbeat or detached
     automation to check back and continue this loop
5. If a GitHub Actions check fails:
   - inspect logs
   - identify root cause using `systematic-debugging`
   - fix only if the change stays inside the Linear issue/PR scope
   - run relevant local verification
   - commit and push
   - update Linear with failure, fix, and verification evidence
   - continue watching
6. If all required checks pass:
   - update Linear with green status and evidence
   - report ready for orchestrator acceptance

## Block Conditions

Stop and update Linear when:

- failure is external/provider/credential related
- failure is unrelated to the PR or already failing on base
- repeated flake fails after one rerun or configured retry budget
- fix requires out-of-scope files
- GitHub auth/logs are unavailable
- CI failure requires human judgment or secrets

## Automation Prompt

When creating an automation, include:

- repo path
- PR URL
- Linear issue key
- current branch
- max retry/fix attempts
- instruction to update Linear on green/failure/block
- instruction to stop when green or blocked

Do not create duplicate watchers for the same PR; update or reuse an existing
automation when possible.
