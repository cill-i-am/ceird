# Authentication Architecture

## Purpose

This document is the source of truth for how authentication currently works in
the codebase across:

- `apps/domain`, which owns the authoritative auth runtime
- `apps/api` and `apps/mcp`, which forward protocol traffic through the private domain Worker
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
- OAuth/OIDC authorization-server configuration for MCP clients
- app-owned OAuth consent UI for Better Auth authorization requests
- MCP resource-server bearer-token validation and tool authorization

Authentication explicitly does not currently support:

- social auth
- magic links or OTP flows
- redirect-back after login or signup
- roles, permissions, or authorization rules
- custom app-owned auth endpoints such as `/me` or `/viewer`
- a custom app-owned auth service layer that wraps Better Auth behavior
- machine-to-machine `client_credentials` grants for Ceird MCP scopes

## Architectural Summary

The system is intentionally split into two layers:

1. `apps/domain` owns Better Auth configuration, persistence, cookies, rate
   limiting, trusted-origin policy, and the `/api/auth/*` HTTP surface.
2. `apps/app` uses Better Auth's native client against that server contract and
   adds only the minimum app-specific behavior needed for:
   - guest auth forms
   - session-aware route guards
   - authenticated shell rendering
   - sign-out UX
   - OAuth consent review and approve/deny actions

The core rule is:

> Better Auth is the auth system. The app composes around it, but does not
> reimplement or replace its HTTP contract.

## Backend Ownership

### Domain Entry Point

The domain server mounts the auth slice through
`apps/domain/src/server.ts` and `apps/domain/src/domains/identity/authentication/auth.ts`.
The API and MCP Workers reach that surface through the `DOMAIN` service binding.

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
`apps/domain/src/domains/identity/authentication/config.ts`.

Current config decisions:

- `basePath` is always `/api/auth`
- `appName` is `"Ceird"`
- email/password auth is enabled
- Better Auth's JWT plugin is enabled so the OAuth Provider can issue and
  verify JWT-backed tokens, with session JWT response headers disabled so the
  existing cookie-backed app session surface is preserved
- the JWT plugin's direct `/api/auth/token` session-token endpoint is disabled;
  OAuth clients must use the OAuth Provider token endpoint
- Better Auth's OAuth Provider plugin is configured for MCP client
  authorization with the scopes `openid`, `profile`, `email`,
  `offline_access`, `ceird:read`, `ceird:write`, and `ceird:admin`
- unauthenticated dynamic OAuth client registration is enabled for MCP clients,
  defaulting newly registered clients to the identity scopes plus `ceird:read`
  while allowing the full Ceird MCP scope set
- OAuth grants are limited to authorization-code and refresh-token flows;
  client-credentials tokens are intentionally not enabled for Ceird scopes
- the OAuth Provider points clients at the existing app login and consent pages
  through app-owned absolute URLs for `/login` and `/oauth/consent`
- Better Auth remains the native owner of
  `/api/auth/request-password-reset` and `/api/auth/reset-password`
- rate limiting is enabled and stored in the database
- `BETTER_AUTH_BASE_URL` is required
- `MCP_RESOURCE_URL` is configured from the stage MCP hostname for deployed
  Workers; when omitted in package-local runs the valid MCP resource audience
  defaults to the API origin plus `/mcp`
- `OAUTH_ISSUER_URL` is optional; when omitted OAuth/OIDC issuer metadata
  defaults to `BETTER_AUTH_BASE_URL`; explicit issuer URLs are canonicalized to
  match Better Auth discovery metadata before token signing uses them
- trusted origins are restricted to known local origins, the configured app
  origin, and explicit `AUTH_TRUSTED_ORIGINS` entries such as tenant wildcard
  patterns (`https://*--pr-123.ceird.app`)
- `AUTH_COOKIE_PREFIX` can set Better Auth's cookie prefix for stage-isolated
  cookie names
