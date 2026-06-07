# Better Auth Decision Log

Last updated: 2026-06-07

This log tracks product, security, and UX decisions for the Linear project
`Better Auth security and UX hardening` (`TSK-41` through `TSK-75`), plus
follow-up backlog spikes discovered during implementation and verification.

The recommended defaults were approved by the user on 2026-06-06. Decisions
whose approved default was to defer adoption are marked `Deferred` and tracked
as explicit backlog spikes.

## Status Model

- `Pending user approval`: a recommended default exists, but dependent
  implementation must wait for approval or adjustment.
- `Approved`: the user has accepted the decision and implementation may proceed.
- `Deferred`: the user has intentionally moved the decision out of this project.
- `Rejected`: the recommendation was rejected; record the replacement policy.

## Immediate Decision Packet

These are the first decisions needed before meaningful implementation begins on
the baseline auth/security cluster.

| Decision                           | Issues                       | Status   | Recommended default                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified email gates               | `TSK-42`                     | Approved | Require verified email for organization creation, member invitations, OAuth/MCP consent approval, future API key creation, and 2FA/passkey enrollment. Do not block ordinary login, authenticated password change, or OAuth/MCP consent denial.                                             |
| Better Auth secret rotation shape  | `TSK-43`                     | Approved | Add versioned secrets through `BETTER_AUTH_SECRETS` as comma-separated `<version>:<secret>` entries, sort highest version first for Better Auth's current secret, and retain `BETTER_AUTH_SECRET` as a migration fallback until every stage is rotated.                                     |
| External organization role mapping | `TSK-44`, `TSK-70`           | Approved | Keep Ceird `external` mapped to Better Auth member capability for plugin compatibility, but add explicit Ceird guards and regression tests around exposed organization endpoints and domain actions.                                                                                        |
| Security audit event taxonomy      | `TSK-46`, `TSK-67`, `TSK-73` | Approved | Treat password, email, 2FA, passkey, organization invitation, role, member removal, OAuth client registration, OAuth consent, token revocation, and future API key lifecycle events as audit-grade. Keep captcha and rate-limit hits as observability unless they cross an alert threshold. |

## Queued Product And Security Decisions

These decisions should be resolved before their dependent implementation issues
start. They do not all need to block the first baseline docs work.

| Decision                                     | Issues                        | Status   | Approved policy                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password length policy                       | `TSK-47`                      | Approved | Require passwords between 12 and 256 characters.                                                                                                                                                                                                       |
| HIBP provider outage behavior                | `TSK-48`                      | Approved | Reject known-compromised passwords; fail open with high-severity telemetry when the provider is unavailable in production and deterministic fail-open behavior locally.                                                                                |
| Account security controls in first release   | `TSK-49`                      | Approved | Shape active sessions, current-session marker, revoke other sessions, 2FA/backup-code placement, and recovery/security copy first.                                                                                                                     |
| Session metadata display                     | `TSK-50`                      | Approved | Show creation time, meaningful last-used/updated time, current marker, browser/device family, and IP only if useful; do not show precise location.                                                                                                     |
| Current-session revocation behavior          | `TSK-51`                      | Approved | Revoke other sessions from settings; keep current-session termination on the existing sign-out path.                                                                                                                                                   |
| Self-service account deletion                | `TSK-52`                      | Deferred | Defer to a separate account/data lifecycle policy spike covering deletion, retention, anonymization, owner transfer, domain data, audit events, grants, and invites.                                                                                   |
| Captcha provider and triggers                | `TSK-53`, `TSK-54`, `TSK-116` | Approved | Use Cloudflare Turnstile if captcha is adopted. The first rollout protects signup, reset request, and verification resend; repeated failed sign-in attempts are deferred to a dedicated conditional-captcha spike.                                     |
| Captcha provider timeout and telemetry       | `TSK-121`                     | Deferred | Define Turnstile verifier timeout, fail-open/fail-closed behavior, sanitized telemetry, and user-facing retry copy before treating captcha provider availability as a fully Ceird-owned operational signal.                                            |
| Rate-limit storage failure mode              | `TSK-55`                      | Approved | Fail closed for high-risk public endpoint reads; fail open with warning telemetry for authenticated settings endpoint reads; keep write failures non-blocking.                                                                                         |
| Auth delivery abuse limits                   | `TSK-56`                      | Approved | Track reset, verification resend, change-email confirmation, and organization invitation delivery limits by separate flow-specific keys.                                                                                                               |
| Abuse telemetry alert thresholds             | `TSK-57`                      | Approved | Keep normal throttling dashboard-only; alert on sustained spikes, provider failures, suspicious OAuth registration, and email provider/queue failures.                                                                                                 |
| 2FA enforcement policy                       | `TSK-58`                      | Approved | Make 2FA optional for all users, strongly prompt owners/admins, require verified email before enrollment, and defer hard requirements until recovery/support exists.                                                                                   |
| Passkey adoption                             | `TSK-63`                      | Deferred | Defer passkeys until TOTP 2FA and session management ship; revisit first as phishing-resistant step-up, then passwordless sign-in.                                                                                                                     |
| OAuth dynamic client registration            | `TSK-64`, `TSK-65`            | Approved | Keep unauthenticated dynamic registration only for identity/read scopes; require owner/admin approval or manual registration for write/admin scopes. Disable Better Auth's authenticated OAuth client write endpoints until that approval path exists. |
| OAuth DCR default refresh-token grant policy | `TSK-130`                     | Approved | Keep Better Auth's default: omitted public DCR `grant_types` persist as `authorization_code` only. Refresh-token clients must explicitly request both supported grants.                                                                                |
| OAuth consent copy and high-risk treatment   | `TSK-66`                      | Approved | Group scopes as identity/read/write/admin/offline; require verified email for consent approval and treat `ceird:admin` as future step-up.                                                                                                              |
| Auth audit provenance retention              | `TSK-120`                     | Deferred | Define retention, anonymization, and access control for raw source IP and user-agent audit provenance before exposing or retaining it as long-lived product data.                                                                                      |
| Device Authorization for CLI/MCP             | `TSK-68`                      | Deferred | Evaluate Device Authorization, but do not adopt it in the first implementation wave without concrete CLI or limited-input UX.                                                                                                                          |
| Better Auth MCP and Agent Auth plugins       | `TSK-69`                      | Deferred | Keep current OAuth Provider plus Ceird MCP bearer validation; evaluate MCP plugin and defer Agent Auth until stable and tied to a concrete pilot.                                                                                                      |
| Organization and invitation limits           | `TSK-71`, `TSK-72`            | Approved | Use 10 orgs/user, 200 members/org, 100 pending invites/org, 30 invites/actor/hour, and 200 invites/org/day as first-release guardrails.                                                                                                                |
| Organization audit visibility                | `TSK-74`                      | Approved | Capture audit events first; expose useful owner/admin activity later, keeping raw rate-limit/captcha/provider/token-refresh noise internal.                                                                                                            |
| Better Auth teams and dynamic access control | `TSK-75`                      | Deferred | Defer until crews, branches, regions, divisions, or user-defined roles become concrete product concepts.                                                                                                                                               |

