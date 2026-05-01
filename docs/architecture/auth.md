# Authentication Architecture

## Purpose

This document is the source of truth for how authentication currently works in
the codebase across:

- `apps/api`, which owns the authoritative auth runtime
- `apps/app`, which owns auth UI, route gating, and session-aware navigation

It describes the current implementation, not a hypothetical target state.

## Current Scope

Authentication currently supports only:

- email/password sign-up
- email/password sign-in
- email verification
- password reset request
- password reset completion
- sign-out
- session lookup
- route protection for the authenticated app shell
- redirecting authenticated users away from guest-only auth pages

Authentication explicitly does not currently support:

- social auth
- magic links or OTP flows
- redirect-back after login or signup
- roles, permissions, or authorization rules
- custom app-owned auth endpoints such as `/me` or `/viewer`
- a custom app-owned auth service layer that wraps Better Auth behavior

## Architectural Summary

The system is intentionally split into two layers:

1. `apps/api` owns Better Auth configuration, persistence, cookies, rate
   limiting, trusted-origin policy, and the `/api/auth/*` HTTP surface.
2. `apps/app` uses Better Auth's native client against that server contract and
   adds only the minimum app-specific behavior needed for:
   - guest auth forms
   - session-aware route guards
   - authenticated shell rendering
   - sign-out UX

The core rule is:

> Better Auth is the auth system. The app composes around it, but does not
> reimplement or replace its HTTP contract.

## Backend Ownership

### API Entry Point

The API server mounts the auth slice through
`apps/api/src/server.ts` and `apps/api/src/domains/identity/authentication/auth.ts`.

Responsibilities:

- create the Better Auth instance
- mount it at `/api/auth`
- preserve the `/api/auth` prefix when wiring it into the Effect HTTP server
- apply auth-specific CORS handling around the Better Auth web handler

Important implementation detail:

- Effect mount prefixes are stripped by default
- the auth slice opts into `includePrefix: true`
- this is required because Better Auth expects to receive requests with the
  configured base path intact

### Better Auth Configuration

The canonical config lives in
`apps/api/src/domains/identity/authentication/config.ts`.

Current config decisions:

- `basePath` is always `/api/auth`
- `appName` is `"Task Tracker"`
- email/password auth is enabled
- Better Auth remains the native owner of
  `/api/auth/request-password-reset` and `/api/auth/reset-password`
- rate limiting is enabled and stored in the database
- `BETTER_AUTH_BASE_URL` is required
- trusted origins are restricted to known local and sandbox app origins

Current rate-limit rules:

- `POST /sign-in/email`: 5 attempts per 60 seconds
- `POST /sign-up/email`: 3 attempts per 60 seconds
- `POST /send-verification-email`: 3 attempts per 60 seconds

Current note:

- auth config currently defines custom rate-limit rules for sign-in, sign-up,
  and verification email delivery
- password reset revokes existing sessions once the new password is accepted

### Auth Email Runtime Configuration

The auth email boundary adds runtime config in
`apps/api/src/domains/identity/authentication/auth-email-config.ts`.

Required values:

- `AUTH_EMAIL_FROM`

Current defaulted value:

- `AUTH_EMAIL_TRANSPORT`, which defaults to `"noop"` locally and is set to
  `"cloudflare-binding"` by the Cloudflare infra stage
- `AUTH_EMAIL_FROM_NAME`, which defaults to `"Task Tracker"`

`AUTH_EMAIL_TRANSPORT=cloudflare-api` is the local/manual opt-in path for real
email delivery outside Workers. In that mode only, the API also requires
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

### Auth Email Delivery Boundary

Password reset and email verification delivery now cross one narrow app-owned
boundary in `apps/api`:

- `apps/api/src/domains/identity/authentication/auth-email.ts` defines
  `AuthEmailSender`, an auth-domain Effect service for sending password reset,
  verification, and organization invitation mail
- `AuthEmailSender` validates each payload, renders the auth email content,
  and keeps the transport contract provider-neutral through `deliveryKey`
- `apps/api/src/domains/identity/authentication/cloudflare-email-binding-auth-email-transport.ts`
  provides the Cloudflare Workers Email Service binding adapter for deployed
  queue consumers
- `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.ts`
  keeps the Cloudflare REST API adapter available for explicit local/manual
  delivery

Rule:

- Better Auth still owns the reset HTTP endpoints and token semantics
- the app-owned boundary starts at delivery policy, not at route ownership
- auth startup now depends on valid auth email config as well as core Better
  Auth config, because `AuthenticationLive` composes `AuthEmailSender` with
  `CloudflareAuthEmailTransportLive` at boot
