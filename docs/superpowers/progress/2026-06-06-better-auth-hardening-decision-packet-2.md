# Better Auth Hardening Decision Packet 2

Last updated: 2026-06-06

This packet covers credential/session security and abuse-protection policy. It
does not replace Decision Packet 1; Packet 1 remains the first runtime
implementation gate.

The canonical decision history lives in
`docs/architecture/better-auth-decision-log.md`; this file is the compact reply
surface for the next milestone set.

## How To Reply

Reply with one of:

- `Approve packet 2 defaults`
- `Approve 5, 6, 8, and 10; change 7 to ...`
- Per-item edits using the item numbers below

## 5. Password Length Policy

**Issues:** `TSK-47`

**Recommended default:** Require passwords between 12 and 256 characters.

**Why:** Twelve characters is a pragmatic modern minimum without forcing complex
composition rules. A 256-character maximum allows password managers and long
passphrases while keeping request payloads bounded.

**Implementation unlocked after approval:**

- explicit Better Auth server password length config
- aligned signup, reset, and change-password schemas
- user-facing copy updates
- server/app validation tests

## 6. Have I Been Pwned Failure Behavior

**Issues:** `TSK-48`

**Recommended default:** Reject known-compromised passwords. If the HIBP
provider is unavailable, fail open with high-severity telemetry in production
and fail open in local/test with deterministic test coverage.

**Why:** Known compromised passwords should be blocked, but an external provider
outage should not become a total sign-up/reset/change-password outage unless
there is a stronger compliance reason to choose availability loss.

**Implementation unlocked after approval:**

- Better Auth HIBP plugin adoption
- provider failure tests
- compromised-password rejection tests
- user-facing copy that does not expose provider internals

## 7. Account Security Controls In First Release

**Issues:** `TSK-49`, `TSK-50`, `TSK-51`, later `TSK-59` to `TSK-62`

**Recommended default:** Shape and implement these first:

- active sessions
- current session marker
- revoke one other session
- revoke all other sessions
- 2FA placement and backup-code placement as planned sections
- account recovery/security state language

Defer these from the first account-security UI slice unless separately
approved:

- passkeys
- trusted devices
- self-service account deletion

**Why:** Session visibility and revocation are useful immediately and give the
security settings page a stable information architecture before 2FA/passkeys add
more states.

**Implementation unlocked after approval:**

- `$impeccable shape` for account security settings
- active-session listing implementation
- session revocation implementation
- browser verification for the settings surface

## 8. Session Metadata Display

**Issues:** `TSK-50`

**Recommended default:** Show only metadata that is reliable enough to avoid
false precision:

- current-session marker
- created time
- last-used or updated time if Better Auth data proves it is meaningful
- browser/device family parsed from user agent
- IP address only if already stored and useful for the user

Do not show precise location unless a dedicated, trustworthy location source is
introduced and reviewed.

**Why:** Session UI should help users identify access without pretending we know
more about a device/location than the data supports.

**Implementation unlocked after approval:**

- exact UI fields for active sessions
- tests for present/missing metadata states
- copy for unknown or approximate session details

## 9. Current-Session Revocation Behavior

**Issues:** `TSK-51`

**Recommended default:** Settings can revoke other sessions and all other
sessions. Terminating the current session should stay on the existing sign-out
path.

**Why:** This keeps destructive behavior unsurprising: the security panel
removes other access, while sign-out remains the clear current-session exit.

**Implementation unlocked after approval:**

- revoke-one-other-session action
- revoke-all-other-sessions action
- confirmation copy and tests
- consistent settings/sign-out behavior

## 10. Self-Service Account Deletion Scope

**Issues:** `TSK-52`

**Recommended default:** Defer self-service account deletion out of this
Better Auth hardening project. Create a separate account/data lifecycle project
for deletion, retention, anonymization, owner transfer, jobs, comments, audit
events, OAuth grants, invitations, and future API keys.

**Why:** Account deletion is bigger than auth. It touches domain data ownership
and retention rules, so implementing it inside this hardening project would
either be incomplete or over-broaden the project.

**Implementation unlocked after approval:**

- decision record marking account deletion deferred
- follow-up Linear project/issue for account lifecycle policy
- removal of account deletion from first account-security UI scope

## 11. Captcha Provider And Trigger Policy

**Issues:** `TSK-53`, `TSK-54`

**Recommended default:** Use Cloudflare Turnstile if captcha is adopted, with
local/test bypass and environment-specific secrets. Apply captcha selectively
to:

- sign-up
- password reset request
- verification email resend
- repeated failed sign-in attempts after threshold

Do not make captcha always-on for normal sign-in.

**Why:** Ceird already runs on Cloudflare, and selective challenges reduce abuse
without making ordinary authentication feel hostile.

**Implementation unlocked after approval:**

- Better Auth captcha plugin adoption
- Turnstile runtime config
- local/test bypass behavior
- UI/error states for selected auth flows
- browser verification of challenge/error states where possible

## 12. Rate-Limit Storage Failure Policy

**Issues:** `TSK-55`

**Recommended default:**

- Fail closed for high-risk public write endpoints when rate-limit storage
  cannot be read: sign-in, sign-up, password reset request, verification resend.
- Fail open with warning telemetry for authenticated settings endpoints:
  change email and change password.
- Keep write failures non-blocking but observable so a single failed counter
  update does not break an otherwise valid request.

**Why:** Public abuse endpoints need stricter protection. Authenticated settings
flows should favor availability once a session already exists, while still
making storage failures visible.

**Implementation unlocked after approval:**

- custom rate-limit storage read/write behavior changes
- endpoint-class tests for storage failures
- architecture docs for fail-open/fail-closed policy

## 13. Auth Delivery Abuse Limits

**Issues:** `TSK-56`

**Recommended default:** Track delivery-abuse limits separately by flow:

- password reset request: per email and per IP
- verification resend: per user/email and per IP
- change-email confirmation: per authenticated user and destination email
- organization invitations: per actor, per recipient email, and per organization

Preserve anti-enumeration behavior for password reset and verification flows.

**Why:** Email delivery abuse is not one problem. Per-flow keys make it possible
to slow abuse without leaking whether an account exists.

**Implementation unlocked after approval:**

- delivery-flow inventory
- missing rate-limit proposals or implementation
- tests for anti-enumeration-preserving limits
- telemetry fields for delivery throttles

## 14. Abuse Telemetry And Alert Thresholds

**Issues:** `TSK-57`

**Recommended default:** Keep normal throttling dashboard-only. Alert on:

- sustained spikes in rate-limit hits by endpoint
- captcha provider failures or verification errors
- repeated HIBP provider failures
- suspicious OAuth dynamic client registration attempts
- auth email provider or queue failures crossing threshold

Redact emails, tokens, invite URLs, reset URLs, verification URLs, and raw
secrets from logs.

**Why:** Alerting on every expected throttle creates noise. Alerting should
identify sustained abuse, provider degradation, and security-boundary failures.

**Implementation unlocked after approval:**

- telemetry requirements section
- event/metric names for abuse controls
- redaction rules
- follow-up implementation tasks for alert wiring

## Current Dependency

Packet 1 is still the first runtime implementation gate. Packet 2 can be
approved now, but implementation should still start with Packet 1 baseline work
before credential/session and abuse-protection runtime changes.

## Verification State

Current branch verification before this packet:

- `git diff --check`
- `pnpm check-types`

Runtime tests, migrations, and browser verification have not started because no
runtime behavior has been approved or changed yet.