- `AUTH_COOKIE_DOMAIN`, when provided, is the authoritative cross-subdomain
  cookie parent and takes precedence over app/API-derived cookie sharing
- explicit cookie domains are validated as parent domains of the configured
  auth/app hosts; they cannot include schemes, ports, paths, or wildcards
- canonical deployed app/API sibling domains share the configured parent cookie
  domain, for example `app.ceird.app` and `api.ceird.app` use `ceird.app`
- production Alchemy sets the cookie domain to the tenant base domain, normally
  `ceird.app`, so `app.ceird.app`, `api.ceird.app`, and tenant hosts share
  the same session
- non-production Alchemy stages do not set a shared apex cookie domain by
  default, because a `ceird.app` parent cookie would send production sessions
  to preview/staging Workers under the same apex
- non-production neutral app/API hosts still share their stage parent domain
  such as `pr-123.ceird.app` through the app/API sibling-domain fallback
- deployed stages isolate Better Auth cookie names with the stage-specific
  `AUTH_COOKIE_PREFIX`
- package-local localhost development keeps host-scoped cookies because tenant
  hosts are disabled there

### Tenant Hosts And Auth

Auth entry routes stay on the neutral app host for each stage. Login, signup,
password reset, email verification, OAuth consent, invitation acceptance, and
organization creation are app routes on `app.ceird.app`,
`app.<stage>.ceird.app`, or `app.pr-<number>.ceird.app`; tenant hosts are for
authenticated organization context, not for owning the auth entry flow.

Better Auth accepts tenant browser origins through `AUTH_TRUSTED_ORIGINS`,
which infra derives from the stage tenant route pattern. Production trusts
`https://*.ceird.app`; non-production stages trust
`https://*--{tenantStageAlias}.ceird.app`. The neutral app origin is still
trusted explicitly.

Cookies are scoped to the tenant base domain only in production. Production
uses `ceird.app`, so neutral app/API hosts and tenant hosts can share the
session. Non-production stages keep cookies scoped to the neutral app/API stage
parent, such as `pr-123.ceird.app`, rather than the shared apex. This prevents
preview or staging Workers from receiving production cookies while preserving
neutral-host auth for branch deploys. Cross-stage isolation also uses the
stage-specific `AUTH_COOKIE_PREFIX` (`ceird-main`, `ceird-pr-123`, or a
branch-derived prefix). Package-local localhost development keeps tenant hosts
disabled and uses host-scoped cookies.

Current OAuth/OIDC discovery endpoints provided by Better Auth under the auth
base path:

- `/api/auth/.well-known/oauth-authorization-server`
- `/api/auth/.well-known/openid-configuration`

