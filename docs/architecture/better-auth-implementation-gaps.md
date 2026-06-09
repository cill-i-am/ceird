# Better Auth Implementation Gaps

Audited on 2026-06-06 from the current Ceird source, the local Better Auth
1.6.11 source snapshot under `opensrc/`, and the Better Auth v1.6 docs.

## Goal

Use Better Auth as the system of record for identity, sessions, OAuth, and
organization membership, while tightening the app-specific boundaries around
security policy, organization authorization, and user-facing account controls.

This document identifies current implementation gaps. The companion document,
[`better-auth-feature-adoption.md`](better-auth-feature-adoption.md), catalogs
the Better Auth feature/plugin surface and recommends adoption opportunities.
The current Better Auth/Ceird authorization split is mapped in
[`auth-organization-permission-matrix.md`](auth-organization-permission-matrix.md).

## Current Auth Touchpoints

Ceird currently touches Better Auth in these areas:

- `apps/domain/src/domains/identity/authentication/config.ts` owns Better Auth
  base URL, trusted origins, cookie policy, rate limits, email/password,
  verification, password reset, change-email support, captcha, password
  compromise screening, two-factor settings, and OAuth/MCP config.
- `apps/domain/src/domains/identity/authentication/auth.ts` creates the Better
  Auth instance with Drizzle persistence, JWT, OAuth Provider, organization
  plugin, captcha, optional TOTP two-factor auth, auth email delivery hooks,
  organization hooks, dynamic OAuth client registration, and the extra
  organization admin read guard.
- `apps/domain/src/domains/identity/authentication/schema.ts` defines the
  persisted Better Auth tables currently in use: users, accounts, sessions,
  verification records, rate limits, organizations, members, invitations, JWKS,
  OAuth clients, OAuth tokens, OAuth consent, two-factor state, and Ceird auth
  security audit events.
- `apps/domain/src/domains/organizations/current-actor.ts` resolves the current
  domain actor from the Better Auth session row, active organization id, and
  membership row.
- `apps/domain/src/domains/organizations/authorization.ts` applies Ceird domain
  permissions for owner/admin/member/external roles.
- `apps/domain/src/domains/identity/security-activity.ts` exposes the
  owner/admin-safe organization security activity read model over Ceird auth
  security audit events.
- `apps/domain/src/domains/mcp/http.ts` validates MCP bearer traffic through the
  Better Auth OAuth Provider integration.
- `apps/app/src/lib/auth-client.ts` creates the Better Auth React client with
  the organization client, OAuth Provider client, and two-factor client plugins.
- `apps/app/src/features/auth/*` owns login, signup, password reset, email
  verification, OAuth consent, auth route guards, server auth context, and
  sign-out UX, including the inline 2FA login challenge.
- `apps/app/src/features/settings/*` uses Better Auth for profile updates, email
  change confirmation, password changes, active-session review and revocation,
  and optional TOTP two-factor management.
- `apps/app/src/features/organizations/*` uses Better Auth organization APIs
  for organization creation, active organization switching, invitations,
  invitation acceptance, member listing, role updates, and member removal.
- `packages/identity-core/src/index.ts` owns Ceird's shared organization role
  vocabulary and validation schemas.

## Gaps

### 1. Architecture Notes Lag Behind The Implementation

This audit found that `docs/architecture/auth.md` had drifted behind the code:
it said authentication did not support roles, permissions, or authorization
rules, and its current-scope list did not mention profile update, change email,
or password change flows. The implementation already had organization roles,
domain authorization checks, member administration, change-email confirmation,
and password-change UI.

Better move:

- Keep `docs/architecture/auth.md` updated in the same change whenever Better
  Auth plugin config, account settings, route guards, OAuth/MCP behavior, or
  organization authorization changes.
- Split "Better Auth endpoint ownership" from "Ceird domain authorization" so
  future readers do not mistake custom authorization checks for Better Auth
  replacement.

### 2. Password Policy Baseline And Breach Screening Are In Place

The app and Better Auth now enforce an explicit 12 to 256 character password
length policy, and password reset continues to revoke existing sessions after a
successful reset. Ceird also checks sign-up, reset, and authenticated
password-change submissions against the HIBP k-anonymity range API through a
Ceird-owned Better Auth plugin.

