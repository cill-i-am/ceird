---
name: domain-modeling
description: Build and sharpen Ceird's domain model. Use when the user wants to pin down product terminology, update CONTEXT.md, record a durable decision, resolve overloaded language, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `CONTEXT.md` for vocabulary is not this skill — that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

For Ceird, current source code, Linear Project/PRD state, `CONTEXT.md`, and
`docs/architecture/*` are the durable sources of truth. Historical plans under
`docs/superpowers/*` are context only; verify them against source before
recording new language or decisions.

## File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. Ceird already uses
the root `CONTEXT.md` as its product glossary; keep using that unless a
multi-context map is intentionally introduced.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Record decisions sparingly

First choose the right durable home:

- Linear Project/PRD or issue comment: active product scope, acceptance,
  blockers, HITL decisions, execution evidence.
- `CONTEXT.md`: domain/product terminology only.
- `docs/architecture/*`: current source-backed runtime, route, API,
  persistence, shared package, local development, infrastructure, or workflow
  behavior.
- `docs/adr/`: only for rare cross-cutting decisions that are hard to reverse,
  surprising without context, and not better represented by an existing
  architecture guide.

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. If the decision changes current
architecture or workflow behavior, update the relevant guide under
`docs/architecture/` or `docs/agents/` instead. Use the format in
[ADR-FORMAT.md](./ADR-FORMAT.md) only when a standalone ADR is still the right
home.