The MCP resource server also exposes protected-resource metadata at:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/<mcp-resource-path>`

Ceird does not use the packaged `@xmcp-dev/better-auth` adapter or ship the
`xmcp` runtime in `apps/api` or `apps/mcp`. MCP auth uses Ceird's existing
Better Auth OAuth Provider runtime, and MCP HTTP uses the
`effect/unstable/ai` MCP server layer mounted inside the private domain Worker.

### MCP Bearer Sessions

The MCP endpoint validates OAuth Provider access tokens as JWT bearer tokens.
Token verification requires:

- issuer equal to the configured OAuth issuer
- audience equal to `MCP_RESOURCE_URL`
- a token subject (`sub`) matching the Better Auth user
- a Better Auth session id (`sid`)
- an OAuth client id (`client_id`)

MCP tool execution does not synthesize cookie headers. It resolves the
organization actor by loading the Better Auth `session` row from `sid`, checking
that the row belongs to `sub`, reading the active organization id from that
session, and then loading the user's `member` role in that organization. The
Effect AI MCP router receives the verified identity through Effect
context/layers, and the same domain authorization services used by the HTTP API
decide whether that actor can perform each operation.
The Cloudflare domain Worker keeps initialized Effect AI MCP apps in an
isolate-local authorized-app cache keyed by Better Auth session id, user id,
OAuth client id, and normalized scopes. Deployed stages may tune that cache with
`CEIRD_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES` and
`CEIRD_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS`; app-owned Worker infra maps those
stage inputs to the runtime `MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES` and
`MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS` environment keys. Package-local runs use
runtime defaults when those values are not provided.

Current Ceird MCP scopes are:

- `ceird:read` for read-only labels, sites, jobs, and options tools
- `ceird:write` for job comments and job-label assignment tools
- `ceird:admin` for organization activity and administrative tools; this scope
  also satisfies read and write tool checks

Current rate-limit rules:

- `POST /sign-in/email`: 5 attempts per 60 seconds
- `POST /sign-up/email`: 3 attempts per 60 seconds
- `POST /send-verification-email`: 3 attempts per 60 seconds

Current note:

- auth config currently defines custom rate-limit rules for sign-in, sign-up,
  and verification email delivery
- Better Auth still stores rate-limit state in the `rate_limit` table, but the
  auth runtime installs a small database-backed `customStorage` wrapper so
  rate-limit reads and writes can be measured as `auth.rateLimitReadMs` and
  `auth.rateLimitWriteMs`
- password reset revokes existing sessions once the new password is accepted

### Auth Email Runtime Configuration

The auth email boundary adds runtime config in
`apps/domain/src/domains/identity/authentication/auth-email-config.ts`.

Required values:

- `AUTH_APP_ORIGIN`
- `AUTH_EMAIL_FROM`

Current defaulted value:

- `AUTH_EMAIL_FROM_NAME`, which defaults to `"Ceird"`

Environment variables configure email metadata, not transport topology.
Package-local Node runtimes compose `AuthEmailTransport.Local`, which uses
deterministic development delivery. The Cloudflare Worker composes
`AuthEmailTransport.CloudflareBinding` directly and fails fast when the
`AUTH_EMAIL` Worker binding is missing.

### Auth Email Delivery Boundary

Password reset and email verification delivery now cross one narrow domain-owned
boundary in `apps/domain`:

- `apps/domain/src/domains/identity/authentication/auth-email.ts` defines
  `AuthEmailSender`, an auth-domain Effect service for sending password reset,
  verification, and organization invitation mail
- `apps/domain/src/domains/identity/authentication/auth-email-transport.ts`
  defines the provider-neutral `AuthEmailTransport` capability and its
  `Development`, `CloudflareBinding`, and `Local` layers
- `AuthEmailSender` validates each payload, renders the auth email content,
  and keeps the transport contract provider-neutral through `deliveryKey`
- `apps/domain/src/domains/identity/authentication/cloudflare-email-binding-auth-email-transport.ts`
  provides the Cloudflare Workers Email Service binding adapter for deployed
  queue consumers

Rule:

- Better Auth still owns the reset HTTP endpoints and token semantics
- the app-owned boundary starts at delivery policy, not at route ownership
- auth startup now depends on valid auth email config as well as core Better
  Auth config, because `AuthenticationLive` composes `AuthEmailSender` through
  the auth email transport capability
- password reset emails carry a stable provider-neutral `deliveryKey` at the
  auth boundary for correlation and transport stability
- that `deliveryKey` stays consistent across transports so future verification
  mail can reuse the same boundary without baking provider-specific naming into
  the domain contract
- verification and organization invitation mail now pass through the same
  `AuthEmailSender` boundary
- package-local Node runtimes send auth email through the direct promise bridge
  with `AuthEmailTransport.Local`
- the Cloudflare Worker runtime enqueues auth email work to Cloudflare Queues
  and consumes it from the same Worker through the `queue()` handler with
  `AuthEmailTransport.CloudflareBinding`

### Cloudflare Queue Scheduling

In the Cloudflare Worker runtime, auth email delivery is scheduled through
Cloudflare Queues instead of `queueMicrotask`.

The domain Worker enqueues validated auth email messages during Better Auth hooks.
The same Worker consumes the queue and sends through the existing
`AuthEmailSender` and Cloudflare transport boundary. Queue retries and the
dead-letter queue own durable failure handling.
Queue scheduling records `auth.emailQueueSendMs` in the active auth request
observation. Because Better Auth schedules verification and reset delivery as
background work in the Cloudflare runtime, the Worker also logs background task
completion/failure with the propagated request id and accumulated auth timings.

Package-local Node runtime continues to use direct promise-based delivery.

### Base URL Strategy

The backend now requires one explicit Better Auth base URL:

- `BETTER_AUTH_BASE_URL`

Rules:

- the API fails fast if `BETTER_AUTH_BASE_URL` is missing
- we do not derive the backend auth base URL from request hosts anymore
- local, test, and Alchemy entry points are responsible for providing the value

Current defaults by entry point:

- package-local development injects `http://127.0.0.1:3001`
- Playwright's package-local fallback injects `http://127.0.0.1:3001`
- Alchemy stages inject one explicit auth origin into both sides through
  `BETTER_AUTH_BASE_URL` for the API and app/API origin env for the app
