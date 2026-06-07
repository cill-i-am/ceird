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

Packet 1 implementation checkpoint:

- The user approved the recommended defaults and the decision log now marks
  the baseline decisions as approved.
- Deferred adoption items were moved to backlog spike issues in Linear.
- Implemented `BETTER_AUTH_SECRETS` parsing as `<version>:<secret>` entries,
  sorted highest-version-first while retaining `BETTER_AUTH_SECRET` as the
  fallback secret.
- Implemented verified-email gates for organization creation, member
  invitations, and OAuth/MCP consent approval.
- Added app-facing verified-email copy for create-team, invite, and OAuth
  consent failures so users get an actionable next step instead of a generic
  forbidden error.
- Focused tests pass for the domain auth config/guard suite, app organization
  server boundary, onboarding flow, and members invite flow.

Credential security checkpoint:

- Implemented the explicit 12 to 256 character password length policy in
  Better Auth config and app-side auth/settings validation.
- Implemented Ceird's fail-open password compromise check plugin for
  sign-up, password reset, and authenticated password change, with
  high-severity provider-outage telemetry.
- The password compromise check now skips passwords that already fail the local
  12 to 256 character policy and uses a bounded provider timeout so HIBP
  slowness fails open instead of stalling auth requests.
- Added app copy for compromised-password failures across sign-up, reset, and
  settings password changes.
- Updated current Playwright auth fixtures to use policy-compliant passwords.
- Kept login validation intentionally separate from password creation/mutation:
  existing short passwords can still reach Better Auth sign-in while empty
  login passwords remain client-side required-field errors.
- Added a regression test for password length error normalization so 12-character
  minimum messages do not get collapsed to required-field copy.
- Added mounted auth-handler coverage proving the Better Auth compromise hook
  rejects sign-up `password` and change-password `newPassword` bodies.
- Focused domain and app auth/settings tests pass for the password policy and
  compromise-check changes.

Review-finding fixes:

- The verified-email auth wrapper now resolves production sessions through
  Better Auth's signed-cookie API instead of trusting direct unsigned cookie
  parsing.
- Session resolver failures now fail closed for verified-email gates and
  administrative organization guards, while missing sessions still delegate to
  Better Auth's native unauthenticated handling.
- OAuth consent approval now requires verified email regardless of scope because
  the guard does not rely on client-supplied scope provenance at the Better Auth
  boundary.
- Versioned Better Auth secrets are decoded through Effect config boundaries and
  normalized highest-version-first whether loaded from env or passed
  programmatically.
- Domain Worker env contracts now expose redacted `BETTER_AUTH_SECRETS` and
  the optional password compromise check override.
- Alchemy stage loading validates `BETTER_AUTH_SECRETS` before Worker env
  mutation, and local Alchemy Workers emit
  `AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED=false` so package-local development
  does not unexpectedly call HIBP despite `NODE_ENV=production`.
- Organization invite resend now uses the same targeted verified-email copy as
  first-time invites.
- DB-backed auth integration tests now mark owner fixtures verified before
  organization creation.

Verification completed for this checkpoint:

- `git diff --check`
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm --filter app test -- src/features/auth/auth-schema.test.ts src/features/auth/login-page.test.tsx`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm test`

Remaining Packet 1 follow-ups:

- Run browser verification after confirming the Alchemy stage/credentials for a
  runtime app flow.

Linear updates completed:

- Added implementation and verification notes to `TSK-41` through `TSK-48`.
- Moved `TSK-48` to In Review after the credential-security implementation
  landed.

## 2026-06-07

Abuse-protection checkpoint:

- Implemented the approved `TSK-55` rate-limit storage failure policy.
  Public abuse endpoints now fail closed on pre-handler reservation outages,
  while Better Auth response-accounting reads fail open so a post-handler
  storage outage cannot replace an already-completed auth response.
- Public reservation failures return a stable `AUTH_RATE_LIMIT_UNAVAILABLE`
  response with a short `Retry-After`, rather than leaking a storage exception.
- Kept rate-limit storage write failures non-blocking and sanitized their
  warning telemetry.
- Implemented the approved `TSK-56` delivery-abuse hardening. Password reset,
  verification resend, change-email confirmation, and organization invitation
  now reserve flow-specific delivery keys before Better Auth side effects, with
  email-derived key components stored as HMAC digests rather than raw
  addresses. Review fixes reject unreadable oversized delivery bodies before
  delegation, disable Better Auth's raw internal logger, restrict
  authenticated-only email counters to resolved sessions, and require explicit
  invite organization IDs to match the active organization.
