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
  verification, password reset, change-email support, and OAuth/MCP config.
- `apps/domain/src/domains/identity/authentication/auth.ts` creates the Better
  Auth instance with Drizzle persistence, JWT, OAuth Provider, organization
  plugin, auth email delivery hooks, organization hooks, dynamic OAuth client
  registration, and the extra organization admin read guard.
- `apps/domain/src/domains/identity/authentication/schema.ts` defines the
  persisted Better Auth tables currently in use: users, accounts, sessions,
  verification records, rate limits, organizations, members, invitations, JWKS,
  OAuth clients, OAuth tokens, and OAuth consent.
- `apps/domain/src/domains/organizations/current-actor.ts` resolves the current
  domain actor from the Better Auth session row, active organization id, and
  membership row.
- `apps/domain/src/domains/organizations/authorization.ts` applies Ceird domain
  permissions for owner/admin/member/external roles.
- `apps/domain/src/domains/mcp/http.ts` validates MCP bearer traffic through the
  Better Auth OAuth Provider integration.
- `apps/app/src/lib/auth-client.ts` creates the Better Auth React client with
  the organization client and OAuth Provider client plugins.
- `apps/app/src/features/auth/*` owns login, signup, password reset, email
  verification, OAuth consent, auth route guards, server auth context, and
  sign-out UX.
- `apps/app/src/features/settings/user-settings-page.tsx` uses Better Auth for
  profile updates, email change confirmation, and password changes.
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

### 2. Password Policy Is Mostly Implicit

The app validates passwords at the UI layer with a minimum length of 8
characters, and the Better Auth config enables email/password with session
revocation on password reset. It does not set explicit Better Auth
`minPasswordLength` or `maxPasswordLength`, and it does not check passwords
against known breach corpuses.

Better move:

- Set the server-side Better Auth password length policy explicitly.
- Consider raising the minimum to 12 or longer for new accounts.
- Add the Better Auth Have I Been Pwned plugin for sign-up and password changes.
- Keep the app UI copy and schemas generated from, or at least aligned with,
  the server policy.

### 3. Public Auth Abuse Controls Stop At Rate Limits

Ceird has database-backed Better Auth rate limits for sign-in, sign-up,
verification resend, change email, and change password. That helps, but public
credential and delivery endpoints still rely on rate limits alone.

Better move:

- Add captcha only to abuse-prone flows where the UX cost is justified:
  sign-up, password-reset request, verification resend, and possibly repeated
  failed sign-in attempts.
- Keep captcha conditional by environment and risk signal, not always-on for
  every login.
- Decide whether rate-limit storage failures should fail open or fail closed,
  and document that policy in the auth architecture guide.

### 4. Email Verification Is Not A Trust Boundary

The current architecture intentionally sends verification on sign-up but does
not require verification before session creation. That keeps onboarding smooth,
but it also allows unverified users to create organizations, invite members, and
enter OAuth consent flows unless a route or server function adds its own guard.

Better move:

- Decide which actions require verified email. Good first candidates are
  organization creation, inviting members, OAuth/MCP consent, API key creation,
  and changing security-sensitive account settings.
- Either use Better Auth's `requireEmailVerification` behavior for credential
  sessions or keep login permissive and add explicit step-up guards around the
  high-trust actions.
- Make the unverified state actionable in settings and privileged flows, not
  only through the existing banner.

### 5. No MFA, Passkey, Or Step-Up Auth For Privileged Actions

Owners/admins, OAuth consent approvers, and future API/agent operators still
authenticate with password-only accounts. The login form does not handle Better
Auth two-factor redirects, and the auth schema does not include two-factor or
passkey tables.

Better move:

- Add two-factor authentication for owner/admin accounts first.
- Use TOTP plus backup codes before adding email/SMS OTP as a second factor.
- Add passkeys as either a primary sign-in method or a step-up method for
  sensitive actions.
- Gate dangerous owner/admin actions behind recent 2FA/passkey verification
  before enforcing it globally.

### 6. Account Session Management Is Incomplete

Password reset revokes other sessions, and password change asks Better Auth to
revoke other sessions. Users do not currently have a settings surface to view
active sessions, revoke specific sessions, revoke all other sessions on demand,
or understand which devices are signed in.

Better move:

- Add a security settings panel for active sessions and session revocation.
- Include current device, creation time, last-used time if available, and
  coarse location/user-agent only if the data is trustworthy enough.
- Pair session management with sign-out behavior and Better Auth cookie prefix
  handling so stage-specific sessions remain understandable.

### 7. No Secret Rotation Path Is Documented

Ceird requires `BETTER_AUTH_SECRET` and validates its length, but the current
config does not expose Better Auth's versioned `secrets` rotation option.
Rotating the single secret could invalidate or break encrypted/signed Better
Auth state depending on what data exists at the time of rotation.

Better move:

- Add configuration support for Better Auth versioned secrets before production
  auth data becomes difficult to migrate.
- Document a rotation runbook in the auth architecture guide.
- Keep Alchemy/stage secret naming explicit so preview and production stages do
  not accidentally share rotation material.

### 8. OAuth/MCP Client Registration Is Very Permissive

The OAuth Provider plugin is configured for unauthenticated dynamic client
registration. New clients default to identity scopes plus `ceird:read`, while
the registration policy allows the full Ceird MCP scope set. This is convenient
for MCP clients, but it makes registration policy, redirect validation, consent
copy, and auditability part of the security boundary.

Better move:

- Threat-model dynamic registration separately from browser auth.
- Constrain write/admin scope registration more tightly than read-only MCP
  access.
- Validate client metadata and redirect URI patterns with product-specific
  rules where Better Auth allows hooks or wrapper policy.
- Add audit events for client registration, consent grant, refresh-token use,
  revocation, and admin-scope consent.
- Consider Better Auth's MCP, Device Authorization, or Agent Auth plugins if
  they can replace custom policy with narrower capability grants.

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

### 10. Organization Limits Are Product Policy, Not Configured Policy

The organization plugin currently configures invitation expiration, custom
roles, hooks, and reinvite behavior. It does not encode organization count
limits, membership limits, invitation limits, team support, or verified-email
requirements for organization creation/invitation.

Better move:

- Decide whether a user can create unlimited organizations.
- Decide whether organizations have initial member or pending-invitation caps.
- Add plugin-level limits or Ceird server guards before these become billing or
  abuse concerns.
- Keep Better Auth teams deferred until crews, branches, regions, or divisions
  become a concrete product concept.

### 11. Auth And Organization Security Events Are Not A First-Class Audit Log

Ceird has observability around auth email delivery and rate-limit storage, but
the app does not appear to expose a coherent audit trail for security-sensitive
Better Auth events such as password changes, email changes, 2FA enrollment,
OAuth client registration, consent grants, organization invitations, role
changes, and member removal.

Better move:

- Define a domain event/audit boundary for auth and organization security
  events.
- Log events with organization id, actor id, target id, source, and stage.
- Surface the useful subset in organization activity and account security
  settings.
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
