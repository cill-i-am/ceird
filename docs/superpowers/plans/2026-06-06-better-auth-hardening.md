# Better Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Linear project "Better Auth security and UX hardening" so every issue is completed or explicitly resolved as deferred/rejected with decisions captured in Linear and architecture docs.

**Architecture:** Use one integration branch as the truth branch, with short-lived feature worktrees for independent clusters only after policy and UX dependencies are clear. Treat Better Auth as the identity, session, OAuth, and organization authority; put Ceird-specific security policy in domain/app boundaries with runtime schemas, migrations, tests, architecture docs, and browser verification for user workflows.

**Tech Stack:** Better Auth 1.6.11, Drizzle, Effect Schema, TanStack Start, TanStack Router, TanStack Form, Vitest, Playwright/browser automation, Alchemy/Cloudflare Workers, Linear.

---

## Controller State

- Integration branch: `codex/better-auth-hardening`
- Integration worktree: `.worktrees/better-auth-hardening`
- Linear project: `Better Auth security and UX hardening`
- Linear issue range: `TSK-41` through `TSK-75`
- Issue map: `docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md`
- First decision packet: `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-1.md`
- Second decision packet: `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-2.md`
- Third decision packet: `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-3.md`
- Fourth decision packet: `docs/superpowers/progress/2026-06-07-better-auth-hardening-decision-packet-4.md`
- Stage verification runbook:
  `docs/superpowers/progress/2026-06-07-better-auth-hardening-stage-verification-runbook.md`
- Proposed Alchemy stage for browser verification: `codex-better-auth-hardening`
- Baseline already verified on the integration worktree:
  - `pnpm install`
  - `pnpm check-types`

Do not run provider-mutating Alchemy commands until the user confirms the target
stage and credentials. When browser workflows need auth cookies, API calls, or
database state, use the explicit stage URL emitted by Alchemy.

## Human Decision Checkpoints

Stop and ask the user before implementing dependent work when any of these
questions is unresolved.

Track decisions and recommended defaults in
`docs/architecture/better-auth-decision-log.md`. Recommendations are not
approved policy until the user explicitly accepts or adjusts them.

### Product and Security Policy

- `TSK-42`: Which actions require verified email?
- `TSK-43`: What environment/config shape should versioned Better Auth secrets use?
- `TSK-44`: How should Ceird's `external` role map to Better Auth organization capabilities?
- `TSK-46`: Which auth/org events are audit-grade versus observability-only?
- `TSK-47`: What minimum and maximum password length should Ceird enforce?
- `TSK-48`: If Have I Been Pwned is unavailable, should auth fail open or fail closed?
- `TSK-52`: Should self-service account deletion be in this project or deferred?
- `TSK-53`: Which captcha provider and trigger policy should Ceird use?
- `TSK-55`: Should rate-limit storage failure fail open or fail closed by endpoint?
- `TSK-57`: Which abuse signals should alert versus remain dashboard-only?
- `TSK-58`: Should 2FA be optional, prompted, required for owners/admins, or step-up only?
- `TSK-63`: Should passkeys be adopted now, deferred, or scoped only to step-up auth?
- `TSK-64`: How permissive should OAuth dynamic client registration remain?
- `TSK-68`: Should Device Authorization be adopted for CLI/MCP flows?
- `TSK-69`: Should Better Auth MCP or Agent Auth replace or augment the current integration?
- `TSK-71`: What organization/member/invitation limits should apply?
- `TSK-75`: Should Better Auth teams or dynamic access control be adopted or deferred?

### UX Shape

Use `$impeccable shape` before implementation for these issues:

- `TSK-49`: Account security settings UX
- `TSK-59`: 2FA enrollment and recovery UX
- `TSK-62`: Login 2FA challenge UX
- `TSK-66`: OAuth consent UX for Ceird scopes
- `TSK-74`: Organization security activity UI

Do not use `imagegen` for these unless the user explicitly asks for bitmap
mockups. These are product UI surfaces, so code-native shape artifacts and
implementation-ready UX notes are the right default.

## Per-Stage Review Discipline

Apply these checks at each milestone before marking the issue ready for review:

- Use `$effect-review` for touched Effect, Schema, service, test, and
  observability code. Small documentation-only stages may record a local
  no-code review instead of launching subagents.
