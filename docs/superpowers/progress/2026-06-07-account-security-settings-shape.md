# Account Security Settings Shape

Status: Approved by the user on 2026-06-07 and implemented on
`codex/better-auth-hardening` for `TSK-49`, `TSK-50`, and `TSK-51`.

Verification note, 2026-06-07: account security settings/session management
passed a package-local production-preview Playwright smoke with a verified user
and three real Better Auth sessions. The smoke verified the `This device`
marker, absence of a revoke button on the current session, active/other session
counts, targeted session revocation, bulk revocation of remaining other
sessions, and screenshots at `/tmp/tsk49-session-list.png` and
`/tmp/tsk51-session-revoked.png`. The smoke found and fixed a real-session
current-device bug: Better Auth `/get-session` returns session `id` but not
session `token`, so current-session matching now falls back to session id. The
clean run had zero browser console errors or warnings.

Visual direction probe skipped: this is an extension of an existing product
settings surface with committed product context, design tokens, and interaction
patterns, not a net-new or directionally ambiguous interface.

## Feature Summary

Account security settings give an authenticated user one focused place to review
sign-in safety and remove sessions from devices they no longer trust. The first
release should add active-session visibility and revocation controls without
turning account settings into a broad security dashboard.

This shape fits Ceird's existing `/settings` route. It keeps the current
profile, email, and password forms intact, then adds a restrained `Security` tab
for active sessions and future sign-in protections.

## Primary User Action

Find the current session, identify other active sessions, and revoke a single
lost device or all other sessions with clear confirmation and feedback.

## Confirmed Policy Inputs

- Current-session termination stays on the existing sign-out path.
- Password changes continue to request other-session revocation through Better
  Auth.
- Password reset continues to revoke existing sessions once the new password is
  accepted.
- Active-session management is account-scoped, not organization-scoped.
- No account deletion controls are added in this project slice. That policy is
  deferred to `TSK-52`.

## Design Direction

Color strategy: Restrained.

Scene sentence: an office admin or site lead checks their account from a laptop
or tablet after signing in somewhere else, in normal working light, wanting quick
confidence that their account is still under control.

Anchor references:

- Ceird's existing `/settings` tabs and `AppUtilityPanel` surfaces
- Linear account settings
- Stripe-style device/session rows

Use the existing Ceird product system: Geist, cool neutral surfaces, line tabs,
compact row lists, semantic destructive actions, and blue only for selected or
primary state.

## Scope

Fidelity: production-ready implementation after this brief is confirmed.

Breadth: one account settings tab inside the existing `/settings` route.

Interactivity: active-session loading, current-session marker, revoke-one
session, revoke-all-other-sessions, inline confirmation, mutation feedback, and
route/cache refresh.

Time intent: first-release account security controls. Trusted devices, 2FA,
passkeys, account deletion, and support/admin session management stay in their
own issues.

## Layout Strategy

Add a `Security` tab between `Profile` and `Email`.

The `Security` tab contains:

- an `Active sessions` `AppUtilityPanel`
- a short summary row above the list showing current session state and count of
  other active sessions
- a single row-list container for sessions, not nested cards
- a row action for each other session
- a `Revoke all other sessions` action near the panel title or list footer,
  disabled when there are no other sessions

Session row hierarchy:

1. device/browser label, for example `Chrome on macOS` or `Unknown device`
2. `This device` badge on the current session
3. last active time as the main timestamp
4. created date as secondary metadata
5. revoke action for non-current sessions only

Do not display raw IP addresses or raw user-agent strings in the first release.
User-agent parsing should produce a friendly device/browser label, with a safe
fallback.

Future 2FA/passkey placement:

- reserve the `Security` tab as the home for future 2FA, backup-code, trusted
  device, and passkey settings
- do not render disabled future controls in this slice
- when 2FA ships, place sign-in protections above active sessions, because they
  change how future sessions are created

## Key States

Default: current session first, other sessions sorted by most recent activity.
The user sees which row is this device and which sessions can be revoked.

Single-session: current session row remains visible. The bulk revoke action is
disabled or omitted with copy that there are no other active sessions.

Loading: skeleton rows shaped like session rows. Keep the tab header and panel
stable.

Load failure: inline alert inside the panel. Copy should say the sessions could
not be loaded and offer retry.

Revoke pending: disable the affected row action and bulk action. Preserve row
height so the list does not jump.

