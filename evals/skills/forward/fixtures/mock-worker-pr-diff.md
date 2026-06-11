# Mock Worker PR Diff

PR: https://github.com/example/ceird/pull/77
Issue: TSK-103 Aggregate weekly digest activity

Relevant diff summary:

- Adds `getWeeklyDigestActivity(workspaceId, weekStart)`.
- Includes comments and resolved threads.
- Does not include label changes.
- Tests cover workspace filtering for comments only.
- Linear comment says "ready, all criteria complete".

Recent parent PRD comment after worker dispatch:

> Label changes are required for the first slice because admins rely on them to
> detect taxonomy churn.

Expected orchestrator behavior:

- Do not accept the PR as done.
- Send targeted feedback to the worker about missing label changes and tests.
- Keep TSK-103 in review or in progress until the spec gap is fixed.