- Implemented the approved `TSK-57` telemetry split. Abuse-related auth logs now
  use stable `authAbuseSignal`, `authAbuseSignalSeverity`, and
  `authAbuseAlertPolicy` annotations for rate-limit hits, reservation failures,
  HIBP provider failures, auth email provider failures, and auth email queue
  failures.
- Documented the dashboard-only versus alert-grade signal policy in
  `docs/architecture/auth.md`. Production alert threshold wiring remains a
  follow-up for the observability tooling layer.

Verification completed for this checkpoint:

- `git diff --check`
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`

Abuse-protection review fixes:

- Removed the Better Auth session token from the browser-visible mounted
  `/api/auth/get-session` serialization used by the typed auth web handler.
- Extended Ceird's atomic pre-handler reservations to authenticated
  `/change-email` and `/change-password` while keeping those settings actions
  fail-open on rate-limit storage outages.
- Fail-closed public abuse endpoints now also fail closed when a client IP
  cannot be resolved, with explicit `rate_limit_client_ip_unavailable`
  telemetry.
- Added stable abuse-signal annotations for rate-limit storage read and write
  failures.
- Scheduled HIBP provider-failure telemetry through the auth background task
  handler so the captured Effect runtime context is preserved.
- Added focused unit coverage for settings endpoint reservations, missing
  client IP behavior, storage write failures, and HIBP provider-failure
  telemetry scheduling.
- Added an integration test for concurrent password-reset reservation bursts;
  the local run skipped it because the auth integration database was not
  available.
- Created backlog review spikes `TSK-113` and `TSK-114` for rate-limit table
  retention and durable auth email delivery de-duplication.
- Configured Better Auth client IP resolution to prefer `CF-Connecting-IP`
  before `X-Forwarded-For`, matching deployed Cloudflare Worker traffic.
- Routed rate-limit storage and abuse-reservation telemetry through the
  captured Effect runtime context so custom logger services, spans, and request
  annotations are preserved.
- Replaced the unproven identity-only OAuth consent exemption with a stricter
  first-release rule: accepted OAuth/MCP consent approval requires verified
  email for all scopes because the auth guard does not trust client-supplied
  scope provenance.
- Added mounted integration coverage for unverified organization creation and
  invitation attempts, asserting blocked persistence and email side effects when
  the auth integration database is available.

Verification completed for review fixes:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.integration.test.ts`
  - skipped locally because the auth integration database was unavailable
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `git diff --check`

Captcha checkpoint:

- Implemented the approved `TSK-54` first rollout with Better Auth's captcha
  plugin and Cloudflare Turnstile.
- Captcha is configurable through `AUTH_CAPTCHA_ENABLED`,
  `AUTH_CAPTCHA_TURNSTILE_SECRET_KEY`, optional
  `AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE`, and app-exposed
  `VITE_AUTH_CAPTCHA_ENABLED` / `VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY`.
- The protected endpoints are `/sign-up/email`,
  `/request-password-reset`, and `/send-verification-email`. Ordinary
  `/sign-in/email` remains captcha-free in this rollout.
- Added shared auth UI for the Turnstile challenge and submit-token header
  handling in sign-up, password reset request, and verification resend flows.
- Created backlog spike `TSK-116` for conditional captcha after repeated failed
  sign-in attempts because Better Auth's captcha plugin protects whole
  endpoints and the approved policy avoids always-on login captcha.
- Review fixes restrict `AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE` to loopback
  local/test verifier stubs at both the domain config and Alchemy stage
  boundaries, reset Turnstile tokens after successful verification resend, and
  let the app retry Turnstile script loading after a failed script request.
- Browser verification remains blocked until Turnstile test keys and the
  Alchemy stage/credentials are confirmed.

Verification completed for the captcha checkpoint:

