# Better Auth Hardening Issue Map

Last updated: 2026-06-07

This is the controller map for Linear project
`Better Auth security and UX hardening`. It exists to keep issue workers,
reviewers, and future Codex sessions aligned on the current artifact,
dependency, and verification lane for each issue.

## Project Artifacts

| Artifact                   | Location                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Linear project             | https://linear.app/tskr/project/better-auth-security-and-ux-hardening-cee0b0f66e98             |
| Execution plan             | `docs/superpowers/plans/2026-06-06-better-auth-hardening.md`                                   |
| Progress note              | `docs/superpowers/progress/2026-06-06-better-auth-hardening.md`                                |
| Decision Packet 1          | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-1.md`              |
| Decision Packet 2          | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-2.md`              |
| Decision Packet 3          | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-3.md`              |
| Decision Packet 4          | `docs/superpowers/progress/2026-06-07-better-auth-hardening-decision-packet-4.md`              |
| TSK-49 Shape Doc           | `docs/superpowers/progress/2026-06-07-account-security-settings-shape.md`                      |
| TSK-59/62 Shape Doc        | `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`                                |
| TSK-66 Shape Doc           | `docs/superpowers/progress/2026-06-07-oauth-consent-shape.md`                                  |
| TSK-74 Shape Doc           | `docs/superpowers/progress/2026-06-07-organization-security-activity-shape.md`                 |
| Stage verification runbook | `docs/superpowers/progress/2026-06-07-better-auth-hardening-stage-verification-runbook.md`     |
| Linear stage runbook       | https://linear.app/tskr/document/better-auth-hardening-stage-verification-runbook-2575d8ec56ba |
| Completion audit           | `docs/superpowers/progress/2026-06-07-better-auth-hardening-completion-audit.md`               |
| Linear completion audit    | https://linear.app/tskr/document/better-auth-completion-audit-9c835bec685f                     |
| Linear runtime checkpoint  | https://linear.app/tskr/document/better-auth-runtime-parity-checkpoint-2026-06-07-c100b96b189c |
| Decision log               | `docs/architecture/better-auth-decision-log.md`                                                |
| Linear decision log        | https://linear.app/tskr/document/better-auth-decision-log-b7bf51e2af59                         |
| Permission matrix          | `docs/architecture/auth-organization-permission-matrix.md`                                     |
| Linear permission matrix   | https://linear.app/tskr/document/auth-and-organization-permission-matrix-2ef2c76db252          |
| Feature adoption doc       | `docs/architecture/better-auth-feature-adoption.md`                                            |
| Linear feature adoption    | https://linear.app/tskr/document/better-auth-feature-adoption-6a30bb094b3c                     |
| Implementation gaps doc    | `docs/architecture/better-auth-implementation-gaps.md`                                         |
| Linear implementation gaps | https://linear.app/tskr/document/better-auth-implementation-gaps-492cea767e0f                  |

## Status Vocabulary

- `Ready for review`: implementation or documentation exists on the integration
  branch and has passed the current verification gate, but is not merged.
- `Needs decision`: dependent implementation must wait for user approval or
  adjustment.
- `Needs shape`: UI work must go through `$impeccable shape` and human product
  review before implementation.
- `Implementation pending`: decision/design dependencies are not fully resolved
  or implementation has not started.
- `Deferred candidate`: likely out of immediate scope unless the user approves
  adoption.

## Auth Baseline

| Issue                                        | Current state    | Primary artifact                                                                         | Next gate                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSK-41` Update auth architecture docs       | Ready for review | `docs/architecture/auth.md`                                                              | Merge/review current docs branch.                                                                                                                                                                                   |
| `TSK-42` Verified-email gate policy          | Ready for review | `apps/domain/src/domains/identity/authentication/auth.ts`, `docs/architecture/auth.md`   | Verified-email blocked states passed production-preview Playwright smoke on 2026-06-07; accepted OAuth consent is now stricter than the initial Ceird-scope-only policy and requires verified email for all scopes. |
| `TSK-43` Better Auth secret rotation plan    | Ready for review | `apps/domain/src/domains/identity/authentication/config.ts`, `docs/architecture/auth.md` | Browser verification after stage confirmation.                                                                                                                                                                      |
| `TSK-44` Permission ownership matrix         | Ready for review | `docs/architecture/auth-organization-permission-matrix.md`                               | External-role regression coverage now lives in `TSK-70`.                                                                                                                                                            |
| `TSK-45` Plugin adoption migration checklist | Ready for review | `docs/architecture/better-auth-feature-adoption.md`                                      | Merge/review current docs branch.                                                                                                                                                                                   |
| `TSK-46` Security audit event taxonomy       | Ready for review | `docs/architecture/better-auth-decision-log.md`                                          | Event capture remains in `TSK-67` and `TSK-73`.                                                                                                                                                                     |
| `TSK-120` Audit provenance retention         | Deferred spike   | `TSK-120`                                                                                | Define retention, anonymization, and access control for raw source IP/user-agent audit provenance.                                                                                                                  |

## Credential And Session Security

