# Better Auth Hardening Decision Packet 3

Last updated: 2026-06-06

This packet covers privileged account protection, OAuth/MCP hardening, and
organization authorization policy. It does not replace Decision Packets 1 or 2;
Packet 1 remains the first runtime implementation gate.

The canonical decision history lives in
`docs/architecture/better-auth-decision-log.md`; this file is the compact reply
surface for the remaining decision-heavy milestones.

## How To Reply

Reply with one of:

- `Approve packet 3 defaults`
- `Approve 15, 16, 18, and 24; change 22 to ...`
- Per-item edits using the item numbers below

## 15. 2FA Enforcement Policy

**Issues:** `TSK-58`, `TSK-60`, `TSK-61`, `TSK-62`

**Recommended default:** First release:

- optional 2FA for all users
- strong enrollment prompts for organization owners/admins
- verified email required before 2FA enrollment if Packet 1 is approved
- no hard owner/admin requirement until recovery and support policy exists
- sensitive-action step-up as a follow-up after enrollment/recovery is stable

**Why:** This gets MFA into the product without creating account lockout and
support problems before recovery flows exist.

**Implementation unlocked after approval:**

- Better Auth two-factor plugin adoption plan
- schema/migration work for 2FA
- settings and login challenge shape
- owner/admin prompt copy and policy-blocked states

## 16. 2FA Method, Recovery, And Login Challenge Shape

**Issues:** `TSK-59`, `TSK-61`, `TSK-62`

**Recommended default:**

- support TOTP authenticator apps first
- generate backup codes during enrollment
- allow recovery-code login as a first-release recovery path
- keep the 2FA challenge as an inline continuation on `/login`, not a modal
- preserve redirect and invitation continuation through the challenge
- shape settings enrollment, backup-code reveal/regeneration, disable, and
  login challenge with `$impeccable shape` before implementation

**Why:** TOTP plus backup codes is a common baseline. Inline login continuation
keeps routing simpler and preserves existing login/invitation state.

**Implementation unlocked after approval:**

- `$impeccable shape` for 2FA settings and login challenge
- 2FA enrollment, verification, backup-code, disable, and login tests
- browser verification for desktop/mobile settings and login flows

## 17. Passkey Adoption Strategy

**Issues:** `TSK-63`

**Recommended default:** Defer passkeys until after TOTP 2FA and session
management ship. Revisit passkeys first as phishing-resistant step-up for
sensitive actions, then consider passwordless sign-in later.

**Why:** Passkeys are valuable, but they add browser support, recovery,
account-linking, and UI complexity. The product gets more security per unit of
implementation by landing sessions and 2FA first.

**Implementation unlocked after approval:**

- passkey decision record marked deferred
- revisit trigger after 2FA/session-management completion
- no passkey schema or UI work in the first implementation wave

## 18. OAuth Dynamic Client Registration Policy

**Issues:** `TSK-64`, `TSK-65`

**Recommended default:** Keep unauthenticated dynamic client registration only
for identity scopes plus read-only Ceird access. Require authenticated
owner/admin approval or manual registration for `ceird:write` and
`ceird:admin` scopes.

Also enforce:

- exact HTTPS redirect URI matching outside local development
- localhost redirect URI allowance only in local/test/dev stages
- bounded client name, URL, and metadata lengths
- no broad wildcard redirect URI patterns

**Why:** Read-only dynamic registration preserves MCP convenience. Write/admin
scopes are an authorization boundary and should require an accountable human
organization operator.

**Implementation unlocked after approval:**

- dynamic registration threat model
- constrained registration implementation
- redirect URI and metadata tests
- registration/consent audit event requirements

## 19. OAuth Consent UX And High-Risk Treatment

**Issues:** `TSK-66`

**Recommended default:** Shape consent around user-comprehensible groups:

- identity: profile/email identity
- read: view Ceird organization data
- write: create or change Ceird operational data
- admin: administer organization-sensitive data
- offline access: continue access after the browser session

Require verified email for Ceird scope consent if Packet 1 is approved. Treat
`ceird:admin` as high risk and require future step-up once 2FA/passkeys are
available.