Revoke success: remove revoked rows after mutation refresh and show a concise
status message.

Revoke failure: keep the row in place, show an inline destructive status, and
allow retry.

Current-session row: no revoke button. It may include copy that signing out ends
this session.

Unsupported or missing metadata: show `Unknown device` and omit unavailable
metadata. Do not leak tokens, session ids, raw user agents, or raw IP addresses.

## Interaction Model

The existing settings route and global navigation stay unchanged:

- `/settings` remains the route.
- `Open user settings` in the command bar still opens `/settings`.
- `G T` still navigates to user settings.
- `Mod+Enter` remains the scoped submit shortcut for focused forms.

The new session controls do not need new keyboard shortcuts. They are not
frequent enough to justify another global or route-level chord, and every button
must remain reachable by tab order with visible focus.

Destructive controls use inline two-step confirmation:

- first click on `Revoke session` or `Revoke all other sessions` enters a local
  confirm state
- confirm buttons use explicit labels: `Revoke session` and
  `Revoke other sessions`
- cancel returns to the normal row or footer state

Mutation success refreshes the settings route data or the local session query.
If the current session becomes invalid for any reason, fall back to the existing
authenticated-shell behavior rather than inventing a separate recovery flow.

## Content Requirements

Tab label: `Security`

Panel title: `Active sessions`

Panel description: `Review where your account is signed in and revoke sessions
from devices you no longer use.`

Current session badge: `This device`

Bulk action: `Revoke other sessions`

Single row action: `Revoke session`

Confirm title: `Revoke this session?`

Bulk confirm title: `Revoke all other sessions?`

Success copy:

- `Session revoked.`
- `Other sessions revoked.`

Failure copy:

- `We couldn't load active sessions. Please try again.`
- `We couldn't revoke that session. Please try again.`
- `We couldn't revoke other sessions. Please try again.`

Single-session copy: `No other active sessions.`

Current-session helper: `Sign out from the account menu to end this session.`

## Data And Backend Requirements

Use Better Auth as the source of truth for sessions. Prefer the generated
auth-client session APIs if they expose the required calls. If browser client
calls cannot satisfy cookie or response-shape requirements, add a narrow
TanStack Start server function that forwards the current cookies to Better Auth
and returns a sanitized DTO.

UI DTO fields:

- `id`
- `isCurrent`
- `createdAt`
- `updatedAt` or `lastActiveAt`
- friendly device/browser label

Do not expose:

- session token
- raw session id outside action payloads
- raw IP address
- raw user agent
- active organization id unless a future product need exists

Session revocation APIs should be called with the minimum required identifier,
then the list should refresh from Better Auth. Do not maintain an app-owned
parallel session store.

## Implementation Notes

- Keep `UserSettingsPage` from becoming a larger multi-feature component if the
  implementation gets heavy. Extract a `UserSecuritySessionsPanel` rather than
  adding another large branch inside the page.
- Use composition over boolean prop expansion if new row or confirm components
  are introduced.
- Keep user-agent parsing deterministic and small. A safe fallback is better
  than broad, fragile parsing.
- Add tests for loading, current-session marking, revoke-one confirmation,
  revoke-all confirmation, failure copy, and the no-other-sessions state.
- Focused component and settings-page tests cover loading, current-session
  marking, revoke-one confirmation, revoke-all confirmation, failure copy, and
  the no-other-sessions state.
- Browser verification remains required on the approved Alchemy stage with an
  authenticated test account before final handoff.

## Recommended Implementation References

- `$impeccable craft` or `$impeccable polish` for the UI build pass.
- `layout` for row density and responsive behavior.
- `clarify` for confirmation and failure copy.
- `adapt` for mobile row collapse.
- Better Auth source/docs for session-list and revocation API behavior.
- TanStack Start server-function guidance if a server bridge is required.
- Vercel composition patterns if the sessions panel needs reusable row or
  confirmation primitives.

## Open Human Decisions

No unresolved product choices remain for this slice. Approved defaults:

1. Existing `/settings` route.
2. New `Security` tab between `Profile` and `Email`.
3. Current session is visible but cannot be revoked from this panel.
4. Other sessions can be revoked one at a time or all at once.
5. Raw IP addresses and raw user agents stay internal-only.
6. No visible disabled controls for future 2FA, passkeys, or trusted devices in
   this slice.