- `pnpm --filter app test -- src/features/auth/auth-captcha.test.tsx src/features/auth/auth-form-errors.test.ts src/features/auth/signup-page.test.tsx src/features/auth/password-reset-request-page.test.tsx src/features/auth/email-verification-banner.test.tsx`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts src/platform/cloudflare/env.test.ts`
- `pnpm exec vitest run infra/stages.test.ts infra/cloudflare-stack.test.ts`
- `pnpm check-types`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

OAuth/MCP hardening checkpoint:

- Implemented the approved `TSK-65` dynamic client registration constraints.
  Public DCR now defaults and limits clients to identity scopes plus
  `ceird:read`; `ceird:write`, `ceird:admin`, and `client_credentials` are
  rejected before Better Auth persists a client.
- Added Ceird pre-handler validation for DCR redirect and metadata policy:
  HTTPS is required outside local/dev, loopback redirects are local/dev only,
  wildcard and fragment redirects are rejected, unsupported metadata fields are
  rejected, and client metadata has bounded lengths.
- Disabled Better Auth's authenticated OAuth client write endpoints until Ceird
  has an owner/admin approval or manual-registration path for privileged OAuth
  clients.
- Review fixes now reject malformed URL metadata, unsupported grant and response
  metadata, repeated or oversized scope strings, and IPv4-mapped IPv6 loopback
  redirects before Better Auth can persist a dynamic client.
- Added `/oauth2/register` to Ceird's fail-closed atomic public abuse
  reservation path with a 5-per-minute rule.
- Added `oauth_dynamic_client_registration_rejected` telemetry for rejected DCR
  attempts; durable OAuth/MCP audit events remain in `TSK-67`.
- Added focused unit coverage for accepted read-only DCR, rejected write/admin
  scopes, client-credentials and unsupported grants, unsupported response types,
  unsafe redirects, oversized/unknown metadata, telemetry severity/policy, and
  local loopback allowance.
- Added DB-backed integration coverage for rejected DCR persistence boundaries:
  invalid requests must leave `oauth_client` empty while recording the
  `/oauth2/register` abuse reservation row.
- Implemented `TSK-67` durable OAuth/MCP audit capture through the
  `auth_security_audit_event` table and auth HTTP wrapper.
- Audit events now cover dynamic client registration success/rejection, consent
  grant/denial, refresh-token grants, and revoke endpoint acceptance. Consent
  admin/write scopes are metadata on consent events, not separate event types.
- Refresh/revoke audit capture pre-reads stored Better Auth token rows where
  possible to attach user/session/client/scope context without storing raw
  tokens. JWT and unknown-token revoke paths remain endpoint audit evidence with
  `matchedStoredToken: false`.
- Added domain and Alchemy Drizzle migrations/snapshots for the audit table.

Verification completed for the OAuth/MCP checkpoint:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.integration.test.ts`
  - skipped locally because the auth integration database was unavailable
- `pnpm vitest run infra/drizzle.test.ts`
- `pnpm check-types`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

Organization authorization checkpoint:

- Implemented `TSK-70` external-role regression coverage without production
  code changes; the current behavior already matched the approved policy.
- Added Better Auth plugin inspection coverage proving Ceird maps `external` to
  `memberAc` and that the role lacks organization, member, and invitation
  mutation permissions.
- Extended the DB-backed organization endpoint integration scenario to cover
  external active-organization switching, denied active-organization switching
  to an unrelated organization, denied invitation creation/resend/cancel,
  denied organization update, denied role mutation, denied member removal, and
  unchanged organization/member/invitation persistence after those denials.
- Added Ceird domain authorization tests for owner/admin/member/external
  boundaries and app route-guard coverage for external users on admin-only and
  internal-only organization routes.
- Updated the permission matrix and issue map to remove `TSK-70` as an open
  permission ownership gap.

Verification completed for the organization authorization checkpoint:

- `pnpm --filter domain test -- src/domains/organizations/authorization.test.ts`
- `pnpm --filter app test -- src/features/organizations/organization-access.test.ts`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "keeps external Better Auth organization permissions"`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.integration.test.ts -t "guards external access across Better Auth organization endpoints"`
  - skipped locally because the auth integration database was unavailable

Organization limit checkpoint:

- Implemented the approved `TSK-71`/`TSK-72` first-release guardrails.
- Better Auth now enforces normal-path structural limits through the
  organization plugin: 10 organizations per user, 200 members per organization,
  and 100 pending invitations per organization.
- Ceird also checks the 10 organizations-per-user cap before invitation
  acceptance so invited membership cannot bypass the organization-creation
  limit.
- Ceird's auth pre-handler keeps the existing invitation IP reservation and adds
  scoped invitation submission reservations: 30 invitations per actor per hour
  and 200 invitations per active organization per day. The organization-scoped
  key is derived from the trusted active session organization, not the request
  body organization id.
- App organization flows now map Better Auth org-limit, pending-invite-limit,
  membership-limit, and invitation rate-limit responses to specific user-facing
  messages.
- Created `TSK-115` as a backlog spike for strict database-atomic cardinality
  enforcement under concurrent organization/member/invitation mutations.
- Updated the auth architecture guide, Better Auth implementation gaps,
  feature-adoption catalog, permission matrix, and issue map.