**Why:** Consent should describe what the client can do in Ceird terms, not
only protocol scope names. Admin grants deserve stronger attention and later
step-up.

**Implementation unlocked after approval:**

- `$impeccable shape` for OAuth consent
- improved consent copy and grouping
- high-risk warning treatment
- browser verification of approve/deny behavior

## 20. Device Authorization For CLI/MCP

**Issues:** `TSK-68`

**Recommended default:** Evaluate Better Auth Device Authorization, but do not
adopt it in the first implementation wave. Keep the current browser redirect
OAuth flow for MCP until there is a concrete CLI/limited-input user journey.

**Why:** Device Authorization is a good fit for CLI and limited-input clients,
but adopting it before the client UX exists risks adding protocol surface
without improving the current product.

**Implementation unlocked after approval:**

- evaluation document comparing current OAuth redirect flow and device auth
- defer/adopt recommendation with schema and route implications
- no device-auth schema work unless evaluation changes the decision

## 21. Better Auth MCP And Agent Auth Plugins

**Issues:** `TSK-69`

**Recommended default:** Keep the current OAuth Provider plus Ceird MCP bearer
validation integration. Evaluate Better Auth's MCP plugin for narrower MCP
patterns, but defer Agent Auth until the plugin is stable enough and Ceird has a
specific agent capability-grant workflow to pilot.

**Why:** The current integration is understood and already tied into Ceird
domain authorization. Agent Auth is directionally relevant, but unstable
security infrastructure should not become a default dependency without a crisp
pilot.

**Implementation unlocked after approval:**

- current integration retained as the default
- MCP plugin evaluation notes
- Agent Auth defer record and revisit trigger

## 22. Organization, Member, And Invitation Limits

**Issues:** `TSK-71`, `TSK-72`

**Recommended default:** Use conservative first-release guardrails, not billing
limits:

- organizations per user: 10
- members per organization: 200
- pending invitations per organization: 100
- invitations per actor: 30 per hour
- invitations per organization: 200 per day
- verified email required for organization creation and invitations if Packet 1
  is approved

Treat these as abuse/product safety controls, not pricing entitlements.

**Why:** The project is greenfield, so generous guardrails reduce accidental
abuse and runaway invitation delivery without prematurely defining packaging.

**Implementation unlocked after approval:**

- org/member/invite policy section
- Better Auth plugin config or Ceird guard implementation
- limit-reached user-facing behavior and tests

## 23. Organization Security Activity Visibility

**Issues:** `TSK-73`, `TSK-74`

**Recommended default:** Capture audit events first, then expose this subset to
owners/admins in product UI:

- organization created
- invitation created, resent, canceled, accepted
- member role changed
- member removed
- OAuth client/consent grants involving the organization when applicable
- future API key lifecycle events when API keys are adopted

Keep these internal-only unless separately approved:

- raw rate-limit hits
- captcha failures
- provider latency
- low-level token refresh noise

**Why:** Owners/admins need a useful security story, not an undifferentiated log
stream. Internal abuse telemetry can stay in observability unless it becomes an
incident or support signal.

**Implementation unlocked after approval:**

- organization audit event visibility policy
- `$impeccable shape` for organization security activity UI
- filters, empty states, dense-history behavior, and retention copy

## 24. Better Auth Teams And Dynamic Access Control

**Issues:** `TSK-75`

**Recommended default:** Defer Better Auth teams and dynamic access control.
Revisit only when crews, branches, regions, divisions, or user-defined roles
become concrete product concepts.

**Why:** Current organization roles are intentionally simple. Adding teams or
user-defined access control now would create abstraction before product demand.

**Implementation unlocked after approval:**

- defer record in architecture/project docs
- no team/dynamic-access schema work in this project
- revisit trigger for future product modeling

## Current Dependency

Packet 1 is still the first runtime implementation gate. Packets 2 and 3 can
be approved now, but implementation should still start with Packet 1 baseline
work before credential/session, abuse, privileged-account, OAuth/MCP, or
organization runtime changes.

## Verification State

Current branch verification before this packet:

- `git diff --check`
- `pnpm check-types`

Runtime tests, migrations, and browser verification have not started because no
runtime behavior has been approved or changed yet.