- local dev and Playwright launchers inject `AUTH_EMAIL_FROM` and
  `AUTH_EMAIL_FROM_NAME`
- local dev uses the deterministic development transport
- Alchemy stage config validates the deployed auth email sender address

### Trusted Origins and CORS

Auth CORS behavior is intentionally scoped to trusted app origins.

Allowed by default:

- `http://127.0.0.1:3000`
- `http://localhost:3000`
- `http://127.0.0.1:4173`
- `http://localhost:4173`

The configured `AUTH_APP_ORIGIN` is also added exactly when it is a valid
absolute origin. The old worktree sandbox alias patterns are not trusted by
default; Alchemy stages provide explicit app/API origins through stack env.

Rules:

- trusted origins may receive credentialed CORS responses
- untrusted origins do not get permissive auth CORS headers
- preflight `OPTIONS` requests from untrusted origins are rejected with `403`
- `Access-Control-Allow-Credentials: true` is set for trusted origins

This is a deliberate allowlist model, not a broad dev-only wildcard.

### Persistence Model

The backend auth schema lives in
`apps/domain/src/domains/identity/authentication/schema.ts`.

Current tables:

- `user`
- `session`
- `account`
- `verification`
- `rate_limit`
- `jwks`
- `oauth_client`
- `oauth_refresh_token`
- `oauth_access_token`
- `oauth_consent`

The database is the source of truth for:

- users
- sessions
- accounts
- verifications
- rate limiting state
- JWT signing keys for OAuth/OIDC token issuance
- OAuth client registrations, tokens, and consent records

Ceird does not maintain a parallel app-specific session store.

### Database Wiring

`apps/domain/src/platform/database/database.ts` owns Postgres access, including
the auth slice.

Responsibilities:

- create the `pg` connection pool
- expose a Drizzle database for Better Auth
- expose Effect SQL layers for domain-owned repositories

Current architectural decision:

- Better Auth uses the Drizzle adapter directly
- the surrounding Effect database layers support domain repositories, not a
  wrapper around Better Auth

## Frontend Ownership

### Auth Client Module

`apps/app/src/lib/auth-client.ts` is the single app entry point for Better Auth
client creation.

Responsibilities:

- export `AUTH_BASE_PATH` as `/api/auth`
- derive the API auth origin from the current app origin when needed
- create a shared Better Auth React client
- install Better Auth client plugins for organization and OAuth provider flows

Rules:

- use one shared auth client module
- do not instantiate ad hoc Better Auth clients throughout the app
- do not add custom fetch wrappers or app-owned auth endpoint shims unless a
  real product need appears

### App-Origin to API-Origin Mapping

The app resolves its auth base URL in two steps:

- prefer the explicitly injected API origin: `API_ORIGIN` on the app server and
  `VITE_API_ORIGIN` in the browser bundle