Remaining gap: provider-outage telemetry should be connected to alerting once
the production observability policy is finalized.

Better move:

- Keep the app UI copy and schemas generated from, or at least aligned with, the
  server policy.
- Alert on repeated password compromise provider failures.

### 3. Public Auth Abuse Controls Need Operational Tuning

Ceird has database-backed Better Auth rate limits for sign-in, sign-up,
password reset request, verification resend, change email, change password, and
organization invitation submission. Public abuse endpoints now reserve
path/IP-based slots atomically before Better Auth endpoint side effects run;
reservation failures fail closed, over-limit reservations return before email,
account, or session side effects, Better Auth's response-accounting reads fail
open with warning telemetry, and counter writes remain non-blocking.
Delivery-sensitive flows also reserve flow-specific keys before email side
effects: password reset by target email, verification resend by target email
and authenticated user when available, change-email confirmation by
destination email and authenticated user, and organization invitation by
recipient email, actor, and organization. Email-derived key components are
HMAC digests rather than raw addresses. Oversized or unreadable delivery
request bodies fail before Better Auth can send mail, and Better Auth's
internal logger is disabled so Ceird-owned sanitized telemetry is the only auth
logging boundary.
Ceird also adopts Better Auth's captcha plugin with Cloudflare Turnstile for
sign-up, password reset request, and verification resend when
`AUTH_CAPTCHA_ENABLED=true`.

Remaining gap: operational thresholds still need production tuning. The runtime
now preserves Better Auth's anti-enumeration response shape for password reset
and verification resend while making delivery throttles visible through stable
rate-limit telemetry. Captcha provider timeout and sanitized telemetry policy is
tracked separately in `TSK-121`.

Better move:

- Keep captcha limited to abuse-prone flows where the UX cost is justified.
  The current implementation covers sign-up, password-reset request, and
  verification resend.
- Do not make ordinary sign-in always-on captcha. Conditional captcha after
  repeated failed sign-in attempts is tracked as `TSK-116`.
- Review the first-release delivery thresholds against production traffic
  before raising alert severity.
- Keep rate-limit storage failure telemetry sanitized and dashboard-oriented
  unless failures cross the approved alert threshold.
- Decide `TSK-121` before treating Turnstile provider availability as a fully
  Ceird-owned operational signal.

### 4. Email Verification Gate Coverage Needs To Stay Explicit

The baseline implementation now sends verification on sign-up without requiring
verification before ordinary login. Verified email is required before
organization creation, member invitations, and Ceird-scope OAuth/MCP consent
approval. Identity-only OAuth consent approval uses the same verified-email
gate; only consent denial remains allowed while verification is pending. Revisit
that stricter baseline only if server-side consent scope provenance is added.

Remaining gap: future privileged surfaces must opt into the same policy when
they ship. Approved future gates include API key creation and passkey
enrollment; TOTP enrollment is already gated on verified email.

Better move:

- Keep ordinary login permissive, but add explicit guards around every new
  high-trust action.
- Add tests whenever a new Better Auth organization, OAuth, API key, 2FA, or
  passkey flow depends on verified email.
- Keep the unverified state actionable in settings and privileged flows, not
  only through the existing banner.

### 5. Passkeys And Step-Up Auth Are Still Incomplete

The Better Auth two-factor plugin, `user.twoFactorEnabled`, `two_factor` table,
verified-email enrollment gate, client plugin, and `/settings` security-tab
management flow are now wired. Owners/admins get stronger enrollment prompts,
but first-release 2FA remains optional. Password sign-in now continues into the
inline TOTP or backup-code challenge when Better Auth returns
`twoFactorRedirect`. Passkeys and sensitive-action step-up remain deferred.

Better move:

- Keep trusted devices disabled until remembered-device policy is approved.
- Add passkeys as either a primary sign-in method or a step-up method for
  sensitive actions.
- Gate dangerous owner/admin actions behind recent 2FA/passkey verification
  before enforcing it globally.

### 6. Account Session Management Is In Place, With Metadata Deferred