- password reset emails carry a stable provider-neutral `deliveryKey` at the
  auth boundary for correlation and transport stability
- that `deliveryKey` stays consistent across transports so future verification
  mail can reuse the same boundary without baking provider-specific naming into
  the domain contract
- verification and organization invitation mail now pass through the same
  `AuthEmailSender` boundary
- Node and sandbox runtimes send auth email through the direct promise bridge
- the Cloudflare Worker runtime enqueues auth email work to Cloudflare Queues
  and consumes it from the same Worker through the `queue()` handler

### Cloudflare Queue Scheduling

In the Cloudflare POC runtime, auth email delivery is scheduled through
Cloudflare Queues instead of `queueMicrotask`.

The API Worker enqueues validated auth email messages during Better Auth hooks.
The same Worker consumes the queue and sends through the existing
`AuthEmailSender` and Cloudflare transport boundary. Queue retries and the
dead-letter queue own durable failure handling.

The Node sandbox runtime continues to use direct promise-based delivery until
the sandbox is moved to Workers.

### Base URL Strategy

The backend now requires one explicit Better Auth base URL:

- `BETTER_AUTH_BASE_URL`

Rules:

- the API fails fast if `BETTER_AUTH_BASE_URL` is missing
- we do not derive the backend auth base URL from request hosts anymore
- local, test, and sandbox entry points are responsible for providing the value

Current defaults by entry point:

- local Portless dev injects `https://api.task-tracker.localhost:1355`
- Playwright auth e2e injects `http://127.0.0.1:3001`
- sandbox containers inject one explicit auth origin into both sides:
  `BETTER_AUTH_BASE_URL` for the API and `VITE_AUTH_ORIGIN` for the app
- when sandbox aliases are healthy, that injected origin is
  `https://<slug>.api.task-tracker.localhost:1355`
- when sandbox aliases are unavailable, that injected origin falls back to the
  loopback API URL such as `http://127.0.0.1:4301`
- local dev and Playwright launchers inject `AUTH_EMAIL_FROM`,
  `AUTH_EMAIL_FROM_NAME`, and `AUTH_EMAIL_TRANSPORT`
- local dev selects `AUTH_EMAIL_TRANSPORT=cloudflare-api` when real Cloudflare
  API credentials are present, otherwise it uses `noop`
- sandbox startup preflight validates the auth email sender address and defaults
  delivery to `noop`

### Trusted Origins and CORS

Auth CORS behavior is intentionally scoped to trusted app origins.

Allowed by default:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `http://127.0.0.1:4173`
- `http://localhost:4173`
- `http://app.task-tracker.localhost:1355`
- `https://app.task-tracker.localhost:1355`
- sandbox app origins matching `http://*.app.task-tracker.localhost:1355`
- sandbox app origins matching `https://*.app.task-tracker.localhost:1355`
- the app-side origin derived from a configured `PORTLESS_URL`

Rules:

- trusted origins may receive credentialed CORS responses
- untrusted origins do not get permissive auth CORS headers
- preflight `OPTIONS` requests from untrusted origins are rejected with `403`
- `Access-Control-Allow-Credentials: true` is set for trusted origins

This is a deliberate allowlist model, not a broad dev-only wildcard.

### Persistence Model

The backend auth schema lives in
`apps/api/src/domains/identity/authentication/schema.ts`.

Current tables:

- `user`
- `session`
- `account`
- `verification`
- `rate_limit`

The database is the source of truth for:

- users
- sessions
- accounts
- verifications
- rate limiting state

The API does not maintain a parallel app-specific session store.

### Database Wiring

`apps/api/src/domains/identity/authentication/database.ts` owns Postgres access
for the auth slice.

Responsibilities:

- create the `pg` connection pool
- validate connectivity on startup
- expose a Drizzle database for Better Auth
- expose Effect SQL / Drizzle layers for future backend composition

Current architectural decision:

- Better Auth uses the Drizzle adapter directly
- the surrounding Effect database layers exist as extension points, not as a
  wrapper around Better Auth today

## Frontend Ownership

### Auth Client Module

`apps/app/src/lib/auth-client.ts` is the single app entry point for Better Auth
client creation.

Responsibilities:

- export `AUTH_BASE_PATH` as `/api/auth`
- derive the API auth origin from the current app origin when needed
- create a shared Better Auth React client

Rules:

- use one shared auth client module
- do not instantiate ad hoc Better Auth clients throughout the app
- do not add custom fetch wrappers or app-owned auth endpoint shims unless a
  real product need appears

### App-Origin to API-Origin Mapping