| Issue                                 | Current state             | Primary artifact                                                                                                                             | Next gate                                                                                                                                        |
| ------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TSK-47` Password policy              | Ready for review          | `apps/domain/src/domains/identity/authentication/config.ts`, `apps/app/src/features/auth/auth-schemas.ts`                                    | Local in-app Browser verified weak signup password copy on 2026-06-07; stage smoke remains useful for server policy parity.                      |
| `TSK-48` HIBP password screening      | Ready for review          | `apps/domain/src/domains/identity/authentication/auth-password-compromise.ts`, `docs/architecture/auth.md`                                   | Package-local Playwright smoke with a loopback HIBP range stub passed on 2026-06-07; stage parity with the default HIBP provider remains useful. |
| `TSK-49` Account security settings UX | Ready for review          | `apps/app/src/features/settings/user-security-sessions-panel.tsx`, `docs/superpowers/progress/2026-06-07-account-security-settings-shape.md` | Production-preview smoke passed on 2026-06-07 with an authenticated account and clean console output.                                            |
| `TSK-50` Active session listing       | Ready for review          | `apps/app/src/features/settings/user-security-sessions-panel.tsx`                                                                            | Current-session marking is verified against real Better Auth session ids; richer device/location metadata is deferred to `TSK-122`.              |
| `TSK-51` Session revocation controls  | Ready for review          | `apps/app/src/features/settings/user-security-sessions-panel.tsx`                                                                            | Targeted revoke and revoke-other-sessions controls passed production-preview smoke; current-session termination stays on sign-out.               |
| `TSK-52` Account deletion policy      | Deferred to backlog spike | `TSK-52`                                                                                                                                     | Spike defines account/data lifecycle policy before adoption.                                                                                     |

## Abuse Protection

| Issue                                      | Current state    | Primary artifact                                                                                         | Next gate                                                                                                                                                                    |
| ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSK-53` Captcha policy                    | Ready for review | `docs/architecture/better-auth-decision-log.md`                                                          | Cloudflare Turnstile first rollout is implemented in `TSK-54`; conditional failed-sign-in captcha is deferred to `TSK-116`.                                                  |
| `TSK-54` Captcha plugin adoption           | Ready for review | `apps/domain/src/domains/identity/authentication/auth.ts`, `apps/app/src/features/auth/auth-captcha.tsx` | DB-backed integration and package-local Playwright smoke with a loopback Turnstile verifier passed on 2026-06-07; stage parity with real Turnstile test keys remains useful. |
| `TSK-55` Rate-limit storage failure policy | Ready for review | `apps/domain/src/domains/identity/authentication/auth.ts`, `docs/architecture/auth.md`                   | Package-local Playwright and direct API outage smokes passed on 2026-06-07; Cloudflare client-IP stage parity remains useful.                                                |
| `TSK-56` Auth delivery abuse controls      | Ready for review | `apps/domain/src/domains/identity/authentication/auth.ts`, `docs/architecture/auth.md`                   | Broader domain verification and stage/runtime smoke after auth stage confirmation.                                                                                           |
| `TSK-57` Abuse telemetry and alerting      | Ready for review | `docs/architecture/auth.md`, auth abuse log annotations                                                  | Wire production alert thresholds in observability tooling.                                                                                                                   |
| `TSK-121` Captcha timeout/telemetry policy | Deferred spike   | `TSK-121`                                                                                                | Define Turnstile provider timeout, failure behavior, telemetry, and retry copy.                                                                                              |

## Privileged Account Protection

| Issue                                   | Current state             | Primary artifact                                                                                                                                                                    | Next gate                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSK-58` 2FA enforcement policy         | Ready for review          | `docs/architecture/better-auth-decision-log.md`                                                                                                                                     | Policy captured as optional 2FA for all users, owner/admin prompts, verified-email enrollment gate, and no hard requirement until recovery/support exists.                                                                                                                                           |
| `TSK-59` 2FA enrollment and recovery UX | Ready for review          | `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`                                                                                                                     | Shape is approved and implemented through `TSK-61` and `TSK-62`; fresh package-local Playwright smoke verified TOTP setup, backup-code acknowledgement, and login recovery on 2026-06-07.                                                                                                            |
| `TSK-60` Better Auth two-factor plugin  | Ready for review          | `apps/domain/src/domains/identity/authentication/auth.ts`, `apps/domain/src/domains/identity/authentication/schema.ts`, `apps/domain/drizzle/20260607122344_better_auth_two_factor` | Plugin/schema/migration/client plumbing is implemented for optional TOTP plus encrypted backup codes. Enrollment requires verified email, and trusted-device requests are blocked until `TSK-110`.                                                                                                   |
| `TSK-61` 2FA settings management        | Ready for review          | `apps/app/src/features/settings/user-two-factor-panel.tsx`, `apps/app/src/routes/_app.settings.tsx`, `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`                | Settings enrollment, verification, backup-code acknowledgement/regeneration, disable flows, and the unverified-email blocked state are implemented with focused tests and package-local browser smokes. Fresh TOTP setup smoke captured `/tmp/tsk59-62-2fa-settings-smoke.png`.                      |
| `TSK-62` Login 2FA challenge            | Ready for review          | `apps/app/src/features/auth/login-page.tsx`, `apps/app/src/features/auth/login-page.test.tsx`, `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`                      | Inline `/login` challenge is implemented for TOTP and backup-code verification, preserving the existing success navigation path, with focused tests and package-local browser smoke. Fresh challenge screenshots: `/tmp/tsk62-2fa-login-totp-smoke.png` and `/tmp/tsk62-2fa-login-backup-smoke.png`. |
| `TSK-63` Passkey adoption strategy      | Deferred to backlog spike | `TSK-63`                                                                                                                                                                            | Revisit after TOTP 2FA and session management ship.                                                                                                                                                                                                                                                  |

## OAuth And MCP Hardening

| Issue                                             | Current state             | Primary artifact                                                                                                                                                              | Next gate                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TSK-64` Dynamic client registration threat model | Ready for review          | `docs/architecture/better-auth-decision-log.md`                                                                                                                               | Approved read-only dynamic registration policy is implemented through `TSK-65`; review the policy with the registration guard and audit coverage.                                                                                                   |
| `TSK-65` Constrain client registration            | Ready for review          | `apps/domain/src/domains/identity/authentication/auth.ts`, `docs/architecture/auth.md`                                                                                        | DB-backed integration coverage and local domain HTTP smoke passed on 2026-06-07 for successful public read-only DCR, rejected write-scope DCR, rate limits, and audit rows. Stage parity remains useful before handoff.                             |
| `TSK-66` OAuth consent UX                         | Ready for review          | `apps/app/src/features/auth/oauth-consent-page.tsx`, `apps/domain/src/domains/identity/authentication/auth.ts`, `docs/superpowers/progress/2026-06-07-oauth-consent-shape.md` | Local in-app Browser verified grouped high-risk scopes and missing-workspace approval block on 2026-06-07; package-local production-preview smoke verified active-workspace signed Better Auth approval with org-scoped consent and audit evidence. |
| `TSK-67` OAuth/MCP audit events                   | Ready for review          | `auth_security_audit_event`, `docs/architecture/auth.md`                                                                                                                      | DB-backed integration coverage passed against disposable Postgres on 2026-06-07; Cloudflare/Neon stage parity remains useful before handoff.                                                                                                        |
| `TSK-68` Device Authorization evaluation          | Deferred to backlog spike | `TSK-68`                                                                                                                                                                      | Revisit when CLI/MCP limited-input UX is concrete.                                                                                                                                                                                                  |
| `TSK-69` MCP and Agent Auth plugin evaluation     | Deferred to backlog spike | `TSK-69`                                                                                                                                                                      | Keep current OAuth Provider path while plugin evaluation is deferred.                                                                                                                                                                               |