Password reset revokes other sessions, and password change asks Better Auth to
revoke other sessions. Account settings now include a Security tab that lists
active Better Auth sessions, marks the current session, avoids exposing raw IP
addresses or raw user-agent strings, lets users revoke a specific other
session, and supports revoking all other sessions on demand.

Remaining gap: richer browser/device-family and approximate-location metadata
is deferred to `TSK-122` until the product can define what is useful, safe, and
not misleading.

Better move:

- Keep raw IP addresses and raw user-agent strings out of ordinary settings UI.
- Include current device, creation time, last-used time if available, and coarse
  location/user-agent summaries only if the data is trustworthy enough.
- Pair session management with sign-out behavior and Better Auth cookie prefix
  handling so stage-specific sessions remain understandable.

### 7. Secret Rotation Still Needs Operational Rollout

Ceird now requires `BETTER_AUTH_SECRET` as a legacy/current fallback and accepts
versioned Better Auth rotation material through `BETTER_AUTH_SECRETS` formatted
as comma-separated `<version>:<secret>` entries. The auth config sorts the
highest version first before passing those values to Better Auth's `secrets`
option and keeps the fallback secret in place during migration.

Remaining gap: stage secret rollout and the operational add/promote/retire
runbook are not complete yet.

Better move:

- Document a rotation runbook in the auth architecture guide or operations docs.
- Keep Alchemy/stage secret naming explicit so preview and production stages do
  not accidentally share rotation material.
- Verify stage rollout with one non-production rotation before production auth
  data exists.

### 8. OAuth/MCP Client Registration Is Very Permissive

The OAuth Provider plugin is configured for unauthenticated dynamic client
registration. New clients default to identity scopes plus `ceird:read`, and
Ceird's auth wrapper rejects write/admin scopes, confidential client metadata,
unsafe redirects, unsupported grants/response types, malformed array metadata,
oversized pre-handler request bodies, and consent-skipping attempts before
Better Auth persists a client. Accepted registrations are normalized to public
clients with `token_endpoint_auth_method: "none"`, including authenticated
requests that omit the field.

Better move:

- Threat-model dynamic registration separately from browser auth.
- Keep write/admin scope registration separate from read-only MCP access until
  owner/admin approval or manual client registration exists.
- Validate client metadata and redirect URI patterns with product-specific
  rules where Better Auth allows hooks or wrapper policy.
- Add audit events for client registration, consent grant, refresh-token use,
  revocation, and admin-scope consent.
- Keep the `TSK-69` decision in place: do not replace the current OAuth
  Provider `mcpHandler` integration with the standalone MCP plugin. Evaluate
  Device Authorization separately for CLI/limited-input UX, and revisit Agent
  Auth only when it is stable and tied to a concrete agent-capability pilot.

### 9. Organization Authorization Is Split Across Better Auth And Ceird

Better Auth owns organization membership, invitations, active organization, and
some role checks. Ceird separately resolves `OrganizationActor` and applies
domain authorization. That split is appropriate, but it is easy to extend the
app in a way that bypasses one side.

Specific seams to watch:

- Ceird maps its `external` role to Better Auth's `memberAc` role capability so
  Better Auth endpoints may treat external users as ordinary members unless the
  endpoint is wrapped or a Ceird domain check runs after session resolution.
- Ceird's extra guard around Better Auth organization admin read endpoints only
  covers selected `GET` paths. Other plugin endpoints rely on Better Auth's
  own role checks and Ceird's hooks.
- Domain permissions are coarse: owner/admin, internal, and external. That is
  readable today, but richer workflows will need a named permission matrix.

Better move:

- Keep `auth-organization-permission-matrix.md` current and move the matrix
  into `identity-core` or a domain-owned package if it becomes executable
  policy rather than documentation.
- Document which routes rely on Better Auth role checks and which rely on Ceird
  domain authorization checks.
- Add tests for external-member access whenever a new Better Auth organization
  endpoint is exposed through the app.
- Consider Better Auth dynamic access control only when custom user-defined
  roles become a product requirement.

### 10. Organization Limits Are Now First-Release Guardrails

The organization plugin currently configures invitation expiration, custom
roles, hooks, reinvite behavior, verified-email requirements for organization
creation and invitations, first-release organization/member/pending-invitation
limits, and invitation submission abuse limits.

