# Better Auth Hardening Stage Verification Runbook

Last updated: 2026-06-07

This runbook is for the final Better Auth hardening browser/runtime pass. Do
not run provider-mutating Alchemy commands until the operator confirms the
target stage and credentials for the current session.

## Current Local Attempt

On 2026-06-07, after the sandbox and previous local server were removed, a fresh
package-local runtime target was recreated successfully:

- Docker Postgres `ceird-e2e-verify` ran at `127.0.0.1:5439`.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5439/ceird pnpm --filter domain db:migrate`
  applied the Drizzle migrations.
- Domain/API/app were started at `127.0.0.1:3002`, `127.0.0.1:3001`, and
  `127.0.0.1:4173`.
- The in-app Browser connector was attempted first through the Browser skill,
  but no `iab` Browser was registered in this session.
- Package-local Playwright was used as the browser fallback against the same
  local target.

Fresh package-local browser evidence:

- `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5439/ceird AUTH_EMAIL_FROM=no-reply@example.com VITE_AUTH_CAPTCHA_ENABLED=false pnpm --filter app exec playwright test e2e/auth.test.ts e2e/organization-invitations.test.ts e2e/organization-settings.test.ts --project=chromium`
  passed with 19 tests.
- Manual TOTP/backup-code smoke passed with signup, DB email verification,
  `/settings` 2FA setup, captured Better Auth TOTP URI and 10 backup codes,
  TOTP enrollment verification, backup-code acknowledgement, login TOTP
  challenge success, and login backup-code challenge success. Screenshots:
  `/tmp/tsk59-62-2fa-settings-smoke.png`,
  `/tmp/tsk62-2fa-login-totp-smoke.png`, and
  `/tmp/tsk62-2fa-login-backup-smoke.png`.
- Manual organization security activity smoke passed with signup, DB email
  verification, create-team, seeded representative audit rows, owner-visible
  `/organization/security`, hidden raw IP/user-agent provenance, URL-backed
  event-type filtering, and screenshots:
  `/tmp/tsk74-organization-security-activity-mq43xd6o.png` and
  `/tmp/tsk74-organization-security-activity-filter-mq43xd6o.png`.

Result: local package-runtime verification is no longer blocked. In-app Browser
coverage remains pending until a Browser session is registered. Cloudflare/Neon
stage parity remains the final runtime gate, especially real Turnstile handling
and deployed client-IP behavior.

Earlier same-day restricted-shell attempt:

- `apps/app` built successfully with `../../node_modules/.bin/vite build`, but
  that shell could not bind a fresh preview/dev socket and Docker access later
  became permission-denied. That was an environment limitation and is superseded
  by the fresh package-local target above.

## Current Stage Prerequisites

On 2026-06-07, `.env.local` was restored in the integration worktree from the
primary checkout. A read-only Alchemy doctor check for
`codex-better-auth-hardening` was started earlier after that restore, then
intentionally interrupted. Stage verification still needs reachable provider
credentials and explicit operator confirmation for the target stage before
running provider-mutating Alchemy commands.

Later on 2026-06-07, the read-only preflight was rerun after local package
runtime verification:

- `pnpm alchemy:doctor --stage codex-better-auth-hardening --json` passed. The
  planned stage, `.env.local`, required Alchemy env values, Node 26, and
  Alchemy `2.0.0-beta.44` all checked out.
- `pnpm alchemy:state-audit --stage codex-better-auth-hardening --json --tenant-routing-required --allow-finding legacy_drizzle_migrations_state`
  completed without state-read errors, but failed because the planned stage has
  no expected resources in Alchemy state yet: PostgresBranch, AgentAiGateway,
  Domain, Api, Mcp, Agent, TenantWorkerRoute, and TenantWildcardDnsRecord are
  absent.

Result: credentials/env are ready enough for an Alchemy run, but the stage is
not currently provisioned. The next step is provider-mutating:

```bash
pnpm dev -- --stage codex-better-auth-hardening
```

or, if a non-dev reconciliation is desired:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-better-auth-hardening
```

Do not run either command until the operator confirms that
`codex-better-auth-hardening` and the current `.env.local` credentials are the
intended provider target.

## Current Non-Browser Verification

On 2026-06-07, the non-browser gates passed after the final review-finding
fixes for OAuth/MCP organization binding, two-factor rate-limit reservations,
trusted-device request handling, OAuth consent raw-query preservation, password
reset error classification, and auth telemetry redaction.

- `pnpm lint`: passed.
- `pnpm format`: passed.
- `pnpm check-types`: passed.
- `PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/ultracite check .`:
  passed.
