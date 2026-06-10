# Authentication Architecture

## Purpose

This document is the source of truth for how authentication currently works in
the codebase across:

- `apps/domain`, which owns the authoritative auth runtime
- `apps/api` and `apps/mcp`, which forward protocol traffic through the private domain Worker
- `apps/app`, which owns auth UI, route gating, and session-aware navigation

It describes the current implementation, not a hypothetical target state.
The current auth/organization authorization split is mapped in
[`auth-organization-permission-matrix.md`](auth-organization-permission-matrix.md).
Pending Better Auth hardening decisions are tracked in
[`better-auth-decision-log.md`](better-auth-decision-log.md).

## Current Scope

Authentication currently supports only:

- email/password sign-up
- email/password sign-in
- email verification
- password reset request
- password reset completion
- Cloudflare Turnstile captcha for selected public auth flows when enabled
- profile updates
- verified email-change request and completion
- authenticated password change
- sign-out
- session lookup
- account security settings with active-session listing and other-session
  revocation
- account security settings with connected-app listing and OAuth/MCP consent
  disconnect
- account security settings with optional TOTP two-factor enrollment, backup
  code acknowledgement/regeneration, and disable controls
- inline two-factor login challenge with TOTP and backup-code verification
- versioned Better Auth secret rotation config
- verified-email gates for high-trust organization and OAuth/MCP actions
- route protection for the authenticated app shell
- redirecting authenticated users away from guest-only auth pages
- Better Auth organization creation, active organization switching,
  invitations, invitation acceptance, member listing, member removal, and member
  role changes
- Ceird domain authorization for organization actors and role-scoped workflows
- OAuth/OIDC authorization-server configuration for MCP clients
- app-owned OAuth consent UI for Better Auth authorization requests
- app-owned connected-app management for user-approved OAuth/MCP clients
- owner/admin organization security activity review
- Better Auth two-factor persistence and endpoints for optional TOTP plus backup
  codes
- MCP resource-server bearer-token validation and tool authorization

Authentication explicitly does not currently support:

- social auth
- magic links or OTP flows
- redirect-back after login or signup
- passkeys, API keys, SSO, or SCIM
- user-defined organization roles or Better Auth dynamic access control
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
  and rejecting `ceird:write` or `ceird:admin`; write/admin clients must be
  manually registered or approved through a future accountable owner/admin flow
- dynamic client registration follows Better Auth's native grant default:
  clients that omit `grant_types` are persisted with `authorization_code` only,
  even though Ceird's default registration scope includes `offline_access`;
  clients that need their registered metadata to advertise refresh-token support
  must request `grant_types: ["authorization_code", "refresh_token"]`. Runtime
  token issuance remains Better Auth-native in this policy-only spike; Ceird
  does not add a separate per-client grant enforcement layer here
- Ceird normalizes accepted dynamic client registration requests to public
  OAuth clients by forwarding `token_endpoint_auth_method: "none"` to Better
  Auth, including authenticated registrations that omit the field. Explicit
  confidential client metadata such as
  `token_endpoint_auth_method: "client_secret_basic"` or `type: "web"` is
  rejected before Better Auth can issue a client secret.
- Better Auth's authenticated OAuth client write endpoints
  (`/oauth2/create-client`, `/oauth2/update-client`, client secret rotation,
  delete-client, and their admin variants) and native consent-management
  endpoints (`/oauth2/get-consent`, `/oauth2/get-consents`,
  `/oauth2/update-consent`, and `/oauth2/delete-consent`) are disabled at the
  Ceird auth handler boundary so
  connected-app disconnect always flows through Ceird's audited revoke path
- dynamic client registration rejects unsafe redirect and metadata shapes before
  Better Auth persists a client: non-HTTPS redirects outside local/dev,
  loopback redirects outside local/dev, wildcard or fragment redirects,
  malformed URL metadata, client-credentials or unsupported grants, unsupported
  response types, repeated or oversized scope metadata, consent-skipping
  attempts, unsupported metadata fields, malformed array metadata, oversized
  pre-handler request bodies, and oversized client metadata
- OAuth grants are limited to authorization-code and refresh-token flows;
  client-credentials tokens are intentionally not enabled for Ceird scopes
- the OAuth Provider points clients at the existing app login and consent pages
  through app-owned absolute URLs for `/login` and `/oauth/consent`
- `ceird:*` OAuth consent is organization-scoped through Better Auth
  `postLogin.consentReferenceId`; the stored consent reference id is the active
  Better Auth organization id, while identity-only consent remains account-level
