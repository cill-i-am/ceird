# Cloudflare Alchemy Mainline CI

Ceird deploys the Cloudflare POC through Alchemy v2. The stack uses
`Cloudflare.state({ workerName: "ceird-alchemy-state" })`, so CI and
local deploys share state through Cloudflare rather than through checked-in
`.alchemy` files.

This repository is not using per-PR preview infrastructure. The deploy workflow
applies changes to the single shared live Cloudflare stack after `main` passes
the `Build` workflow.

## Alchemy Stage

Alchemy has its own CLI stage in addition to the application naming stage loaded
from `CEIRD_INFRA_STAGE`. Both must be stable in CI.

For the mainline deployment:

- `ALCHEMY_STAGE=main`
- `CEIRD_ALCHEMY_STAGE=main`
- `CEIRD_INFRA_STAGE=production`

The `packages/infra/scripts/alchemy-env.mjs` wrapper injects `--stage` from
those environment variables when the caller does not pass one explicitly. This
prevents GitHub Actions from falling back to Alchemy's default
`dev_${USER}` stage, which would create a separate state namespace on every
runner.

The current live resource names are intended to be `ceird-production-*`. The
original local POC used `task-tracker-preview-*` under the local
`dev_cillianbarron` Alchemy stage; those resources should be destroyed before
the first `ceird-production` deploy, rather than adopted into CI.

## GitHub Secrets And Variables

Create a GitHub environment named `main` and add:

Secrets:

- `AUTH_EMAIL_FROM`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `PLANETSCALE_API_TOKEN`
- `PLANETSCALE_API_TOKEN_ID`

Variables:

- `AUTH_EMAIL_FROM_NAME`
- `PLANETSCALE_ORGANIZATION`

`CLOUDFLARE_API_TOKEN` must be able to read and update the Cloudflare state
store, deploy Workers, manage custom domains, queues, Hyperdrive, and create the
runtime auth-email API token. Alchemy's CI guide specifically calls out that
`Cloudflare.state()` needs Cloudflare Secrets Store Write in CI because Alchemy
reads the state-store token back through an ephemeral edge-preview Worker with a
secret binding.

## Workflow

`.github/workflows/deploy-main.yml` deploys on:

- successful `Build` workflow runs on `main`
- manual `workflow_dispatch`

The workflow:

- installs dependencies with pnpm
- type-checks the app and infra package
- deploys through `pnpm --filter @task-tracker/infra run deploy`
- serializes deploys with a GitHub Actions concurrency group
- applies migrations by default through `APPLY_MIGRATIONS=true`

Use the manual `apply_migrations=false` input only when intentionally testing a
deploy that must not touch the database schema.

## Alchemy Docs Notes

The Alchemy v2 CI guide recommends:

- using `state: Cloudflare.state()` for Cloudflare-backed state
- using GitHub Actions secrets/variables for CI credentials
- setting an explicit stage with `alchemy deploy --stage <stage>`
- optionally using `--adopt` when importing existing cloud resources into a
  fresh state store

The guide also describes a more advanced `stacks/github.ts` approach where
Alchemy creates scoped provider credentials and writes them into GitHub. We are
not adding that yet; for this POC, manually managed GitHub environment secrets
are simpler and avoid giving the stack token-management authority until we
decide the deployment model is worth keeping.
