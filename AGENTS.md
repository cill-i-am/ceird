# Agent Context

## Project Status

This is a greenfield project and has not been released.

- Do not optimize for backward compatibility.
- Do not preserve workarounds unless they still make clear architectural sense.
- Prefer clean, sweeping refactors over incremental patching when that improves the codebase.
- It is fine to reshape APIs, folder structure, and internal architecture when needed.
- Keep the code simple and readable.
- Ensure maximum type safety.
- Always leave the codebase better than you found it.

## Dependency Source

This repo keeps fetched dependency source code in `opensrc/` for local agent context.

- Check `opensrc/sources.json` for the current fetched package list.
- Use those local sources when behavior is unclear from types alone.
- Do not commit files from `opensrc/`; the directory is intentionally gitignored.

## Documentation And Source Of Truth

Treat current source code and architecture guides as the authority, and treat
historical plans as decision context only.

- Start with `README.md`, `docs/README.md`, and the relevant guide under
  `docs/architecture/` when orienting on an unfamiliar area.
- When code changes affect routes, API contracts, persistence, shared package
  boundaries, local development behavior, or infrastructure, update the matching
  architecture guide in the same change.
- Use `docs/superpowers/specs` and `docs/superpowers/plans` to understand prior
  intent, but verify current behavior against source before relying on them.

## Worktrees And Alchemy Stages

Local development is Alchemy-native. Root `pnpm dev` delegates to
`alchemy dev --env-file .env.local`, which creates or updates the selected
Cloudflare/Neon stage.

- Before starting an Alchemy dev stage from a linked worktree, check the current
  branch. If the worktree is detached, create or switch to a descriptive
  `codex/<task-slug>` branch, or pass an explicit `--stage`.
- Stages should have intentional, task-specific names. Prefer branch-derived
  names such as `codex-my-task`; avoid generic names like `dev` unless that is
  explicitly requested.
- Use `pnpm dev -- --stage <stage>` for local cloud-backed development, or
  `CEIRD_CLOUDFLARE=1 pnpm alchemy dev --env-file .env.local --stage <stage>`
  when calling the Alchemy CLI directly.
- Use `CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage <stage>`
  for non-dev reconciliation and
  `CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --env-file .env.local --stage <stage>`
  only when intentionally deleting a stage's resources.
- Do not run provider-mutating Alchemy commands (`dev`, `deploy`, or `destroy`)
  without confirming the target stage and credentials are appropriate.
- For browser workflows that depend on auth cookies, API calls, or database
  state, use the app/API URLs emitted by Alchemy for the selected stage.

## Linear Issues And Pull Requests

When a task is associated with a Linear issue, use the Linear issue title as the pull request title, including the issue key when it is part of the title, such as `TSK-4 My Linear Issue`.

This lets Linear associate the pull request with the issue and move workflow states automatically.

## Sub-Agent Defaults

When spawning Codex sub-agents, set `reasoning_effort` explicitly because
sub-agents otherwise inherit the parent thread's reasoning effort.

- Use `low` for focused exploration, bounded implementation, and parallel
  investigation tasks.
- Use `medium` for spec compliance review and fix agents unless the task is
  clearly mechanical.
- Use `high` for code quality review and final implementation review.
- Use `xhigh` for broad or risky reviews involving architecture, auth/security,
  persistence, migrations, infrastructure, or cross-package contracts.
- When using `medium` or higher, mention the reason in the dispatch context or
  progress update.

## Type Boundaries

Model runtime and type safety according to the boundary the code is crossing.

- Use `Config` or `Schema` at input/output boundaries such as environment loading, HTTP payloads, persistence boundaries, and external integrations.
- Prefer inferred types from `Schema` for shared DTOs and domain payloads that cross module or service boundaries.
- Keep plain TypeScript interfaces and types for simple internal computed objects that stay inside a trusted local implementation and do not need runtime decoding.
- Do not add runtime schemas for internal shapes unless they provide a clear boundary-level benefit such as decoding, validation, serialization, or contract sharing.

## Verification

Run the narrowest relevant checks while iterating, then broaden when the change
touches shared behavior.

- Use package filters such as `pnpm --filter app test`, `pnpm --filter api test`,
  or `pnpm --filter @ceird/jobs-core test` for focused feedback.
- For cross-package or handoff-ready changes, prefer `pnpm check-types`,
  `pnpm test`, `pnpm lint`, and `pnpm format`.
- For browser workflows that depend on auth cookies, API calls, or database
  state, use an explicit Alchemy stage and run the affected Playwright tests
  against that stage's app/API URLs.
- For database schema changes, generate and inspect the Drizzle migration under
  `apps/api/drizzle`, then verify the API and native Neon branch migration path.

<!-- stripe-projects-cli managed:agents-md:start -->

## Stripe Projects CLI

This repository is initialized for the Stripe project "ceird".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->

## Hotkeys And UI Actions

When adding or changing app UI, treat keyboard access as part of the feature.

- Any new route, primary navigation target, workflow action, repeated list action, drawer/form action, command/menu item, or icon-only control should either have a hotkey or an explicit reason why a hotkey would be harmful or unnecessary.
- Register shortcuts through the app hotkey layer rather than ad hoc `keydown` listeners.
- Show discoverability with the shared shortcut UI, such as keycaps in command rows, menu rows, tooltips, and the keyboard shortcuts help overlay.
- Keep shortcuts context-aware. Avoid global single-key shortcuts while the user is typing or when the action is unavailable.