The app resolves its auth base URL in two steps:

- prefer an explicitly injected `VITE_AUTH_ORIGIN` when one exists
- otherwise rewrite the current app origin to the matching API origin

The fallback host-rewrite behavior is intentionally limited to local and
Portless-style development.

Current mappings:

- `*.app.task-tracker.localhost` -> `*.api.task-tracker.localhost`
- `app.task-tracker.localhost` -> `api.task-tracker.localhost`
- `localhost:3000` or `127.0.0.1:3000` -> port `3001`
- `localhost:4173` or `127.0.0.1:4173` -> port `3001`

This lets the app talk to the API auth handler without hardcoding a single
deployment URL.

### Server-Side Session Lookup Bridge

`apps/app/src/features/auth/get-server-auth-session.ts` is the server-side
session bridge used by the TanStack Start app.

Responsibilities:

- run only on the server via `createServerFn`
- read the incoming request `cookie` header
- derive the correct auth base URL from the request protocol and host
- create a request-scoped Better Auth client
- call `getSession` against the API while forwarding the original cookies

Important rule:

- SSR auth checks use the real incoming cookies
- they do not guess session state on the server

If either the cookie header or auth base URL cannot be resolved, the function
returns `null`.

### Runtime Environment Switch

`apps/app/src/features/auth/require-authenticated-session.ts` and
`apps/app/src/features/auth/redirect-if-authenticated.ts` use
`isServerEnvironment()` to choose the correct session lookup strategy.

Rule:

- SSR uses `getCurrentServerSession()`
- browser runtime uses `authClient.getSession()`

This keeps auth decisions consistent across:

- initial server render
- client-side navigation after hydration

## Route Model

The route split is intentionally simple:

### Public Auth Routes

- `/login`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

These routes all live outside `/_app`, but they do not all share the same
access policy.

- `/login` and `/signup` are guest-only routes
- `/verify-email` is a public verification result route
- `/forgot-password` and `/reset-password` are public auth-recovery routes and
  remain reachable even when a user is already signed in

Behavior:

- `/login` and `/signup`: if a session exists, redirect to `/`
- `/login` and `/signup`: if session lookup fails unexpectedly, treat the user
  as unauthenticated and allow the page to render
- `/verify-email`: render the result route without gating it on session state
- `/forgot-password` and `/reset-password`: render as public recovery routes
  without `redirectIfAuthenticated`

`/login` and `/signup` use
`apps/app/src/features/auth/redirect-if-authenticated.ts`.

`/verify-email` is mounted as a public route without app-shell gating.

`/forgot-password` and `/reset-password` are mounted as public routes without
that guard.

Design rule:

- guest-only entry routes fail open on lookup failure
- verification result routes stay public and should not block on the current
  session state
- public recovery routes stay reachable regardless of session state
- we prefer preserving access to public auth and recovery routes over blocking
  the user due to a transient session-read problem
- verification result and password recovery remain outside `/_app` because
  they are account lifecycle flows, not authenticated product flows

### Protected App Routes

The authenticated app lives under the `/_app` layout route:

- `/_app` resolves the session in `beforeLoad`
- `/_app/` renders the signed-in home screen
- any future route placed under `/_app` inherits the authenticated shell model

Behavior:

- if a session exists, route loading continues
- if no session exists, redirect to `/login`
- if session lookup throws unexpectedly, also redirect to `/login`

This is implemented by
`apps/app/src/features/auth/require-authenticated-session.ts`.

Design rule:

- protected routes fail closed
- infrastructure uncertainty is treated the same as unauthenticated access

### Email Verification Reminder

The authenticated shell now shows verification state without turning it into a
hard access gate.

`apps/app/src/components/app-layout.tsx` renders
`apps/app/src/features/auth/email-verification-banner.tsx` when the session
has an email address and `session.user.emailVerified` is false.

Current behavior:

- the shell stays usable while the reminder is visible
- the reminder offers a resend action from inside the authenticated shell
- resend requests call `authClient.sendVerificationEmail` with the current
  user email and a `/verify-email` callback URL
- the reminder disappears once `session.user.emailVerified` becomes true

Design rule:

- unverified email is a reminder state, not a product lockout
- the authenticated shell should keep working while verification is pending
- resend should stay available from the app shell until verification completes

### Redirect Simplicity Rule

Current redirect behavior is intentionally fixed:

- successful login -> `/`
- successful signup -> `/`
- authenticated visit to `/login` or `/signup` -> `/`
- unauthenticated visit to protected routes -> `/login`
- successful sign-out -> `/login`

We explicitly do not support redirect-back targets yet.

