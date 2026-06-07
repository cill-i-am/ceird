# Auth And Organization Permission Matrix

Last updated: 2026-06-07

This document maps the current authorization split between Better Auth, the
Ceird app, and Ceird domain services. It describes the implementation as it
exists today. Product/security decisions that would change this matrix are
tracked in [`better-auth-decision-log.md`](better-auth-decision-log.md).

## Ownership Model

Better Auth owns identity, sessions, organization membership, invitations,
active organization state, OAuth Provider flows, and the native `/api/auth/*`
endpoint contract.

Ceird owns product authorization for domain actions after a Better Auth session
and active organization have been resolved. That boundary is implemented through:

- `apps/domain/src/domains/organizations/current-actor.ts`, which resolves the
  active organization actor from the Better Auth session and `member` row.
- `apps/domain/src/domains/organizations/authorization.ts`, which applies
  product-level owner/admin/internal/external checks.
- `apps/app/src/features/organizations/organization-route-access.ts`, which
  protects organization app routes before rendering.

## Role Vocabulary

The shared role contract lives in `packages/identity-core/src/index.ts`.

| Role       | Current class            | Current meaning                                                    |
| ---------- | ------------------------ | ------------------------------------------------------------------ |
| `owner`    | Administrative, internal | Full organization administration and product configuration access. |
| `admin`    | Administrative, internal | Organization administration and product configuration access.      |
| `member`   | Internal                 | Internal product access without administrative powers.             |
| `external` | External                 | Collaborator access with restricted product visibility.            |

Current Better Auth organization role mapping lives in
`apps/domain/src/domains/identity/authentication/auth.ts`:

| Ceird role | Better Auth access-control mapping |
| ---------- | ---------------------------------- |
| `owner`    | `ownerAc`                          |
| `admin`    | `adminAc`                          |
| `member`   | `memberAc`                         |
| `external` | `memberAc`                         |

`external -> memberAc` is the approved current policy for Better Auth plugin
compatibility. Ceird product authorization remains stricter: domain services and
route guards treat `external` as a restricted collaborator role. Regression
coverage now asserts that Better Auth's `external` mapping stays equivalent to
`memberAc` and does not gain organization, member, or invitation mutation
permissions.

## Current Enforcement Matrix

