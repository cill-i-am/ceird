# OAuth Consent Shape

Date: 2026-06-07  
Issue: `TSK-66`  
Status: Implemented on the integration branch after user approval on 2026-06-07

This shape covers the first-wave `/oauth/consent` improvements for Better
Auth OAuth Provider requests. The implementation lives in:

- `apps/app/src/features/auth/oauth-consent-page.tsx`
- `apps/domain/src/domains/identity/authentication/auth.ts`
- `apps/app/src/features/auth/oauth-consent-page.test.tsx`
- `apps/domain/src/domains/identity/authentication/authentication.test.ts`

## Sources

- `TSK-66` Linear issue
- `docs/architecture/better-auth-decision-log.md`
- `docs/architecture/auth.md`
- `apps/app/src/features/auth/oauth-consent-page.tsx`
- `apps/app/src/lib/auth-client.ts`
- Better Auth docs: <https://better-auth.com/docs/plugins/oauth-provider>
- Local Better Auth source:
  - `opensrc/repos/github.com/better-auth/better-auth/packages/oauth-provider/src/client.ts`
  - `opensrc/repos/github.com/better-auth/better-auth/packages/oauth-provider/src/consent.ts`
  - `opensrc/repos/github.com/better-auth/better-auth/packages/oauth-provider/src/oauthClient/endpoints.ts`
  - `opensrc/repos/github.com/better-auth/better-auth/packages/oauth-provider/src/types/index.ts`

## Current Behavior

Ceird already owns the app consent screen at `/oauth/consent`.

- The route displays `client_id`, redirect host, and requested scopes from the
  signed Better Auth query prefix.
- `authClient.oauth2.consent` approves or denies the request and lets Better
  Auth verify the signed query server-side.
- The app maps common Better Auth consent errors to safe user-facing copy.
- Denial remains available without verified email; approval is blocked by the
  domain auth wrapper when email is unverified.
- The UI intentionally avoids route hotkeys because approving access is a
  security-sensitive action.

Implemented first-wave behavior:

- Better Auth public client metadata enriches display when available, while the
  signed query remains the trust boundary.
- Scopes are grouped semantically into admin, write, read, offline, identity,
  and unknown access rows.
- `ceird:admin`, write, offline, and unknown scopes use warning treatment, but
  `ceird:admin` remains approvable after verified-email policy is satisfied.
- `ceird:*` consent rows are scoped to the active organization through Better
  Auth OAuth Provider `postLogin.consentReferenceId`.
- Approval is blocked when a `ceird:*` request has no active organization;
  denial remains available.

## Product Context

This is a high-trust interruption in an OAuth/MCP authorization flow. The user
may be returning from an agent, CLI, or integration and needs to answer one
question: should this client get this level of access to Ceird?

The surface should feel like a compact product decision screen, not a marketing
page and not a protocol dump. It should preserve Ceird's restrained product UI:
cool neutral surfaces, precise hierarchy, explicit risk language, no decorative
animation, no modal, no route shortcuts.

Visual direction:

- Color strategy: Restrained, with semantic warning/destructive treatment only
  for write/admin risk.
- Scene sentence: a site manager or office admin is approving an agent from a
  laptop or phone while trying to avoid granting broader access than intended.
- Anchors: Linear authorization dialogs, GitHub OAuth app consent, Stripe
  connected account permission review.

Visual direction probes are skipped because this is an existing security screen
with a defined product register and no ambiguous visual lane.

## Recommended Defaults

1. Keep the route as a contained `EntryShell` screen, not an app-shell page and
   not a modal.
2. Keep deny and approve as explicit focused button actions only. Do not add
   hotkeys, `Escape` denial, or automatic default submit.
3. Fetch Better Auth public client metadata with
   `authClient.oauth2.publicClient({ query: { client_id } })` when the user is
   signed in. Treat it as display enrichment, not as the trust boundary.
4. Display `client_name` as the primary client label when available. Fall back
   to `client_id`.
5. Display redirect host from the signed authorization query. Display
   `client_uri`, `policy_uri`, and `tos_uri` only when returned by the public
   client endpoint and URL parsing succeeds.
6. Group scopes by user meaning, not protocol order.
7. Allow identity/read/write/offline approval after verified-email policy is
   satisfied.
8. Treat `ceird:admin` as warning-only in the first wave after verified email.
   Future step-up auth for admin consent is tracked separately in `TSK-111`.
9. Do not implement partial scope approval in `TSK-66`. Better Auth supports
   submitting a narrower `scope`, but the client contract needs its own spike:
   `TSK-118`.
10. Do not implement connected-app consent management in `TSK-66`. Track that
    separately in `TSK-119`.

## Scope Grouping

