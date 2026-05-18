# Cloudflare Alchemy CI

Ceird deploys the Cloudflare stack through Alchemy v2. The stack uses
`Cloudflare.state()`, so CI and local deploys share Cloudflare-backed remote
state rather than checked-in `.alchemy` files. The stack does not configure a
custom state-store Worker name; it relies on Alchemy's default shared
Cloudflare state store.

CI owns two deployment paths:

- `.github/workflows/preview.yml` deploys persistent same-repository pull
  request previews and runs Playwright E2E against the preview app/API.
- `.github/workflows/deploy-main.yml` deploys the canonical `main` stage after
  `main` passes the `Build` workflow. Main deploy behavior is intentionally
  separate from preview deploy behavior.

## Alchemy Stage

Alchemy stage is the only infrastructure environment axis. CI must pass it
explicitly so GitHub Actions never falls back to Alchemy's default
`dev_${USER}` stage.

For mainline deployment:

- `pnpm alchemy deploy --stage main --yes`
- `CEIRD_CLOUDFLARE=1`

For pull request previews:

- `pnpm alchemy deploy --stage pr-${PR_NUMBER} --yes`
- `pnpm alchemy destroy --stage pr-${PR_NUMBER} --yes`
- `CEIRD_CLOUDFLARE=1`

The stage is passed as a CLI flag rather than through a separate environment
variable. This prevents accidental per-runner state namespaces if a future
GitHub runner environment changes.

Resource names are derived from the Alchemy stage, for example
`ceird-main-api`, `ceird-pr-42-api`, or `ceird-dev-cillian-api`. Any resources
from older stage naming schemes should be handled intentionally before the
corresponding native-stage deploy, rather than adopted accidentally.

## GitHub Secrets And Variables

Create a GitHub environment named `main` for production deploys and main-stage
E2E. Create `preview-deploy` and `preview-cleanup` for pull request previews.
`preview-deploy` should require reviewer approval through GitHub environment
protection rules so same-repository PR code is reviewed before provider secrets
are exposed. `preview-cleanup` should not require reviewer approval, otherwise
PR cleanup can stall after a branch is closed.

For `main`, add:

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

The `Build` workflow's Playwright E2E job selects the `main` environment only on
trusted pushes to `main`, so those environment-scoped variables and secrets are
not exposed to pull-request code while still testing the live Alchemy stage
before deployment.

For both `preview-deploy` and `preview-cleanup`, add:

Secrets:

- `ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS`
- `AUTH_EMAIL_FROM`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `GOOGLE_MAPS_API_KEY`
- `NEON_API_KEY`

Variables:

- `AUTH_EMAIL_FROM_NAME`
- `NEON_ORG_ID` (optional)

Preview E2E does not store `PLAYWRIGHT_DATABASE_URL` as a GitHub secret. After
deploy, `.github/workflows/preview.yml` reads the preview stage's
`PostgresBranch` state and pipes the JSON to
`scripts/export-playwright-database-url.mjs`. The helper extracts
`attr.connectionUri` from either the current redacted Alchemy encoding
(`{"__redacted__":"..."}`) or a plain string, emits a GitHub Actions
`add-mask` command for the value, and writes `PLAYWRIGHT_DATABASE_URL` to
`GITHUB_ENV`.

Preview stages named `pr-<number>` deploy the API Worker with
`AUTH_RATE_LIMIT_ENABLED=false`. This keeps repeated same-PR E2E runs from
locking themselves out against a persistent preview database while preserving
auth rate limiting for `main` and ordinary non-PR stages by default.

`ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS` is the JSON body from
`~/.alchemy/credentials/default/cloudflare-state-store.json`, stored as a
GitHub environment secret. Preview CI writes it back to Alchemy's expected
credentials path before deploy or destroy. This avoids re-running
`pnpm alchemy cloudflare bootstrap` for preview jobs; the current Alchemy beta
reads the state-store token through Cloudflare edge preview during bootstrap,
and Cloudflare rejects edge preview for the existing state-store Worker because
it has a Durable Object binding.