- Use `$review-swarm` for material implementation diffs, especially auth,
  security, persistence, migrations, cross-package contracts, and user-visible
  workflows. Treat subagent reports as review input, then fix only findings with
  concrete correctness, security, privacy, reliability, contract, or coverage
  value.
- Use `$vercel-composition-patterns` for React surfaces, reusable component
  APIs, and settings/activity/consent UI work. Prefer composition and explicit
  variants over boolean prop growth.
- Use `$drizzle-orm` and `$postgres` for schema, migration, query, index,
  retention, and cardinality work. Generate and inspect migrations where the
  schema changes, and keep query behavior explicit at trust boundaries.
- Use TanStack Start and TanStack Router best practices for app routes,
  loaders, server functions, and auth guards. Keep server-only work inside
  `createServerFn` or server-only modules, use typed search validation for
  filterable routes, and avoid Next.js or Remix patterns.
- For new or materially changed UI, run focused tests first, then browser
  verification on the confirmed Alchemy stage with desktop and mobile viewport
  spot checks.

## Worktree Strategy

Use the integration worktree for sequencing, docs, final merges, and verification.
Create short-lived worktrees only when a cluster can be worked without sharing
mutable files with another active cluster.

| Cluster                         | Branch/worktree suffix            | Linear issues        | Parallelism                                                            |
| ------------------------------- | --------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| Auth baseline and policy        | `better-auth-baseline-policies`   | `TSK-41` to `TSK-46` | Start first. Mostly docs and policy.                                   |
| Credential and session security | `better-auth-credential-session`  | `TSK-47` to `TSK-52` | Start after password/session decisions.                                |
| Abuse protection                | `better-auth-abuse-protection`    | `TSK-53` to `TSK-57` | Can run after captcha and rate-limit decisions.                        |
| Privileged account protection   | `better-auth-privileged-accounts` | `TSK-58` to `TSK-63` | Mostly sequential because 2FA config, login, and settings share state. |
| OAuth/MCP hardening             | `better-auth-oauth-mcp`           | `TSK-64` to `TSK-69` | Can run after dynamic registration policy.                             |
| Organization authorization      | `better-auth-org-authorization`   | `TSK-70` to `TSK-75` | Can run after permission matrix and org limit decisions.               |

Subagents should use explicit `reasoning_effort`:

- `low` for focused read-only audits and mechanical docs updates.
- `medium` for bounded implementation tasks.
- `high` for auth/security review.
- `xhigh` for persistence, migrations, OAuth/MCP, and final cross-project review.

## Browser Verification Matrix

Use Browser only for workflows with user-visible app behavior. Tests remain the
first line of verification; browser runs prove the app feels and behaves right.

| Workflow                        | Issues                                  | Browser target                                        | Verify                                                                                          |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Account security settings       | `TSK-49` to `TSK-51`                    | `/settings`                                           | Sessions load, current session is marked, revoke actions confirm and refresh.                   |
| Password policy and HIBP copy   | `TSK-47`, `TSK-48`                      | `/signup`, reset, `/settings`                         | Rejection states are clear and do not leak provider details.                                    |
| Captcha states                  | `TSK-53`, `TSK-54`                      | Auth entry routes                                     | Required/missing/failed captcha states are understandable.                                      |
| 2FA enrollment                  | `TSK-59` to `TSK-61`                    | `/settings`                                           | Enroll, verify, backup codes, disable policy states.                                            |
| 2FA login challenge             | `TSK-62`                                | `/login`                                              | Password login continues into challenge, recovery code works, invitation continuation survives. |
| Verified email gates            | `TSK-42` plus implementation follow-ups | App flows chosen by policy                            | Blocked users see actionable verification path.                                                 |
| OAuth consent                   | `TSK-64` to `TSK-67`                    | `/oauth/consent`                                      | Scope grouping, organization context, deny/approve behavior.                                    |
| Organization member/admin flows | `TSK-70` to `TSK-74`                    | `/members` and organization settings/activity surface | External users are blocked, limit states are clear, audit/activity UI behaves.                  |

Browser runs must include desktop and mobile viewport spot checks for new UI.
For final handoff, capture screenshots for each new or materially changed UI
surface and include the important screenshots in the final report.

## Verification Commands

Use narrow checks while iterating:

```bash
pnpm --filter domain test
pnpm --filter app test
pnpm --filter @ceird/identity-core test
pnpm --filter app test <focused-test-file>
```