- connected-app management uses Better Auth's `oauth_consent` rows as the grant
  source of truth. `GET /user/connected-apps` returns the current user's
  consented OAuth/MCP clients with account/workspace context, grouped scopes,
  redirect hosts, grant timestamps, and active token counts. `DELETE
/user/connected-apps/:grantId` deletes the consent, revokes matching active
  refresh tokens, deletes matching DB-backed access tokens, and records
  `oauth_consent_revoked` without exposing stored token material. Already
  issued JWT access tokens can remain valid outside resources that perform
  live-consent checks until they expire.
- refresh-token grants pre-check that the hashed Better Auth refresh-token row
  still has a matching `oauth_consent` row whose scopes cover the refresh-token
  scopes before Better Auth can rotate it. Missing or narrowed consent returns
  `invalid_grant`; uninspectable token requests and storage failures fail
  closed with sanitized telemetry.
- the database enforces at most one consent per user/client/account or
  user/client/workspace reference and rejects new active DB-backed OAuth token
  rows unless a matching consent row still exists with covering scopes. This
  closes refresh/disconnect races where Better Auth would otherwise insert a
  rotated token after consent deletion.
- if a `ceird:*` request reaches the post-login authorization step without an
  active organization, Better Auth redirects to the app consent route for a
  blocking workspace warning; server-side consent approval still fails with
  `OAUTH_ACTIVE_ORGANIZATION_REQUIRED` if no active organization exists
- email/password auth uses an explicit 12 to 256 character password length
  policy through Better Auth `minPasswordLength` and `maxPasswordLength`
- password creation and mutation paths use Ceird's Better Auth password
  compromise check plugin for `/sign-up/email`, `/change-password`, and
  `/reset-password`; deployed-looking auth config enables it by default, while
  `CEIRD_LOCAL_DEV=true` or a strict loopback/`.localhost` auth base URL keeps it
  disabled unless explicitly overridden
- Better Auth's captcha plugin is enabled when `AUTH_CAPTCHA_ENABLED=true`
  using Cloudflare Turnstile. The first rollout protects `/sign-up/email`,
  `/request-password-reset`, and `/send-verification-email`; ordinary
  `/sign-in/email` is intentionally not always challenged. Conditional captcha
  after repeated failed sign-in attempts is deferred to `TSK-116`.
- `AUTH_CAPTCHA_SITE_VERIFY_URL_OVERRIDE` is accepted only for strict loopback
  or `.localhost` verifier stubs. Hostnames that merely start with `127.`, such
  as `127.evil.example`, are rejected at both the domain config and Alchemy
  stage config boundaries.
- Better Auth remains the native owner of
  `/api/auth/request-password-reset` and `/api/auth/reset-password`
- Better Auth remains the native owner of profile updates, verified email
  changes, and password changes; the app only renders forms around those client
  APIs
- rate limiting is enabled and stored in the database. `rate_limit` rows are
  mutable limiter state and are retained for 48 hours after `last_request`,
  which is greater than the current largest configured limiter window of 24
  hours. The first release uses one uniform retention horizon for all keys.
- `BETTER_AUTH_BASE_URL` is required
- `BETTER_AUTH_SECRET` is required as the legacy/current fallback secret and
  must be at least 32 characters
- `BETTER_AUTH_SECRETS` is optional versioned rotation material formatted as
  comma-separated `<version>:<secret>` entries, for example
  `2:current-secret,1:previous-secret`; versions must be unique non-negative
  integers, each secret must be at least 32 characters, and the highest version
  is passed to Better Auth first as the current signing material
- `AUTH_PASSWORD_COMPROMISE_CHECK_ENABLED` optionally overrides the password
  compromise check. When omitted, the check is enabled unless
  `CEIRD_LOCAL_DEV=true` or `BETTER_AUTH_BASE_URL` is strict loopback or
  `.localhost`, so missing `NODE_ENV` does not disable deployed-stage password
  screening.
- `AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE` optionally points the
  password compromise check at a strict loopback or `.localhost` range API stub
  for deterministic tests and local browser smoke runs; deployed stages should
  use the default HIBP provider.
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
- Alchemy sets the cookie domain to the tenant base domain, normally
  `ceird.app`, so neutral app/API hosts and tenant hosts share the same session
  in both production and non-production stages
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