`CLOUDFLARE_API_TOKEN` must be able to read and update the Cloudflare state
store, deploy Workers, manage custom domains, queues, Hyperdrive, and bind
Cloudflare Email Service to the API Worker.

## Preview Workflow

`.github/workflows/preview.yml` runs on pull request `opened`, `synchronize`,
`reopened`, and `closed` events. Secret-bearing jobs are gated with:

```yaml
github.event.pull_request.head.repo.full_name == github.repository
```

The workflow uses `pull_request`, not `pull_request_target`, and forked pull
requests do not satisfy the same-repository gate. Fork PR code therefore cannot
receive Cloudflare, Neon, or environment-scoped GitHub secrets from the preview
jobs. Same-repository preview deploys run in the protected `preview-deploy`
environment, so GitHub waits for environment approval before checking out and
deploying PR code with provider secrets. Inside the preview job, provider
secrets are scoped to the Alchemy credential restore, deploy, and state-read
steps; Playwright receives only the stage URLs and the masked database URL. The
workflow grants `issues: write` to `GITHUB_TOKEN` so the same-repository preview
job can create or update a pull request comment with the app/API URLs after the
health checks pass. It also grants `pull-requests: write` because GitHub's PR
comment endpoint accepts either issues or pull request write scope depending on
repository policy. Fork PRs still run the normal non-secret `Build` workflow.

For same-repository PR updates, the workflow:

- checks out the PR head SHA
- restores Alchemy's Cloudflare state-store credentials from an environment
  secret
- deploys or updates the persistent `pr-${PR_NUMBER}` stage
- derives `PLAYWRIGHT_BASE_URL` as
  `https://app.pr-${PR_NUMBER}.ceird.app`
- derives `PLAYWRIGHT_API_URL` as
  `https://api.pr-${PR_NUMBER}.ceird.app`
- reads and masks `PLAYWRIGHT_DATABASE_URL` from the preview
  `PostgresBranch` state
- waits for the preview app and API `/health` endpoints to respond
- creates or updates a single PR comment containing the preview app/API URLs
- runs `pnpm --filter app e2e`

The workflow has a concurrency group per PR:

```yaml
ceird-preview-pr-${{ github.event.pull_request.number }}
```

Deploy and cleanup runs for the same PR are serialized so Alchemy does not try
to reconcile and destroy the same stage concurrently.

When a same-repository PR closes, the cleanup job checks out the repository
default branch instead of closed PR code, verifies the stage name matches
`pr-[0-9]+`, restores the state-store credentials, and destroys the preview
stage through the unblocked `preview-cleanup` environment. The same workflow
also has a manual `workflow_dispatch` cleanup path: provide the numeric PR
number to destroy `pr-<number>` from default-branch code if the closed-PR
cleanup was cancelled or failed. A scheduled stale-preview cleanup is
intentionally not part of the first workflow; closed-PR cleanup plus manual
cleanup is the source of truth for now.

Preview resources persist for the lifetime of the pull request. That means each
open PR consumes Cloudflare Worker routes, queues, Hyperdrive configs, and a
Neon branch until it is closed. Watch provider quotas if many same-repository
PRs are open at once.

## Main Workflow

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

The main deploy workflow sets `CEIRD_APP_HOSTNAME=app.ceird.app` and
`CEIRD_API_HOSTNAME=api.ceird.app` so the production stage keeps the canonical
app/API routes. Other stages use stage-scoped hostnames such as
`app.<stage>.ceird.app` and `api.<stage>.ceird.app` unless explicitly
overridden.

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
- using PR stages such as `pr-{number}` for isolated previews and destroying
  them when the PR closes
- optionally using `--adopt` when importing existing cloud resources into a
  fresh state store

The guide also describes a more advanced `stacks/github.ts` approach where
Alchemy creates scoped provider credentials and writes them into GitHub. Ceird
currently uses manually managed GitHub environment secrets to avoid giving the
stack token-management authority until that deployment model is needed.