Verification completed so far for the organization limit checkpoint:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm --filter app test -- src/features/organizations/organization-auth-errors.test.ts src/features/organizations/accept-invitation-page.test.tsx src/features/organizations/organization-server.test.ts`
- `pnpm check-types`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

Organization audit checkpoint:

- Implemented `TSK-73` organization audit capture in the shared
  `auth_security_audit_event` table.
- Added event types for organization create/update/active switch, invitation
  create/resend/cancel/accept, member role update, and member removal.
- Better Auth organization hooks capture successful plugin-owned lifecycle
  mutations; a Ceird auth wrapper captures endpoint-only events where the hooks
  do not include the acting user or are not invoked by Better Auth.
- Invitation audit metadata stores masked recipient emails only and omits raw
  invitation IDs and invite URLs.
- Added a constraint migration for both domain and Alchemy Drizzle migration
  paths.
- Review fixes:
  - `organization_invitation_resent` is now emitted only when Ceird pre-reads an
    existing pending invitation before the Better Auth handler; a new invite sent
    with `resend: true` is not falsely audited as a resend.
  - Organization hook audit rows inherit request-local session, source IP, and
    user-agent provenance from the auth wrapper.
  - Organization audit context pre-reads fail open with sanitized telemetry
    instead of blocking member mutations.
  - Audit writes use the auth background-task handler when available, while
    write/context failure telemetry sanitizes email, URL, and token-shaped
    values.
  - The auth architecture guide explicitly scopes organization audit rows to
    successful Better Auth mutations; failed-attempt audit taxonomy remains a
    future product/security decision.

Verification completed for the organization audit checkpoint:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm vitest run infra/drizzle.test.ts`
- `pnpm check-types`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

Organization security activity shape checkpoint:

- Drafted the `TSK-74` `$impeccable shape` artifact at
  `docs/superpowers/progress/2026-06-07-organization-security-activity-shape.md`.
- Recommended a restrained, list-first owner/admin security activity ledger that
  extends Ceird's existing `/activity` vocabulary rather than adding a separate
  dashboard.
- Marked four human confirmation gates before implementation:
  - whether `organization_active_changed` stays internal-only
  - whether the UI lives at a new `/organization/security` route or in existing
    `/activity`
  - whether first-release rows link to members/invitations or stay read-only
  - whether source IP/user agent are ever visible to owners/admins
- Added a durable per-stage review discipline to the execution plan covering
  Effect, review-swarm, Vercel React composition, Drizzle/Postgres, TanStack
  Start/Router, and browser verification expectations.

Account security settings shape checkpoint:

- Drafted the `TSK-49` `$impeccable shape` artifact at
  `docs/superpowers/progress/2026-06-07-account-security-settings-shape.md`.
- Recommended a conservative first-release settings shape: keep `/settings`,
  add a `Security` tab, show the current session as non-revocable in-panel
  state, allow revoke-one and revoke-all-other-session actions, keep raw
  IP/user-agent values internal-only, and avoid placeholder controls for future
  2FA/passkeys.
- Updated the issue map so `TSK-49`, `TSK-50`, and `TSK-51` are gated on human
  confirmation before UI implementation.

Two-factor authentication shape checkpoint:

- Inspected the official Better Auth 2FA docs and the locally fetched Better
  Auth 1.6.11 source for plugin endpoints, schema, temporary 2FA cookie
  behavior, TOTP verification, backup-code handling, and trusted-device support.
- Drafted the `TSK-59`/`TSK-62` `$impeccable shape` artifact at
  `docs/superpowers/progress/2026-06-07-two-factor-auth-shape.md`.
- Recommended a first-release 2FA shape: account `Security` tab placement,
  TOTP plus backup codes only, verified-email enrollment gate, no
  trusted-device checkbox, no passkey/email-OTP placeholders, inline `/login`
  challenge continuation, QR setup with manual URI fallback, and no
  post-enrollment backup-code viewing until fresh-session/step-up policy is
  defined.
- Updated the issue map so `TSK-59`, `TSK-60`, `TSK-61`, and `TSK-62` are gated
  on human confirmation before plugin/schema/UI implementation.

OAuth consent shape checkpoint:

- Inspected the official Better Auth OAuth Provider docs, locally fetched OAuth
  Provider source, current `/oauth/consent` UI, auth client setup, and Ceird's
  OAuth policy docs.
- Drafted the `TSK-66` `$impeccable shape` artifact at
  `docs/superpowers/progress/2026-06-07-oauth-consent-shape.md`.
- Recommended first-wave consent defaults: restrained contained consent screen,
  Better Auth public-client metadata as display enrichment, semantic scope
  groups, warning treatment for write/offline access, denial always available,
  no route hotkeys, no partial scope approval, and no connected-app management
  inside the consent screen.
- Marked human confirmation gates for blocking `ceird:admin` until step-up
  policy exists, using Better Auth `postLogin.consentReferenceId` for
  organization-scoped `ceird:*` consent, public client metadata enrichment, and
  deferring partial approval and connected-app consent management.
- Created `TSK-118` for partial OAuth scope approval policy and `TSK-119` for
  connected apps and OAuth consent management.

Backend security review-hardening checkpoint:

- Ran the requested review discipline for the backend/auth slice using
  `effect-review`, `review-swarm`, Drizzle/Postgres review, and Better Auth
  local source/docs checks.
- Hardened shared bounded request-body reads so oversized auth pre-handler
  bodies return promptly even without `content-length`.
- DCR policy now reads `/oauth2/register` through the bounded JSON reader,
  rejects oversized pre-handler request bodies with the stable
  `AUTH_RATE_LIMIT_REQUEST_INVALID` response, rejects malformed array metadata,
  rejects confidential client metadata, and normalizes accepted registrations to
  public clients by forwarding `token_endpoint_auth_method: "none"` to Better
  Auth.
- OAuth consent verified-email gating now reads accepted consent submissions
  through the same bounded JSON reader, so oversized accepted consent bodies
  fail before session resolution.
- Turnstile verifier URL override validation now requires strict loopback or
  `.localhost` hostnames at both the domain config and Alchemy stage config
  boundaries; deceptive hosts such as `127.evil.example` are rejected.
- Added mounted Better Auth captcha coverage for the protected endpoints and
  kept ordinary sign-in outside the always-on captcha set.
- Created `TSK-120` for auth security audit provenance retention and
  anonymization, created `TSK-121` for captcha provider timeout and telemetry
  policy, and updated existing `TSK-115` as the deferred spike for atomic
  organization cardinality enforcement.