Cookies are scoped to the tenant base domain for deployed Alchemy stages.
Production uses `ceird.app`; a PR preview also uses `ceird.app` because its
tenant host shape is `org--pr-123.ceird.app`, which cannot share cookies with
`app.pr-123.ceird.app` through the narrower `pr-123.ceird.app` parent. Better
Auth cookie names stay isolated with the stage-specific `AUTH_COOKIE_PREFIX`
(`ceird-main`, `ceird-pr-123`, or a branch-derived prefix), so preview Workers
do not accept production sessions even though browsers may send multiple
stage-prefixed cookies under the shared apex. Package-local localhost
development keeps tenant hosts disabled and uses host-scoped cookies.

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
The `TSK-69` evaluation records the decision to keep this OAuth Provider plus
`mcpHandler` path, reject Better Auth's standalone MCP plugin, and defer Agent
Auth until it is stable and product-led:
[`better-auth-mcp-agent-auth-evaluation.md`](better-auth-mcp-agent-auth-evaluation.md).

### MCP Bearer Sessions

The MCP endpoint validates OAuth Provider access tokens as JWT bearer tokens.
Token verification requires:

- issuer equal to the configured OAuth issuer
- audience equal to `MCP_RESOURCE_URL`
- a token subject (`sub`) matching the Better Auth user
- a Better Auth session id (`sid`)
- an OAuth client id from Better Auth's JWT `azp` claim, with `client_id` still
  accepted for compatible callers

After JWT verification, the domain Worker also checks that a matching
`oauth_consent` row still exists for the token user, OAuth client id, consent
reference id, and token scopes. This check runs before the isolate-local
authorized-app cache is used, so disconnecting a connected app immediately
prevents future MCP requests even if a previously issued access token has not
expired yet. Storage or layer failures fail closed as `invalid_token` and emit
sanitized warning telemetry.

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
- `POST /request-password-reset`: 3 attempts per 60 seconds
- `POST /send-verification-email`: 3 attempts per 60 seconds
- `POST /change-email`: 3 attempts per 60 seconds
- `POST /change-password`: 5 attempts per 60 seconds
- `POST /oauth2/register`: 5 attempts per 60 seconds
- `POST /organization/invite-member`: 30 attempts per 60 minutes by client IP,
  actor, and recipient email; 200 attempts per organization per 24 hours

Current note:

- auth config currently defines custom rate-limit rules for sign-in, sign-up,
  password reset request, verification email delivery, change email, change
  password, dynamic OAuth client registration, and organization invitations
- client IP resolution for Better Auth rate limits and Ceird atomic abuse
  reservations checks `CF-Connecting-IP` first, then `X-Forwarded-For`, matching
  the deployed Cloudflare Worker path while retaining local/proxy fallback
- Better Auth still stores rate-limit state in the `rate_limit` table, but the
  auth runtime installs a small database-backed `customStorage` wrapper so
  rate-limit reads and writes can be measured as `auth.rateLimitReadMs` and
  `auth.rateLimitWriteMs`
- public abuse endpoints (`sign-in`, `sign-up`, password reset request,
  verification resend, dynamic OAuth client registration, organization
  invitation submission) also use an atomic pre-handler reservation under
  `ceird-auth-abuse:*` rate-limit keys; reservation failures fail closed with
  `AUTH_RATE_LIMIT_UNAVAILABLE` and a short `Retry-After`, and over-limit
  reservations return `429` before Better Auth performs endpoint side effects
- delivery endpoints reserve additional flow-specific keys before email side
  effects: password reset by target email, verification resend by target email
  and authenticated user when available, change-email confirmation by
  destination email and authenticated user, and organization invitation by
  recipient email. Email-derived key components are HMAC digests using the
  active Better Auth secret, so the `rate_limit` table and telemetry do not
  store raw recipient addresses for those counters.
- organization invitation submission also reserves actor and organization
  scoped keys when a Better Auth session and active organization can be
  resolved: 30 invitations per actor per hour and 200 invitations per
  organization per day. An explicit invite `organizationId` must match the
  active session organization before Ceird delegates to Better Auth.
- oversized, unreadable, or unsupported delivery request bodies fail before
  Better Auth side effects so malformed padding cannot bypass flow-specific
  email counters
- Better Auth's organization plugin enforces the first-release normal-path
  structural limits for organization creation, member count, and pending
  invitations: 10 organizations per user, 200 members per organization, and
  100 pending invitations per organization. Ceird also checks the 10
  organizations-per-user cap before invitation acceptance so accepted invites
  cannot bypass the creation-only plugin limit.
- `TSK-115` tracks database-atomic cardinality enforcement for concurrent
  organization creation, invitation creation, and invitation acceptance races.
- authenticated settings endpoints (`change-email` and `change-password`) also
  use atomic pre-handler reservations while storage is healthy, but reservation
  failures fail open so a rate-limit storage outage does not block an already
  authenticated account-management action
