# Organization Security Activity Shape

Status: Approved by the user on 2026-06-07 for `TSK-74`.

## Feature Summary

Organization security activity gives owners and admins a focused read-only view
of security-relevant organization changes: invitations, member role changes,
member removals, organization creation, and organization settings updates. It
should help an admin answer "what changed, who did it, and who or what was
affected?" without exposing noisy internal audit rows.

This shape extends Ceird's existing activity vocabulary. It should feel like a
precise operational ledger, not a compliance dashboard.

## Primary User Action

Review recent organization security events, filter to the event or actor that
matters, and identify whether a membership or invitation change needs follow-up.

## Recommended Visibility Policy

Visible to owners/admins:

- `organization_created`
- `organization_updated`
- `organization_invitation_created`
- `organization_invitation_resent`
- `organization_invitation_canceled`
- `organization_invitation_accepted`
- `organization_member_role_updated`
- `organization_member_removed`

Retained internally only:

- `organization_active_changed`
- OAuth client registration, consent, refresh, and revoke events
- rate-limit, captcha, provider, token-context, and write-failure telemetry

Rationale: active-organization changes are noisy session state, while OAuth and
provider events need a broader account/security surface rather than an
organization-admin activity page.

Approved decision: keep `organization_active_changed` internal-only.

## Design Direction

Color strategy: Restrained.

Scene sentence: an owner or office admin reviews membership changes at a desk or
on a tablet after an invitation, role, or member access question comes up; the
surface needs to feel calm, exact, and trustworthy in normal working light.

Anchor references:

- Ceird's existing `/activity` timeline
- Linear issue/activity history
- Stripe-style security and team audit rows

Use the existing Ceird product system: Geist, cool neutral surfaces, row lists,
compact filters, semantic badges, and restrained blue only for action or selected
state.

## Scope

Fidelity: production-ready implementation after this brief is confirmed.

Breadth: one organization-scoped security activity surface, plus route/nav entry
and command-bar access if implemented as a new route.

Interactivity: read-only list with filters and pagination or load-more behavior.

Time intent: implement enough for first-release owner/admin review. Export,
long-term retention controls, and failed-attempt audit taxonomy stay out of
scope.

Approved decision: add a new admin-only `/organization/security` route with a
`Security activity` page title. Keep `/activity` as the work-item activity feed.

## Layout Strategy

Use the same page architecture as `OrganizationActivityPage`:

- `AppPageHeader` with title `Security activity`, concise description, and a
  retention note.
- Filter bar below the header for event type, actor, target type, date range,
  and text target search.
- A single bordered row-list/timeline container, with no nested cards.
- Desktop rows use columns for event, actor, target, and timestamp.
- Mobile rows collapse into stacked activity items with the event badge, time,
  summary, actor, and target.
- Active filters appear as compact badges with a clear action.
- Dense history uses pagination or load-more, not infinite uncontrolled scroll.

The row summary should be the most scannable item, for example:

- `Ryan Mitchell invited Taylor Young as Member.`
- `Sarah Chen changed Jordan Lee from Member to Admin.`
- `Ryan Mitchell removed Alex Johnson from the organization.`

## Key States

Default: recent security activity, newest first, with visible row counts and
applied filters.

Empty: no security events yet. Copy should explain that invitations, role
changes, member removals, and organization updates will appear here.

Filtered empty: no matching events. Show active filters and a clear-filters
button.

Loading: skeleton rows shaped like the final ledger. Avoid centered spinners.

Error: inline alert above the row list with retry. Keep the header and filters
stable.

Dense history: show `1-50 of N events` and load more or pagination. Prefer
cursor pagination from the backend.

Redacted target: if metadata is missing or intentionally masked, show the masked
email or `Unknown target`, never raw invitation IDs or URLs.

Permission denied: route guard should redirect or block non-owner/admin users
before rendering, following existing organization admin route behavior.

## Interaction Model