Verification completed for the review-hardening checkpoint:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "captcha|Turnstile|OAuth dynamic client registration|OAuth consent"`
- `pnpm exec vitest run infra/stages.test.ts -t "captcha"`

Final review-agent fixes:

- Tightened auth config defaults so missing `NODE_ENV` no longer behaves like
  local development. Deployed-looking HTTPS config now enables the password
  compromise check and rejects OAuth DCR loopback redirects by default; local
  affordances require `CEIRD_LOCAL_DEV=true` or a strict loopback/`.localhost`
  auth base URL.
- Fixed bounded auth body classification so missing `content-length` is treated
  as unknown instead of zero; streamed DCR and OAuth consent bodies without a
  JSON content type now fail before Better Auth delegation.
- Updated the implementation-gaps doc to match the stricter current policy:
  identity-only OAuth consent approval also requires verified email; only
  denial remains allowed while verification is pending.

Verification completed for final review-agent fixes:

- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "NODE_ENV is unset|loopback auth config|streamed OAuth dynamic client registration|streamed accepted OAuth consent"`
- `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
- `pnpm exec vitest run infra/stages.test.ts infra/drizzle.test.ts`
- `pnpm format`
- `pnpm lint`
- `pnpm check-types`
- `pnpm test`
- `git diff --check`

Linear coordination checkpoint:

- Synced the Linear project documents from the local canonical docs: issue map,
  decision log, feature adoption, implementation gaps, and execution plan.
- Updated the execution plan checkboxes so shaped-but-unapproved UI surfaces are
  marked as shaped and still gated, while implemented security slices are marked
  ready for review.
- Added `Needs decision` alongside `Needs design` on the decision-gated
  account security, 2FA, OAuth consent, and organization security activity
  issues in Linear.
- Attached the organization security activity shape document to `TSK-74`.
- Moved `TSK-64` to `In Review` because the approved dynamic registration
  threat model is now reflected by the implemented `TSK-65` policy.

Decision Packet 4 checkpoint:

- Added
  `docs/superpowers/progress/2026-06-07-better-auth-hardening-decision-packet-4.md`
  to consolidate the remaining human gates for account security settings, 2FA,
  OAuth consent, organization security activity, and stage/browser verification.
- This packet is the next approval point before implementing `TSK-50`,
  `TSK-51`, `TSK-60`, `TSK-61`, `TSK-62`, `TSK-66`, or `TSK-74`.

Account security settings implementation checkpoint:

- Implemented the approved `TSK-49` to `TSK-51` account security slice in
  `apps/app/src/features/settings/user-security-sessions-panel.tsx`.
- Added a `/settings` `Security` tab between `Profile` and `Email` without
  changing the existing settings route, command-bar destination, or scoped
  `Mod+Enter` form submit behavior.
- The new panel loads Better Auth active sessions directly through the generated
  auth client, marks the current session as `This device`, hides raw IP
  addresses and raw user-agent strings, and keeps current-session termination on
  the existing sign-out path.
- Other sessions can be revoked one at a time, or all other sessions can be
  revoked through Better Auth's `revokeOtherSessions` client call. Both
  destructive actions use inline confirmation and preserve the current session.
- Focused verification completed:
  - `pnpm --filter app test -- src/features/settings/user-security-sessions-panel.test.tsx src/features/settings/user-settings-page.test.tsx`
  - `pnpm --filter app check-types`

OAuth consent implementation checkpoint:

- Implemented the approved `TSK-66` first-wave OAuth consent slice in
  `apps/app/src/features/auth/oauth-consent-page.tsx` and
  `apps/domain/src/domains/identity/authentication/auth.ts`.
- Better Auth OAuth Provider consent for `ceird:*` scopes is now scoped to the
  active organization through `postLogin.consentReferenceId`; identity-only
  consent remains account-level.
- Missing active-organization state redirects to the app consent route for a
  blocking workspace warning, and server-side consent approval still fails with
  `OAUTH_ACTIVE_ORGANIZATION_REQUIRED` if no active organization exists.
- The consent page now fetches Better Auth public client metadata for
  display-only enrichment, groups scopes by user meaning, warns on admin/write,
  offline, and unknown scopes, keeps `ceird:admin` warning-only, and preserves
  explicit focused-button approve/deny actions without route hotkeys.
- Focused verification completed:
  - `pnpm --filter app test -- src/features/auth/oauth-consent-page.test.tsx`
  - `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts -t "configures JWT-backed Better Auth OAuth Provider for MCP clients"`
  - `pnpm --filter app check-types`
  - `pnpm --filter domain check-types`

Organization security activity implementation checkpoint:

- Implemented the approved `TSK-74` owner/admin read-only security activity
  route at `/organization/security`.
- Added a shared `@ceird/identity-core` identity API contract for
  `GET /organization/security/activity`, including query/response schemas,
  cursor support, and identity-core access/storage/cursor errors.
- Added the domain identity read model over `auth_security_audit_event`,
  scoped to the active organization and owner/admin-visible organization event
  allowlist. `organization_active_changed` remains internal-only.
- The read model returns safe actor, target, role-change, summary, timestamp,
  organization id, and cursor fields. Raw source IP and raw user-agent
  provenance stay out of the shared response schema and UI.
- Added the app page with URL-backed filters for actor, event type, target
  type, date range, and target search. Rows are read-only; no row target links
  or local page hotkeys were added.
- Added admin navigation and command palette support for the page with `G Y`.
- Review-hardening fixes after the Effect/Drizzle/Postgres/TanStack/React pass:
  cursor pagination now preserves database timestamp precision instead of
  round-tripping through JavaScript `Date`, semantically invalid cursors map to
  the typed cursor error, member target display data resolves through an
  active-organization-scoped member join instead of trusting JSON metadata, role
  change badges render only for role-update events, target search no longer
  matches raw target-user metadata, the route preserves workspace sheet search
  while changing filters, and the UI exposes a URL-backed `Next page` action.
- Focused verification completed:
  - `pnpm --filter @ceird/identity-core test -- src/index.test.ts`
  - `pnpm --filter @ceird/identity-core check-types`
  - `pnpm --filter domain test -- src/domains/identity/security-activity.test.ts src/domains/organizations/authorization.test.ts src/domains/http.integration.test.ts`
  - `pnpm --filter domain check-types`
  - `pnpm --filter app test -- src/features/organization-security/organization-security-activity-page.test.tsx src/routes/-_app._org.organization.security.test.tsx src/features/organization-security/organization-security-server.test.ts src/components/app-navigation.test.ts src/hotkeys/active-shortcut-scopes.test.ts src/features/command-bar/app-global-command-actions.test.tsx src/hotkeys/route-hotkeys.test.tsx src/components/app-sidebar.test.tsx src/components/nav-main.test.tsx src/features/auth/app-context-middleware.test.ts src/features/api/app-api-client.test.ts src/test/app-route-code-splitting.test.ts src/features/workspace-sheets/workspace-sheet-navigation.test.tsx`
  - `pnpm --filter app check-types`
  - `pnpm format`
  - `pnpm lint`
  - `git diff --check`

Two-factor plugin/schema implementation checkpoint:

- Implemented the approved `TSK-60` Better Auth two-factor backend slice.
- Added the Better Auth `twoFactor` server plugin with issuer `Ceird`, explicit
  six-digit/30-second TOTP settings, encrypted backup-code storage, and no
  email/SMS OTP delivery.
- Added the app `twoFactorClient()` plugin through the shared auth-client plugin
  factory so `TSK-61` and `TSK-62` can use typed Better Auth 2FA methods.
- Added `user.twoFactorEnabled` and the `two_factor` table with encrypted
  secret, encrypted backup codes, `verified` state, cascading user ownership,
  and generated Drizzle migrations under both `apps/domain/drizzle` and
  `apps/domain/drizzle-alchemy`.
- Added platform and infra schema exports for the new table, and verified the
  latest Alchemy Drizzle snapshot has no pending generated diff.
- Enforced verified email before `/two-factor/enable` at the auth boundary.
- Blocked direct `trustDevice: true` requests on first-release two-factor
  verification endpoints while `TSK-110` remains deferred.
- Review note: the attempted multi-agent review swarm inspected the root
  checkout instead of `.worktrees/better-auth-hardening`, so its findings were
  discarded as stale. Local review found and fixed the trusted-device bypass
  risk.
- Focused verification completed:
  - `pnpm --filter domain test -- src/domains/identity/authentication/authentication.test.ts`
  - `pnpm --filter app test -- src/features/auth/auth-schema.test.ts`
  - `pnpm test:infra -- drizzle.test.ts`
  - `pnpm --filter domain check-types`
  - `pnpm --filter app check-types`
  - `pnpm format`
  - `pnpm lint`
  - `git diff --check`

Final non-browser verification checkpoint:

- Incorporated the final review-agent fixes for the Better Auth hardening
  branch: OAuth access tokens now carry a fixed `ceird_org_id` claim for
  Ceird-scoped MCP access, MCP actor resolution prefers that token-bound
  organization over mutable live session state, OAuth refresh audit provenance
  uses the token row `referenceId`, auth security audit writes no longer race a
  request-scoped database through background scheduling, two-factor verification
  endpoints use fail-closed atomic abuse reservations, trusted-device request
  parsing fails closed on unreadable or oversized bodies, OAuth consent SSR
  receives the raw signed query string, and password reset compromised-password
  failures no longer render as expired-token failures.
- Re-ran the previously failing auth telemetry redaction regression directly:
  `cd apps/domain && ../../node_modules/.bin/vitest run
