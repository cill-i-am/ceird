---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts: Linear
Projects/PRDs/issues/comments, architecture guides, `CONTEXT.md`, ADRs, PRs,
commits, diffs, or generated reports. Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

For Ceird, include the repo path, current branch, Linear issue or Project links
when known, PR URL when known, verification already run, and the next likely
skill (`grill-with-docs`, `to-prd`, `to-issues`, `orchestrator`, `worker`,
`production-ready`, `ci-watch`, or `systematic-debugging`).