## Authenticated Shell

`apps/app/src/routes/_app.tsx` is the auth boundary for the product shell.

Responsibilities:

- resolve the authenticated session in `beforeLoad`
- pass that session into route context
- render `AuthenticatedAppLayout`

`apps/app/src/features/auth/authenticated-app-layout.tsx` reads the route
context and passes `session.user` into `AppLayout`.

Architectural rule:

- authenticated shell components receive user data from the guarded route
  context
- they do not perform their own session fetches

This avoids duplicate session orchestration inside layout components.

## Form Architecture

### Login

`apps/app/src/features/auth/login-page.tsx` owns the login screen.

Current behavior:

- uses TanStack Form for form state
- validates submit payloads with `Effect/Schema`
- decodes and normalizes input through shared auth schemas
- calls `authClient.signIn.email`
- displays field-level validation inline
- displays safe form-level failure messaging for server/auth errors
- navigates to `/` after success

### Signup

`apps/app/src/features/auth/signup-page.tsx` owns the signup screen.

Current behavior:

- uses TanStack Form for form state
- validates submit payloads with `Effect/Schema`
- requires `name`, `email`, `password`, and `confirmPassword`
- enforces password confirmation match before submit
- calls `authClient.signUp.email`
- displays field-level validation inline
- displays safe form-level failure messaging for server/auth errors
- requests email verification through the auth backend, which delivers a
  verification link to the user
- navigates to `/` after success

### Password Reset Request

`apps/app/src/features/auth/password-reset-request-page.tsx` owns the reset
request screen.

Current behavior:

- uses TanStack Form for form state
- validates the email payload through shared auth schemas
- calls Better Auth's native password reset request flow
- keeps success and failure messaging generic so the response stays
  non-enumerating

### Password Reset Completion

`apps/app/src/features/auth/password-reset-page.tsx` owns the reset completion
screen.

Current behavior:

- uses TanStack Form for form state
- validates password and token inputs before submit
- calls Better Auth's native password reset completion flow
- shows specific invalid-or-expired-link copy for the search-param-driven
  invalid-link state
- keeps failed `resetPassword` submissions on the same generic, safe form-error
  path used elsewhere in auth UI

### Email Verification Result

`apps/app/src/features/auth/email-verification-page.tsx` owns the public
verification result screen.

Current behavior:

- renders on the public `/verify-email` route outside `/_app`
- shows a success or invalid-link result based on the search state
- keeps the result route reachable without requiring an authenticated shell
- links users back to the app or login screen after the result is shown

### Shared Validation Rules

The shared auth schemas live in
`apps/app/src/features/auth/auth-schemas.ts`.

Current input rules:

- email is trimmed, non-empty, and must match a basic email pattern
- password is trimmed and must be at least 8 characters
- signup name is trimmed and must be at least 2 characters
- signup password and confirm password must match

Important rule:

- the form boundary owns normalization and validation before Better Auth is
  called
- the app does not send raw, unvalidated form state directly to Better Auth

## Error Handling Rules

Error handling is intentionally conservative and user-safe.

### Validation Errors

Validation errors come from `Effect/Schema` and are shown inline near the
fields or at the form level.

### Better Auth Failures

`apps/app/src/features/auth/auth-form-errors.ts` maps auth failures to safe
messages.

Rules:

- we do not surface raw Better Auth error payloads directly to users
- rate-limit responses (`429`) map to a specific retry-later message
- other sign-in failures map to a generic credentials-oriented message
- other sign-up failures map to a generic account-creation message
- password reset request responses remain generic and non-enumerating
- the search-param-driven invalid-link state may specifically call out invalid
  or expired links
- submitted reset failures still use the generic reset failure message
- verification resend failures map to a dedicated verification-safe message

This is a deliberate anti-enumeration and UX decision.

### Protected-Route Failures

Rules:

- protected session lookup failure -> redirect to `/login`
- guest-route session lookup failure -> continue rendering guest page
- sign-out failure -> keep the user in place and show a small error message

## Sign-Out Behavior

The user menu in `apps/app/src/components/nav-user.tsx` owns the current
sign-out interaction.

Current behavior:

- call `authClient.signOut()`
- if sign-out succeeds, navigate to `/login`
- if router navigation fails, fall back to `window.location.assign("/login")`
- if sign-out fails, keep the user in place and show an inline error

Rules:

- sign-out should be explicit from authenticated chrome
- failed sign-out should not falsely imply success
- redirect after sign-out is to `/login`, not back to the current page

## Security and Boundary Rules

These are the important current rules we are following.

### We Do

