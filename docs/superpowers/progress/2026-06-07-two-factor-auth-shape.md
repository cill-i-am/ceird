# Two-Factor Authentication Shape

Status: Approved by the user on 2026-06-07 for `TSK-59`, `TSK-60`,
`TSK-61`, and `TSK-62`. `TSK-60` backend/plugin/schema work is implemented
locally and ready for review. `TSK-61` account settings management is also
implemented locally with focused tests and browser smoke verification. `TSK-62`
login challenge handling is implemented locally with focused tests, typecheck,
and browser smoke verification.

Verification note, 2026-06-07: focused app/domain tests, typecheck, lint,
format, React Doctor, app build, and browser smoke passed after the
settings-management implementation. Browser smoke used an isolated package
stack on `127.0.0.1:4174` -> `127.0.0.1:3001` -> `127.0.0.1:3002`, with
`AUTH_RATE_LIMIT_ENABLED=false` to match the repo's package-local Playwright
config. The smoke signed in with a disposable verified test user, opened
`/settings`, waited for the `Security` tab to hydrate before clicking it,
confirmed the `Set up 2FA` button is disabled until the current password is
entered, then confirmed setup advances to the QR/TOTP entry state without
unexpected console or page errors. The safe disabled-state screenshot is
`/tmp/tsk61-security-disabled-post-refactor.png`; no screenshot was captured
while QR setup material or backup codes were visible.

Verification note, 2026-06-07: `TSK-62` browser smoke passed against a fresh
package-local stack on `127.0.0.1:4174` -> `127.0.0.1:3001` ->
`127.0.0.1:3002` backed by a disposable Postgres container on
`127.0.0.1:55439`. The smoke seeded a disposable verified user through the real
Better Auth sign-up, organization-create, two-factor enable, and TOTP
verification endpoints, then verified `/login` continues into the inline
`Verify your sign-in` challenge. TOTP verification returned to the authenticated
home shell, the account-menu sign-out path returned to `/login`, and backup-code
verification also returned to the authenticated home shell. Browser console
errors were empty. Challenge screenshot capture timed out through the in-app
browser backend, so sensitive states were verified with DOM snapshots, URL
assertions, visible challenge/home-shell assertions, and console-log inspection.
A final non-sensitive authenticated home screenshot was captured at
`/tmp/tsk62-browser-safe-home.png`; no screenshot was captured while TOTP or
backup-code material was visible.

Visual direction probe skipped: this is a security workflow inside existing
auth/settings product surfaces. The project register, settings patterns, and
login card shell already determine the visual lane.

Primary sources:

- Better Auth 2FA docs: https://better-auth.com/docs/plugins/2fa
- Local installed source:
  `opensrc/repos/github.com/better-auth/better-auth/packages/better-auth/src/plugins/two-factor`

## Feature Summary

Ceird's first 2FA release adds optional TOTP authenticator app enrollment with
backup codes, plus an inline login challenge for users who have enabled 2FA. It
is an account-level protection, not an organization setting, but owners/admins
should be strongly prompted to enroll.

This shape intentionally avoids hard enforcement, trusted-device UX, passkeys,
email/SMS OTP, and sensitive-action step-up. Those remain deferred until the
recovery, support, and step-up policies are designed.

## Primary User Action

In settings: enable 2FA, verify an authenticator code, and save backup codes.

At login: complete the second-factor challenge with an authenticator code or a
single-use backup code while preserving the original redirect or invitation
continuation.

## Confirmed Policy Inputs

- `TSK-58`: 2FA is optional for all users in the first release.
- Owners/admins get strong enrollment prompts, but no hard requirement.
- Verified email is required before 2FA/passkey enrollment.
- TOTP plus backup codes is the first supported method.
- Backup code login is the first-release recovery path.
- Passkeys are deferred to `TSK-63`.
- Trusted-device policy is deferred to `TSK-110`.
- Sensitive-action step-up policy is deferred to `TSK-111`.
- Use shadcn-compatible primitives for the UI. The app target is `apps/app`
  with `base-luma`, `base` primitives, Tailwind v4, `hugeicons`, and `#`
  aliases.
- Use official shadcn `InputOTP` for six-digit TOTP entry and backup-code entry
  where it fits. Add it through
  `pnpm dlx shadcn@latest add input-otp -c apps/app` before importing from
  `#/components/ui/input-otp`.
- Use the shadcn.io QR generator pattern as a base/reference for the setup QR
  component only after checking licensing and local component compatibility.