| Group                  | Scopes                            | Risk    | First-wave treatment                                                                                                           |
| ---------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity               | `openid`, `profile`, `email`      | Low     | Quiet group. Explain that the client can confirm who the user is and read basic account details.                               |
| Ceird read             | `ceird:read`                      | Medium  | Normal group. Explain that the client can view Ceird workspace data such as jobs, sites, labels, and options.                  |
| Ceird write            | `ceird:write`                     | High    | Warning group. Explain that the client can create or change operational data, including job comments and job-label assignment. |
| Ceird administration   | `ceird:admin`                     | Highest | Warning group. Explain that the client can administer workspace access/settings and that step-up auth will be added later.     |
| Ongoing access         | `offline_access`, `refresh_token` | High    | Warning group. Explain that the client can keep access after the browser session until access is revoked.                      |
| Unknown or unsupported | Any unrecognized scope            | High    | Warning group. Show raw scope, use cautious copy, and allow approval only if Better Auth has already accepted the request.     |

Recommended display order:

1. Highest-risk Ceird scopes first: admin, write, read.
2. Offline access next because it affects duration.
3. Identity scopes last because they are lower risk.
4. Unknown scopes stay visible in their own group and are never silently folded
   into another category.

## Organization Context

This is the important product/security decision in the shape.

Recommended default:

- For identity-only requests, consent is account-level and does not need an
  organization label.
- For any `ceird:*` request, consent should be tied to the active organization
  using Better Auth OAuth Provider `postLogin.consentReferenceId`.
- If the request includes `ceird:*` scopes and the session has no active
  organization, approval should be blocked with copy that tells the user to
  choose a workspace and start the authorization again.
- The consent screen should only show organization name/slug when the stored
  Better Auth consent reference will also be organization-scoped.

Why:

Ceird currently records OAuth audit events with the active organization where
available, but Better Auth consent rows are not organization-scoped unless
`consentReferenceId` is configured. Showing organization context without
scoping the stored consent would make the UI more confident than the security
model.

Approved decision:

- Use organization-scoped consent for `ceird:*` scopes via
  `postLogin.consentReferenceId`.

## Layout Strategy

Use one compact vertical decision surface:

1. Header: "Review app access" with direct support copy:
   "Approve only if you trust this app or agent."
2. Client section:
   - Primary: client name or client id.
   - Secondary: client id, redirect host, client website/policy/terms when
     available.
   - Loading: skeleton rows while public client metadata loads.
   - Failure: fallback to signed query details, with "Client details
     unavailable" copy.
3. Workspace section:
   - For organization-scoped Ceird requests, show the active workspace name and
     slug.
   - If no active workspace exists for Ceird scopes, show a blocking warning.
4. Access section:
   - Grouped rows with icons, labels, plain-English descriptions, and raw scope
     chips.
   - Warning callout for write/offline/admin access.
5. Action row:
   - `Deny` outline button first.
   - `Allow access` primary button last, disabled for blocked states.
   - On mobile, full-width stacked buttons with `Deny` first and `Allow access`
     second.

Do not use nested cards. Use list rows, badges, alert/callout primitives, and
existing `EntrySurfaceCard` geometry.

## Interaction Model

- The screen loads immediately from signed query fields, then enriches client
  metadata when `publicClient` resolves.
- Client metadata fetch failure does not block denial or non-blocked approval.
- Denial stays available in every valid signed-request state, including
  unverified email and high-risk admin states.
- Approval sets a loading state only on the approve button.
- Denial sets a loading state only on the deny button.
- While one action is pending, both buttons are disabled to avoid double
  decisions.
- Successful consent redirects to the Better Auth returned URL.
- Recoverable errors re-enable the buttons and show the targeted alert.
- No route-level hotkeys. `Enter` or `Space` should activate only the focused
  button. `Escape` should not deny the request.

## Key States

| State                   | Expected behavior                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Valid read-only request | Client details, optional workspace context, read/identity groups, `Deny`, `Allow access`.                                         |
| Write request           | Same as valid request plus a warning treatment for data-changing access.                                                          |
| Offline request         | Same as valid request plus clear duration copy: access can continue until revoked.                                                |
| Admin request           | Show admin group and a strong warning, but allow approval after verified-email policy is satisfied.                               |
| Unknown scope           | Show raw scope in unknown group with cautious copy. Do not hide it.                                                               |
| Metadata loading        | Show skeleton in client section only. Do not blank the whole screen.                                                              |
| Metadata unavailable    | Keep signed query display. Add quiet copy that richer client details could not be loaded.                                         |
| Missing client id       | Keep existing expired/invalid consent state with no actions.                                                                      |
| Missing active org      | If `ceird:*` scope exists and org-scoped consent is approved, block approval and explain that the user needs an active workspace. |
| Unverified email        | Approval returns targeted verified-email copy. Denial remains available.                                                          |
| Expired/changed query   | Keep existing expired/changed targeted errors.                                                                                    |
| Pending action          | Disable both actions. Show loading on the chosen action only.                                                                     |