Broaden before merging a cluster into the integration branch:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
git diff --check
```

For database schema changes:

```bash
pnpm --filter domain db:generate
git diff -- apps/domain/drizzle apps/domain/src/domains/identity/authentication/schema.ts
pnpm --filter domain test
```

If the exact Drizzle script name differs, inspect `apps/domain/package.json`
and use the repo's existing migration command. Never hand-write migrations
without inspecting generated SQL.

## Task 1: Stabilize Planning And Linear State

**Files:**

- Create: `docs/superpowers/plans/2026-06-06-better-auth-hardening.md`
- Update as needed: Linear project status updates

- [x] **Step 1: Create integration worktree**

Run:

```bash
git worktree add .worktrees/better-auth-hardening -b codex/better-auth-hardening main
```

Expected: worktree is created at `.worktrees/better-auth-hardening`.

- [x] **Step 2: Install dependencies**

Run:

```bash
pnpm install
```

Expected: dependencies install. `opensrc` sync may report source snapshot
failures; treat those as non-blocking only if package install succeeds and the
local `opensrc/sources.json` already has the needed Better Auth source.

- [x] **Step 3: Run baseline typecheck**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [x] **Step 4: Save this plan and publish a Linear execution note**

Create this plan file. Project status updates are disabled in this Linear
workspace, so attach a project document named
`Better Auth Hardening Execution Plan` instead of posting a status update:

```markdown
Project execution plan created on `codex/better-auth-hardening`.

Current state:

- Integration worktree is ready.
- `pnpm check-types` passes on the integration branch.
- Next step is resolving the first policy decisions before implementation.

Decision checkpoints are explicit in the plan and dependent implementation will
not proceed until those are settled.
```

Expected: Linear project has an execution-plan document attached.

## Task 2: Resolve Baseline Policy Issues

**Issues:** `TSK-41`, `TSK-42`, `TSK-43`, `TSK-44`, `TSK-45`, `TSK-46`

**Files likely touched:**

- `docs/architecture/auth.md`
- `docs/architecture/auth-next-steps.md`
- `docs/architecture/organization-next-steps.md`
- `docs/architecture/better-auth-implementation-gaps.md`
- `docs/architecture/better-auth-feature-adoption.md`
- `docs/architecture/api.md`
- `docs/README.md`
- `apps/domain/src/domains/identity/authentication/config.ts`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/organizations/authorization.ts`
- `packages/identity-core/src/index.ts`

- [x] **Step 1: Ask the user the baseline decision packet**

Ask these questions together:

1. Which actions require verified email: organization creation, invitations,
   OAuth/MCP consent, API key creation, security setting changes, admin actions?
2. Should versioned Better Auth secrets be configured as one structured env var
   or stage-managed individual env vars?
3. Should Ceird keep `external` mapped to Better Auth member capability, or
   should we narrow Better Auth endpoint exposure around external members?
4. Which events are audit-grade: account security, organization membership,
   OAuth/MCP, API keys, abuse events?

Expected: user answers or asks to defer specific decisions.

Status: asked on 2026-06-06 with recommended defaults. Answers are still
pending and tracked in `docs/architecture/better-auth-decision-log.md`, so
dependent implementation remains paused.

- [x] **Step 2: Implement `TSK-41` docs update**

Update `docs/architecture/auth.md` so current scope includes:

- profile update
- change email
- change password
- organization roles and domain authorization
- member administration
- Better Auth OAuth Provider and MCP bearer validation
- current rate-limit rules including change email and change password

Run:

```bash
git diff --check
```

Expected: PASS.

- [x] **Step 3: Implement `TSK-45` plugin adoption checklist**

Add a checklist section to `docs/architecture/better-auth-feature-adoption.md`
or `docs/architecture/auth.md` covering:

- local Better Auth docs/source check
- server plugin config
- app client plugin config
- auth schema updates
- Drizzle migration generation and inspection
- runtime config and secrets
- focused server/app tests
- browser verification if user-facing
- architecture doc updates

Run:

```bash
git diff --check
```

Expected: PASS.

- [x] **Step 4: Record decisions for `TSK-42`, `TSK-43`, `TSK-44`, and `TSK-46`**

Create or update architecture sections for:

- verified-email gate policy
- Better Auth secret rotation runbook
- auth and organization permission ownership matrix
- auth/organization security audit event taxonomy

Expected: each policy issue has a concrete decision or is explicitly marked
deferred/rejected in Linear and docs.

