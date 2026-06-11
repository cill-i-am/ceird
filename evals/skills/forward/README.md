# Forward Skill Evals

Forward eval packs are mocked, cold-start behavior tests for the local agent
workflow skills.

They do not call a model directly. Instead, each pack contains:

- the skills an isolated agent should use
- mock Linear, GitHub, CI, or repository fixtures
- rubric criteria to score the agent's output
- required response sections

Render copyable prompts with:

```bash
pnpm eval:skills:forward
```

Use each rendered prompt in a fresh Codex thread or subagent. Do not include the
expected answer or prior analysis. Score the resulting output against the
referenced rubric, then tighten the relevant skill when failures repeat.