| Surface                                            | Current enforcement owner                                             | Current source                                                                | Notes                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-up, sign-in, sign-out, session lookup         | Better Auth                                                           | `apps/domain/src/domains/identity/authentication/auth.ts`                     | Ceird mounts Better Auth and serializes `get-session` responses.                                                                                           |
| Password reset                                     | Better Auth plus Ceird email boundary                                 | `auth.ts`, `auth-email.ts`                                                    | Better Auth owns reset token semantics; Ceird owns delivery policy and transport.                                                                          |
| Email verification and email change confirmation   | Better Auth plus Ceird email boundary                                 | `auth.ts`, `auth-email.ts`                                                    | Verified email is a trust boundary for organization creation, invitations/resends, and Ceird-scope OAuth consent approvals.                                |
| Profile update and authenticated password change   | Better Auth client/server contract                                    | `apps/app/src/features/settings/user-settings-page.tsx`                       | App renders forms around Better Auth client APIs.                                                                                                          |
| Organization creation                              | Better Auth organization plugin plus Ceird server function validation | `auth.ts`, `organization-server.ts`, `organization-server-impl.server.ts`     | Better Auth creates the organization. Ceird generates/validates tenant-safe slugs and forwards auth cookies. Verified email is required before creation.   |
| Organization active switching                      | Better Auth organization plugin plus app route context                | `organization-server.ts`, `organization-access.ts`                            | Active organization is stored on the Better Auth session. Any authenticated member, including `external`, may switch only to organizations they belong to. |
| Organization route access                          | Ceird app route guards                                                | `organization-route-access.ts`, `organization-access.ts`                      | Admin-only and internal-only UI routes redirect before rendering; external users are redirected to jobs for internal-only app routes.                      |
| Domain product actions                             | Ceird domain services                                                 | `current-actor.ts`, `authorization.ts`                                        | Domain code resolves the active Better Auth member row and applies owner/admin/internal/external checks.                                                   |
| Create sites                                       | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanCreateSite`.                                                                                                     |
| Manage labels                                      | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanManageLabels`.                                                                                                   |
| Manage organization configuration                  | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanManageConfiguration`.                                                                                            |
| View organization-wide data                        | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires an internal role; `external` is denied.                                                                                                           |
| Organization member listing and invitation listing | Better Auth endpoint plus Ceird extra read guard                      | `auth.ts`                                                                     | Selected `GET` endpoints are wrapped so only owner/admin can read administrative organization data.                                                        |
| Member removal and role changes                    | Better Auth organization plugin hooks and role mapping                | `auth.ts`                                                                     | Better Auth owns endpoint behavior; Ceird validates role values in hooks. Regression coverage asserts `external` cannot mutate roles or remove members.    |
| Invitation creation and resend/cancel behavior     | Better Auth organization plugin plus Ceird email boundary             | `auth.ts`, `auth-email.ts`                                                    | Invitation creation and resend require verified email and Better Auth invitation permission; regression coverage asserts `external` cannot invite.         |
| Public invitation preview                          | Ceird public preview handler                                          | `auth.ts`                                                                     | Preview returns masked email, organization name, and role for a pending unexpired invitation.                                                              |
| OAuth authorization and consent                    | Better Auth OAuth Provider plus Ceird app consent page                | `auth.ts`, `apps/app/src/features/auth/*`                                     | Approving any OAuth/MCP consent requires verified email; denial remains available so users can reject access without first verifying email.                |
| MCP bearer-token validation                        | Better Auth OAuth Provider plus Ceird domain authorization            | `apps/domain/src/domains/mcp/http.ts`, `current-actor.ts`, `authorization.ts` | Bearer token resolves Better Auth session and active organization before domain tool authorization.                                                        |

## Current Ceird Domain Checks

The current domain authorization service exposes four checks:

| Check                           | Allowed roles              | Denied roles         |
| ------------------------------- | -------------------------- | -------------------- |
| `ensureCanCreateSite`           | `owner`, `admin`           | `member`, `external` |
| `ensureCanManageLabels`         | `owner`, `admin`           | `member`, `external` |
| `ensureCanManageConfiguration`  | `owner`, `admin`           | `member`, `external` |
| `ensureCanViewOrganizationData` | `owner`, `admin`, `member` | `external`           |

## Known Gaps

- Verified email is required for organization creation, invitations, OAuth/MCP
  consent approval, and 2FA enrollment. API keys, passkey enrollment, and other
  future high-trust actions must add the same gate when implemented.
- OAuth/MCP and organization audit-grade events are persisted through
  `auth_security_audit_event`; owner/admin activity UI remains planned in
  `TSK-74`.

## Limit Policy

- Better Auth enforces normal-path limits for 10 organizations per user, 200
  members per organization, and 100 pending invitations per organization.
- Ceird enforces the 10 organizations-per-user cap before invitation
  acceptance, closing the creation-only Better Auth limit gap for normal
  request flow.
- Ceird's auth pre-handler adds invitation submission reservations for 30
  invites per actor per hour and 200 invites per organization per day before
  Better Auth performs invitation side effects.
- The app maps Better Auth organization, member, pending-invitation, and
  invitation rate-limit failures to specific onboarding/member-management copy.
- `TSK-115` tracks strict database-atomic enforcement for concurrent
  cardinality races.

## Decision Dependencies

- `TSK-42`: verified-email gate implementation and regression coverage.
- `TSK-44`: approved external-role policy and permission ownership matrix.
- `TSK-46`: auth and organization audit event taxonomy.
- `TSK-70`: external-role regression coverage for Better Auth organization
  endpoints.
- `TSK-71`: organization/member/invitation limit policy.
- `TSK-72`: organization/member/invitation limit implementation.
