---
name: subagent-execution
description: Delegate bounded implementation, investigation, and review tasks to focused subagents with explicit reasoning effort. Use inside worker or orchestrator sessions when independent subtasks, spec checks, or risk-based reviews can be done in parallel.
---

# Subagent Execution

Use subagents to reduce cost, isolate context, and improve review quality. The
controller remains responsible for verifying results.

## When To Use

- independent implementation subtasks inside one Linear issue
- focused investigation or debugging domains
- spec-compliance review against Linear issue/PRD
- code quality or risk review before `production-ready`
- multiple unrelated failures or flaky tests

Do not use subagents when tasks would edit the same files concurrently without a
clear owner, or when the full system context is required in one head.

## Reasoning Defaults

Set `reasoning_effort` explicitly:

- `low`: focused exploration, bounded implementation, mechanical fixes
- `medium`: spec compliance review, fix agents, integration tasks
- `high`: code quality review, auth/security, persistence, architecture
- `xhigh`: broad/high-risk review across auth, data, infra, migrations, or
  cross-package contracts

## Prompt Shape

Every subagent prompt should include:

- Linear issue key/title and the relevant acceptance criteria
- parent PRD/project summary when needed
- exact scope and files, if known
- constraints and out-of-scope boundaries
- expected output format
- whether it may edit files or is read-only
- required verification commands for edit agents

Subagents do not inherit the controller's context. Inline the context they need
or point to exact local files they must read.

## Review Loop

For implementation subtasks:

1. Dispatch implementer.
2. Read report and diff.
3. Dispatch or perform spec-compliance review.
4. Dispatch or perform code-quality/risk review.
5. Ask the implementer to fix targeted findings.
6. Verify materially, not just by trusting the subagent report.

## Stop Conditions

Escalate to the user or orchestrator when:

- subagent reports `NEEDS_CONTEXT` twice
- subagent reports `BLOCKED`
- implementation requires out-of-scope files
- tests fail repeatedly without root cause
- the Linear issue appears wrong or stale