## Better Auth Behavior To Design Around

Better Auth's `twoFactor` plugin adds:

- `user.twoFactorEnabled`
- `twoFactor` table with encrypted `secret`, encrypted `backupCodes`, and
  `userId`; the installed Better Auth 1.6.11 package also includes a
  `verified` flag used to distinguish pending enrollment from completed TOTP
  setup
- `/two-factor/enable`, which requires the user's password and returns
  `totpURI` plus backup codes
- `/two-factor/verify-totp`, which completes enrollment if the user is not yet
  enabled
- `/two-factor/generate-backup-codes`, which invalidates previous backup codes
- `/two-factor/verify-backup-code`, which consumes one backup code during login
- `/two-factor/disable`, which requires password and deletes the two-factor
  record

For credential sign-in, Better Auth creates a temporary signed 2FA cookie after
password verification, removes the provisional session cookie, deletes the
provisional session row, and returns `twoFactorRedirect: true`. The app must not
navigate to the authenticated shell until a TOTP or backup-code verification
creates the final session cookie.

## Design Direction

Color strategy: Restrained.

Scene sentence: a contractor, office admin, or owner configures account security
from a laptop during normal work, then later completes a short login challenge
from a laptop or phone while trying to get back into the workspace quickly.

Anchor references:

- Ceird account settings shape at
  `docs/superpowers/progress/2026-06-07-account-security-settings-shape.md`
- Ceird login card and invitation continuation flow
- Linear and Stripe account security flows

Use the existing Ceird product system: compact panels, exact form copy, stable
row heights, visible focus, calm destructive confirmations, and no decorative
security dashboard.

## Scope

Fidelity: production-ready implementation after this brief is confirmed.

Breadth:

- Settings enrollment and management under the account security surface.
- Login challenge continuation inside the existing `/login` route.
- Schema/plugin/migration plan for `TSK-60`.

Interactivity:

- enable 2FA
- verify TOTP during enrollment
- reveal and acknowledge backup codes
- regenerate backup codes
- disable 2FA
- complete login challenge with TOTP
- complete login challenge with backup code

Out of scope:

- trusted-device checkbox or "remember this device"
- email/SMS OTP as a second factor
- passkeys
- self-service lost-device recovery beyond backup codes
- mandatory owner/admin enforcement
- sensitive-action step-up

## Settings Layout Strategy

Place 2FA above active sessions in the account `Security` tab, because 2FA
controls how future sessions are created. If the `TSK-49` shape changes, keep
the relative order: sign-in protections first, active sessions second.

Use one `AppUtilityPanel` titled `Two-factor authentication`.

Panel states:

- Not enrolled, verified email: show status, short owner/admin prompt when the
  current role is owner/admin, password field, and `Set up 2FA`.
- Not enrolled, unverified email: show blocked state with resend/verify path,
  not the password field.
- Enrollment started: show QR code, manual setup URI reveal/copy affordance,
  verification code input, and backup-code save warning.
- Enrollment verified: show backup codes, copy/download controls, and an
  acknowledgement checkbox before returning to the normal enabled state.
- Enabled: show enabled status, backup-code regeneration action, and disable
  action.
- Regenerated codes: show the new backup codes immediately and require
  acknowledgement.
- Disable confirmation: password field plus explicit `Disable 2FA` confirmation.

Do not show disabled future controls for passkeys, trusted devices, or email OTP
in this first release.

## Enrollment Flow

1. User opens account security settings.
2. If email is unverified, enrollment is blocked with actionable verification
   copy.
3. User enters current password and starts setup.
4. App calls `authClient.twoFactor.enable({ password })`.
5. App stores returned `totpURI` and `backupCodes` in local component state for
   this enrollment session only.
6. App renders a QR code from `totpURI` plus a manual setup reveal/copy action.
7. User enters a six-digit authenticator code.
8. App calls `authClient.twoFactor.verifyTotp({ code })` without
   `trustDevice`.
9. After success, app shows backup codes and requires acknowledgement before
   collapsing to the enabled state.

If the user refreshes or leaves before saving backup codes, the setup should be
restartable by calling `enable` again. Better Auth deletes existing two-factor
rows before creating a new pending setup.

Implementation default: use a shadcn-compatible QR component patterned after
https://www.shadcn.io/tools/qr-generator when licensing allows; otherwise wrap
a small QR rendering dependency in a local shadcn-style component. Keep the
manual setup URI available as a text fallback.

## Backup Code Management

Backup codes are one-time recovery credentials. They should be treated like
password material in the UI.