## Organization Authorization

| Issue                                       | Current state             | Primary artifact                                                                                                                                                            | Next gate                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TSK-70` External-role regression coverage  | Ready for review          | `docs/architecture/auth-organization-permission-matrix.md`                                                                                                                  | DB-backed endpoint coverage passed against disposable Postgres on 2026-06-07 after aligning the integration setup with verified-email org creation.                                                                                                                                                                |
| `TSK-71` Org/member/invitation limit policy | Ready for review          | `docs/architecture/better-auth-decision-log.md`                                                                                                                             | Policy captured as 10 orgs/user, 200 members/org, 100 pending invites/org, 30 invites/actor/hour, 200 invites/org/day.                                                                                                                                                                                             |
| `TSK-72` Implement org/invitation limits    | Ready for review          | `apps/domain/src/domains/identity/authentication/auth.ts`, `apps/app/src/features/organizations/organization-auth-errors.ts`                                                | DB-backed integration coverage and package-local Playwright smoke passed on 2026-06-07 for the 10-team cap and invitation-acceptance blocked copy. Strict concurrent cardinality enforcement is split to `TSK-115`.                                                                                                |
| `TSK-73` Organization security audit events | Ready for review          | `auth_security_audit_event`, `docs/architecture/auth.md`                                                                                                                    | Review-hardened for resend truth, request provenance, fail-open context lookup, and sanitized audit telemetry; owner/admin activity UI remains in `TSK-74`.                                                                                                                                                        |
| `TSK-74` Organization security activity UI  | Ready for review          | `apps/app/src/features/organization-security/organization-security-activity-page.tsx`, `apps/domain/src/domains/identity/security-activity.ts`, `docs/architecture/auth.md` | Fresh package-local Playwright smoke passed with real signup/create-team plus seeded organization audit events on 2026-06-07; screenshots: `/tmp/tsk74-organization-security-activity-mq43xd6o.png` and `/tmp/tsk74-organization-security-activity-filter-mq43xd6o.png`. In-app Browser connector was unavailable. |
| `TSK-75` Teams and dynamic access control   | Deferred to backlog spike | `TSK-75`                                                                                                                                                                    | Revisit when teams or user-defined roles become concrete product concepts.                                                                                                                                                                                                                                         |

## Deferred Spike Backlog

| Issue     | Spike                                                      | Notes                                                                                                            |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TSK-52`  | Account deletion and data lifecycle policy                 | Define deletion, retention, anonymization, owner transfer, domain data, audit, grants, invites.                  |
| `TSK-63`  | Passkey adoption strategy                                  | Revisit as phishing-resistant step-up first, then passwordless sign-in.                                          |
| `TSK-68`  | Better Auth Device Authorization for CLI and MCP flows     | Evaluate when CLI or limited-input device UX exists.                                                             |
| `TSK-69`  | Better Auth MCP and Agent Auth plugins                     | Keep current OAuth Provider path until a concrete pilot or stable plugin need appears.                           |
| `TSK-75`  | Better Auth teams and dynamic access control               | Revisit when crews, branches, regions, divisions, or user-defined roles exist.                                   |
| `TSK-110` | Trusted-device policy for 2FA and session UX               | Define remembered-device behavior before 2FA hardening work.                                                     |
| `TSK-111` | Sensitive-action step-up authentication policy             | Define which actions require recent 2FA/passkey verification; include follow-up step-up for admin OAuth consent. |
| `TSK-112` | Future organization API key strategy                       | Define ownership, scope, quota, expiry, revocation, and audit before API key adoption.                           |
| `TSK-113` | Rate-limit table retention and cleanup policy              | Define retention horizon, cleanup mechanism, and stale-table operational signals.                                |
| `TSK-114` | Durable auth email delivery de-duplication                 | Decide whether auth email delivery needs persistent idempotency across queue redelivery.                         |
| `TSK-115` | Atomic organization cardinality enforcement                | Evaluate DB/transactional guards for concurrent org/member/pending-invite cardinality limits.                    |
| `TSK-116` | Conditional captcha after repeated failed sign-in attempts | Design a risk-triggered sign-in challenge without making ordinary sign-in always-on captcha.                     |
| `TSK-117` | Atomic multi-key auth abuse reservations                   | Decide all-or-nothing reservation and denied-attempt accounting semantics for abuse keys.                        |
| `TSK-118` | Partial OAuth scope approval policy                        | Decide whether Better Auth's reduced-scope consent support fits Ceird's MCP client contracts.                    |
| `TSK-119` | Connected apps and OAuth consent management                | Define account/org settings for listing and revoking saved OAuth consents.                                       |
| `TSK-120` | Auth security audit provenance retention and anonymization | Define retention, anonymization, and access control for raw IP/user-agent audit provenance.                      |
| `TSK-121` | Captcha provider timeout and telemetry policy              | Decide Turnstile timeout, fail-open/fail-closed policy, telemetry, and retry UX.                                 |
| `TSK-122` | Active-session device and approximate-location metadata    | Evaluate safe browser/device-family and approximate-location metadata for account sessions.                      |
| `TSK-130` | OAuth DCR default refresh-token grant policy               | Decide whether omitted public DCR `grant_types` should stay Better Auth-native or default to refresh support.    |

