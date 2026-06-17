---
name: grill-with-docs
description: Grilling session that challenges a plan against Ceird source, Linear context, CONTEXT.md language, and architecture docs. Use when the user wants to stress-test a plan, resolve product/domain ambiguity, or sharpen terminology before PRD, issue slicing, or implementation.
---

# Grill With Docs

Interview the user one question at a time, but do not ask questions that source,
Linear history, or architecture docs can answer.

## Process

1. Read the relevant current sources first:
   - `README.md`
   - `docs/README.md`
   - `docs/agents/domain.md`
   - relevant `docs/architecture/*`
   - `CONTEXT.md`
   - relevant Linear Project/PRD/issues/comments when the plan is Linear-backed
2. Run the `/grilling` skill for the interview loop: one question at a time,
   recommended answer included, codebase exploration instead of user questions
   when possible.
3. Run the `/domain-modeling` skill whenever the conversation changes product
   language, resolves an overloaded term, or records a durable decision.
4. Capture resolved implementation/product decisions in the right durable home:
   Linear for active work, `CONTEXT.md` for glossary terms, architecture guides
   for current source-backed behavior, and ADRs only when `domain-modeling`
   says the ADR bar is met.

## Output

End with the current decision tree:

- resolved decisions
- open questions, each with a recommended answer
- source or Linear evidence checked
- suggested next skill: usually `to-prd`, `to-issues`, `prototype`,
  `triage`, or `worker`