Enabled-state controls:

- `Regenerate backup codes`
- `Disable 2FA`

Regeneration flow:

1. User chooses `Regenerate backup codes`.
2. Inline confirmation explains previous codes will stop working.
3. User enters current password.
4. App calls `authClient.twoFactor.generateBackupCodes({ password })`.
5. App shows the new codes and requires acknowledgement.

Do not add a "view backup codes any time" button in the first release. Better
Auth exposes a server-only `viewBackupCodes` endpoint, but its docs caution that
backup-code display should require a fresh session. That fresh-session/step-up
policy belongs in `TSK-111`.

## Disable Flow

Disabling 2FA requires current password and explicit confirmation.

Flow:

1. User chooses `Disable 2FA`.
2. Inline confirmation explains future sign-ins only require password.
3. User enters current password.
4. App calls `authClient.twoFactor.disable({ password })`.
5. App refreshes session state and returns to the not-enrolled state.

Do not revoke sessions automatically on disable in this slice unless Better Auth
does so internally. If Ceird wants disable to revoke other sessions, that should
be a separate policy decision tied to step-up/session management.

## Login Challenge Strategy

Keep the challenge as an inline continuation in `LoginPage`, not a modal and not
a separate route in the first release.

Flow:

1. User submits email and password on `/login`.
2. If `authClient.signIn.email` returns an error, existing sign-in error copy
   remains.
3. If it returns `twoFactorRedirect: true`, do not call
   `navigateOnSuccess()`.
4. Replace the password form body with `Verify your sign-in`.
5. Preserve the submitted email, the invitation search param, and the eventual
   success navigation target.
6. User enters an authenticator code, or switches to backup code.
7. App calls `authClient.twoFactor.verifyTotp({ code })` or
   `authClient.twoFactor.verifyBackupCode({ code })` without `trustDevice`.
8. On success, clear organization access cache and call existing
   `navigateOnSuccess()`.

If the temporary 2FA cookie expires, show a recoverable expired state:

`That verification session expired. Sign in again to get a new challenge.`

The action should return the user to the email/password form with the email
still filled.

## Key States

Settings:

- not enrolled
- not enrolled, owner/admin prompt
- not enrolled, email unverified
- setup pending password
- QR/manual setup visible
- TOTP verification error
- backup codes revealed
- backup codes acknowledged
- enabled
- regenerate pending
- regenerate success with new codes
- disable pending
- disable success
- provider/API failure

Login:

- password form
- password failure
- 2FA challenge with TOTP
- 2FA challenge with backup code
- invalid code
- expired challenge
- backup code consumed successfully
- invitation continuation success

## Interaction Model

Keyboard:

- All controls use normal tab order and visible focus.
- Keep `Mod+Enter` for settings form submission when focus is inside a 2FA
  password/code form, using the existing settings hotkey layer.
- Do not add a new global or route-level 2FA shortcut.

Code entry:

- Use shadcn `InputOTP` for six-digit TOTP entry.
- Use `InputOTP` for backup-code entry only if Ceird normalizes backup codes to
  a fixed slot pattern; otherwise use the existing shadcn `Input` for
  hyphenated or variable-length backup codes.
- Accept pasted codes and normalize spaces/hyphens for backup-code entry.
- Use `inputMode="numeric"` for TOTP.
- Do not auto-submit until a code is syntactically complete and the user submits
  or presses Enter.

Copy/download:

- Backup code copy action should write all codes as newline-separated text.
- Download action can be omitted in first release if clipboard support and
  acknowledgement are implemented.

Trusted device:

- No checkbox in first release.
- Calls should omit `trustDevice` or pass `false`.

## Content Requirements

Settings title: `Two-factor authentication`

Settings description: `Add an authenticator app so signing in requires a
time-based code after your password.`

Owner/admin prompt: `Owners and admins should protect this account with 2FA
before inviting teammates or changing workspace access.`

Unverified email blocked title: `Verify your email before setting up 2FA.`

Unverified email blocked copy: `We use your verified email for account recovery
and security notices.`

Setup action: `Set up 2FA`

Verify action: `Verify code`

Enabled status: `2FA is enabled.`

Regenerate action: `Regenerate backup codes`

Disable action: `Disable 2FA`

Backup code warning: `Save these backup codes now. Each code works once, and
they are the only self-service recovery path if you lose your authenticator.`

Login challenge title: `Verify your sign-in`

Login challenge description: `Enter the code from your authenticator app.`

