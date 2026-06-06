# Better Auth Hardening Progress

## 2026-06-06

Active objective: implement the Linear project `Better Auth security and UX
hardening` end to end, with decisions captured, implementation verified by
tests/docs/migrations, and browser verification for user-facing workflows.

Current integration branch/worktree:

- Branch: `codex/better-auth-hardening`
- Worktree: `.worktrees/better-auth-hardening`
- Linear project:
  https://linear.app/tskr/project/better-auth-security-and-ux-hardening-cee0b0f66e98

Baseline completed:

- Created integration worktree from `main`.
- Ran `pnpm install`.
- Ran `pnpm check-types`; it passed.
- Added execution plan:
  `docs/superpowers/plans/2026-06-06-better-auth-hardening.md`.
- Linear project status updates are disabled in this workspace, so the execution
  summary was attached as a Linear project document instead:
  https://linear.app/tskr/document/better-auth-hardening-execution-plan-9e78e49a67f8
- Pulled the Better Auth research docs into the integration branch:
  - `docs/architecture/better-auth-implementation-gaps.md`
  - `docs/architecture/better-auth-feature-adoption.md`
- Updated `docs/architecture/auth.md` so current scope includes profile update,
  verified email change, authenticated password change, Better Auth
  organization workflows, Ceird domain authorization, and the current
  change-email/change-password rate-limit rules.
- Added the Better Auth plugin adoption checklist to
  `docs/architecture/better-auth-feature-adoption.md`.
- Added Linear labels:
  - `Needs decision`
  - `Needs design`
- Applied `Needs decision` to policy/product/security decision issues and
  `Needs design` to UI shape issues.
- Added decision log:
  `docs/architecture/better-auth-decision-log.md`.
- Attached the decision log to the Linear project:
  https://linear.app/tskr/document/better-auth-decision-log-b7bf51e2af59
- Added a source-backed current permission matrix:
  `docs/architecture/auth-organization-permission-matrix.md`.
- Attached the permission matrix to the Linear project:
  https://linear.app/tskr/document/auth-and-organization-permission-matrix-2ef2c76db252
- Added the issue map:
  `docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md`.
- Attached the issue map to the Linear project:
  https://linear.app/tskr/document/better-auth-issue-map-732d59f487cf
- Added the compact first decision packet:
  `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-1.md`.
- Attached the first decision packet to Linear:
  https://linear.app/tskr/document/decision-packet-1-baseline-auth-policy-226ed14f9d49
- Added the compact second decision packet:
  `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-2.md`.
- Attached the second decision packet to Linear:
  https://linear.app/tskr/document/decision-packet-2-credential-session-and-abuse-policy-eb88979eb74b
- Added the compact third decision packet:
  `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-3.md`.
- Attached the third decision packet to Linear:
  https://linear.app/tskr/document/decision-packet-3-privileged-accounts-oauthmcp-and-organization-policy-b624d63ba4e0

Verification completed after the docs updates:

- `git diff --check`
- `pnpm check-types`

Pending first human decision packet:

1. Verified email gates: recommended default is to require verified email for
   organization creation, member invitations, OAuth/MCP consent for Ceird
   scopes, future API key creation, and 2FA/passkey enrollment, while not
   blocking ordinary login or password change.
2. Better Auth secret rotation config: recommended default is a structured
   `BETTER_AUTH_SECRETS` env var with `BETTER_AUTH_SECRET` retained as the
   current fallback during migration.
3. External organization role: recommended default is to keep mapping
   `external` to Better Auth `memberAc`, but add explicit Ceird tests and
   guards around every exposed organization endpoint.
4. Audit-grade events: recommended default is to audit password/email/security
   setting changes, 2FA/passkey changes, org invites, role changes, member
   removal, OAuth client registration, consent grants/denials, token revocation,
   and future API key lifecycle. Captcha/rate-limit hits remain observability
   unless they cross an alert threshold.

Do not start policy-dependent implementation until the user resolves or adjusts
these decisions.
