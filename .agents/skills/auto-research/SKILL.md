---
name: auto-research
description: Run bounded autonomous improvement loops toward a measurable engineering, code quality, product, or UX goal. Use when the user invokes /auto-research or $auto-research, asks for N repeated attempts, wants Codex to keep/discard experiments, requests overnight or recurring autonomous work, or wants to improve a metric such as complexity, performance, test failures, accessibility, UI quality, or review findings until a stop condition is reached.
---

# Auto Research

Use this skill to run an autoresearch-style loop: define a target, measure the current state, make one experiment, verify it, keep the change only if it improves the score, then repeat until the budget or stop condition is met.

The pattern is inspired by `karpathy/autoresearch`, adapted for general software work rather than fixed LLM training experiments.

## Invocation

Accept both `$auto-research` and `/auto-research` as equivalent user intent.

Interpret arguments this way:

```text
/auto-research "<goal>" <loop-count-or-stop-condition>
$auto-research "<goal>" --loops 20
$auto-research "<goal>" --until "<condition>"
$auto-research "<goal>" --loops 20 --automate
```

- The first positional argument is the goal.
- If the second positional argument is an integer, treat it as the loop count.
- If the second positional argument is text, treat it as the stop condition.
- If no loop count is supplied, default to 5 loops.
- If invoked as `/auto-research` or `$auto-research` with a goal and loop specification, default to Automation Mode unless the user says "run now", "do it here", or otherwise clearly asks for current-thread execution.
- Also use Automation Mode when the user says "overnight", "keep going", "run later", "automate", or "recurring".

Examples:

```text
/auto-research "get cyclomatic complexity of all functions below 5" 20
/auto-research "improve the UX of the dashboard" "use impeccable critique until there are no P0/P1 findings"
/auto-research "reduce bundle size without changing behavior" --loops 10
```

## Operating Contract

Before editing code, establish the contract for this run:

1. Restate the goal in one sentence.
2. Define the score or gate used to decide whether a loop is better.
3. Define the stop condition: loop count, metric threshold, review threshold, time budget, or a combination.
4. Define the verification commands that must pass before a change can be kept.
5. Define the edit scope: likely files, packages, or surfaces.
6. Record the current branch and git status.

If the goal is too vague to score, choose a reasonable proxy and say so. Ask a concise question only when scoring cannot be inferred safely.

## Score Selection

Prefer objective, machine-checkable scores:

- Complexity: number of functions above threshold, max complexity, average complexity.
- Tests: failing test count, specific failing suites, coverage threshold.
- Types: TypeScript or schema errors count.
- Performance: bundle size, render time, API latency, Lighthouse score, query count.
- Accessibility: axe violations, keyboard traps, contrast failures.
- UX quality: findings from `$impeccable critique`, `$impeccable audit`, or another named evaluator.

For qualitative goals, convert "better" into a review gate:

- "Improve UX" becomes "no P0/P1 findings from the chosen review pass, no regressions in typecheck/tests, and visible issues addressed in priority order."
- "Use impeccable until it has no more suggestions" becomes "run the relevant `$impeccable` evaluator and stop when there are no P0/P1 findings, or after the loop budget is exhausted."
- "Polish the app" becomes "fix the highest-priority polish findings first, keep only changes that reduce issue severity or count."

Do not use an unbounded "no suggestions at all" stop condition. Good evaluators can always produce another low-priority suggestion.

## Setup

Follow project instructions such as `AGENTS.md` first.

Use a dedicated branch unless the user explicitly says to stay on the current branch. Name it with the normal project prefix:

```text
codex/auto-research-<short-goal-slug>
```

Protect existing work:

- Treat pre-existing dirty files as user work.
- Do not overwrite or revert changes that existed before the run.
- Do not touch `opensrc/` unless the user explicitly asks.
- Keep the edit scope as small as the goal permits.

Create a run log directory and leave it uncommitted unless the user asks otherwise:

```text
.auto-research/<run-slug>/results.jsonl
```

Each JSONL row should include:

```json
{"iteration":1,"goal":"...","idea":"...","score_before":"...","score_after":"...","verification":["..."],"decision":"keep|discard|crash","reason":"...","commit":"optional-short-sha","files":["..."]}
```

If `.auto-research/` is not gitignored, keep it untracked by default.

## Loop

For each iteration:

1. Inspect the current best score and recent log rows.
2. Pick one coherent experiment. Favor the highest expected score improvement with limited blast radius.
3. Make the change.
4. Run the verification commands and the scoring command.
5. Decide:
   - `keep` when verification passes and the score improves, or the agreed qualitative gate improves without regressions.
   - `discard` when verification fails, the score worsens, or the change adds complexity without enough benefit.
   - `crash` when the idea is broken or cannot be made to run after a small fix attempt.
6. Log the result.
7. Commit kept iterations only, staging only files changed by that iteration. Use messages like `auto-research: reduce task form branching`.
8. Revert discarded or crashed iteration changes only for files changed in that iteration.

Before reverting, inspect `git status --short` and the file list from the iteration. Never revert unrelated user changes. Prefer reversing the patch from the current iteration or restoring only files that are known to be owned by the iteration.

## Fix Attempts

If an iteration fails because of a small implementation mistake, make up to two focused fix attempts inside the same iteration. Examples:

- Type error from a renamed symbol.
- Missing import.
- Test expectation that needs to match the intended behavior.

Do not spend the full loop budget rescuing a weak idea. If the approach is fundamentally worse, discard it and move on.

## Automation Mode

Use app automations when the user invokes this skill with a goal and loop specification, or when they ask for detached, recurring, overnight, or later work. Current-thread execution is the fallback when the user explicitly asks to run now or when the automation tool is unavailable.

Automation behavior:

- Prefer a cron automation for detached workspace work.
- Prefer a heartbeat automation only when continuing this same thread soon.
- Each automation run should resume from the `.auto-research/<run-slug>/results.jsonl` log and perform a small batch, usually 1 to 3 iterations.
- The automation prompt must include the goal, stop condition, scoring gate, verification commands if known, branch name, and log path.
- Pass schedule, workspace, and destination via the automation tool fields, not inside the prompt.
- Tell the automation to stop or pause itself when the loop budget or stop condition is reached.

If the automation tool is unavailable, explain that the environment cannot create a scheduled run and offer to execute the loop in the current thread.

## Working With Other Skills

If the goal names another skill, use it normally inside the loop:

- `$impeccable critique` or `$impeccable audit` can supply UX findings and severity gates.
- `$systematic-debugging` can guide repeated failure reduction.
- `$verification-before-completion` applies before claiming the run succeeded.

Do not spawn subagents unless the user explicitly asked for parallel agents or delegation.

## Final Report

When the run stops, report:

- Goal and stop condition.
- Starting score and final score.
- Loops attempted, kept, discarded, and crashed.
- Kept commits, if any.
- Files changed.
- Verification commands run.
- Remaining highest-value next experiments.

Keep the report concise. Include blockers honestly when verification or scoring could not be completed.