Linear note: `TSK-122` intentionally remains a standalone backlog issue outside
the Better Auth project per user direction. The other deferred spikes in this
table are attached to the project backlog and, where applicable, to their
matching project milestone.

## Verification State

Current integration branch verification:

- `git diff --check`
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm --filter app test -- src/features/auth/auth-schema.test.ts src/features/auth/login-page.test.tsx`
- `pnpm --filter app test src/features/organizations/organization-server.test.ts`
- `pnpm --filter app test src/features/organizations/organization-onboarding-page.test.tsx`
- `pnpm --filter app test src/features/organizations/organization-members-page.test.tsx`
- `pnpm --filter app test -- src/features/auth/auth-captcha.test.tsx src/features/auth/auth-form-errors.test.ts src/features/auth/signup-page.test.tsx src/features/auth/password-reset-request-page.test.tsx src/features/auth/email-verification-banner.test.tsx`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "password compromise|pwned|HIBP"`
- `pnpm --filter app test -- src/features/auth/auth-form-errors.test.ts`
- `pnpm --filter domain test -- src/platform/cloudflare/env.test.ts`
- `pnpm exec vitest run infra/stages.test.ts infra/cloudflare-stack.test.ts -t "password compromise"`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "rate-limit|Rate-limit|rate limit|Rate limit"`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "captcha|Turnstile|OAuth dynamic client registration|OAuth consent"`
- `AUTH_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55443/ceird pnpm --filter domain test -- src/domains/identity/authentication/authentication.integration.test.ts -t "captcha"`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts src/platform/cloudflare/env.test.ts`
- `pnpm exec vitest run infra/stages.test.ts -t "captcha"`
- `pnpm exec vitest run infra/stages.test.ts infra/cloudflare-stack.test.ts`
- `pnpm test`
- `pnpm --filter app test -- src/features/settings/user-security-sessions-panel.test.tsx src/features/settings/user-settings-page.test.tsx`
- `pnpm --filter app test -- src/features/settings/user-security-sessions-panel.test.tsx src/features/settings/user-settings-page.test.tsx src/routes/_app.settings.test.tsx`
- `pnpm --filter app check-types`
- `pnpm --filter app test -- src/features/auth/oauth-consent-page.test.tsx`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "configures JWT-backed Better Auth OAuth Provider for MCP clients"`
- `pnpm --filter domain check-types`
- `pnpm --filter @ceird/identity-core test -- src/index.test.ts`
- `pnpm --filter @ceird/identity-core check-types`
- `pnpm --filter domain test -- src/domains/identity/security-activity.test.ts src/domains/organizations/authorization.test.ts src/domains/http.integration.test.ts`
- `pnpm --filter domain check-types`
- `pnpm --filter app test -- src/features/organization-security/organization-security-activity-page.test.tsx src/routes/-_app._org.organization.security.test.tsx src/features/organization-security/organization-security-server.test.ts src/components/app-navigation.test.ts src/hotkeys/active-shortcut-scopes.test.ts src/features/command-bar/app-global-command-actions.test.tsx src/hotkeys/route-hotkeys.test.tsx src/components/app-sidebar.test.tsx src/components/nav-main.test.tsx src/features/auth/app-context-middleware.test.ts src/features/api/app-api-client.test.ts src/test/app-route-code-splitting.test.ts src/features/workspace-sheets/workspace-sheet-navigation.test.tsx`
- `pnpm --filter app check-types`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter app test -- src/features/auth/auth-schema.test.ts`
- `pnpm test:infra -- drizzle.test.ts`
- `pnpm --filter domain check-types`
- `pnpm --filter app check-types`
- `pnpm format`
- `pnpm lint`
- `git diff --check`
- `cd apps/app && ../../node_modules/.bin/vitest run src/features/settings/user-settings-page.test.tsx src/features/organizations/organization-onboarding-page.test.tsx src/features/organizations/organization-server.test.ts src/features/auth/oauth-consent-page.test.tsx`
- `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts -t "requires verified email"`
- `cd apps/app && ../../node_modules/.bin/vitest run src/features/auth/auth-schema.test.ts src/features/auth/auth-captcha.test.tsx src/features/auth/auth-form-errors.test.ts src/features/auth/signup-page.test.tsx src/features/auth/password-reset-request-page.test.tsx src/features/auth/password-reset-page.test.tsx src/features/auth/email-verification-banner.test.tsx src/features/auth/login-page.test.tsx src/features/auth/oauth-consent-page.test.tsx src/features/settings/user-security-sessions-panel.test.tsx src/features/settings/user-settings-page.test.tsx src/features/organization-security/organization-security-activity-page.test.tsx src/routes/-_app._org.organization.security.test.tsx src/features/organization-security/organization-security-server.test.ts src/routes/_app.settings.test.tsx`
- `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts src/domains/identity/security-activity.test.ts src/domains/organizations/authorization.test.ts src/domains/http.integration.test.ts src/platform/cloudflare/env.test.ts`
- `./node_modules/.bin/vitest run infra/stages.test.ts infra/cloudflare-stack.test.ts infra/drizzle.test.ts`
- `cd apps/domain && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
- `cd apps/app && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
- `cd apps/app && ../../node_modules/.bin/vite build`
- `cd packages/identity-core && ../../node_modules/.bin/vitest run --globals src/index.test.ts`
- `cd packages/identity-core && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
- `./node_modules/.bin/tsc --noEmit -p tsconfig.infra.json`
- `./node_modules/.bin/oxlint --config .oxlintrc.mjs . --ignore-pattern '.agents/**' --ignore-pattern 'opensrc/**' --ignore-pattern 'apps/app/src/routeTree.gen.ts'`
- `./node_modules/.bin/oxfmt --check .`
- `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5439/ceird AUTH_EMAIL_FROM=no-reply@example.com VITE_AUTH_CAPTCHA_ENABLED=false pnpm --filter app exec playwright test e2e/auth.test.ts e2e/organization-invitations.test.ts e2e/organization-settings.test.ts --project=chromium`
- Read-only review swarm on the no-socket HIBP range override, Turnstile
  verifier helper, mounted captcha denial regression, and browser/runtime
  handoff docs: intent/regression and security/privacy sub-agents reported no
  findings; the controller reliability/contracts pass also found no material
  issues.