- otherwise rewrite the current app origin to the matching API origin in the
  narrow fallback cases below

The fallback host-rewrite behavior is intentionally limited to local and legacy
localhost-alias development.

### OAuth Consent UI

`apps/app/src/features/auth/oauth-consent-page.tsx` owns the public
`/oauth/consent` review screen used by Better Auth's OAuth Provider.

Current behavior:

- parses the authorization query for display through the TanStack Router route
- shows the requesting `client_id`, requested scopes, and redirect host
- leaves signed-query verification to Better Auth
- submits approve or deny decisions through `authClient.oauth2.consent`
- relies on the OAuth provider client plugin to forward the original signed
  `window.location.search` query on submit
- avoids route hotkeys because consent is security-sensitive and should require
  an explicit focused button action

Current mappings:

- injected `API_ORIGIN` or `VITE_API_ORIGIN` wins when present
- conventional `app.<domain>` origins map to matching `api.<domain>` origins
- `app.localhost` maps to `api.localhost`
- `localhost:3000` or `127.0.0.1:3000` -> port `3001`
- `localhost:4173` or `127.0.0.1:4173` -> port `3001`

This lets the app talk to the API auth handler without hardcoding a single
deployment URL while keeping removed sandbox worktree aliases out of the
runtime fallback path.

### Server-Side Session Lookup Bridge

`apps/app/src/features/auth/server-session.ts` is the server-side session
bridge used by the TanStack Start app.

Responsibilities:

- run only on the server via `createServerOnlyFn`
- read the incoming request `cookie` header
- resolve the server API origin from the Worker `API_ORIGIN` binding or local
  process env
- normalize Better Auth secure cookie names for local API handoffs
- call `/api/auth/get-session` against the API while forwarding the original
  cookies and public forwarded host/protocol headers

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

- SSR uses `getCurrentServerSession()` and the request-scoped app context when
  TanStack Start middleware has already hydrated it
- browser runtime uses `getCachedClientAppContext()`, which calls the
  `getCurrentAppContext` server function and reuses the decoded app auth
  snapshot briefly during route transitions

This keeps auth decisions consistent across:

- initial server render
- client-side navigation after hydration

### App Auth Context Snapshot

The app shell has a narrow, schema-validated context boundary under
`apps/app/src/features/auth`:

- `app-context-types.ts` defines the `Effect/Schema` contracts for the server
  auth session and app auth context snapshot, including branded session, user,
  and organization IDs
- `auth-request-context.server.ts` reads the current request cookies, forwards
  the public host/protocol headers to Better Auth, and builds the snapshot
- `app-context-middleware.ts` wires TanStack Start request middleware for app
  routes and function middleware for app-owned auth/organization server
  functions
- `app-context-functions.ts` exposes the browser-readable
  `getCurrentAppContext` server function
- `app-context-client-cache.ts` and `app-context-client-cache-state.ts` keep a
  short-lived browser promise cache for route guards without importing the
  server-function path into auth mutation chunks

Organization routes ask the snapshot to hydrate the organization list and the
current active member role. The `_app` parent route reads that snapshot first,
then `_app/_org` resolves the active organization and only falls back to Better
Auth client organization APIs when the snapshot did not contain enough
organization context.

Rules:

- app auth context is only for shell identity and organization context:
  session, active organization, organization list, and current role
- raw Better Auth session payloads are decoded server-side with the session
  token present, then the token is stripped before the app context snapshot or
  browser cache can observe the session
- product data stays on the domain API lane rather than moving through app
  server functions
- route guards decode snapshot data with `Effect/Schema` before trusting it
- sign-in, sign-up, sign-out, organization creation, invitation acceptance, and
  active-organization switching clear the browser auth/organization caches

### Organization Slug Contract