Current state: the user approved the recommended defaults on 2026-06-06.
Verified-email gates and Better Auth secret rotation config have focused tests
and architecture docs. The source-backed current authorization matrix exists at
`docs/architecture/auth-organization-permission-matrix.md`; external-role
regression coverage remains tracked under `TSK-70`.

Traceability: current issue states and next gates are tracked in
`docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md`.

- [x] **Step 5: Verify baseline policy docs**

Run:

```bash
pnpm check-types
git diff --check
```

Expected: PASS.

Status: `pnpm check-types`, `pnpm test`, `pnpm lint`, `pnpm format`, and
`git diff --check` have passed on the integration branch. Browser verification
remains gated on confirmed Alchemy stage credentials.

## Task 3: Shape UI Surfaces Before Implementation

**Issues:** `TSK-49`, `TSK-59`, `TSK-62`, `TSK-66`, `TSK-74`

**Required skill:** `$impeccable shape`

- [x] **Step 1: Run shape for account security settings**

Scope:

- active sessions
- revoke session controls
- future 2FA/passkey placement
- recovery states
- keyboard access and responsive layout

Expected output: implementation-ready UX notes attached to `TSK-49` and linked
from dependent issues `TSK-50` and `TSK-51`.

Output: `docs/superpowers/progress/2026-06-07-account-security-settings-shape.md`.
Implementation remains gated on human confirmation for session metadata,
revocation behavior, and first-release account security surface scope.

- [x] **Step 2: Run shape for 2FA enrollment, recovery, and login challenge**

Scope:

- TOTP enrollment
- backup codes
- disable and recovery
- login challenge
- invitation continuation through login

Expected output: implementation-ready UX notes attached to `TSK-59` and `TSK-62`.

Output: `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`.
Implementation remains gated on human confirmation for enrollment, backup-code,
trusted-device, and login-challenge decisions.

- [x] **Step 3: Run shape for OAuth consent**

Scope:

- identity scopes
- `ceird:read`
- `ceird:write`
- `ceird:admin`
- `offline_access`
- organization context
- client identity and redirect target

Expected output: implementation-ready UX notes attached to `TSK-66`.

Output: `docs/superpowers/progress/2026-06-07-oauth-consent-shape.md`.
Implementation remains gated on human confirmation for admin-scope blocking,
organization-scoped consent, public-client metadata enrichment, and deferrals.

- [x] **Step 4: Run shape for organization security activity**

Scope:

- event grouping
- filters
- empty and dense-history states
- owner/admin visibility
- retention copy

Expected output: implementation-ready UX notes attached to `TSK-74`.

Output: `docs/superpowers/progress/2026-06-07-organization-security-activity-shape.md`.
Implementation remains gated on human confirmation for visible event scope,
route placement, row behavior, and source IP/user-agent visibility.

## Task 4: Implement Credential And Session Security

**Issues:** `TSK-47`, `TSK-48`, `TSK-50`, `TSK-51`, `TSK-52`

**Dependencies:**

- password policy decision
- HIBP failure behavior decision
- account security settings shape
- account deletion policy decision for `TSK-52`

**Files likely touched:**

- `apps/domain/src/domains/identity/authentication/config.ts`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/identity/authentication/schema.ts`
- `apps/domain/src/domains/identity/authentication/authentication.test.ts`
- `apps/app/src/features/auth/auth-schemas.ts`
- `apps/app/src/features/auth/signup-page.tsx`
- `apps/app/src/features/auth/password-reset-page.tsx`
- `apps/app/src/features/settings/user-settings-page.tsx`
- `apps/app/src/features/settings/user-settings-schemas.ts`
- `apps/app/src/features/settings/user-settings-page.test.tsx`
- `apps/app/src/features/settings/user-settings-schemas.test.ts`

- [x] **Step 1: Write failing tests for explicit password policy**

Add tests for signup, reset, and change-password schemas to reject the chosen
minimum and accept a valid password.

Run:

```bash
pnpm --filter app test user-settings-schemas.test.ts auth-schemas.test.ts
```

Expected: FAIL until policy is implemented.

- [x] **Step 2: Implement password policy**

Set Better Auth server config and app schemas to the chosen policy. Update copy
in affected forms.

Run:

```bash
pnpm --filter app test user-settings-schemas.test.ts auth-schemas.test.ts
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS.

- [x] **Step 3: Add HIBP plugin after failure behavior is decided**