Browser verification notes:

- In-app Browser verification ran on 2026-06-07 against the local app at
  `http://localhost:4173` using a Browser-created unverified Better Auth user
  (`codex-ba-1780845597453@example.test`).
- The Browser run verified weak signup password validation with the targeted
  `Use 12 to 256 characters.` field error.
- The Browser run verified the approved unverified create-team blocking copy.
- The Browser run verified the account Security tab email verification
  reminder, hidden `Set up 2FA` action, approved 2FA warning copy, and current
  active session.
- The Browser run verified `/oauth/consent` grouped `ceird:admin`,
  `ceird:write`, `offline_access`, and identity scopes with high-risk warning
  treatment, showed the missing-workspace block, left `Deny` available, and
  disabled `Allow access`. Screenshots were saved at
  `/tmp/better-auth-browser-unverified-org-gate.png`,
  `/tmp/better-auth-browser-unverified-2fa-block.png`, and
  `/tmp/better-auth-browser-oauth-consent-missing-workspace.png`.
- Active-workspace OAuth consent passed a 2026-06-07 package-local
  production-preview Playwright smoke against the rebuilt local app/API/domain
  stack and disposable Postgres. The smoke used a real Better Auth sign-up,
  explicitly verified the user in the disposable DB, created an active
  workspace through Better Auth, seeded a manually provisioned privileged OAuth
  client row, requested a signed Better Auth authorization URL with PKCE,
  loaded the signed `/oauth/consent` URL returned by Better Auth, and approved
  `openid profile email ceird:read ceird:write ceird:admin` through the app UI.
  The run verified high-risk admin/write/read grouping, active workspace display
  and enabled approval, callback with code/state, `oauth_consent.reference_id`
  equal to the active organization id, `oauth_consent.scopes` preserving all
  requested scopes, an `oauth_consent_granted` audit event with actor,
  organization, client, scopes, and admin/write metadata, and zero browser
  console warnings/errors. Screenshots were saved at
  `/tmp/tsk66-oauth-consent-active-workspace.png` and
  `/tmp/tsk66-oauth-consent-callback.png`. The in-app Browser connector was
  retried first, but Browser discovery returned no registered `iab` browser for
  this pass.
- Earlier restricted-shell loopback/DB access returned `Operation not
permitted`, so that Browser run could not flip the user to verified or seed
  active organization audit data. That environment limitation is superseded by
  the later package-local runtime pass against disposable Postgres `5439`,
  domain `3002`, API `3001`, and app `4173`.
