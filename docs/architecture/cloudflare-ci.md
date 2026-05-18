# Cloudflare Alchemy Mainline CI

Ceird deploys the Cloudflare stack through Alchemy v2. The stack uses
`Cloudflare.state()`, so CI and local deploys share Cloudflare-backed remote
state rather than checked-in `.alchemy` files. The stack does not configure a
custom state-store Worker name; it relies on Alchemy's default shared
Cloudflare state store.

This repository is not using per-PR preview infrastructure. The deploy workflow
applies changes to the single shared live Cloudflare stack after `main` passes
the `Build` workflow.

## Alchemy Stage

Alchemy stage is the only infrastructure environment axis. CI must pass it
explicitly so GitHub Actions never falls back to Alchemy's default
`dev_${USER}` stage.

For the mainline deployment:

- `pnpm alchemy deploy --stage main --yes`
- `CEIRD_CLOUDFLARE=1`

The stage is passed as a CLI flag rather than through a separate environment
variable. This prevents accidental per-runner state namespaces if a future
GitHub runner environment changes.

Resource names are derived from the Alchemy stage, for example
`ceird-main-api`, `ceird-pr-42-api`, or `ceird-dev-cillian-api`. Any resources
from older stage naming schemes should be handled intentionally before the
corresponding native-stage deploy, rather than adopted accidentally.

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
- `PLAYWRIGHT_API_URL`
- `PLAYWRIGHT_BASE_URL`

E2E secrets:

- `PLAYWRIGHT_DATABASE_URL`

The `Build` workflow's Playwright E2E job also selects the `main` environment
so those environment-scoped variables and secrets are available when it tests
against the existing Alchemy stage.

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
- type-checks the app, API, and root infra helpers
- bootstraps Cloudflare state through `pnpm alchemy cloudflare bootstrap`
- deploys through `pnpm alchemy deploy --stage main --yes`
- serializes deploys with a GitHub Actions concurrency group
- lets Alchemy `Drizzle.Schema` update API migration snapshots before the native
  Neon branch resource applies `apps/api/drizzle`
- caps Hyperdrive origin database connections and points Hyperdrive at the typed
  Neon branch origin

`NEON_API_KEY` is used by Alchemy's Neon provider. The parent Alchemy stage
defaults to `main`; that stage creates the shared Neon project and `main`
branch, while other stages reference the `main` project and fork their own
branch from `main`. Set `CEIRD_NEON_PARENT_BRANCH_PROTECTED=true` only when the
Neon plan can create another protected branch. `CEIRD_NEON_HISTORY_RETENTION_SECONDS`
defaults to `21600` so the workflow declares the provider-reported Neon
retention window instead of re-planning it on every deploy.

The main deploy workflow does not set `CEIRD_APP_HOSTNAME` or
`CEIRD_API_HOSTNAME`, so it uses stage-scoped hostnames such as
`app-main.ceird.app` and `api-main.ceird.app`. Set those variables only for an
intentional canonical domain cutover after any existing Worker routes have been
cleared.

`CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` defaults to `5`, Cloudflare
Hyperdrive's minimum. Keep it below the Neon connection budget so there is room
for direct migration connections and provider control-plane checks. The parent
stage defaults `CEIRD_HYPERDRIVE_NAME` to `ceird-production-postgres` to adopt
the existing Cloudflare Hyperdrive config; override it only for a fresh
provider name or a deliberate replacement.

The root infra helpers track the current Alchemy v2 beta line documented by
v2.alchemy.run. Older local patches for beta.28 and
`@distilled.cloud/cloudflare@0.15.2` were removed after beta.40 published native
ESM-safe CLI imports and Cloudflare observability support.

## Alchemy Docs Notes

The Alchemy v2 CI guide recommends:

- using `state: Cloudflare.state()` for Cloudflare-backed state
- using GitHub Actions secrets/variables for CI credentials
- setting an explicit stage with `pnpm alchemy deploy --stage <stage>`
- optionally using `--adopt` when importing existing cloud resources into a
  fresh state store

The guide also describes a more advanced `stacks/github.ts` approach where
Alchemy creates scoped provider credentials and writes them into GitHub. Ceird
currently uses manually managed GitHub environment secrets to avoid giving the
stack token-management authority until that deployment model is needed.
