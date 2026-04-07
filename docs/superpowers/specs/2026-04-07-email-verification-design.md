# Email Verification Design

## Summary

Add email verification as the final core authentication lifecycle flow.

This pass keeps the existing architecture intact:

- `apps/api` owns Better Auth configuration, verification-token delivery, and
  auth email policy
- `apps/app` owns verification UX, banner presentation, and route handling
- Better Auth remains the source of truth for verification behavior

This pass intentionally chooses link-based verification and a non-blocking
policy so we can complete auth cleanly without turning verification into a
second login gate.

## Goals

- add native Better Auth email verification
- reuse the existing auth email boundary instead of creating a parallel mail
  path
- keep verification delivery link-based rather than OTP-based
- allow authenticated users to enter the app before verifying
- show a clear in-app verification reminder with a resend action
- keep room to tighten verification policy later if product requirements change

## Non-Goals

- making verification mandatory for app access in this pass
- adding OTP-based email verification
- adding 2FA, magic links, social auth, or richer account trust scoring
- rebuilding auth routing around a verification-only shell
- adding organization- or workspace-specific verification policy

## Current Context

The app already supports:

- email/password sign-up
- email/password sign-in
- password reset
- SSR session lookup
- a protected authenticated shell under `/_app`
- a dedicated auth email boundary with Resend as the first adapter

The current auth architecture explicitly recommends email verification as the
next auth extension and warns that mandatory verification should be treated as a
route-policy change rather than quietly folded into the base auth guard.

## Core Decisions

The following decisions are fixed for this design:

1. email verification is implemented with Better Auth's native verification link
   flow
2. verification is non-blocking for authenticated product access in this pass
3. unverified users can enter `/_app`
4. `/_app` shows a persistent verification reminder until the account is
   verified
5. users can resend verification mail from the app
6. verification email delivery extends the existing `AuthEmailSender` boundary
7. OTP verification is intentionally deferred

## Why Not OTP

OTP is viable, and the UI toolkit can support it, but it is not the best fit
for the current architecture.

OTP would require:

- a code-entry screen
- resend cooldown behavior
- wrong-code and expired-code handling
- more client-side state around pending verification attempts
- a deliberate move away from Better Auth's default verification model

The current codebase already has a strong pattern for email links via password
reset. A link-based verification flow reuses more of that work and keeps the
auth surface simpler.

## Architecture

### Backend Ownership

`apps/api` continues to own verification runtime behavior.

Responsibilities added in this pass:

- configure Better Auth email verification hooks
- build verification URLs that target app-owned verification result handling
- deliver verification mail through the existing auth email service
- keep provider-specific email formatting inside the Resend adapter

We should not add custom app-owned verification endpoints unless Better Auth's
native flow proves insufficient.

### Auth Email Boundary

Extend the existing auth-domain mail service:

- add `sendEmailVerificationEmail` to `AuthEmailSender`

This service should own:

- input validation
- verification message composition
- provider delivery mapping
- observability for verification sends and failures

This service should not become a generic application-wide mail platform.

### Better Auth Integration

Verification should be configured through Better Auth's native email
verification support.

That integration should:

1. let Better Auth own token generation and verification behavior
2. delegate verification email delivery to `AuthEmailSender`
3. preserve the current pattern where app code composes around Better Auth
   instead of replacing it

### Frontend Ownership

`apps/app` owns the visible verification UX.

This pass should add:

- a banner or alert inside the authenticated shell for unverified users
- a resend verification action available from that banner
- a verification result route that can show success, invalid-link, or
  expired-link outcomes after the user clicks the email link

The reminder should be task-focused:

- explain that the account email is not verified yet
- explain why verification matters
- give the user one clear next action

## Route Semantics

This pass keeps route semantics simple:

- `/login` and `/signup` remain guest-only
- recovery routes remain public
- verification result handling can remain outside `/_app`
- `/_app` remains the authenticated boundary
- `requireAuthenticatedSession()` continues to answer only whether the user is
  signed in

Important rule:

- do not overload the base auth guard to answer both "signed in?" and
  "verified?"

If product requirements later demand blocking verification, that should be
introduced as an explicit route-policy decision with dedicated documentation.

## User Flows

### Sign Up

After successful sign-up:

- create the session as today
- send a verification email
- continue into the authenticated experience

If organization onboarding still applies:

- let the user continue through the same authenticated onboarding flow
- keep verification as a separate trust state, not a blocker for initial setup

### Signed-In Unverified Session

When an authenticated user enters `/_app` and `emailVerified` is `false`:

- render the normal app shell
- show a persistent verification reminder near the top of the shell
- offer a resend action
- optionally suppress dismissibility so the reminder remains visible until the
  session updates to verified

This keeps the policy visible without trapping the user in a transitional auth
state.

### Verification Link Click

When a user clicks the link in the email:

- Better Auth handles verification
- the app renders a success or failure result screen
- on success, the next session lookup should reflect `emailVerified: true`

Failure states should cover:

- invalid link
- expired link
- already-used or otherwise no-longer-valid token

Those failures should remain user-safe and recovery-oriented.

### Resend Verification

From the authenticated banner:

- the user can request another verification email
- success copy should confirm that a new link has been sent
- failure copy should remain simple and actionable

Resend behavior should use the same auth email boundary and rate-limiting style
as other auth mail.

## UX Notes

The reminder should use existing app patterns and remain unobtrusive but hard to
miss.

Suggested behavior:

- use an `Alert`-style banner in the authenticated shell
- show the current email address when helpful
- provide a primary resend action
- provide secondary guidance such as checking spam or reopening the original
  email

We do not need an OTP entry component in this pass.

## Error Handling

Verification should preserve the current auth tone:

- success and recovery copy should be direct and non-alarming
- invalid or expired verification links can be stated explicitly
- resend failures should not expose provider internals
- banner resend should surface rate-limit failures with the shared auth error
  style where possible

## Testing

We should add coverage for:

- Better Auth verification email hook wiring
- auth email service verification message composition
- Resend transport integration for verification sends
- sign-up or resend flows that trigger verification delivery
- authenticated shell banner behavior for `emailVerified: false`
- absence of the banner for verified users
- verification result page success and failure states

## Future-Compatible Follow-Ups

This design preserves room for later changes without forcing them now:

- make verification blocking for selected routes or high-trust actions
- switch from banner-only reminders to stricter onboarding gates
- add OTP-based verification if product needs a code-entry flow
- combine verification state with richer trust or abuse-prevention policy

Those would be follow-up policy changes, not part of this implementation pass.
