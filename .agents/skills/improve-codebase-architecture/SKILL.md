---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one the user picks.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors
that turn shallow modules into deep ones. The aim is testability and
AI-navigability.

This command is informed by Ceird's domain model and built on shared design
vocabulary:

- Run `/codebase-design` for architecture vocabulary: **module**,
  **interface**, **depth**, **seam**, **adapter**, **leverage**, and
  **locality**. Use those terms exactly in every suggestion.
- Read `CONTEXT.md` for product language. The domain language gives names to
  good seams.
- Read relevant `docs/architecture/*` and `docs/agents/*` guides so the review
  does not re-litigate current source-backed decisions.

## Process

### 1. Explore

Read the project's domain glossary and relevant architecture/workflow guides
first.

Then explore the codebase organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small
  modules?
- Where are modules **shallow**: interface nearly as complex as the
  implementation?
- Where have pure functions been extracted just for testability, but the real
  bugs hide in how they are called?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their
  current interface?

Apply the deletion test from `/codebase-design` to suspected shallow modules:
would deleting it concentrate complexity, or just move it?

### 2. Present Candidates As An HTML Report

Write a self-contained HTML file to the OS temp directory so nothing lands in
the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or
`%TEMP%` on Windows), and write to
`<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file.
Open it for the user and tell them the absolute path.

Use [HTML-REPORT.md](HTML-REPORT.md) for the scaffold, diagram patterns, and
tone. Each candidate gets:

- files/modules involved
- problem
- solution
- benefits in terms of locality, leverage, and tests
- before/after diagram
- recommendation strength: `Strong`, `Worth exploring`, or `Speculative`

Use `CONTEXT.md` vocabulary for the domain and `/codebase-design` vocabulary for
the architecture. Do not propose interfaces yet. After the report is written,
ask: "Which of these would you like to explore?"

### 3. Grilling Loop

Once the user picks a candidate, run `/grilling` to walk the design tree with
them: constraints, dependencies, the deepened module, what sits behind the seam,
and what tests survive.

Side effects happen inline as decisions crystallize:

- Run `/domain-modeling` when the candidate introduces or sharpens product
  language.
- If the user rejects a candidate for a durable, load-bearing reason, ask
  whether to record it in Linear, an architecture guide, or an ADR according to
  `/domain-modeling`.
- If the user wants alternative interfaces for the deepened module, run
  `/codebase-design` and use its design-it-twice parallel sub-agent pattern.
