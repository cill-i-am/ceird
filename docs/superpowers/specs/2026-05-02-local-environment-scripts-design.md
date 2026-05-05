# Local Environment Scripts Design

## Summary

Add generic repository scripts for local environment setup and teardown so Codex
local environments, humans, and future automation all use the same workflow.

The setup script prepares a worktree for development by enabling Corepack,
installing dependencies, and ensuring `.env.local` exists. The teardown script
stops the worktree sandbox without making teardown noisy when no sandbox is
running.

Sandbox startup remains an explicit action. This keeps setup fast and avoids
leaving Docker Compose services running for threads that only need editing,
planning, or tests.

## Goals

- provide generic script names that are not tied to Codex
- keep Codex app setup configuration small and stable
- support linked worktrees by copying `.env.local` from another repository
  worktree when available
- allow an explicit env source path for unusual layouts
- create a minimal safe sandbox env file if no source env file exists
- expose teardown as a reusable script around `pnpm sandbox:down`
- make scripts idempotent and safe to run repeatedly
- test the setup and teardown behavior with command stubs

## Non-Goals

- automatically starting the sandbox during setup
- changing the sandbox CLI lifecycle or Docker Compose model
- committing real secrets or generated `.env.local` files
- replacing direct `pnpm sandbox:*` scripts in `package.json`
- adding platform-specific Codex app configuration to source control

## Current Problems

Codex local environments can run arbitrary setup scripts and actions, but the
repo currently does not have one checked-in setup entry point for worktree
preparation. That pushes small pieces of project knowledge into each Codex app
configuration:

- dependency setup
- `.env.local` copying
- sandbox teardown
- which sandbox actions should be explicit rather than automatic

This is easy to drift over time and harder to review in pull requests.

## Design

### Script Names

Add two root-level scripts:

- `scripts/setup-local-environment.sh`
- `scripts/teardown-local-environment.sh`

The names describe the repository workflow rather than a specific agent or UI.

### Setup Behavior

`scripts/setup-local-environment.sh` should:

1. resolve the repository root with `git rev-parse --show-toplevel`
2. run from the repository root
3. run `corepack enable`
4. run `pnpm install --frozen-lockfile`
5. leave an existing `.env.local` untouched
6. copy `.env.local` from `LOCAL_ENV_SOURCE` when that variable points to a
   file
7. otherwise search other `git worktree list --porcelain` entries for a
   `.env.local` file and copy the first match
8. otherwise create a minimal `.env.local` that supports sandbox startup with
   noop email delivery:

```dotenv
AUTH_EMAIL_FROM=auth@ceird.localhost
AUTH_EMAIL_FROM_NAME=Ceird
AUTH_EMAIL_TRANSPORT=noop
```

The script should print concise status lines so humans can tell whether env was
copied, preserved, or created.

### Teardown Behavior

`scripts/teardown-local-environment.sh` should:

1. resolve and enter the repository root
2. run `pnpm sandbox:down`
3. exit successfully even when `sandbox:down` reports that nothing was running

This makes the script safe as a Codex action at the end of a thread.

### Codex Local Environment Shape

Codex setup should call only:

```sh
bash scripts/setup-local-environment.sh
```

Codex actions should include:

```sh
bash scripts/teardown-local-environment.sh
pnpm sandbox:up
pnpm sandbox:url
pnpm sandbox:status
pnpm sandbox:logs
pnpm check-types
pnpm test
pnpm check
```

## Testing

Add `scripts/local-environment.test.mjs` using `node:test`. The tests should
create temporary git repositories and fake `corepack` and `pnpm` executables so
the shell scripts can be tested without installing dependencies or running
Docker.

Required coverage:

- setup copies `.env.local` from `LOCAL_ENV_SOURCE`
- setup preserves an existing `.env.local`
- setup creates the minimal fallback env when no source exists
- teardown calls `pnpm sandbox:down` and exits successfully if the command
  fails because there is nothing to stop

## Review Checklist

- no real secrets are committed
- script names are generic
- setup is idempotent
- sandbox startup remains explicit
- teardown is safe to run repeatedly
- Codex instructions are documented in the pull request and final handoff