## Copy Notes

Recommended group labels:

- Identity: "Confirm your identity"
- Ceird read: "View workspace data"
- Ceird write: "Change workspace data"
- Ceird administration: "Administer workspace settings"
- Ongoing access: "Keep access after this session"
- Unknown: "Requested access Ceird does not recognize"

Recommended high-risk copy:

- Write: "This app or agent may create or update Ceird work data."
- Admin warning: "This app or agent may administer workspace access and
  settings. Approve only if you expected this request."
- Offline: "This app or agent may keep access until you revoke it."
- Unknown: "Only approve if you expected this exact access request."

Button labels:

- `Deny`
- `Allow access`
- `Return to app` only after a non-recoverable state where no Better Auth
  redirect URL can be obtained.

## Implementation Notes

- Add a small typed client-public-metadata decoder at the app boundary using
  `Schema`, because Better Auth public client metadata crosses an external HTTP
  boundary.
- Keep signed query parsing defensive and preserve existing forged-query tests.
- Treat public client metadata as display-only. The signed query and Better Auth
  server verification remain the trust boundary.
- If org-scoped consent is confirmed, configure
  `oauthProvider({ postLogin: { consentReferenceId, shouldRedirect, page } })`
  only after designing the missing-org/organization-selection behavior. Better
  Auth's type docs explicitly put the failure responsibility on the app when a
  scope requires a reference id and no reference exists.
- Keep `authClient.oauth2.consent` calls all-or-nothing for now. Do not pass a
  reduced `scope` until `TSK-118` decides partial approval policy.
- Keep route hotkeys out of this screen. The existing comment should remain or
  move beside the final action component.

## Tests To Add

- Groups `ceird:read`, `ceird:write`, `ceird:admin`, `offline_access`, and
  identity scopes into ordered semantic groups.
- Shows warning treatment for write and offline access.
- Shows strong warning treatment for `ceird:admin` and still allows approval
  after verified-email policy is satisfied.
- Fetches and displays Better Auth public client metadata when available.
- Falls back to signed query details when metadata fails.
- Shows organization context only when org-scoped consent is implemented.
- Blocks approval for Ceird scopes when org-scoped consent is implemented and no
  active organization exists.
- Preserves signed-query prefix behavior and ignores forged trailing query
  values.
- Keeps denial available for unverified email and admin-warning states.
- Does not register route-level hotkeys for approve/deny.

## Approved Human Decisions

The user approved these defaults on 2026-06-07:

1. Use warning-only first-wave approval for `ceird:admin` after verified email.
   Step-up auth is a follow-up tracked in `TSK-111`.
2. Use organization-scoped consent for `ceird:*` with Better Auth
   `postLogin.consentReferenceId`.
3. Use `publicClient` as display enrichment with signed-query fallback.
4. Defer partial approval to `TSK-118`.
5. Defer connected-apps consent management to `TSK-119`.

## Verification

- 2026-06-07 local in-app Browser verification covered the missing-workspace
  block for a signed-looking consent route: grouped high-risk scopes were
  visible, `Deny` remained available, and `Allow access` stayed disabled.
- 2026-06-07 package-local production-preview Playwright smoke passed against a
  rebuilt local app/API/domain stack and disposable Postgres database for the
  active-workspace success path. The smoke used a real Better Auth session,
  verified the user in the disposable DB, created an active workspace through
  Better Auth, seeded a manually provisioned privileged OAuth client row, and
  requested a signed Better Auth authorization URL with PKCE.
- The active-workspace smoke loaded the signed `/oauth/consent` URL returned by
  Better Auth, approved `openid profile email ceird:read ceird:write
ceird:admin` through the app UI, and verified callback with code/state,
  `oauth_consent.reference_id` equal to the active organization id,
  `oauth_consent.scopes` preserving the approved scopes, and an
  `oauth_consent_granted` audit event with actor, organization, OAuth client,
  scopes, and admin/write metadata.
- Browser console output was clean for the successful active-workspace pass.
  Screenshots:
  `/tmp/tsk66-oauth-consent-active-workspace.png` and
  `/tmp/tsk66-oauth-consent-callback.png`.
- In-app Browser was retried before the active-workspace pass, but Browser
  discovery returned no registered `iab` browser. The active-workspace success
  evidence is therefore package-local Playwright evidence until a Browser
  session is registered again.
