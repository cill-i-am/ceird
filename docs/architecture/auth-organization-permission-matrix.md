# Auth And Organization Permission Matrix

Last updated: 2026-06-06

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

`external -> memberAc` is a compatibility choice in the current runtime, not a
settled future policy. The decision log keeps the pending policy question
visible because Better Auth plugin endpoints may treat `external` users as
member-like unless a Ceird guard runs before or after the endpoint.

## Current Enforcement Matrix

| Surface                                            | Current enforcement owner                                             | Current source                                                                | Notes                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-up, sign-in, sign-out, session lookup         | Better Auth                                                           | `apps/domain/src/domains/identity/authentication/auth.ts`                     | Ceird mounts Better Auth and serializes `get-session` responses.                                                                                       |
| Password reset                                     | Better Auth plus Ceird email boundary                                 | `auth.ts`, `auth-email.ts`                                                    | Better Auth owns reset token semantics; Ceird owns delivery policy and transport.                                                                      |
| Email verification and email change confirmation   | Better Auth plus Ceird email boundary                                 | `auth.ts`, `auth-email.ts`                                                    | Verification exists, but verified email is not currently a trust boundary.                                                                             |
| Profile update and authenticated password change   | Better Auth client/server contract                                    | `apps/app/src/features/settings/user-settings-page.tsx`                       | App renders forms around Better Auth client APIs.                                                                                                      |
| Organization creation                              | Better Auth organization plugin plus Ceird server function validation | `auth.ts`, `organization-server.ts`, `organization-server-impl.server.ts`     | Better Auth creates the organization. Ceird generates/validates tenant-safe slugs and forwards auth cookies. Verified email is not currently required. |
| Organization active switching                      | Better Auth organization plugin plus app route context                | `organization-server.ts`, `organization-access.ts`                            | Active organization is stored on the Better Auth session.                                                                                              |
| Organization route access                          | Ceird app route guards                                                | `organization-route-access.ts`, `organization-access.ts`                      | Admin-only and internal-only UI routes redirect before rendering.                                                                                      |
| Domain product actions                             | Ceird domain services                                                 | `current-actor.ts`, `authorization.ts`                                        | Domain code resolves the active Better Auth member row and applies owner/admin/internal/external checks.                                               |
| Create sites                                       | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanCreateSite`.                                                                                                 |
| Manage labels                                      | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanManageLabels`.                                                                                               |
| Manage organization configuration                  | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires owner or admin through `ensureCanManageConfiguration`.                                                                                        |
| View organization-wide data                        | Ceird domain authorization                                            | `authorization.ts`                                                            | Requires an internal role; `external` is denied.                                                                                                       |
| Organization member listing and invitation listing | Better Auth endpoint plus Ceird extra read guard                      | `auth.ts`                                                                     | Selected `GET` endpoints are wrapped so only owner/admin can read administrative organization data.                                                    |
| Member removal and role changes                    | Better Auth organization plugin hooks and role mapping                | `auth.ts`                                                                     | Better Auth owns endpoint behavior; Ceird validates role values in hooks. External regression coverage is still needed.                                |
| Invitation creation and resend/cancel behavior     | Better Auth organization plugin plus Ceird email boundary             | `auth.ts`, `auth-email.ts`                                                    | Invitation expiration and reinvite cancellation are configured. Invitation abuse limits remain a pending policy decision.                              |
| Public invitation preview                          | Ceird public preview handler                                          | `auth.ts`                                                                     | Preview returns masked email, organization name, and role for a pending unexpired invitation.                                                          |
| OAuth authorization and consent                    | Better Auth OAuth Provider plus Ceird app consent page                | `auth.ts`, `apps/app/src/features/auth/*`                                     | Dynamic client registration and consent are policy-sensitive and tracked separately.                                                                   |
| MCP bearer-token validation                        | Better Auth OAuth Provider plus Ceird domain authorization            | `apps/domain/src/domains/mcp/http.ts`, `current-actor.ts`, `authorization.ts` | Bearer token resolves Better Auth session and active organization before domain tool authorization.                                                    |

## Current Ceird Domain Checks

The current domain authorization service exposes four checks:

| Check                           | Allowed roles              | Denied roles         |
| ------------------------------- | -------------------------- | -------------------- |
| `ensureCanCreateSite`           | `owner`, `admin`           | `member`, `external` |
| `ensureCanManageLabels`         | `owner`, `admin`           | `member`, `external` |
| `ensureCanManageConfiguration`  | `owner`, `admin`           | `member`, `external` |
| `ensureCanViewOrganizationData` | `owner`, `admin`, `member` | `external`           |

## Known Gaps

- The current matrix is descriptive; it does not approve the future
  `external -> memberAc` policy.
- Selected Better Auth organization `GET` endpoints have an owner/admin guard,
  but external-role regression coverage is still needed for every Better Auth
  organization endpoint the app exposes.
- Verified email is not currently required for organization creation,
  invitations, OAuth/MCP consent, API keys, or other high-trust actions.
- Organization count, member count, and pending invitation limits are not
  currently configured as product policy.
- Audit-grade auth and organization events are not yet persisted through a
  first-class audit stream.

## Decision Dependencies

- `TSK-42`: verified-email gate policy.
- `TSK-44`: future external-role policy and ownership matrix approval.
- `TSK-46`: auth and organization audit event taxonomy.
- `TSK-70`: external-role regression coverage for Better Auth organization
  endpoints.
- `TSK-71`: organization/member/invitation limit policy.