- `./node_modules/.bin/knip --no-config-hints`: passed with only Node's
  `module.register()` deprecation warning.
- Focused redaction rerun with the installed Vitest binary passed:

  ```bash
  cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts -t "redacts raw rate-limit keys"
  ```

- `pnpm test`: passed.
  - `apps/app`: 125 files passed, 845 tests passed.
  - `apps/domain`: 33 files passed, 367 tests passed, 23 DB-backed tests skipped
    because the local integration database was unavailable.
  - `test:infra`: 7 files passed, 73 tests passed.
  - `test:scripts`: 65 tests passed.

Continuation checkpoint after local Browser/server deferral:

- Repaired two non-browser tests/helpers that still required live loopback
  sockets:
  - The deterministic HIBP range override config test now spies on
    `globalThis.fetch` and verifies the loopback URL, `/range/ABCDE` request,
    `Add-Padding: true`, `User-Agent: Ceird Password Checker`, and response
    body without binding a local HTTP server.
  - The DB-backed Turnstile captcha integration helper now uses a
    `globalThis.fetch` spy instead of starting a local site-verify HTTP server.
    A no-DB helper regression verifies accepted and rejected verifier responses;
    the DB-backed captcha integration still skips when the integration database
    is unavailable.
- Added mounted Better Auth captcha denial coverage to the no-socket unit suite.
  It proves the real captcha plugin path calls the configured Turnstile verifier
  through `globalThis.fetch`, sends secret/response/remote IP JSON, and returns
  `VERIFICATION_FAILED` before database persistence when the verifier rejects
  the token.
- A follow-up read-only review pass found no material regression,
  security/privacy, reliability, or contract issues in the no-socket HIBP,
  Turnstile helper, mounted captcha denial, and handoff-doc updates.
- Refreshed direct non-browser checks passed:
  - `./node_modules/.bin/vitest run infra/drizzle.test.ts infra/stages.test.ts infra/cloudflare-stack.test.ts`
    passed with 50 tests.
  - `cd apps/app && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
    passed.
  - `cd apps/domain && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
    passed.
  - `./node_modules/.bin/tsc --noEmit -p tsconfig.infra.json` passed.
  - `cd packages/identity-core && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
    passed.
  - `cd apps/app && ../../node_modules/.bin/vitest run ...` for the focused
    auth/settings/organization-security UI batch passed with 141 tests.
  - `cd apps/domain && ../../node_modules/.bin/vitest run ...` for the focused
    auth/security/org/env batch passed with 217 tests.
  - `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts -t "captcha|Turnstile"`
    passed with 11 tests.
  - `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.integration.test.ts -t "Turnstile|captcha"`
    passed with 1 no-socket helper regression and 20 DB-backed skips.
  - `cd packages/identity-core && ../../node_modules/.bin/vitest run --globals src/index.test.ts`
    passed with 25 tests.
  - Scoped `oxfmt --check` and `git diff --check` passed.

Known local verification noise:

- `pnpm --filter app exec vitest ...` exited before Vitest with `fetch failed`;
  using the installed binary directly avoided the network/toolchain path.
- A later `pnpm format` wrapper retry after documentation-only edits exited
  with `fetch failed` before the script body printed; direct
  `./node_modules/.bin/oxfmt --check .` passed on the final worktree state.
- Earlier same-day loopback socket binds were unavailable from a restricted
  shell. The latest package-local run after sandbox removal successfully bound
  Docker Postgres, domain, API, and app listeners.
- Some app tests emit pre-existing React `act(...)` and Node deprecation
  warnings; they did not fail the run.
- The latest in-app Browser attach attempt reached the Browser connector but no
  `iab` browser was registered. Package-local Playwright is the current local
  browser evidence for this run.

## Package-Local Target

Use this path when local socket binding and a disposable Postgres database are
available. Prefer a disposable database over the default shared DB unless the
operator explicitly wants to reuse local state.

Example variables:

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55439/ceird
export AUTH_APP_ORIGIN=http://127.0.0.1:4174
export BETTER_AUTH_BASE_URL=http://127.0.0.1:3001
export BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef
export AUTH_RATE_LIMIT_ENABLED=false
export AGENT_INTERNAL_SECRET=agent-e2e-internal-secret
export AGENT_ORIGIN=http://127.0.0.1:4174
export VITE_AGENT_ORIGIN=http://127.0.0.1:4174
```

Start the package-local stack:

```bash
pnpm --filter domain db:migrate
PORT=3002 pnpm --filter domain exec tsx src/index.ts
PORT=3001 DOMAIN_ORIGIN=http://127.0.0.1:3002 pnpm --filter api exec tsx src/index.ts
API_ORIGIN=http://127.0.0.1:3001 pnpm --filter app exec vite dev --host 127.0.0.1 --port 4174 --strictPort
```