Backup code switch: `Use a backup code`

Authenticator switch: `Use authenticator code`

Expired challenge: `That verification session expired. Sign in again to get a
new challenge.`

Lost-device copy: `If you cannot access your authenticator, use a backup code.`

Do not mention support recovery unless the product has a real support workflow.

## Data, Schema, And API Requirements

`TSK-60` must add:

- server plugin: `twoFactor({ issuer: "Ceird" })`
- client plugin: `twoFactorClient()`
- `user.twoFactorEnabled`
- `twoFactor` table
- Drizzle migrations under both `apps/domain/drizzle` and
  `apps/domain/drizzle-alchemy`
- platform and infra schema exports for the new table
- verified-email auth-boundary guard for `/two-factor/enable`
- trusted-device request rejection for first-release two-factor verification
  endpoints

Recommended database shape from Better Auth 1.6.11:

- `user.two_factor_enabled boolean default false`
- `two_factor.id text primary key`
- `two_factor.secret text not null`
- `two_factor.backup_codes text not null`
- `two_factor.user_id text not null references user(id) on delete cascade`
- `two_factor.verified boolean default true`
- indexes on `secret` and `user_id`

`TSK-61` must still show a user-facing blocked enrollment state when
`session.user.emailVerified` is false; the server boundary now enforces the same
rule.

`TSK-62` must update login handling for `twoFactorRedirect` and avoid treating
the password step as authenticated success.

Audit/event capture for 2FA enrollment, disable, backup-code regeneration, and
successful recovery-code use is audit-grade per `TSK-46`, but the durable event
write can be a follow-up if it would broaden the first UI/plugin slice too much.
If deferred, create a Linear follow-up before marking the milestone complete.

## Tests To Add

Domain:

- plugin is present with `two-factor` id
- schema includes `twoFactorEnabled` and `twoFactor`
- migration includes the new column/table/indexes
- verified-email enrollment guard at the auth boundary
- trusted-device direct API requests are rejected while `TSK-110` is deferred

App settings:

- unverified email blocks enrollment
- owner/admin prompt copy appears for privileged current role
- enable flow shows QR/manual setup and backup-code acknowledgement
- invalid TOTP shows safe error copy
- regenerate backup codes requires password and shows new codes
- disable requires password and confirmation
- Security tab remains mounted while backup codes are unacknowledged
- route/before-unload guard warns before leaving with unacknowledged backup
  codes
- duplicate TOTP verification submits are ignored while the first request is
  pending

App login:

- `twoFactorRedirect` does not navigate to the app shell
- TOTP verification navigates after success
- backup-code verification navigates after success
- invalid or expired challenge stays in login flow
- invitation continuation survives through the challenge

Browser:

- settings enrollment layout on desktop and mobile
- backup code reveal and acknowledgement
- login challenge continuation
- backup-code login

`TSK-61` settings enrollment and `TSK-62` login challenge browser smokes have
passed on package-local stacks. Stage-backed browser verification can still be
run before merge if the project wants parity with Alchemy-emitted URLs, but it
is no longer blocking the local implementation proof for these two issues.
The `TSK-61` unverified-email blocked state also passed a 2026-06-07
production-preview Playwright smoke with screenshots at
`/tmp/tsk61-unverified-2fa-block.png`; the requested in-app Browser plugin was
not available in that session because no `iab` browser was registered.

## Recommended Implementation References

- `$impeccable craft` or `$impeccable polish` for settings/login UI.
- `layout` for dense settings panel structure.
- `clarify` for recovery and destructive-action copy.
- `adapt` for mobile code-entry and backup-code layouts.
- Better Auth 2FA docs and installed 1.6.11 source.
- TanStack Start route/search handling for invitation continuation.
- Vercel composition patterns for extracting 2FA settings/login components
  rather than expanding `UserSettingsPage` and `LoginPage` indefinitely.
- Drizzle/Postgres review for schema and migration correctness.

## Approved Human Decisions

The user approved these defaults on 2026-06-07:

1. Keep 2FA settings under the account `Security` tab shaped in `TSK-49`.
2. Use TOTP plus backup codes only in the first release.
3. Do not show a trusted-device checkbox until `TSK-110` resolves.
4. Do not show passkeys or email/SMS OTP placeholders.
5. Keep login challenge inline on `/login`, preserving invitation continuation.
6. Add a shadcn-compatible QR setup component, with manual URI fallback.
7. Do not offer "view backup codes" after enrollment until `TSK-111` defines
   fresh-session or step-up behavior.