- treat Better Auth as the canonical auth engine
- keep auth mounted at `/api/auth`
- restrict trusted origins to known app origins
- use database-backed rate limiting
- send verification links through `AuthEmailSender`
- revoke existing sessions on successful password reset
- use server-first session lookup for SSR-protected routes
- fail closed for protected routes
- fail open for guest-only routes
- normalize and validate auth form input before submission
- avoid leaking raw auth backend errors into the UI

### We Do Not

- build a parallel custom auth API on top of Better Auth
- create app-owned session endpoints just to reshape Better Auth responses
- duplicate auth logic inside page components when route guards can own it
- support redirect-back targets yet
- gate app access on unverified email by default
- implement authorization concerns like roles or permissions in this slice
- allow arbitrary origins to use credentialed auth CORS

## Component Responsibilities

### Backend

- `apps/api/src/domains/identity/authentication/auth.ts`
  Creates and mounts Better Auth, applies auth CORS, preserves `/api/auth`
  prefixing, and delegates password reset and verification delivery through
  `AuthEmailSender`.
- `apps/api/src/domains/identity/authentication/config.ts`
  Defines auth scope, base URL behavior, trusted origins, and rate limits.
- `apps/api/src/domains/identity/authentication/auth-email-config.ts`
  Defines required auth email runtime config and defaults.
- `apps/api/src/domains/identity/authentication/auth-email.ts`
  Defines the auth email boundary for password reset, verification, and
  organization invitation delivery.
- `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.ts`
  Implements the current auth email transport adapter with Cloudflare.
- `apps/api/src/domains/identity/authentication/schema.ts`
  Defines auth persistence tables.
- `apps/api/src/domains/identity/authentication/database.ts`
  Wires Postgres and Drizzle for the auth slice.

### Frontend

- `apps/app/src/lib/auth-client.ts`
  Shared Better Auth client and app-origin to API-origin mapping.
- `apps/app/src/features/auth/get-server-auth-session.ts`
  SSR bridge that forwards cookies to Better Auth session lookup.
- `apps/app/src/features/auth/require-authenticated-session.ts`
  Protected-route guard.
- `apps/app/src/features/auth/redirect-if-authenticated.ts`
  Guest-only-route guard.
- `apps/app/src/features/auth/login-page.tsx`
  Sign-in UI and submit flow.
- `apps/app/src/features/auth/signup-page.tsx`
  Sign-up UI and submit flow.
- `apps/app/src/features/auth/password-reset-request-page.tsx`
  Password reset request UI with generic response handling.
- `apps/app/src/features/auth/password-reset-page.tsx`
  Password reset completion UI with invalid/expired-link feedback.
- `apps/app/src/features/auth/email-verification-page.tsx`
  Public verification result UI for the `/verify-email` route.
- `apps/app/src/features/auth/email-verification-banner.tsx`
  Authenticated-shell reminder with resend support when email is unverified.
- `apps/app/src/components/nav-user.tsx`
  Sign-out interaction.

## Decision Log

These decisions are currently encoded in the implementation and tests.

- Stay close to Better Auth's native server and client contracts.
- Keep auth scope limited to email/password, email verification, password
  reset, and session handling.
- Keep `/login` and `/signup` guest-only, and keep `/forgot-password` and
  `/reset-password` as public recovery routes outside `/_app`.
- Keep `/verify-email` as a public verification result route outside `/_app`.
- Make the app shell under `/_app` the authenticated boundary.
- Keep verification non-blocking for app access while the authenticated shell
  shows a resend reminder until verification completes.
- Keep redirect destinations simple and fixed.
- Prefer server-first session checks when rendering protected content.
- Use shared schema-based input validation for auth forms.
- Show safe, generic server-error copy instead of backend internals.
- Keep password reset request responses generic while allowing invalid or
  expired reset-link feedback on completion.
- Reuse the auth email boundary for future verification mail instead of
  introducing provider-specific mini-systems.
- Treat sign-out as a real user action with visible failure handling.

## Testing Coverage That Defines Behavior

The current behavior is reinforced by:

- unit tests for auth config and schema shape
- unit tests for auth email delivery boundaries
- unit tests for protected-route and guest-route guards
- unit tests for login, signup, and password reset submit behavior
- unit tests for email verification reminder and result behavior
- integration tests for sign-up, sign-in, sign-out, session reads, and rate
  limiting in the API auth slice
- integration tests for password reset and verification delivery and completion
  behavior in the API auth slice
- Playwright tests for end-to-end login, signup, and route-protection behavior

If a future change conflicts with this document, the tests should be updated in
the same change so the intended architecture stays explicit.