src/domains/identity/authentication/authentication.test.ts -t "redacts raw
rate-limit keys"` passed.
- Full non-browser verification passed:
  - `pnpm test`
  - `pnpm format`
  - `pnpm lint`
  - `pnpm check-types`
  - `PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/ultracite check .`
  - `./node_modules/.bin/knip --no-config-hints`
- `pnpm test` totals for this pass:
  - `apps/app`: 125 files passed, 845 tests passed.
  - `apps/domain`: 33 files passed, 367 tests passed, 23 DB-backed integration
    tests skipped because the local integration database was unavailable.
  - `test:infra`: 7 files passed, 73 tests passed.
  - `test:scripts`: 65 tests passed.
- Local Browser/server verification was intentionally deferred by operator
  direction for this pass; the stage/browser runbook remains the source of truth
  for the eventual runtime matrix.

Documentation sync checkpoint:

- Audited the project docs after the non-browser verification pass and fixed
  stale handoff language that still described two-factor UX, account session
  management, and auth security audit events as pending.
- Updated the local feature-adoption catalog, implementation-gaps audit, and
  issue map so they match the implemented first-release account security,
  two-factor, OAuth/MCP, and organization security activity work.
- Synced the updated Linear project documents:
  - https://linear.app/tskr/document/better-auth-issue-map-732d59f487cf
  - https://linear.app/tskr/document/better-auth-feature-adoption-6a30bb094b3c
  - https://linear.app/tskr/document/better-auth-implementation-gaps-492cea767e0f

Linear state audit checkpoint:

- Audited the Linear project issue statuses after the documentation sync.
- No issues in `Better Auth security and UX hardening` are left in `Todo` or
  `In Progress`.
- Implemented policy, shape, backend, and UI issues are in `In Review`.
- Deferred spikes and follow-up decisions remain in `Backlog`.
- Linear project status updates are still disabled for this workspace, so the
  central coordination comment remains the project-level status carrier.
- Re-audited the issue map against Linear status after the issue-map document
  sync. Normalized `TSK-58`, `TSK-59`, and `TSK-64` to `Ready for review`
  because their approved policy/shape decisions now have corresponding
  implementation slices in review.
- Re-audited Linear backlog metadata after the local Browser waiver. Confirmed
  the Better Auth project has no issues in `Todo`, `In Progress`, or `Done`;
  normalized missing deferred/spike/decision labels for `TSK-113` through
  `TSK-119`; attached `TSK-118`, `TSK-119`, and `TSK-130` to the OAuth/MCP
  milestone; and left `TSK-122` as a standalone backlog issue outside the
  project per user direction.

Completion-audit checkpoint:

- Added
  `docs/superpowers/progress/2026-06-07-better-auth-hardening-completion-audit.md`
  to make the active goal status explicit: approved non-browser implementation,
  docs, migrations, decisions, Linear state, and verification evidence are
  ready for review, but final runtime/browser parity remains open.
- Published the audit as a Linear project document:
  https://linear.app/tskr/document/better-auth-completion-audit-9c835bec685f