- Better Auth `customStorage` rate-limit reads fail open with warning
  telemetry; this covers response-accounting reads after endpoint side effects
  and any Better Auth request-time limiter path that is not covered by Ceird's
  pre-handler reservation
- rate-limit storage write failures remain non-blocking and emit sanitized
  warning telemetry
- fail-closed public abuse endpoints require a resolvable client IP for atomic
  reservation; if the IP cannot be resolved, they return the stable
  `AUTH_RATE_LIMIT_UNAVAILABLE` response rather than silently bypassing the
  public abuse control
- password reset revokes existing sessions once the new password is accepted
- authenticated password changes request other-session revocation through the
  Better Auth client
- Turnstile captcha, when configured, is required for sign-up, password reset
  request, and verification resend. The app passes the token through Better
  Auth's `x-captcha-response` header and keeps normal sign-in captcha-free
  until a conditional failed-attempt design exists.
- conditional captcha after repeated failed sign-in attempts remains a backlog
  spike in `TSK-116`
- captcha provider timeout, fail-open/fail-closed, and Ceird-owned telemetry
  policy remains a backlog spike in `TSK-121`
- `rate_limit` table retention and cleanup policy remains a backlog spike in
  `TSK-113`
- durable auth email delivery de-duplication across queue redelivery remains a
  backlog spike in `TSK-114`
- raw auth audit provenance retention and anonymization remains a backlog spike
  in `TSK-120`

### Auth Abuse Telemetry

Auth abuse logs use stable `authAbuseSignal`, `authAbuseSignalSeverity`, and
`authAbuseAlertPolicy` annotations so dashboards and alerts can be built without
parsing freeform messages.

Current signal policy:

| Signal                                             | Alert policy                                                                                         | Notes                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_limit_hit`                                   | `dashboard_until_sustained_spike`                                                                    | Emitted when the Ceird pre-handler abuse reservation blocks a request.                                                                                                                                                            |
| `rate_limit_reservation_failure`                   | `alert_on_sustained_storage_failure` or `dashboard_until_sustained_storage_failure`                  | Emitted when the Ceird pre-handler abuse reservation cannot run; fail-closed public endpoints are high severity, authenticated settings endpoints are dashboard severity.                                                         |
| `rate_limit_storage_read_failure`                  | `dashboard_until_sustained_storage_failure`                                                          | Emitted when Better Auth `customStorage` cannot read rate-limit state and falls open.                                                                                                                                             |
| `rate_limit_storage_write_failure`                 | `dashboard_until_sustained_storage_failure`                                                          | Emitted when Better Auth `customStorage` cannot write rate-limit state; writes remain non-blocking.                                                                                                                               |
| `rate_limit_client_ip_unavailable`                 | `alert_on_sustained_client_ip_failure` or `dashboard_until_sustained_client_ip_failure`              | Emitted when an atomic reservation endpoint cannot resolve a client IP; fail-closed public endpoints are high severity.                                                                                                           |
| `oauth_dynamic_client_registration_rejected`       | `alert_on_suspicious_oauth_registration` or `dashboard_until_sustained_oauth_registration_rejection` | Emitted when Ceird rejects a dynamic client registration request before Better Auth persists it. Privileged scopes, client-credentials or unsupported grants, unsupported response types, and unsafe redirects are high severity. |
| `password_compromise_provider_failure`             | `alert_on_repeated_provider_failure`                                                                 | HIBP outages fail open but are high-severity.                                                                                                                                                                                     |
| `auth_email_provider_failure`                      | `alert_on_email_failure_threshold`                                                                   | Cloudflare email binding send failures.                                                                                                                                                                                           |
| `auth_email_delivery_failure`                      | `alert_on_email_failure_threshold`                                                                   | Better Auth background email delivery failures.                                                                                                                                                                                   |
| `auth_email_queue_delivery_failure`                | `alert_on_email_queue_failure_threshold`                                                             | Queue delivery failures that will be retried.                                                                                                                                                                                     |
| `auth_email_queue_handler_defect`                  | `alert_on_email_queue_failure_threshold`                                                             | Queue handler defects after retries/error handling failed.                                                                                                                                                                        |
| `auth_email_queue_invalid_message`                 | `dashboard_until_sustained_queue_failure`                                                            | Invalid queue messages are discarded and should alert only if spiking.                                                                                                                                                            |
| `auth_security_audit_write_failure`                | `alert_on_audit_write_failure`                                                                       | Emitted when durable auth security audit capture fails after an OAuth/MCP or organization lifecycle event.                                                                                                                        |
| `auth_security_audit_session_resolution_failure`   | `dashboard_until_sustained_audit_session_failure`                                                    | Emitted when Ceird cannot resolve the Better Auth session while enriching an OAuth/MCP or organization security audit event; request handling and audit capture continue without actor/session enrichment.                        |
| `auth_security_audit_token_context_failure`        | `dashboard_until_sustained_audit_context_failure`                                                    | Emitted when Ceird cannot pre-read stored OAuth token context for refresh/revoke audit enrichment.                                                                                                                                |
| `auth_security_audit_organization_context_failure` | `dashboard_until_sustained_audit_context_failure`                                                    | Emitted when Ceird cannot pre-read organization member or invitation context for audit enrichment.                                                                                                                                |
| `oauth_refresh_token_consent_guard_failure`        | `alert_on_sustained_consent_guard_failure`                                                           | Emitted when Ceird cannot verify live consent before a refresh-token grant. The token request fails closed with OAuth `server_error`.                                                                                             |
| `mcp_connected_app_consent_check_failed`           | `dashboard_until_sustained_mcp_consent_check_failure`                                                | Emitted when the MCP resource server cannot verify live connected-app consent after JWT verification. The MCP request fails closed as `invalid_token`.                                                                            |

Current redaction rules:

- rate-limit logs include endpoint paths and fingerprinted rate-limit keys, not
  raw IP-derived keys
- Better Auth's internal logger is disabled; Ceird-owned Effect telemetry is the
  auth logging boundary so upstream route logs cannot print raw submitted email
  addresses.
- email delivery logs use delivery-key fingerprints and message kinds, not raw
  recipient emails, invite URLs, reset URLs, verification URLs, or tokens
- password compromise logs include provider failure details but never password
  material or full hash values

Future alert wiring should use these annotations for sustained-rate thresholds,
provider failure thresholds, suspicious OAuth dynamic client registration
signals, and email provider or queue failure thresholds.

### Auth Security Audit Events

OAuth/MCP and organization lifecycle events are persisted to
`auth_security_audit_event`. This is separate from abuse telemetry: telemetry
drives dashboards and alerts, while the audit table is append-only security
evidence.

Current event types:

- `oauth_client_registration_succeeded`
- `oauth_client_registration_rejected`
- `oauth_consent_granted`
- `oauth_consent_denied`
- `oauth_consent_revoked`
- `oauth_token_refreshed`
- `oauth_token_revoked`
- `organization_created`
- `organization_updated`
- `organization_active_changed`
- `organization_invitation_created`
- `organization_invitation_resent`
- `organization_invitation_canceled`
- `organization_invitation_accepted`
- `organization_member_role_updated`
- `organization_member_removed`

Each row stores the event type, created timestamp, actor user id when known,
active organization id when available, session id when available, OAuth client
id, bounded scopes, source IP, user agent, and allowlisted JSON metadata. Actor,
organization, and session identifiers are denormalized text snapshots rather
than foreign keys, so normal session cleanup or user/org deletion does not erase
historical audit correlation. The table indexes chronological, event-type,
actor, organization, session, and OAuth-client review paths.

Organization audit metadata stores target user/member IDs and role
before/after values when available. Invitation audit metadata stores masked
recipient email addresses only; raw invitation URLs and invitation IDs are not
written to the audit table.

Organization audit rows are success-only for this stage: Ceird records events
after Better Auth accepts and applies the lifecycle mutation. Failed
organization mutation attempts remain covered by abuse/rate-limit telemetry and
request logs until a separate failed-attempt audit taxonomy is designed.

`@ceird/identity-core` exposes the typed `identity` HTTP API group for the
owner/admin organization security activity read model and current-user
connected-app management:

- `GET /organization/security/activity`
- `GET /user/connected-apps`
- `DELETE /user/connected-apps/:grantId`
- the organization security activity service resolves the current Better Auth
  session, active organization, and membership role through
  `CurrentOrganizationActor`
- only organization owners and admins may read it; other roles receive the
  identity-core access-denied error
- the query is scoped to the active organization and to the owner/admin-visible
  organization event allowlist:
  `organization_created`, `organization_updated`,
  `organization_invitation_created`, `organization_invitation_resent`,
  `organization_invitation_canceled`, `organization_invitation_accepted`,
  `organization_member_role_updated`, and `organization_member_removed`
- `organization_active_changed` remains in the internal audit table but is not
  returned by the owner/admin workspace view
- response items include safe actor, target, role-change, summary, timestamp,
  organization id, and cursor fields; raw source IP and raw user-agent values
  are not part of the shared response schema
- member targets resolve display name/email only through a `member` row scoped to
  the active organization, so schemaless audit metadata cannot expose another
  user's profile details
- filtering supports event type, actor user id, target type, date range, target
  search, limit, and cursor parameters; cursors preserve the database timestamp
  precision used by the `(created_at desc, id desc)` ordering
- connected-app list and disconnect resolve only the current authenticated user.
  A grant id owned by another user is treated as not found so grant existence is
  not leaked across accounts.
- connected-app responses include client display metadata, account/workspace
  context, grouped scopes, redirect hosts, grant timestamps, active token
  counts, and offline-access status. They never include access tokens, refresh
  tokens, token hashes, client secrets, authorization codes, or raw request
  provenance.
- connected-app disconnect writes `oauth_consent_revoked` with actor user id,
  OAuth client id, consent scopes, and reference metadata. It has no step-up
  authentication gate in this release; the UI uses explicit inline
  confirmation.

The app renders this read model at `/organization/security` as a read-only
admin route. It shows filters in the page header, hides raw provenance, and
notes that internal audit retention may be longer than the visible recent
activity view. Cursor pagination is exposed as a URL-backed `Next page` action.
The route uses `G Y` for global admin navigation and has no page-local hotkeys
because there are no row actions.
The app renders connected apps inside `/settings` on the Security tab. It uses
keyboard-accessible row buttons with inline confirmation and does not add a
global hotkey because the panel is not a primary navigation target.

Redaction rules:

- never persist client secrets, access tokens, refresh tokens, authorization
  codes, PKCE verifiers, raw OAuth query strings, or redirect URLs
- store scope names only after count and length bounding
- store revocation `token_type_hint`, not the token value
- store admin/write-scope consent as metadata on consent grant/denial rows

Reliability notes:

- consent denial has no Better Auth consent row, so Ceird records it at the
  auth HTTP wrapper boundary
- OAuth Provider token storage is configured with Ceird's explicit SHA-256
  base64url hash function; audit pre-read uses the same hash before querying
  Better Auth token rows
- refresh-token grants pre-read the stored Better Auth refresh token row before
  Better Auth rotates it, so matching rows can include user, session, active
  organization, client, and scope context; Ceird also checks the matching live
  consent row and covering consent scopes before allowing the refresh grant
  through
- revoke events pre-read stored refresh or opaque access-token rows when
  possible; JWT access-token revocation and unknown-token revocation cannot
  prove a stored row mutation from the endpoint response alone, so those rows
  remain redacted endpoint audit evidence with `matchedStoredToken: false`
- audit writes are scheduled through the auth background-task handler when the
  runtime provides one; write failures fail open with high-severity telemetry
  (`auth_security_audit_write_failure`) so an audit storage outage does not
  corrupt already-completed OAuth or organization responses; security can
  revisit this policy before production if specific grant paths must fail closed

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
- `auth_security_audit_event`

The database is the source of truth for:

- users
- sessions
- accounts
- verifications
- rate limiting state
- JWT signing keys for OAuth/OIDC token issuance
- OAuth client registrations, tokens, and consent records

Ceird does not maintain a parallel app-specific session store.

### Rate-Limit Retention

Better Auth and Ceird's auth-abuse guards store limiter counters in
`rate_limit`. The table is mutable operational state, not append-only
time-series data, so Ceird does not partition it for the first release.

The deployed domain Worker runs auth rate-limit cleanup from its Cloudflare
Cron Trigger at `17 3 * * *` UTC. Cleanup is deliberately off the auth request
path so sign-in, sign-up, OAuth registration, two-factor, and organization
invitation requests do not pay maintenance-query latency or hold cleanup locks.
Local Alchemy dev disables the cron and sets
`AUTH_RATE_LIMIT_CLEANUP_ENABLED=false` explicitly unless overridden.

The cleanup job deletes rows where `last_request` is older than the configured
retention horizon. Defaults are:

- `AUTH_RATE_LIMIT_RETENTION_HOURS=48`
- `AUTH_RATE_LIMIT_CLEANUP_BATCH_SIZE=1000`
- `AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES=10`

Retention config is validated to remain greater than the largest configured
limiter window. The delete path selects victims ordered by `(last_request, id)`
with `FOR UPDATE SKIP LOCKED`, deletes bounded batches, and logs partial
progress if a later batch fails. The supporting
`rate_limit_last_request_id_idx` index keeps victim selection aligned with the
retention predicate and ordering.

### Account Session Management

The app exposes first-release active-session management inside `/settings` as a
`Security` tab between `Profile` and `Email`.

The `Security` tab:

- lists Better Auth active sessions through the generated auth client
- marks the current browser session as `This device`
- allows revoking one other session through Better Auth `revokeSession`
- allows revoking all other sessions through Better Auth `revokeOtherSessions`
- hides raw IP addresses, raw user-agent strings, raw session tokens, and raw
  session ids from the UI

Current-session termination stays on the existing sign-out path. Ceird derives a
small browser/device-family label from the user agent for display, but does not
persist or expose a separate app-owned session metadata model.

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

The fallback host-rewrite behavior is intentionally limited to local and
stage-scoped localhost development.

Local Alchemy stages use Portless sibling hosts such as
`https://app.codex-my-task.ceird.localhost` and
`https://api.codex-my-task.ceird.localhost`. Browser auth and product API
traffic uses the app-owned local proxy at
`https://app.<stage>.ceird.localhost/api` when the configured API origin is the
matching `api.<stage>.ceird.localhost` origin. The proxy is local-only, accepts
only `app.<stage>.ceird.localhost` callers, preserves Better Auth and public
auth paths under `/api/auth` and `/api/public`, and strips the app-local `/api`
prefix for product API calls such as `/api/jobs -> /jobs`.