For Playwright-managed package-local runs, use the existing webServer recipe:

```bash
cd apps/app
PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55439/ceird \
../../node_modules/.bin/playwright test e2e/auth.test.ts e2e/organization-invitations.test.ts e2e/organization-settings.test.ts --project=chromium
```

Current package-local Playwright files provide useful regression coverage for
core auth pages, password reset, email verification, invitation continuation,
member access, and organization settings. They do not fully replace the manual
Browser matrix below for the Better Auth hardening project because the newer
account security settings, 2FA management/login, OAuth consent, captcha provider
states, and organization security activity workflows are only partially covered
by package-local smokes and focused component/server tests. Treat the existing
Playwright suite as a baseline browser regression pass, not as the final runtime
parity proof by itself.

## Alchemy Stage Target

Use this path only after the operator confirms the stage and credentials. The
planned stage name is:

```bash
codex-better-auth-hardening
```

Start local cloud-backed development only after confirmation:

```bash
pnpm dev -- --stage codex-better-auth-hardening
```

When calling Alchemy directly instead of the wrapper, use:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy dev --env-file .env.local --stage codex-better-auth-hardening
```

Use the app, API, and Agent URLs emitted by Alchemy. For database-backed E2E
helpers against an existing stage, set the direct stage database URL explicitly:

```bash
export PLAYWRIGHT_BASE_URL=<alchemy-app-url>
export PLAYWRIGHT_API_URL=<alchemy-api-url>
export PLAYWRIGHT_AGENT_URL=<alchemy-agent-url>
export PLAYWRIGHT_DATABASE_URL=<stage-database-url>
```

Tenant-subdomain tests also need a tenant URL whose leftmost label starts with
the organization slug:

```bash
export PLAYWRIGHT_TENANT_URL=<tenant-organization-slug-stage-url>
```

Do not set `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1` for stage mode.

Automated stage smoke command after the stage URLs are exported:

```bash
cd apps/app
../../node_modules/.bin/playwright test e2e/auth.test.ts e2e/organization-invitations.test.ts e2e/organization-settings.test.ts --project=chromium
```

Add `e2e/tenant-subdomains.test.ts` only when `PLAYWRIGHT_TENANT_URL` is set to
a tenant URL whose leftmost label starts with the test organization slug.

## Browser Matrix

Verify these with the in-app Browser after the local or stage target is live.
If the Browser connector has no registered `iab` session, use package-local
Playwright against the same target and record that fallback explicitly:

- `/signup`: password policy copy and compromised-password copy where the
  provider behavior can be controlled.
- Captcha-enabled auth routes: required, missing, and failed Turnstile states
  after test-key handling is confirmed.
- `/settings`: account Security tab, active sessions, current-device marker,
  targeted revoke, revoke-other-sessions, verified-email 2FA enrollment,
  backup-code acknowledgement, regeneration, disable, and unverified-email
  blocked state.
- `/login`: credential login into 2FA challenge, authenticator-code success,
  backup-code success, and redirect or invitation continuation.
- `/oauth/consent`: missing-workspace block, high-risk scope warning,
  active-workspace approval with a signed Better Auth authorization request,
  callback code/state, and denial path.
- `/organization/security`: owner/admin activity list, filters, URL-backed
  event type search, hidden raw IP/user-agent provenance, and clean console
  output.
- Organization/member/invitation flows: external-role blocks and limit-state
  copy where seeded data makes those states reachable.

Capture the evidence in the issue map and relevant Linear issues:

- target URLs and stage name
- database target or seed notes
- screenshots for non-sensitive states
- Browser console warnings/errors
- whether the run used in-app Browser, package-local Playwright, or both
- explicit remaining gaps, especially Turnstile stage keys and Cloudflare/Neon
  parity

Use this evidence note shape when updating the issue map and Linear
coordination comment:

```md
Runtime/browser parity checkpoint - YYYY-MM-DD

Target:

- Stage/local target:
- App URL:
- API URL:
- Agent URL:
- Database target/seed notes:

Automated browser pass:

- Command:
- Result:
- Tests skipped or intentionally omitted:

Manual Browser matrix:

- Signup/password/HIBP:
- Captcha routes:
- Settings security/session controls:
- 2FA enrollment/login:
- OAuth consent:
- Organization security activity:
- Organization/member/invitation limits and external-role blocks:

Evidence:

- Screenshots:
- Console warnings/errors:
- Server/API errors:
- Follow-up issues created:
```