- The auth prefix preservation test originally used `NodeHttpServer.layerTest`,
  which attempted an ephemeral `0.0.0.0` listen and failed with `EPERM` in the
  restricted local environment before the route assertion ran. The test now uses
  `HttpEffect.toWebHandler` against the same `HttpRouter` so it proves the
  `/api/auth` prefix invariant without requiring a live socket; the refreshed
  domain auth batch passes with 206 tests and 2 DB-backed skips.
- Verified-email blocked states passed a 2026-06-07 package-local
  production-preview Playwright smoke against a disposable Postgres database.
  The smoke seeded an unverified Better Auth session through `/sign-up/email`,
  confirmed `emailVerified: false` via `/get-session`, verified the
  create-team blocked message, verified the account Security tab's 2FA blocked
  state and missing `Set up 2FA` action, and captured screenshots at
  `/tmp/tsk42-unverified-create-team-block.png` and
  `/tmp/tsk61-unverified-2fa-block.png`. The clean run had zero browser console
  errors or warnings.
- The earlier package-local production-preview smoke could not use the in-app
  Browser because the Browser plugin was not registered at that time. The
  follow-up Browser run above covers the same unverified UI gates through the
  in-app Browser; Cloudflare/Neon parity still needs an approved Alchemy stage
  or another verified stage target.
- Account security settings/session management passed a 2026-06-07
  package-local production-preview Playwright smoke with a verified user and
  three real Better Auth sessions. The smoke verified the `This device` marker,
  absence of a revoke button on the current session, active/other session
  counts, targeted session revocation, bulk revocation of remaining other
  sessions, and screenshots at `/tmp/tsk49-session-list.png` and
  `/tmp/tsk51-session-revoked.png`. The smoke found and fixed a real-session
  current-device bug: Better Auth `/get-session` returns session `id` but not
  session `token`, so current-session matching now falls back to session id.
- Account security settings/session management passed a fresh rebuilt-stack
  smoke on 2026-06-07 after the local sandbox/server was removed. The in-app
  Browser connector was attempted first, but `iab` was unavailable in this
  session, so package-local Playwright ran against app `4173`, API `3001`,
  domain `3002`, and disposable Postgres `55443`. The smoke created a real
  Better Auth sign-up, loaded `/settings`, waited for hydration, selected the
  Security tab, and verified `Active sessions`, `This device`, the current
  session sign-out guidance, `No other active sessions.`, and zero
  `Revoke session`/`Revoke other sessions` buttons. Screenshot:
  `/tmp/tsk49-51-security-sessions-smoke.png`.
- Package-local e2e browser coverage passed on 2026-06-07 against disposable
  Postgres `5439`: `auth.test.ts`, `organization-invitations.test.ts`, and
  `organization-settings.test.ts` passed with 19 tests. The suite covered
  unauthenticated redirects, signup password validation, signup/org creation,
  login validation, unverified email reminder and verification resend, password
  reset request/completion, verify-email success and invalid states,
  organization admin settings update, and invitation signup/sign-in/reset/wrong
  account/member-access flows.
- 2FA settings and login challenge passed a fresh package-local Playwright smoke
  on 2026-06-07 against the rebuilt stack and disposable Postgres `5439`. The
  smoke used real signup, DB email verification, `/settings` Security tab 2FA
  setup, Better Auth `/two-factor/enable` TOTP URI and 10 backup codes, TOTP
  verification, backup-code acknowledgement, fresh login TOTP challenge success,
  and fresh login backup-code challenge success. Screenshots:
  `/tmp/tsk59-62-2fa-settings-smoke.png`,
  `/tmp/tsk62-2fa-login-totp-smoke.png`, and
  `/tmp/tsk62-2fa-login-backup-smoke.png`.
- DB-backed auth/org integration coverage passed on 2026-06-07 against a
  disposable local Postgres database using
  `pnpm --filter domain test -- src/domains/identity/security-activity.test.ts src/domains/organizations/authorization.test.ts src/domains/http.integration.test.ts`.
  The run initially caught a stale integration setup that attempted to create an
  organization before the owner email was verified. The test now marks the
  owner verified before org creation, preserving the new production rule while
  still covering request-scoped session, active-organization, and membership
  authorization failures.
- Organization security activity passed a fresh 2026-06-07 package-local
  Playwright smoke after the sandbox and previous local server were removed.
  The smoke recreated disposable Postgres `5439`, applied Drizzle migrations,
  started domain/API/app on `3002`/`3001`/`4173`, attempted the in-app Browser
  connector first, and fell back because no `iab` Browser was registered. The
  Playwright run used real Better Auth signup, DB email verification,
  create-team, seeded representative audit rows with raw IP/user-agent
  provenance, and verified `/organization/security` rendered the owner-visible
  activity list, hidden provenance notice, URL-backed event-type filter, and no
  raw `203.0.113.10` or `Ceird Test Browser` text. The real
  `organization_created` audit row produced three visible events before
  filtering; the role-update filter reduced the list to one event. Screenshots:
  `/tmp/tsk74-organization-security-activity-mq43xd6o.png` and
  `/tmp/tsk74-organization-security-activity-filter-mq43xd6o.png`.

## Current Gate

Decision Packet 4 has been approved and the dependent implementation slices are
now ready for review on the integration branch: account security settings,
OAuth consent, organization security activity, and the `TSK-60` through
`TSK-62` two-factor plugin/schema/settings/login work.