This keeps local browser traffic same-origin with the app so Better Auth session
cookies are retained by the browser. Server-side app helpers continue to call the
configured API origin directly.

### OAuth Consent UI

`apps/app/src/features/auth/oauth-consent-page.tsx` owns the public
`/oauth/consent` review screen used by Better Auth's OAuth Provider.

Current behavior:

- parses the signed authorization-query prefix for display through the TanStack
  Router route and ignores trailing forged duplicate query values
- shows the requesting client, redirect host, active workspace context for
  `ceird:*` requests, and semantic scope groups for identity, read, write,
  admin, offline, and unknown scopes
- fetches Better Auth public OAuth client metadata through
  `authClient.oauth2.publicClient({ query: { client_id } })` after the user is
  signed in; this enriches display with `client_name`, `client_uri`,
  `policy_uri`, and `tos_uri` only and does not replace the signed query as the
  trust boundary
- treats `ceird:admin`, write, offline, and unknown scopes as warning states;
  `ceird:admin` remains warning-only until the follow-up step-up-auth policy in
  `TSK-111`
- disables approval for `ceird:*` requests when the current Better Auth session
  has no active organization, while keeping denial available
- leaves signed-query verification and stored consent enforcement to Better Auth
- submits approve or deny decisions through `authClient.oauth2.consent`
- forwards the signed query prefix as `oauth_query` when present so Better Auth
  can verify the authorization request server-side