Current limits:

- 10 organizations per user through Better Auth `organizationLimit`.
- 200 members per organization through Better Auth `membershipLimit`.
- 100 pending invitations per organization through Better Auth
  `invitationLimit`.
- 10 organizations per user on invitation acceptance through a Ceird-owned
  Better Auth `beforeAcceptInvitation` hook.
- 30 organization invitation submissions per actor per hour through a
  Ceird-owned pre-handler reservation.
- 30 organization invitation submissions per recipient email per hour through a
  Ceird-owned pre-handler reservation with HMAC-derived recipient keys.
- 200 organization invitation submissions per organization per day through a
  Ceird-owned pre-handler reservation against the active session organization;
  explicit invite `organizationId` values must match the active organization
  before Better Auth handles the request.

Remaining gap: database-atomic cardinality enforcement for concurrent
organization/member/invitation mutations is tracked in `TSK-115`. Team support
also remains deliberately deferred until crews, branches, regions, or divisions
become a concrete product concept.

Better move:

- Keep Better Auth plugin-level limits and app-facing limit copy in sync.
- Resolve `TSK-115` before treating structural limits as strict under
  concurrent writes.
- Keep Better Auth teams deferred until crews, branches, regions, or divisions
  become a concrete product concept.

### 11. Auth And Organization Security Audit Needs Retention Policy

Ceird now records security-sensitive auth, OAuth/MCP, and organization events in
the shared `auth_security_audit_event` table. The captured event set includes
dynamic client registration decisions, consent grants/denials, refresh-token
grants, revoke endpoint acceptance, organization lifecycle changes,
invitations, role changes, member removals, and the provenance needed for
future security investigation. Owners/admins can review the safe organization
subset through the `/organization/security` activity surface without exposing
raw IP addresses or raw user-agent strings.

Remaining gap: retention, anonymization, and access policy for raw provenance
is deferred to `TSK-120`, and account-level security activity has not been
surfaced in user settings yet.

Better move:

- Keep the audit event taxonomy in `docs/architecture/auth.md` aligned with
  emitted event types.
- Resolve `TSK-120` before treating raw provenance retention as production
  policy.
- Surface the useful account-level subset in account security settings once
  product copy and retention policy are settled.
- Avoid logging secrets, tokens, raw invite URLs, password reset tokens, or
  verification tokens.

### 12. Plugin Adoption Needs Migration Guardrails

Several useful Better Auth plugins add tables or columns: two-factor, passkey,
API key, SCIM, SSO, last-login database storage, admin, and Agent Auth. Ceird's
auth schema is hand-owned in `apps/domain`, so plugin adoption must update the
schema and Drizzle migrations deliberately.

Better move:

- For every Better Auth plugin proposal, record required schema changes before
  implementation begins.
- Generate and inspect Drizzle migrations under `apps/domain/drizzle`.
- Add focused tests around auth schema decoding, app auth context hydration,
  route guards, and Better Auth client methods exposed in the UI.
- Re-check local `opensrc/` package source when docs and TypeScript behavior
  disagree.

## Source Links

- Better Auth introduction: https://better-auth.com/docs/introduction
- Better Auth plugin catalog: https://better-auth.com/docs/plugins
- Better Auth options reference: https://better-auth.com/docs/reference/options
- Better Auth email/password reference:
  https://better-auth.com/docs/authentication/email-password
- Better Auth organization plugin:
  https://better-auth.com/docs/plugins/organization
- Better Auth OAuth Provider plugin:
  https://better-auth.com/docs/plugins/oauth-provider
- Better Auth MCP plugin: https://better-auth.com/docs/plugins/mcp
- Better Auth Agent Auth plugin:
  https://better-auth.com/docs/plugins/agent-auth
- Better Auth two-factor plugin: https://better-auth.com/docs/plugins/2fa
- Better Auth passkey plugin: https://better-auth.com/docs/plugins/passkey
- Better Auth API key plugin: https://better-auth.com/docs/plugins/api-key
- Better Auth captcha plugin: https://better-auth.com/docs/plugins/captcha
- Better Auth Have I Been Pwned plugin:
  https://better-auth.com/docs/plugins/have-i-been-pwned