No-socket verification hardening checkpoint:

- Re-ran the non-browser drift audit after local browser/server verification was
  deferred by operator direction.
- Found one domain auth config test that was still coupled to live loopback
  socket binding: the deterministic HIBP range override test started a local
  `127.0.0.1` HTTP server before asserting config/fetch behavior. In this
  continuation shell, loopback binds fail with `listen EPERM`, so the test
  failed before exercising the intended assertion.
- Refactored that test to spy on `globalThis.fetch` instead of starting a
  throwaway server. It now verifies the loopback override is accepted, the
  prefix is appended as `/range/ABCDE`, `Add-Padding: true` and
  `User-Agent: Ceird Password Checker` are sent, and the response body is
  returned without requiring socket access.
- Found a second live-socket dependency in the DB-backed Turnstile captcha
  integration helper. The helper previously started a local `127.0.0.1`
  verifier server before Better Auth posted to the configured site-verify
  override. It now uses a `globalThis.fetch` spy with the same success/failure
  semantics, and a no-DB helper regression proves accepted and rejected
  Turnstile responses without binding a local port.
- Added a mounted Better Auth captcha denial regression so the no-socket unit
  suite proves the real captcha plugin path calls the configured Turnstile
  verifier through `globalThis.fetch`, sends the expected JSON body including
  remote IP, and returns `VERIFICATION_FAILED` before any database work when
  the verifier rejects the token.
- Follow-up read-only review found no material issues in the no-socket HIBP
  range override, Turnstile verifier helper, mounted captcha denial regression,
  or browser/runtime handoff docs. Intent/regression and security/privacy
  sub-agents reported no findings; the controller reliability/contracts pass
  also found no fixable gaps.
- Refreshed verification passed:
  - `./node_modules/.bin/vitest run infra/drizzle.test.ts infra/stages.test.ts infra/cloudflare-stack.test.ts`
  - `cd apps/app && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
  - `cd apps/domain && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
  - `./node_modules/.bin/tsc --noEmit -p tsconfig.infra.json`
  - `cd packages/identity-core && ../../node_modules/.bin/tsc --noEmit -p tsconfig.json`
  - `cd apps/app && ../../node_modules/.bin/vitest run src/features/auth/auth-schema.test.ts src/features/auth/auth-captcha.test.tsx src/features/auth/auth-form-errors.test.ts src/features/auth/signup-page.test.tsx src/features/auth/password-reset-request-page.test.tsx src/features/auth/password-reset-page.test.tsx src/features/auth/email-verification-banner.test.tsx src/features/auth/login-page.test.tsx src/features/auth/oauth-consent-page.test.tsx src/features/settings/user-security-sessions-panel.test.tsx src/features/settings/user-settings-page.test.tsx src/features/organization-security/organization-security-activity-page.test.tsx src/routes/-_app._org.organization.security.test.tsx src/features/organization-security/organization-security-server.test.ts src/routes/_app.settings.test.tsx`
  - `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts -t "captcha|Turnstile"` passed with 11 tests.
  - `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.test.ts src/domains/identity/security-activity.test.ts src/domains/organizations/authorization.test.ts src/platform/cloudflare/env.test.ts`
  - `cd apps/domain && ../../node_modules/.bin/vitest run src/domains/identity/authentication/authentication.integration.test.ts -t "Turnstile|captcha"` passed with the no-socket verifier helper regression and skipped the DB-backed captcha integration because the integration database remains unavailable.
  - `cd packages/identity-core && ../../node_modules/.bin/vitest run --globals src/index.test.ts`
  - `./node_modules/.bin/oxfmt --check docs/superpowers/progress/2026-06-06-better-auth-hardening.md docs/superpowers/progress/2026-06-06-better-auth-hardening-issue-map.md docs/superpowers/progress/2026-06-07-better-auth-hardening-completion-audit.md docs/superpowers/progress/2026-06-07-better-auth-hardening-stage-verification-runbook.md apps/domain/src/domains/identity/authentication/authentication.test.ts apps/domain/src/domains/identity/authentication/authentication.integration.test.ts`
  - `git diff --check`

Runtime handoff runbook hardening checkpoint:

- Audited the existing app Playwright suite before the final browser parity pass.
  The suite covers core auth, reset, verification, invitation continuation,
  member access, and organization settings, but it is not sufficient proof for
  the full Better Auth hardening matrix by itself.
- Updated the stage verification runbook with explicit package-local and stage
  Playwright smoke commands, a warning that manual Browser coverage remains
  required for the newer account security, 2FA, OAuth consent, captcha provider,
  and organization security activity surfaces, and a reusable evidence template
  for the final issue-map/Linear update.
