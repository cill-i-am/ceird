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

## Worktrees And Sandboxes

When working from a linked git worktree, prefer the sandbox workflow over the host-level dev scripts.

- Use `pnpm sandbox:up` to boot app, api, and Postgres for the current worktree.
- Use `pnpm sandbox:status` or `pnpm sandbox:url` to discover the current worktree's endpoints.
- Use `pnpm sandbox:logs` when debugging sandboxed services.
- Use `pnpm sandbox:down` when you are finished with that worktree's sandbox.
- Prefer the sandbox URLs and `portless` aliases for worktree development. Fall back to the loopback URLs printed by the CLI when aliases are unavailable.
- Do not default to `pnpm dev` inside linked worktrees unless the user explicitly asks for the non-sandbox flow.

## Type Boundaries

Model runtime and type safety according to the boundary the code is crossing.

- Use `Config` or `Schema` at input/output boundaries such as environment loading, HTTP payloads, persistence boundaries, and external integrations.
- Prefer inferred types from `Schema` for shared DTOs and domain payloads that cross module or service boundaries.
- Keep plain TypeScript interfaces and types for simple internal computed objects that stay inside a trusted local implementation and do not need runtime decoding.
- Do not add runtime schemas for internal shapes unless they provide a clear boundary-level benefit such as decoding, validation, serialization, or contract sharing.

<!-- stripe-projects-cli managed:agents-md:start -->
## Stripe Projects CLI

This repository is initialized for the Stripe project "task-tracker".

## Tools used

- [Stripe CLI](https://docs.stripe.com/stripe-cli) with the `projects` plugin to manage third-party services, credentials, and deployments for this project. Use the stripe-projects-cli to manage deploying and access to third party services.
<!-- stripe-projects-cli managed:agents-md:end -->

<!-- stripe-projects-cli managed:claude-md:start -->
look at AGENTS.md for your rules
<!-- stripe-projects-cli managed:claude-md:end -->