Organization slugs are generated and validated by `@ceird/identity-core`.
The shared slug contract caps slugs at 40 characters so tenant DNS labels can
fit `{slug}--{tenantStageAlias}` within the 63-character DNS label limit, and
rejects `app`, `api`, `agent`, and `mcp` because those labels are reserved for
Ceird system hosts. Generated slugs for organizations with those names receive
an `-org` suffix before creation.

Domain persistence enforces the same contract on the Better Auth organization
table: `organization_slug_format_chk` checks the slug format and the 40-character
maximum length, and rejects reserved system labels. App-owned organization
creation retry logic also uses the shared identity-core suffix helper, which
truncates the base slug before appending a random suffix so conflict retries
remain inside the shared slug contract.

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
- `/login` and `/signup`: if there is no session, render the public page
- `/login` and `/signup`: if session lookup fails unexpectedly, let the failure
  surface so broken auth infrastructure is observable
- `/verify-email`: render the result route without gating it on session state
- `/forgot-password` and `/reset-password`: render as public recovery routes
  without `redirectIfAuthenticated`

`/login` and `/signup` use
`apps/app/src/features/auth/redirect-if-authenticated.ts`.

`/verify-email` is mounted as a public route without app-shell gating.

`/forgot-password` and `/reset-password` are mounted as public routes without
that guard.

Design rule:

- guest-only entry routes only continue for a positive no-session result
- verification result routes stay public and should not block on the current
  session state
- public recovery routes stay reachable regardless of session state
- unexpected session-read failures should not be silently converted into
  unauthenticated state
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
- if session lookup throws unexpectedly, let the failure surface so the route
  does not mask auth infrastructure or schema drift as a normal login redirect

This is implemented by
`apps/app/src/features/auth/require-authenticated-session.ts`.

Design rule:

- protected routes fail closed
- explicit no-session results are treated as unauthenticated access
- infrastructure uncertainty and malformed session payloads are observable
  failures

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
- requires `name`, `email`, and `password`
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
- password is not trimmed and must be at least 8 characters
- signup name is trimmed and must be at least 2 characters

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

- protected no-session result -> redirect to `/login`
- guest-route no-session result -> continue rendering guest page
- unexpected session lookup failure -> surface the error instead of pretending
  the user is signed out
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
- keep auth rate-limit storage observable through the measured custom storage
  wrapper
- send verification links through `AuthEmailSender`
- revoke existing sessions on successful password reset
- use server-first session lookup for SSR-protected routes
- fail closed for protected routes
- keep guest-only routes public only after a successful no-session lookup
- surface unexpected auth lookup failures instead of swallowing them
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

- `apps/domain/src/domains/identity/authentication/auth.ts`
  Creates and mounts Better Auth, applies auth CORS, preserves `/api/auth`
  prefixing, and delegates password reset and verification delivery through
  `AuthEmailSender`.
- `apps/domain/src/domains/identity/authentication/config.ts`
  Defines auth scope, base URL behavior, trusted origins, and rate limits.
- `apps/domain/src/domains/identity/authentication/auth-email-config.ts`
  Defines required auth email runtime config and defaults.
- `apps/domain/src/domains/identity/authentication/auth-email.ts`
  Defines the auth email boundary for password reset, verification, and
  organization invitation delivery.
- `apps/domain/src/domains/identity/authentication/cloudflare-email-binding-auth-email-transport.ts`
  Implements the deployed auth email transport adapter for the Cloudflare Email
  Worker binding.
- `apps/domain/src/domains/identity/authentication/schema.ts`
  Defines auth persistence tables.
- `apps/domain/src/platform/database/schema.ts`
  Re-exports the auth schema into the shared Drizzle database schema.

### Frontend

- `apps/app/src/lib/auth-client.ts`
  Shared Better Auth client and app-origin to API-origin mapping.
- `apps/app/src/features/auth/server-session.ts`
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
- `apps/app/src/features/auth/oauth-consent-page.tsx`
  OAuth consent review UI for the `/oauth/consent` route.
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