The current remaining gate is Cloudflare/Neon runtime parity. The planned stage
is `codex-better-auth-hardening`, using `.env.local` and confirmed Turnstile
test handling. Do not run provider-mutating Alchemy commands until the operator
confirms the target stage and credentials for the current session. Local
rebuilt-stack verification resumed on 2026-06-07; the in-app Browser connector
was unavailable, so package-local Playwright is the current browser evidence
for the refreshed account/session, 2FA, e2e auth/org, and organization security
activity passes.

Approved follow-ups:

- `TSK-122` tracks a deferred spike for active-session browser/device-family
  and approximate-location metadata without exposing raw IP addresses or raw
  user-agent strings.

Credential-security checkpoint:

- `TSK-47` is implemented in the integration branch. Better Auth server config
  uses an explicit 12 to 256 character password policy, app account-password
  schemas use the same range for sign-up and reset completion, login preserves
  existing-password compatibility with non-empty-only validation, and passwords
  are not trimmed. Review added explicit sign-up min/max schema coverage,
  including acceptance at the 256-character maximum, so client-side drift is
  caught alongside the existing server/plugin policy assertions and validation
  copy tests.
- `TSK-48` is implemented in the integration branch. The domain password
  compromise check rejects known-compromised passwords during sign-up, password
  reset, and authenticated password change using the HIBP k-anonymity range API
  shape. A deterministic loopback-only range API override is available for
  local verification and is rejected for non-local or deceptive `127.*`
  hostnames. Focused tests cover the plugin, fail-open telemetry, runtime config
  defaults, Cloudflare env propagation, and Alchemy Worker env forwarding. A
  package-local Playwright smoke against app `4173`, API `3001`, domain `3002`,
  disposable Postgres `55443`, and range stub `8790` passed on 2026-06-07: the
  sign-up request returned `400 PASSWORD_COMPROMISED`, the UI showed
  `Choose a different password; this one appears in known data breaches.`, the
  stub received padded `GET /range/F6B63` with `User-Agent: Ceird Password
Checker`, no smoke user rows persisted, and the screenshot was saved at
  `/tmp/tsk48-signup-compromised-password.png`. The in-app Browser was attempted
  first, but `iab` was unavailable in this session; stage parity with the
  default HIBP provider remains useful before final handoff.

Abuse-protection checkpoint:

- `TSK-54` is implemented in the integration branch. Focused DB-backed
  integration coverage verifies accepted Turnstile responses across
  `/sign-up/email`, `/request-password-reset`, and
  `/send-verification-email`; rejected Turnstile responses return
  `VERIFICATION_FAILED` before sign-up persistence. A package-local Playwright
  smoke against app `4173`, API `3001`, domain `3002`, and a loopback verifier
  at `8787` passed on 2026-06-07: the signup form sent
  `x-captcha-response: captcha-token`, Better Auth returned `200`, the verifier
  received `{ secret, response }`, and the user row was persisted. The in-app
  Browser was attempted first, but `iab` was unavailable in this session; stage
  parity with Cloudflare/Neon and real Turnstile test keys still remains useful
  before final handoff.
- `TSK-55` is implemented in the integration branch. Public abuse endpoints now
  fail closed on pre-handler reservation outages, Better Auth
  response-accounting reads fail open, and write failures remain non-blocking
  with sanitized warning telemetry. The app maps the stable
  `AUTH_RATE_LIMIT_UNAVAILABLE` response to
  `We couldn't verify this request right now. Please try again in a moment.`
  instead of generic auth form failures. A package-local Playwright smoke
  against `/forgot-password` passed on 2026-06-07 after the disposable Postgres
  database was stopped: the UI showed the retry-in-a-moment copy and the public
  endpoint returned `503 AUTH_RATE_LIMIT_UNAVAILABLE`; screenshot saved at
  `/tmp/tsk55-rate-limit-unavailable.png`. Because the package-local API
  adapter does not synthesize Cloudflare client-IP headers, that browser request
  exercised the fail-closed missing-IP branch. A direct API request with
  `cf-connecting-ip: 203.0.113.55` after the same DB outage exercised the
  storage-reservation branch, returned the same stable `503`, and emitted
  `rate_limit_reservation_failure` with high severity and redacted query params.
  The in-app Browser was attempted first, but `iab` was unavailable in this
  session.
- `TSK-56` is implemented in the integration branch. Password reset request,
  verification resend, change-email confirmation, and organization invitation
  now reserve flow-specific delivery keys before Better Auth side effects while
  preserving anti-enumeration response shape. Email-derived keys are HMAC
  digests rather than raw addresses. Review fixes reject unreadable oversized
  delivery bodies before delegation, disable Better Auth's raw internal logger,
  restrict authenticated-only email counters to resolved sessions, and require
  explicit invite organization IDs to match the active organization. Focused
  unit coverage passed for password-reset target-email counters, verification
  resend user/email counters, change-email destination counters, invitation
  recipient/actor/organization counters, active-organization mismatch handling,
  and delivery telemetry. DB-backed integration coverage passed for verification
  resend rate limits, concurrent password-reset abuse reservations, and
  password-reset HMAC target-email persistence with no raw submitted email in
  Ceird-owned `rate_limit` keys. A package-local Playwright smoke against app
  `4173`, API `3001`, domain `3002`, and disposable Postgres `55443` passed on
  2026-06-07: `/forgot-password` returned the generic success state, the auth
  endpoint returned `200`, and the `rate_limit` table contained
  `ceird-auth-abuse:203.0.113.56|/request-password-reset` plus the expected
  `target-email` HMAC key only; screenshot saved at
  `/tmp/tsk56-password-reset-delivery-smoke.png`. The in-app Browser was
  attempted first, but `iab` was unavailable in this session.
