# Decision Packet 4: Remaining UX And Runtime Verification Gates

Last updated: 2026-06-07

This packet covers the remaining Better Auth hardening gates before the next
implementation wave. It is intentionally limited to shaped UI/product decisions
and runtime verification inputs. It does not reopen the already-approved
security policy defaults from Decision Packets 1 through 3.

Canonical branch: `codex/better-auth-hardening`

## How To Reply

Reply with one of:

- `Approve packet 4 defaults`
- `Approve A and B; change C1 to warning-only; approve D and E`
- Per-item edits using the item numbers below

Do not paste production secrets into chat. For Turnstile or stage credentials,
confirm the source to use, such as `.env.local`, existing stage secrets, or a
test credential handoff path.

## A. Account Security Settings (`TSK-49`, `TSK-50`, `TSK-51`)

Status: approved by the user on 2026-06-07. Richer device and approximate
location metadata is deferred to `TSK-122`.

Recommended defaults:

1. Keep account security inside the existing `/settings` route.
2. Add a new `Security` tab between `Profile` and `Email`.
3. Show the current session in the active-session list, but do not allow
   revoking it from this panel. Current-session termination stays on sign-out.
4. Allow revoking one other session and revoking all other sessions.
5. Keep raw IP addresses and raw user-agent strings internal-only.
6. Do not show disabled placeholders for future 2FA, passkeys, trusted devices,
   or account deletion in this slice.

Implementation impact:

- Unlocks active-session listing and revocation UI.
- Keeps the current settings route, command-bar behavior, and settings hotkeys.
- Requires browser verification for desktop and mobile settings layouts.

## B. Two-Factor Authentication (`TSK-59`, `TSK-60`, `TSK-61`, `TSK-62`)

Status: approved by the user on 2026-06-07. Implementation should use
shadcn-compatible primitives, including official `InputOTP` for TOTP/backup-code
entry and a QR base component compatible with the linked shadcn.io QR generator
pattern after licensing/compatibility review.

Recommended defaults:

1. Keep 2FA settings under the account `Security` tab.
2. Support TOTP authenticator apps plus backup codes only in the first release.
3. Keep 2FA optional for all users, with stronger owner/admin prompts but no
   hard enforcement.
4. Do not show a trusted-device checkbox until `TSK-110` resolves.
5. Do not show passkey, email OTP, or SMS OTP placeholders.
6. Keep the login challenge inline on `/login`, preserving invitation and
   redirect continuation.
7. Add a shadcn-compatible QR setup component, with manual setup URI fallback.
8. Do not offer "view backup codes" after enrollment until `TSK-111` defines
   fresh-session or step-up behavior.

Implementation impact:

- Unlocks Better Auth `twoFactor` plugin adoption, schema/migrations, client
  plugin wiring, settings management, and login challenge handling.
- Requires Drizzle migrations under both domain migration paths.
- Requires adding `input-otp` through the app shadcn target before using
  `#/components/ui/input-otp`.
- Requires browser verification with a deterministic TOTP setup or seeded test
  account.

## C. OAuth Consent UX (`TSK-66`)

Status: approved by the user on 2026-06-07 with warning-only first-wave
`ceird:admin` approval. Follow-up step-up auth is tracked in `TSK-111`.

Recommended defaults:

1. Allow first-wave `ceird:admin` consent approval after verified email with
   strong warning copy. Do not block approval solely because step-up auth is not
   implemented yet.
2. Use Better Auth `postLogin.consentReferenceId` for organization-scoped
   `ceird:*` consent. If this is not approved, omit organization-specific copy
   from the first-wave UI.
3. Use Better Auth public client metadata as display enrichment, with signed
   query fields as the fallback trust source.
4. Defer partial scope approval to `TSK-118`.
5. Defer connected-app consent management to `TSK-119`.

Implementation impact:

- Unlocks consent copy, scope grouping, public client metadata display, admin
  warning behavior, and organization-scoped consent behavior.
- Keeps denial available for unverified email and high-risk requests.
- Does not add route-level approve/deny hotkeys.

## D. Organization Security Activity (`TSK-74`)

Status: approved by the user on 2026-06-07.

Recommended defaults:

1. Keep `organization_active_changed` internal-only.
2. Add a new admin-only `/organization/security` route with page title
   `Security activity`.
3. Keep first-release rows read-only with no row target links.
4. Keep source IP and user-agent internal-only.

Implementation impact:

- Unlocks an owner/admin read-only security activity ledger over
  `auth_security_audit_event`.
- Keeps `/activity` as the work-item activity feed.
- Requires URL-backed filters, owner/admin access enforcement, pagination or
  load-more behavior, and desktop/mobile browser verification.

## E. Runtime And Browser Verification

Status: approved by the user on 2026-06-07.

Recommended defaults:

1. Use Alchemy stage `codex-better-auth-hardening`.
2. Use existing `.env.local` credentials for this stage.
3. Use Cloudflare Turnstile test keys or a local verifier override for browser
   verification. Do not require the agent to solve a real captcha.
4. Browser verification should cover only implemented user-visible flows:
   password/HIBP copy, captcha states, verified-email blocked states,
   account-security sessions, 2FA setup/login after implemented, OAuth consent,
   and organization security activity after implemented.

Implementation impact:

- Unlocks provider-mutating `pnpm dev -- --stage codex-better-auth-hardening`
  and Browser runs against emitted app/API URLs.
- Runtime/browser verification may proceed after implemented user-visible flows
  have enough seeded state to exercise.

## Default Approval Summary

Approving packet 4 means:

- Account security UI ships inside `/settings` as a new `Security` tab.
- 2FA ships as optional TOTP plus backup codes, no trusted devices, no passkey
  placeholders, inline login challenge.
- OAuth consent warns on `ceird:admin`, scopes `ceird:*` consent to the active
  organization, enriches client display metadata, and defers partial approval
  plus connected-app management. Step-up auth for admin consent is a follow-up.
- Organization security activity ships as a new read-only
  `/organization/security` owner/admin route, with raw IP/user-agent hidden.
- Stage/browser verification may use `codex-better-auth-hardening`,
  `.env.local`, and Turnstile test handling.