Follow the plugin adoption checklist. Add server config, any needed runtime
configuration, tests for compromised password rejection, and tests for provider
failure behavior.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
pnpm --filter app test
```

Expected: PASS.

Status: implemented through a Ceird-owned Better Auth password compromise check
plugin with the approved fail-open provider outage behavior and focused domain
tests. Browser verification remains gated on stage confirmation.

- [ ] **Step 4: Implement active-session listing**

Use Better Auth session APIs through the established app auth client or a
server function if required by cookie/session semantics. Add loading, empty,
current-session, and failed-load states.

Run:

```bash
pnpm --filter app test user-settings-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Implement session revocation controls**

Add revoke-one-session and revoke-all-other-sessions actions with confirmations,
cache invalidation, and success/failure feedback.

Run:

```bash
pnpm --filter app test user-settings-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Browser verify account security settings**

Against the confirmed app URL, use Browser to verify:

- account security settings loads
- active sessions render
- current session is marked
- revoke controls confirm before action
- mobile layout remains usable

Expected: workflow screenshots captured for final report.

## Task 5: Implement Abuse Protection

**Issues:** `TSK-53`, `TSK-54`, `TSK-55`, `TSK-56`, `TSK-57`

**Dependencies:**

- captcha provider and trigger policy
- rate-limit storage failure policy
- auth delivery abuse limit policy
- abuse telemetry decisions

**Files likely touched:**

- `apps/domain/src/domains/identity/authentication/config.ts`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/identity/authentication/auth-email.ts`
- `apps/domain/src/domains/identity/authentication/authentication.test.ts`
- `apps/app/src/features/auth/login-page.tsx`
- `apps/app/src/features/auth/signup-page.tsx`
- `apps/app/src/features/auth/password-reset-request-page.tsx`
- `apps/app/src/features/auth/email-verification-banner.tsx`
- `docs/architecture/auth.md`

- [x] **Step 1: Ask the user the abuse decision packet**

Ask:

1. Captcha provider and first rollout flows.
2. Fail-open/fail-closed policy for rate-limit storage by endpoint.
3. Delivery limits for reset, verification, change email, and organization invitations.
4. Abuse telemetry signals and alert thresholds.

Expected: decisions recorded in Linear/docs.

- [x] **Step 2: Implement rate-limit failure policy**

Update custom rate-limit storage behavior and tests to match the decision.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS.

- [x] **Step 3: Implement captcha plugin for selected endpoints**

Follow the plugin checklist. Add provider config, test bypass behavior, app token
submission, and focused endpoint/app tests.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
pnpm --filter app test
```

Expected: PASS.

- [x] **Step 4: Add delivery abuse controls and telemetry**

Inventory delivery flows, add missing rate limits/observability, and preserve
anti-enumeration behavior.

Run:

```bash
pnpm --filter domain test
```

Expected: PASS.

Status: implemented for password reset, verification resend, change-email
confirmation, organization invitations, and dynamic client registration where
applicable. Review follow-ups created backlog spikes for retention,
deduplication, conditional captcha, and atomic reservation semantics.

- [ ] **Step 5: Browser verify selected auth flows**

Use Browser for selected captcha or blocked states only if the selected provider
can be exercised in local/stage without solving a CAPTCHA.

Expected: no CAPTCHA is solved by the agent; visual states are verified where possible.

## Task 6: Implement Privileged Account Protection

**Issues:** `TSK-58`, `TSK-59`, `TSK-60`, `TSK-61`, `TSK-62`, `TSK-63`

**Dependencies:**

- 2FA enforcement policy
- 2FA UX shape
- login challenge UX shape
- passkey adoption decision

**Files likely touched:**

- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/identity/authentication/schema.ts`
- `apps/domain/drizzle/*`
- `apps/app/src/lib/auth-client.ts`
- `apps/app/src/features/settings/user-settings-page.tsx`
- `apps/app/src/features/auth/login-page.tsx`
- `apps/app/src/features/auth/auth-navigation.ts`
- `apps/app/src/features/auth/auth-schemas.ts`
- `apps/app/src/features/settings/user-settings-page.test.tsx`
- `apps/app/src/features/auth/login-page.test.tsx`

- [x] **Step 1: Ask the user the privileged-account decision packet**

Ask:

1. 2FA enforcement model for owners/admins.
2. First supported factor methods.
3. Grace period and recovery expectations.
4. Passkey adoption or deferral.

Expected: decisions recorded in Linear/docs.