- `TSK-113`, `TSK-114`, and `TSK-117` are backlog spikes created from the
  abuse-protection review passes. They track rate-limit table retention,
  durable auth email delivery de-duplication, and transactional multi-key abuse
  reservation semantics respectively.
- Review fixes now route auth abuse telemetry through the captured Effect
  runtime context, prefer `CF-Connecting-IP` for deployed Worker client IP
  resolution, and add DB-backed mounted negative tests for unverified
  organization create/invite flows. The DB-backed auth/org integration tests
  passed against a disposable local Postgres database on 2026-06-07.
- `TSK-57` telemetry review closed an architecture contract drift: the runtime
  emitted `auth_security_audit_session_resolution_failure`, but the auth abuse
  signal table did not list it. The table now documents the
  `dashboard_until_sustained_audit_session_failure` policy, and focused tests
  verify OAuth audit session lookup failures fail open, continue audit capture
  without actor/session enrichment, emit the stable signal, and redact email,
  URL, and token material from the failure cause.

OAuth/MCP hardening checkpoint:

- `TSK-65` is implemented in the integration branch. Unauthenticated dynamic
  OAuth client registration is constrained to identity scopes plus `ceird:read`,
  rejects write/admin scopes, client-credentials grants, unsafe redirect URIs,
  wildcard redirects, consent-skipping attempts, unsupported metadata fields,
  and oversized client metadata before Better Auth persists a client.
- Better Auth's authenticated OAuth client write endpoints are disabled at the
  Ceird auth handler boundary until owner/admin approval or manual registration
  is implemented for privileged OAuth clients.
- Review fixes tightened DCR validation for malformed URL metadata, unsupported
  grant and response metadata, repeated or oversized scope strings, malformed
  array metadata, bounded pre-handler request bodies, confidential client
  metadata, public-client normalization, and IPv4-mapped IPv6 loopback
  redirects.
- Final review fixes made streamed DCR bodies without a JSON content type fail
  before Better Auth delegation even when `content-length` is absent.
- Missing `NODE_ENV` no longer enables local DCR loopback allowances for
  deployed-looking HTTPS auth config; only `CEIRD_LOCAL_DEV=true` or a strict
  loopback/`.localhost` auth base URL gets local defaults.
- `/oauth2/register` now participates in Ceird's fail-closed atomic public abuse
  reservation path with a 5-per-minute rule.
- Rejected dynamic registration attempts emit
  `oauth_dynamic_client_registration_rejected` telemetry.
- DB-backed integration coverage and a local domain HTTP smoke passed on
  2026-06-07 for `TSK-65`. The HTTP smoke applied Drizzle migrations to a
  disposable Postgres database, started the domain server on
  `http://127.0.0.1:3002`, verified a successful unauthenticated public DCR
  request persisted one read-only public `oauth_client` with no
  `client_secret`, verified a write-scope DCR request returned
  `invalid_scope` without adding another client, and confirmed both
  source-IP-specific rate-limit rows and success/rejection audit rows.
- `TSK-130` tracks the follow-up decision discovered during runtime
  verification: Better Auth persists omitted DCR `grant_types` as
  `authorization_code` only, even though Ceird's default DCR scopes include
  `offline_access`. The verified MCP-compatible path explicitly requests
  `refresh_token`.
- `TSK-67` adds durable OAuth/MCP audit-event capture for registration
  success/rejection, consent grant/denial, refresh-token grants, and revoke
  endpoint acceptance. Raw tokens, secrets, authorization codes, OAuth query
  strings, and redirect URLs are excluded.
- `TSK-66` is implemented in the integration branch. OAuth consent now enriches
  display with Better Auth public client metadata, groups scopes semantically,
  keeps `ceird:admin` warning-only, and scopes `ceird:*` stored consent rows to
  the active organization via `postLogin.consentReferenceId`. Approval is
  blocked when no active workspace is present; denial remains available.

Organization authorization checkpoint:

- `TSK-72` is implemented in the integration branch. Better Auth organization
  plugin limits are configured as 10 organizations per user, 200 members per
  organization, and 100 pending invitations per organization; Ceird also checks
  invitation acceptance against the same 10-organization membership cap.
- DB-backed integration coverage passed on 2026-06-07 against disposable
  Postgres for real organization creation at the first-release cap: a verified
  user created 10 organizations, the 11th create returned
  `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS`, and only 10
  organizations/memberships persisted.
- Package-local Playwright smoke passed on 2026-06-07 against a fresh local
  app/API/domain stack and disposable Postgres. The smoke created a signed-in
  invitee with 10 organizations, verified the real 11th-create API block,
  created a separate owner organization and pending invitation, loaded the
  signed-in invite acceptance page, and verified the user-facing blocked copy:
  `You've reached the 10-team limit for this account.` Screenshot:
  `/tmp/tsk72-accept-invitation-org-limit.png`.
- The in-app Browser connector was retried against the fresh stack first, but
  `iab` was unavailable. The Playwright fallback is the current local browser
  evidence; Cloudflare/Neon stage parity remains useful before handoff.