- avoids route hotkeys because consent is security-sensitive and should require
  an explicit focused button action

Current mappings:

- injected `API_ORIGIN` or `VITE_API_ORIGIN` wins when present
- conventional `app.<domain>` origins map to matching `api.<domain>` origins
- `app.<stage>.ceird.localhost` maps to `api.<stage>.ceird.localhost`
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

### Verified Email Gates

Ceird treats verified email as a trust boundary for high-trust actions without
blocking ordinary authenticated use of the product shell.

Current gated actions:

- organization creation at the auth HTTP boundary before Better Auth handles
  the request
- organization member invitations and reinvitations at the auth HTTP boundary
  before Better Auth handles the request
- approving OAuth/MCP consent requests

Current allowed actions while email is unverified:

- ordinary email/password login
- authenticated password change
- denying OAuth/MCP consent requests

The domain auth wrapper blocks organization creation, organization invitations,
and accepted OAuth consent approvals before the request reaches Better Auth and
returns `EMAIL_NOT_VERIFIED`. OAuth consent approvals require verified email for
all scopes because the guard does not rely on client-supplied scope provenance;
this is intentionally stricter than the initial Ceird-scope-only policy and can
be revisited in `TSK-66` if Better Auth exposes a server-side consent-code scope
lookup that preserves the auth boundary. The app maps those errors to targeted
copy in the OAuth consent, onboarding, and members workflows.
The wrapper resolves sessions through Better Auth's signed-cookie API in the
runtime path; direct database lookup is retained only for focused guard unit
tests.

### Password Compromise Checks

Ceird rejects known-compromised passwords during sign-up, password reset, and
authenticated password changes. The implementation uses the HIBP k-anonymity
range API shape, so only the first five characters of the SHA-1 password hash
leave the server. A matching suffix returns `PASSWORD_COMPROMISED`, and the app
maps that to user-facing copy that asks for a different password without
exposing provider details.