## UX Shape Checkpoints

These issues require `$impeccable shape` before UI implementation. Human product
review should happen before code changes that lock in the experience.

| Surface                        | Issues                       | Shape must resolve                                                                                                            |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Account security settings      | `TSK-49`, `TSK-50`, `TSK-51` | Information architecture, security summary, active sessions, destructive confirmations, responsive behavior, keyboard access. |
| 2FA enrollment and recovery    | `TSK-59`, `TSK-61`, `TSK-62` | Enrollment, challenge, recovery codes, lost-device copy, backup-code handling, and login continuation.                        |
| OAuth consent                  | `TSK-66`                     | Ceird scope language, organization context, client identity, high-risk warning treatment, deny/approve behavior.              |
| Organization security activity | `TSK-74`                     | Visible event types, permissions, filters, empty states, dense-history behavior, retention language.                          |

## Decision Packet 4 Confirmation Gate

Decision Packet 4 consolidates the remaining approvals needed before the next
implementation wave. Policy-level defaults above are approved, and Packet 4
implementation-shaping decisions are approved for the next implementation wave.

| Gate                           | Issues                                 | Status   | Recommended default                                                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account security settings      | `TSK-49`, `TSK-50`, `TSK-51`           | Approved | Keep the work inside `/settings` as a new `Security` tab, show but do not revoke the current session, allow revoking other sessions, and hide raw IP/user-agent. Follow-up richer device/location metadata is deferred to `TSK-122`.                                       |
| Two-factor authentication      | `TSK-59`, `TSK-60`, `TSK-61`, `TSK-62` | Approved | Ship optional TOTP plus backup codes, no trusted-device checkbox, no passkey/email/SMS placeholders, inline `/login` challenge, and no post-enrollment code viewing. Use shadcn-compatible `InputOTP` and QR base components.                                              |
| OAuth consent UX               | `TSK-66`                               | Approved | Allow first-wave `ceird:admin` approval after verified email with strong warning copy, scope `ceird:*` consent to the active organization, enrich display from public client metadata, and defer partial/connected-app UX. Follow-up step-up auth is tracked in `TSK-111`. |
| Organization security activity | `TSK-74`                               | Approved | Add a read-only owner/admin `/organization/security` route, keep `organization_active_changed` and raw IP/user-agent internal-only, and avoid row target links.                                                                                                            |
| Runtime/browser verification   | Auth and org user-visible workflows    | Approved | Use Alchemy stage `codex-better-auth-hardening` with the existing `.env.local` credential source; use Turnstile test keys or local verifier override, not a real captcha solve.                                                                                            |

## Operational Decisions

- Proposed Alchemy stage for later browser verification:
  `codex-better-auth-hardening`.
- Provider-mutating Alchemy commands may use stage
  `codex-better-auth-hardening` with the existing `.env.local` credential
  source.
- Browser verification is required only after user-visible auth/security UI or
  workflows are implemented.

## Follow-Up Spikes

- `TSK-122`: evaluate browser/device-family and approximate-location metadata
  for active sessions without exposing raw IP addresses or user-agent strings.

## Next Action

Account security settings, 2FA, OAuth consent, organization security activity,
and stage-backed runtime/browser verification may proceed. Deferred adoption
items must stay in backlog spikes unless the user explicitly pulls one into
implementation scope.
