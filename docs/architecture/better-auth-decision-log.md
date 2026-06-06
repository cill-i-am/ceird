# Better Auth Decision Log

Last updated: 2026-06-06

This log tracks product, security, and UX decisions for the Linear project
`Better Auth security and UX hardening` (`TSK-41` through `TSK-75`).

Recommendations in this document are not approved decisions. They are the
controller's proposed defaults so the human decision surface is explicit and
future implementation sessions do not guess silently.

## Status Model

- `Pending user approval`: a recommended default exists, but dependent
  implementation must wait for approval or adjustment.
- `Approved`: the user has accepted the decision and implementation may proceed.
- `Deferred`: the user has intentionally moved the decision out of this project.
- `Rejected`: the recommendation was rejected; record the replacement policy.

## Immediate Decision Packet

These are the first decisions needed before meaningful implementation begins on
the baseline auth/security cluster.

| Decision                           | Issues                       | Status                | Recommended default                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified email gates               | `TSK-42`                     | Pending user approval | Require verified email for organization creation, member invitations, OAuth/MCP consent for Ceird scopes, future API key creation, and 2FA/passkey enrollment. Do not block ordinary login or authenticated password change.                                                                |
| Better Auth secret rotation shape  | `TSK-43`                     | Pending user approval | Add structured, ordered versioned secrets through `BETTER_AUTH_SECRETS`, while retaining `BETTER_AUTH_SECRET` as a migration fallback until every stage is rotated.                                                                                                                         |
| External organization role mapping | `TSK-44`, `TSK-70`           | Pending user approval | Keep Ceird `external` mapped to Better Auth member capability for plugin compatibility, but add explicit Ceird guards and regression tests around exposed organization endpoints and domain actions.                                                                                        |
| Security audit event taxonomy      | `TSK-46`, `TSK-67`, `TSK-73` | Pending user approval | Treat password, email, 2FA, passkey, organization invitation, role, member removal, OAuth client registration, OAuth consent, token revocation, and future API key lifecycle events as audit-grade. Keep captcha and rate-limit hits as observability unless they cross an alert threshold. |

## Queued Product And Security Decisions

These decisions should be resolved before their dependent implementation issues
start. They do not all need to block the first baseline docs work.

| Decision                                     | Issues             | Default posture until approved                                                                                                                                           |
| -------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Password length policy                       | `TSK-47`           | Use minimum 12 and maximum 256 only if approved; otherwise keep current behavior while documenting the gap.                                                              |
| HIBP provider outage behavior                | `TSK-48`           | Prefer fail-open with telemetry in local/dev and fail-open with high-severity observability in production until the user chooses availability versus strict security.    |
| Account security controls in first release   | `TSK-49`           | Shape active sessions, revoke other sessions, 2FA, backup codes, and recovery states first; defer passkeys unless separately approved.                                   |
| Session metadata display                     | `TSK-50`           | Show creation time, last-used time if reliable, current-session marker, and parsed device/browser family; avoid precise location claims unless source quality is proven. |
| Current-session revocation behavior          | `TSK-51`           | Revoke other sessions from settings; keep current-session termination on the existing sign-out path unless the user approves self-revocation.                            |
| Self-service account deletion                | `TSK-52`           | Defer implementation until retention, anonymization, owner-transfer, OAuth grant, invitation, job, comment, and audit-event policy is approved.                          |
| Captcha provider and triggers                | `TSK-53`, `TSK-54` | Do not implement captcha until provider, environments, local bypass, and target auth flows are chosen.                                                                   |
| Rate-limit storage failure mode              | `TSK-55`           | Prefer fail-closed for high-risk public endpoints and fail-open with telemetry for lower-risk authenticated endpoints, subject to user approval.                         |
| Auth delivery abuse limits                   | `TSK-56`           | Treat password reset, verification resend, change email, and invitations as separate delivery-abuse surfaces.                                                            |
| Abuse telemetry alert thresholds             | `TSK-57`           | Start with dashboard-only metrics for normal throttling and alerts for provider failure, sustained spikes, and suspicious OAuth registration attempts.                   |
| 2FA enforcement policy                       | `TSK-58`           | Prefer optional 2FA for all users plus strong prompts for owners/admins; require step-up for sensitive actions only after recovery/support policy exists.                |
| Passkey adoption                             | `TSK-63`           | Defer passkeys until after the 2FA rollout unless the user wants phishing-resistant step-up sooner.                                                                      |
| OAuth dynamic client registration            | `TSK-64`, `TSK-65` | Keep unauthenticated registration only for read-only/default scopes; require approval or authenticated owner/admin action for write/admin scopes.                        |
| OAuth consent copy and high-risk treatment   | `TSK-66`           | Group scopes by identity, read, write, admin, and offline access; require verified email or step-up for admin-scope consent if approved.                                 |
| Device Authorization for CLI/MCP             | `TSK-68`           | Evaluate before adoption; do not replace the current browser redirect flow until CLI/MCP user journeys are clear.                                                        |
| Better Auth MCP and Agent Auth plugins       | `TSK-69`           | Keep the current OAuth Provider/MCP integration while evaluating plugin maturity; treat Agent Auth as experimental unless proven stable.                                 |
| Organization and invitation limits           | `TSK-71`, `TSK-72` | Do not enforce product limits until org/member/invite limits and user-facing limit states are approved.                                                                  |
| Organization audit visibility                | `TSK-74`           | Capture audit events first; separately decide which events owners/admins can view in the app.                                                                            |
| Better Auth teams and dynamic access control | `TSK-75`           | Defer unless near-term workflows require sub-organization teams or user-defined roles.                                                                                   |

## UX Shape Checkpoints

These issues require `$impeccable shape` before UI implementation. Human product
review should happen before code changes that lock in the experience.

| Surface                        | Issues                       | Shape must resolve                                                                                                            |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Account security settings      | `TSK-49`, `TSK-50`, `TSK-51` | Information architecture, security summary, active sessions, destructive confirmations, responsive behavior, keyboard access. |
| 2FA enrollment and recovery    | `TSK-59`, `TSK-61`, `TSK-62` | Enrollment, challenge, recovery codes, lost-device copy, backup-code handling, and login continuation.                        |
| OAuth consent                  | `TSK-66`                     | Ceird scope language, organization context, client identity, high-risk warning treatment, deny/approve behavior.              |
| Organization security activity | `TSK-74`                     | Visible event types, permissions, filters, empty states, dense-history behavior, retention language.                          |

## Operational Decisions

- Proposed Alchemy stage for later browser verification:
  `codex-better-auth-hardening`.
- Provider-mutating Alchemy commands remain blocked until the user confirms the
  target stage and credentials.
- Browser verification is required only after user-visible auth/security UI or
  workflows are implemented.

## Next Action

The controller should ask the user to approve or adjust the immediate decision
packet before starting policy-dependent implementation. Work that only improves
documentation clarity, Linear organization, or non-policy audit notes may
continue without changing runtime behavior.