Provider outages fail open by policy: the auth request continues and the domain
runtime emits high-severity telemetry through Effect logging. This avoids
turning a third-party outage into an account-creation or password-change
outage while still making the degraded security posture observable.

Local deterministic verification can set
`AUTH_PASSWORD_COMPROMISE_CHECK_RANGE_URL_OVERRIDE` to a loopback range API stub.
The override is rejected for non-local hosts and uses the same padded HIBP range
request shape as production, but it is intentionally a test/development hook
rather than a production proxy setting.

Future gated actions already approved by policy, but not implemented yet:

- API key creation
- passkey enrollment

### Two-Factor Authentication

Ceird adopts Better Auth's `twoFactor` plugin for optional TOTP authenticator
apps plus backup codes. The server config uses issuer `Ceird`, explicit
six-digit/30-second TOTP settings, encrypted backup-code storage, and no email
or SMS OTP delivery. The auth schema includes `user.twoFactorEnabled` and a
`two_factor` table for encrypted TOTP secrets, encrypted backup codes,
verification state, and the owning user.

Enrollment is gated at the auth boundary: `/two-factor/enable` requires a
verified email session before Better Auth handles the request. Trusted-device
requests are also blocked at the Ceird boundary for the first release, even
though Better Auth supports them, because remembered-device product policy is
deferred.

The app auth client installs `twoFactorClient()` so settings and login work can
use typed Better Auth methods. Account settings expose the first user-facing
management surface under `/settings` -> `Security`: setup is blocked until the
account email is verified, owners/admins see a stronger enrollment prompt, TOTP
setup renders a QR code plus manual URI fallback, verification never sends a
trusted-device request, backup codes must be acknowledged before returning to
the enabled state, backup-code regeneration requires the current password, and
disable requires both current password and explicit confirmation. Successful
TOTP enrollment verification and disable refresh the app auth context so
`user.twoFactorEnabled` stays aligned with Better Auth. While one-time backup
codes are awaiting acknowledgement, the app keeps the security tab mounted and
registers a route/before-unload warning to reduce accidental code loss.
The domain auth boundary normalizes Better Auth session reads so app-visible
sessions always include a boolean `user.twoFactorEnabled`; the app context
decoder treats a missing or malformed value as a malformed session rather than
silently assuming 2FA is off.

The login page handles Better Auth's `twoFactorRedirect` credential sign-in
response inline instead of redirecting to a separate route. After password
verification, the app preserves the submitted email and invitation continuation
target, replaces the credential form with a `Verify your sign-in` challenge,
and verifies either a TOTP authenticator code or a one-time backup code through
Better Auth's native `twoFactor` client methods. The app does not pass
`trustDevice`; remembered-device policy remains deferred. If the temporary 2FA
verification session expires, the user can return to the password form with the
email preserved and the password cleared.

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
- verifies `authClient.getSession()` after successful sign-in before navigating
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
- password is not trimmed and must be 12 to 256 characters
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
- auth protection unavailable responses (`AUTH_RATE_LIMIT_UNAVAILABLE`) map to
  a short retry-in-a-moment message rather than generic sign-in, sign-up, or
  delivery failures
- other sign-in failures map to a generic credentials-oriented message
- other sign-up failures map to a generic account-creation message
- password reset request responses remain generic and non-enumerating
- the search-param-driven invalid-link state may specifically call out invalid
  or expired links
- submitted reset failures map compromised-password rejections to dedicated
  choose-a-different-password copy and otherwise use the generic reset failure
  message
- settings password-change failures map compromised-password rejections to the
  same dedicated copy
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
- reserve public abuse rate-limit slots atomically before Better Auth endpoint
  side effects run
- require Cloudflare Turnstile on selected high-abuse public auth flows when
  captcha is enabled
- send verification links through `AuthEmailSender`
- require verified email before organization creation, member invitations, and
  OAuth/MCP consent approvals
- keep the app password schemas aligned with Better Auth's explicit 12 to 256
  character password length policy
- revoke existing sessions on successful password reset
- use server-first session lookup for SSR-protected routes
- expose account-scoped active-session listing and other-session revocation
  through Better Auth's session APIs
- handle Better Auth two-factor sign-in challenges inline with TOTP and backup
  code verification
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
- implement domain authorization rules inside auth UI route guards
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
- `apps/app/src/features/auth/auth-captcha.tsx`
  Shared Turnstile loader, challenge component, and Better Auth captcha header
  helper for selected auth forms.
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
