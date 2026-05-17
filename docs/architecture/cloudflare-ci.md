# Cloudflare Alchemy Mainline CI

Ceird deploys the Cloudflare POC through Alchemy v2. The stack uses
`Cloudflare.state({ workerName: "ceird-alchemy-state" })`, so CI and
local deploys share state through Cloudflare rather than through checked-in
`.alchemy` files.

This repository is not using per-PR preview infrastructure. The deploy workflow
applies changes to the single shared live Cloudflare stack after `main` passes
the `Build` workflow.

## Alchemy Stage

Alchemy stage is the only infrastructure environment axis. CI must pass it
explicitly so GitHub Actions never falls back to Alchemy's default
`dev_${USER}` stage.

For the mainline deployment:

- `ALCHEMY_STAGE=main`
- `CEIRD_ALCHEMY_STAGE=main`

The root `pnpm alchemy ...` wrapper injects `--stage` from
those environment variables when the caller does not pass one explicitly. This
prevents accidental per-runner state namespaces.

Resource names are derived from the Alchemy stage, for example
`ceird-main-api`, `ceird-pr-42-api`, or `ceird-dev-cillian-api`. Any old
`ceird-production-*` or `ceird-preview-*` resources from the earlier split-stage
POC should be handled intentionally before the corresponding native-stage
deploy, rather than adopted accidentally.

## GitHub Secrets And Variables

Create a GitHub environment named `main` and add:

Secrets:

- `AUTH_EMAIL_FROM`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GOOGLE_MAPS_API_KEY`
- `NEON_API_KEY`

Variables:

- `AUTH_EMAIL_FROM_NAME`
- `NEON_ORG_ID` (optional)

`CLOUDFLARE_API_TOKEN` must be able to read and update the Cloudflare state
store, deploy Workers, manage custom domains, queues, Hyperdrive, and bind
Cloudflare Email Service to the API Worker. Alchemy's CI guide specifically calls out that
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
- deploys through `pnpm alchemy deploy`
- serializes deploys with a GitHub Actions concurrency group
- lets Alchemy `Drizzle.Schema` update API migration snapshots before the native
  Neon branch resource applies `apps/api/drizzle`
- caps Hyperdrive origin database connections and points Hyperdrive at the typed
  Neon branch origin

`NEON_API_KEY` is used by Alchemy's Neon provider. The parent Alchemy stage
defaults to `main`; that stage creates the shared Neon project and a protected
`main` branch, while other stages reference the `main` project and fork their
own branch from `main`.

This branch removes the PlanetScale provider dependency. If the shared Alchemy
state still contains old `PlanetScale.*` resources, clean them up or reset the
state before the first Neon deploy; otherwise Alchemy may be unable to plan
deletions for resource types whose provider is no longer installed.

`CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` defaults to `5`, Cloudflare
Hyperdrive's minimum. Keep it below the Neon connection budget so there is room
for direct migration connections and provider control-plane checks.

The infra package tracks the current Alchemy v2 beta line documented by
v2.alchemy.run. Older local patches for beta.28 and
`@distilled.cloud/cloudflare@0.15.2` were removed after beta.40 published native
ESM-safe CLI imports and Cloudflare observability support.

## Alchemy Docs Notes

The Alchemy v2 CI guide recommends:

- using `state: Cloudflare.state()` for Cloudflare-backed state
- using GitHub Actions secrets/variables for CI credentials
- setting an explicit stage with `pnpm alchemy deploy -- --stage <stage>`
- optionally using `--adopt` when importing existing cloud resources into a
  fresh state store

The guide also describes a more advanced `stacks/github.ts` approach where
Alchemy creates scoped provider credentials and writes them into GitHub. We are
not adding that yet; for this POC, manually managed GitHub environment secrets
are simpler and avoid giving the stack token-management authority until we
decide the deployment model is worth keeping.