Status: recommended defaults were approved for optional 2FA, owner/admin
prompts, verified-email enrollment, and passkey deferral. 2FA implementation
may proceed under the approved shape; backend, settings management, and login
challenge work are implemented locally.

- [x] **Step 2: Add Better Auth two-factor plugin and schema**

Write failing tests first, add plugin config, update auth schema, generate and
inspect Drizzle migration, and wire client plugin APIs.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
pnpm --filter domain db:generate
git diff -- apps/domain/drizzle apps/domain/src/domains/identity/authentication/schema.ts
```

Expected: tests pass and migration diff is inspected.

Status: Better Auth two-factor is configured for optional TOTP plus encrypted
backup codes, the auth schema and Drizzle migrations include
`user.twoFactorEnabled` and `two_factor`, verified email is required before
enrollment, trusted-device requests are rejected until policy is approved, and
focused domain/app/infra checks pass.

- [x] **Step 3: Implement 2FA settings management**

Implement TOTP enrollment, verification, backup code handling, regeneration, and
disable behavior according to policy.

Run:

```bash
pnpm --filter app test user-settings-page.test.tsx
```

Expected: PASS.

Status: implemented locally with focused tests, typecheck, lint, format, React
Doctor, and app build passing. Browser smoke is deferred by user request while
the Codex browser/sandbox environment is repaired.

- [x] **Step 4: Implement login 2FA challenge**

Update login flow for Better Auth 2FA challenge responses, recovery-code entry,
errors, and invitation continuation.

Run:

```bash
pnpm --filter app test login-page.test.tsx
```

Expected: PASS.

Status: implemented locally. The login page handles Better Auth
`twoFactorRedirect`, verifies TOTP and backup-code challenges through the
native Better Auth client, preserves invitation continuation, and returns to the
password form with email preserved/password cleared if the temporary challenge
session expires.

- [ ] **Step 5: Browser verify 2FA**

Use Browser against the confirmed stage/app URL:

- enroll TOTP if test seed allows it
- verify backup code presentation
- complete login challenge
- verify recovery-code path if practical
- verify invitation continuation remains intact

Expected: screenshots captured for final report.

Status: deferred by user request while the Codex browser/sandbox environment is
repaired.

## Task 7: Implement OAuth/MCP Hardening

**Issues:** `TSK-64`, `TSK-65`, `TSK-66`, `TSK-67`, `TSK-68`, `TSK-69`

**Dependencies:**

- dynamic client registration policy
- OAuth consent UX shape
- audit event taxonomy
- Device Authorization decision
- MCP/Agent Auth adoption decision

**Files likely touched:**

- `apps/domain/src/domains/identity/authentication/config.ts`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/mcp/http.ts`
- `apps/app/src/features/auth/oauth-consent-page.tsx`
- `apps/app/src/features/auth/oauth-consent-page.test.tsx`
- `docs/architecture/auth.md`
- `docs/architecture/api.md`

- [x] **Step 1: Ask the user the OAuth/MCP decision packet**

Ask:

1. Should unauthenticated dynamic client registration remain enabled?
2. Should write/admin scopes require authenticated owner/admin approval?
3. Should admin/write consent require verified email or 2FA step-up?
4. Adopt, evaluate later, or reject Device Authorization?
5. Keep current MCP integration, adopt Better Auth MCP, or pilot Agent Auth?

Expected: decisions recorded in Linear/docs.

- [x] **Step 2: Constrain registration policy**

Implement registration settings or wrapper policy to match the decision. Add
tests for read/write/admin scope attempts and malformed metadata/redirects.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS.

Status: unauthenticated dynamic registration is constrained to identity/read
scopes and public clients; unsafe redirects, unsupported metadata, privileged
scopes, and consent-skipping attempts are rejected before Better Auth persists
the client. Browser/runtime verification remains gated on stage confirmation.

- [ ] **Step 3: Implement OAuth consent UX updates**

Update consent copy, grouping, organization context, and high-risk scope
treatment from the shape output.

Run:

```bash
pnpm --filter app test oauth-consent-page.test.tsx
```

Expected: PASS.

- [x] **Step 4: Add OAuth/MCP audit events**

Emit events for registration, consent grant/denial, refresh/revocation, and
suspicious registration failures. Redact tokens and secrets.

Run:

```bash
pnpm --filter domain test
```

Expected: PASS.

Status: durable audit-event capture exists for registration success/rejection,
consent grant/denial, refresh-token grants, and revocation acceptance with token,
secret, authorization-code, query-string, and redirect URL redaction.

