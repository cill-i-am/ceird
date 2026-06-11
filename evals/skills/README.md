# Skill Evals

This directory holds deterministic contract evals for the local agent skill
suite. They are not a replacement for live forward-testing, but they are cheap
drift checks that can run in CI.

Run them with:

```bash
node scripts/run-skill-evals.mjs
```

For machine-readable output:

```bash
node scripts/run-skill-evals.mjs --json
```

The runner checks two layers:

- Static suite checks: required skills/docs exist, adapted local skills are not
  pinned to upstream locks, upstream Matt Pocock/shadcn skills remain locked,
  and stale duplicate review skill references are gone.
- Scenario contracts: each JSON fixture describes a realistic user prompt, the
  skills that should be involved, and the durable guarantees that must appear in
  the relevant skill or workflow docs.
- Forward packs: mocked behavior evals with fixture Linear/GitHub/CI state,
  rubric criteria, and copyable prompts for isolated agents.

Render forward-test prompts with:

```bash
pnpm eval:skills:forward
```

## Forward-Testing

For model-behavior signal, use these scenarios as prompts for isolated Codex
subagents. Pass only the rendered forward prompt, avoid leaking the expected
answer or prior analysis, then score the output against the referenced rubric.
Keep live Linear/GitHub mutations behind mocks or a temporary sandbox project
unless the user explicitly approves production writes.
