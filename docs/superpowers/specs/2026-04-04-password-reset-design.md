# Password Reset Design

## Summary

Add password reset as the next native Better Auth account lifecycle flow.

This pass keeps the current authentication architecture intact:

- `apps/api` owns Better Auth configuration, reset-token delivery, and auth email
  infrastructure
- `apps/app` owns the public reset request and reset completion screens
- Better Auth remains the source of truth for the reset HTTP contract

This pass also introduces a swappable backend auth email boundary so the first
provider can be Resend without making Resend part of the domain model.

## Goals

- add architecture-complete password reset support
- keep reset behavior native to Better Auth rather than wrapping it in custom
  auth endpoints
- introduce a provider-agnostic auth email service using Effect
- make Resend the first delivery adapter
- preserve a clean path to later swap the provider to Cloudflare email
- keep the route model simple and consistent with existing auth pages

## Non-Goals

- building a generic transactional email platform in this pass
- adding email verification in the same implementation
- adding social auth, OTP, magic links, or 2FA
- introducing workspace- or organization-aware reset behavior
- adding redirect-back behavior after reset
- making password reset an authenticated in-app flow

## Current Context

The app already supports:

- email/password sign-up
- email/password sign-in
- sign-out
- SSR session lookup
- route protection for the authenticated shell

The architecture intentionally keeps Better Auth native on both the API and the
app. Current auth docs already recommend password reset as the next extension.

We also know two future constraints:

- the product will become multi-tenant
- email delivery should not be coupled permanently to Resend because the email
  provider may later move to Cloudflare

That means the reset flow should be added now, but the email delivery boundary
should be designed carefully.

## Core Decisions

The following decisions are fixed for this design:

1. password reset is the next auth feature to add
2. reset remains a public auth flow outside `/_app`
3. Better Auth's native reset flow remains the core protocol
4. email delivery is abstracted behind an Effect service in `apps/api`
5. Resend is the first adapter, not the domain contract
6. we assume the sending domain exists and do not add production gating logic
7. reset does not become workspace-aware in this pass

## Architecture

### Backend Ownership

`apps/api` continues to own all reset runtime behavior.

Responsibilities added in this pass:

- configure Better Auth password reset email hooks
- build reset URLs that target the app's public reset completion route
- deliver reset mail through an auth email service
- keep provider-specific email code out of Better Auth config shape

We should not add custom API routes like:

- `/api/password-reset/request`
- `/api/password-reset/complete`

unless Better Auth proves insufficient. The default move is to use Better
Auth's native endpoints and compose around them.

### Auth Email Boundary

Add a dedicated backend service in the auth domain:

- `AuthEmailSender`

This service should be defined with `Effect.Service` and expose narrow,
auth-specific operations rather than a wide generic mail API.

Initial operations:

- `sendPasswordResetEmail`

This service owns:

- provider integration
- message construction inputs
- provider failure mapping
- delivery observability

This service should not own:

- generic marketing email behavior
- unrelated application notifications
- event bus orchestration for all future emails

That broader platform is a separate concern and should be explored in its own
track.

### Provider Adapter Shape

First implementation:

- `ResendAuthEmailSender`

Rules:

- keep Resend-specific request formatting inside the adapter
- do not leak Resend types into Better Auth config or route code
- use `Config` for API keys, sender address, and app reset URL configuration
- use structured `Effect.log` calls for send attempts and failures

Expected future swap path:

- keep `AuthEmailSender` stable
- replace or add another live layer, such as `CloudflareAuthEmailSender`

### Better Auth Integration

Password reset should be wired into Better Auth through the native
`emailAndPassword.sendResetPassword` hook.

That hook should:

1. receive the reset URL/token payload from Better Auth
2. delegate to `AuthEmailSender.sendPasswordResetEmail`
3. return Effect-managed failures that map into explicit auth email errors

Important rule:

- Better Auth still defines reset behavior
- our code defines delivery and composition around that behavior

### Domain-Driven Shape

Keep reset mail inside the identity/authentication domain because it is part of
account recovery, not a general messaging feature.

Suggested backend structure:

- auth configuration remains in the existing authentication slice
- auth email service and errors live alongside the auth domain
- Resend adapter lives behind that service boundary

This keeps the boundary aligned with the current architecture:

- auth policy in the auth domain
- provider implementation behind a domain service

### Frontend Ownership

`apps/app` owns public reset UX.

New public routes:

- reset request route, for example `/forgot-password`
- reset completion route, for example `/reset-password`

These routes should:

- live outside `/_app`
- reuse the existing auth card/form style
- use TanStack Form plus `Effect/Schema`
- use the native Better Auth client methods or HTTP contract shape as needed

### Route Semantics

Reset routes stay public even after the product becomes multi-tenant.

Reason:

- password reset recovers identity access
- it does not require an already-selected workspace
- it should work before any future workspace chooser or membership UI

Later multi-workspace support should not change this default.

## User Flows

### Reset Request

Route:

- `/forgot-password`

Fields:

- email

Behavior:

- validate email format on submit
- submit to Better Auth's reset request flow
- always show a generic success message
- do not reveal whether the email exists

Success copy should communicate:

- if an account exists for that email, a reset link will be sent

### Reset Completion

Route:

- `/reset-password`

Inputs:

- reset token from the URL
- new password
- confirm password

Behavior:

- validate password locally with `Effect/Schema`
- submit to Better Auth's reset completion flow
- show task-oriented errors for invalid or expired reset state
- on success, redirect to `/login`

Redirect rule:

- do not add redirect-back behavior in this pass
- successful completion always returns the user to `/login`

## Configuration

Add explicit backend config for auth email delivery.

Expected config shape:

- Resend API key
- auth sender email
- auth sender display name if needed
- app reset completion URL base or app origin

Rules:

- load config through `Config`
- keep config validation close to the auth email adapter
- do not read `process.env` directly in domain logic

We assume the sending domain exists, so this pass does not add feature gating or
environment-based suppression for production delivery.

## Error Model

Use explicit auth email and reset errors.

Examples:

- `AuthEmailConfigurationError`
- `AuthEmailDeliveryError`
- `PasswordResetDeliveryError`

Rules:

- prefer specific tagged errors over generic provider errors
- log provider detail structurally
- present safe, user-oriented copy in the app

Public UX rules:

- reset request fails safely with generic messaging when appropriate
- reset completion can be more specific about invalid or expired tokens because
  the user already has the link

## Testing Strategy

Implementation should follow TDD.

Key backend tests:

- auth config includes password reset delivery hook
- `AuthEmailSender` service composes the expected reset message inputs
- Resend adapter maps provider failures into explicit domain errors
- reset URL generation targets the correct public app route

Key frontend tests:

- request page validates email and submits the expected payload
- request page shows generic success messaging
- completion page validates password and confirm password
- completion page handles invalid or expired reset state safely
- successful completion redirects to `/login`

Key integration checks:

- Better Auth request path is still native
- the app routes remain public, not inside the authenticated shell
- auth email config remains swappable at the layer boundary

## Future Compatibility

### Email Verification

Email verification should reuse the same auth email boundary.

Expected later extension:

- add `sendEmailVerificationEmail` to `AuthEmailSender`
- keep verification delivery in the auth domain

### Multi-Tenancy

Reset should remain identity-level even when users belong to multiple
workspaces.

Rules for the later multi-tenant model:

- password reset should not require choosing a workspace first
- workspace membership should resume after sign-in, not during reset
- do not bake workspace context into reset links unless a future product
  requirement clearly demands it

### Generic Transactional Email Platform

We expect a broader transactional email platform may eventually be useful, and
it will likely want event-driven delivery.

This pass deliberately does not implement that platform.

Instead, it creates a narrow auth email boundary that can later:

- remain as an auth-focused facade over a generic platform
- publish events into a broader email pipeline
- switch providers without changing auth route or Better Auth wiring

That keeps current scope tight while preserving a clean migration path.

## Open Decisions Resolved

These decisions are fixed for the next implementation plan:

- use Better Auth native reset flow
- add public reset request and reset completion routes
- add an Effect-based auth email service
- implement Resend as the first adapter
- assume the sending domain exists
- defer generic transactional email platform work into a separate track