- [ ] **Step 5: Browser verify OAuth consent**

Use Browser to verify consent display and approve/deny behavior with test OAuth
request parameters.

Expected: scope grouping and high-risk treatment are visible and understandable.

## Task 8: Implement Organization Authorization Hardening

**Issues:** `TSK-70`, `TSK-71`, `TSK-72`, `TSK-73`, `TSK-74`, `TSK-75`

**Dependencies:**

- permission ownership matrix
- org/member/invitation limit policy
- audit event taxonomy
- organization activity UX shape
- Better Auth teams/dynamic access control decision

**Files likely touched:**

- `packages/identity-core/src/index.ts`
- `apps/domain/src/domains/organizations/authorization.ts`
- `apps/domain/src/domains/organizations/current-actor.ts`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/domain/src/domains/identity/authentication/authentication.test.ts`
- `apps/app/src/features/organizations/organization-members-page.tsx`
- `apps/app/src/features/organizations/organization-members-page.test.tsx`
- `docs/architecture/organization-next-steps.md`
- `docs/architecture/auth.md`

- [x] **Step 1: Ask the user the organization decision packet**

Ask:

1. Organization/member/invitation limits for first release.
2. Whether limits are product policy, abuse controls, billing controls, or all three.
3. Which security activity events owners/admins should see.
4. Adopt or defer Better Auth teams/dynamic access control.

Expected: decisions recorded in Linear/docs.

- [x] **Step 2: Add external-role regression coverage**

Write focused tests proving external users cannot access owner/admin member and
invitation actions or domain workflows where they should be blocked.

Run:

```bash
pnpm --filter domain test
pnpm --filter app test organization-members-page.test.tsx
```

Expected: PASS.

- [x] **Step 3: Implement organization limits**

Add Better Auth plugin options or Ceird server guards according to policy. Add
tests for allowed, boundary, and rejected cases.

Run:

```bash
pnpm --filter domain test src/domains/identity/authentication/authentication.test.ts
pnpm --filter app test organization-members-page.test.tsx
```

Expected: PASS.

- [x] **Step 4: Add organization security audit events**

Emit events for organization creation, invitation create/resend/cancel/accept,
role changes, member removal, and sensitive configuration changes.

Run:

```bash
pnpm --filter domain test
```

Expected: PASS.

Status: policy and implementation are ready for review on the integration
branch. Strict database-atomic cardinality enforcement is deferred to `TSK-115`,
and owner/admin activity UI remains gated on `TSK-74` confirmation.

- [ ] **Step 5: Implement or defer organization security activity UI**

If approved, implement the shaped activity UI. If deferred, close `TSK-74` with
the decision and keep event capture in place.

Run if implemented:

```bash
pnpm --filter app test
```

Expected: PASS.

- [ ] **Step 6: Browser verify organization flows**

Use Browser to verify member admin, external-role blocking, limit states, and
activity UI if implemented.

Expected: screenshots captured for final report.

## Task 9: Final Integration And Project Completion

**Files:**

- Linear project and issues
- Architecture docs touched during implementation
- Final branch diff

- [ ] **Step 1: Run full local verification**

Run:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
git diff --check
```

Expected: PASS, or documented known failures with owner-approved follow-up.

- [ ] **Step 2: Run stage-backed browser verification**

After user confirms stage and credentials, run:

```bash
pnpm dev -- --stage codex-better-auth-hardening
```

Use emitted app/API URLs for browser workflow verification. Do not run Alchemy
provider-mutating commands without explicit stage confirmation.

Expected: applicable Browser verification matrix rows are complete.

- [ ] **Step 3: Final review**

Dispatch final code review with `reasoning_effort="xhigh"` because this project
touches auth, persistence, OAuth, organizations, and UI.

Expected: review findings resolved or explicitly accepted.

- [ ] **Step 4: Update Linear**

For each issue:

- mark complete when implemented and verified
- mark deferred/rejected only with a written decision
- link relevant docs, commits, or PR

Post final project status update with verification summary.

Expected: Linear project accurately reflects delivered and deferred scope.

- [ ] **Step 5: Final handoff**

Report:

- branch/worktree
- completed issues
- deferred/rejected issues and decisions
- migrations created
- tests run
- browser workflows verified
- screenshots for UI workflows
- remaining risks

Expected: user can review or merge with no hidden state.
