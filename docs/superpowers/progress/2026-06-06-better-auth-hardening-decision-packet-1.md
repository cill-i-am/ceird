# Better Auth Hardening Decision Packet 1

Last updated: 2026-06-06

This packet is the historical human approval gate for the baseline Better Auth
hardening work. The user approved these defaults on 2026-06-06, and the
canonical decision history now lives in
`docs/architecture/better-auth-decision-log.md`.

## Status

Approved and implemented in the current hardening branch. Current implementation
state and verification live in:

- `docs/superpowers/progress/2026-06-06-better-auth-hardening.md`
- `docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md`

## 1. Verified Email Gates

**Issues:** `TSK-42`, later verified-email implementation follow-ups

**Recommended default:** Require verified email for:

- organization creation
- member invitations
- OAuth/MCP consent for Ceird scopes
- future API key creation
- 2FA/passkey enrollment

Do not block:

- ordinary login
- authenticated password change

**Why:** This keeps onboarding smooth while making verified email a real trust
boundary before users become organization operators, invite senders, OAuth
approvers, or future integration owners.

**Implementation unlocked after approval:**

- policy section in `docs/architecture/auth.md`
- route/server-function guards for approved high-trust actions
- blocked-state UX/design requests for unverified users
- tests for allowed ordinary auth and blocked high-trust actions

## 2. Better Auth Secret Rotation Shape

**Issues:** `TSK-43`

**Recommended default:** Add structured versioned secrets through
`BETTER_AUTH_SECRETS`, sorted highest-version-first for Better Auth's current
secret, while retaining `BETTER_AUTH_SECRET` as a migration fallback until every
stage is rotated.

Implemented shape:

```text
BETTER_AUTH_SECRETS='2:current-secret-value,1:previous-secret-value'
```

Each entry is `<version>:<secret>`. Versions are unique non-negative integers,
every secret must be at least 32 characters, and the highest version is treated
as current.

**Why:** One structured value is easier for Alchemy/stage-managed secret
promotion than proliferating numbered env vars, the numeric versions match
Better Auth's `secrets` option, and a fallback keeps current local/preview
stages working during migration.

**Implementation unlocked after approval:**

- runtime config schema for versioned secrets
- Better Auth `secrets` wiring
- rotation runbook for add/promote/retire
- tests for structured secrets and legacy fallback

## 3. External Role Policy

**Issues:** `TSK-44`, `TSK-70`

**Recommended default:** Keep the current `external -> memberAc` Better Auth
mapping for plugin compatibility, but add explicit Ceird guards and regression
tests around every exposed organization endpoint and domain action.

**Why:** The current mapping lets Better Auth's organization plugin continue to
work with Ceird's custom role vocabulary. The risk is that Better Auth may treat
`external` as member-like, so Ceird needs source-backed endpoint coverage and
domain checks wherever product semantics are narrower.

**Implementation unlocked after approval:**

- final approved policy in the permission matrix
- external-role endpoint inventory
- regression tests for exposed Better Auth organization endpoints
- domain/action tests proving external users cannot access internal/admin data

## 4. Audit-Grade Event Taxonomy

**Issues:** `TSK-46`, `TSK-67`, `TSK-73`

**Recommended default:** Treat these as audit-grade:

- password changes
- email changes and verification changes
- 2FA/passkey enrollment, disable, and recovery actions
- organization creation
- organization invitations: create, resend, cancel, accept
- role changes and member removal
- OAuth client registration
- OAuth consent grants and denials
- token revocation
- future API key creation, rotation, permission changes, and revocation

Keep these as observability-only unless thresholds are crossed:

- captcha failures
- rate-limit hits
- provider latency or transient delivery failures

**Why:** Audit should capture security-relevant state changes and grants, while
normal abuse-control noise belongs in metrics/logs unless it becomes an
incident signal.

**Implementation unlocked after approval:**

- event taxonomy document/architecture section
- persistence model proposal
- OAuth/MCP audit event implementation plan
- organization audit event implementation plan
- later owner/admin visible activity UI decisions

## Current Non-Decision Artifacts

- Decision log: `docs/architecture/better-auth-decision-log.md`
- Permission matrix:
  `docs/architecture/auth-organization-permission-matrix.md`
- Issue map:
  `docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md`

## Verification State

See the current progress note and issue map for branch verification. This file
is retained as decision context only.