Filters update URL search params so the route is linkable and reload-safe.

Filter controls:

- Event type: segmented or command select with grouped labels.
- Actor: command select over current organization members when available.
- Target type: member, invitation, organization.
- Target search: text input for visible target name, masked email, or member
  identifier.
- Date range: simple from/to date inputs unless the app already has a date-range
  primitive.

Route hotkey and command access:

- If implemented as a new route, add a command-bar action for `Open security
activity`.
- Add a route shortcut only if there is a spare organization-admin navigation
  sequence that does not crowd core navigation. Recommended default: command-bar
  action first, no new global hotkey until this route becomes frequent.

Row actions:

- No destructive row actions in the first release.
- Rows may link to `/members` only when the target member/invitation can be
  safely resolved without leaking raw IDs. Recommended default: no row links in
  first release; keep the ledger read-only.

Approved decision: keep first-release rows read-only with no row target links.

## Content Requirements

Page title: `Security activity`

Description: `Review membership, invitation, and organization changes for this
workspace.`

Retention note: `Showing recent security events. Internal audit retention may be
longer than this view.`

Empty title: `No security activity yet.`

Empty description: `Invitations, role changes, member removals, and organization
updates will appear here after they happen.`

Filtered empty title: `No events match these filters.`

Filtered empty description: `Clear filters or widen the date, actor, event, or
target search.`

Error copy: `We couldn't load security activity. Please try again.`

Event labels:

- `Organization created`
- `Organization updated`
- `Invitation sent`
- `Invitation resent`
- `Invitation canceled`
- `Invitation accepted`
- `Role changed`
- `Member removed`

Retention language should avoid legal guarantees until the product has a formal
retention policy.

## Data And Backend Requirements

The implementation needs a read path over `auth_security_audit_event` scoped to
the active organization and allowed event types.

Backend response should include:

- id
- event type
- created timestamp
- actor user id and display name when available
- target type
- target display label
- organization id
- role before/after when relevant
- masked invitation email when relevant
- event summary fields needed by the UI
- cursor pagination metadata

The read endpoint must enforce owner/admin access. It must not expose raw
invitation IDs, invite URLs, OAuth token metadata, raw source IP, or raw user
agent in the owner/admin UI.

Approved decision: keep source IP and user-agent internal-only.

## Recommended Implementation References

- `$impeccable craft` or `$impeccable polish` for the UI build pass.
- `layout` for row density and responsive behavior.
- `clarify` for audit row copy and empty/error states.
- `adapt` for mobile ledger collapse.
- TanStack Router search-param guidance for filter state.
- Ceird organization route guard patterns in `organization-route-access`.
- Drizzle/Postgres review for the paginated audit-event read query.

## Approved Human Decisions

The user approved these defaults on 2026-06-07:

1. Keep `organization_active_changed` internal-only.
2. Add a new admin-only `/organization/security` route instead of folding this
   view into `/activity`.
3. Keep first-release rows read-only with no row target links.
4. Keep source IP and user-agent internal-only.

## Verification

- 2026-06-07 package-local production-preview Playwright smoke passed against a
  rebuilt local app/API/domain stack and disposable Postgres database. The smoke
  created a real Better Auth session, verified the owner in the disposable DB,
  created `Audit Workspace` through Better Auth, seeded organization security
  audit rows, and loaded `/organization/security` with the saved browser state.
- The smoke verified the owner/admin-visible activity list, the internal-only
  IP/user-agent notice, actor/event/target/date/search filters, URL-backed
  event-type filter state, and clean browser console output.
- Screenshots:
  `/tmp/tsk74-organization-security-activity.png` and
  `/tmp/tsk74-organization-security-activity-filtered.png`.
- In-app Browser verification was retried after recreating the local stack, but
  Browser discovery returned no registered `iab` browser. This pass is therefore
  package-local Playwright evidence; in-app Browser coverage remains pending
  until a Browser session is registered again.
