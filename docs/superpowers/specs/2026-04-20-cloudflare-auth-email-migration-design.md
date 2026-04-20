# Cloudflare Auth Email Migration Design

## Summary

Replace the current Resend-backed auth email transport with a Cloudflare Email
Service transport in `apps/api`.

This is a greenfield codebase, so the migration should be a clean replacement
rather than a compatibility exercise:

- remove Resend-specific config, naming, and dependencies
- keep the app-owned auth email boundary narrow and Effect-native
- make Cloudflare the only supported auth email provider
- prefer the official Cloudflare Node SDK over ad hoc HTTP calls

The existing architecture is already close to the desired shape. The app owns
email composition and auth delivery policy in `AuthEmailSender`, while the
provider adapter is isolated behind `AuthEmailTransport`. This pass keeps that
boundary and swaps the transport cleanly.

## Goals

- replace Resend with Cloudflare Email Service for auth email delivery
- keep Better Auth as the source of truth for password reset behavior
- keep email composition and auth policy inside the identity/authentication
  domain
- use Effect-native boundaries: `Effect.Service`, tagged errors, `Config`, and
  flat Layer composition
- remove provider-specific details that no longer fit the domain model
- keep the implementation easy to extend later for email verification
- preserve strong test coverage around config loading, message composition, and
  provider failure mapping

## Non-Goals

- building a generic transactional email platform in this pass
- introducing Cloudflare Workers or Wrangler just to send email
- supporting both Resend and Cloudflare at runtime
- preserving Resend-specific config names or transport semantics for backward
  compatibility
- redesigning the Better Auth flow itself
- solving durable retry or app-level deduplication in this pass

## Current Context

The current auth email design already follows the right high-level ownership:

- `AuthEmailSender` is an app-owned service that validates password reset input
  and renders the email content
- `AuthEmailTransport` is the provider boundary used by the sender
- `Authentication` wires that service into Better Auth's
  `emailAndPassword.sendResetPassword` hook
- runtime config is loaded via `Config`
- password reset delivery errors are expressed with tagged errors

The current implementation is still partially shaped by Resend:

- `RESEND_API_KEY` is required config
- the live provider is `ResendAuthEmailTransportLive`
- tests assert Resend payloads and Resend-style idempotency behavior
- the input shape uses `idempotencyKey`, and the validation logic currently
  includes a Resend-specific max-length rule

This is the right moment to clean up those seams instead of carrying them
forward.

## External Constraints

Cloudflare Email Service currently introduces several operational constraints
that matter to the design:

1. the sending domain must be onboarded in Cloudflare Email Service
2. the sending domain must use Cloudflare DNS
3. production outbound email requires an account plan that supports the desired
   recipient volume
4. the platform is currently documented as beta, so we should isolate provider
   behavior behind the existing transport boundary

These constraints are deployment concerns, not reasons to widen the app-side
API.

## Core Decisions

The following decisions are fixed for this design:

1. Cloudflare Email Service becomes the only auth email provider
2. the transport uses Cloudflare's REST API through the official `cloudflare`
   Node SDK
3. we do not introduce a Worker, Wrangler config, or a second deployment target
   just for email sending
4. `AuthEmailSender` remains the auth-domain `Effect.Service`
5. `AuthEmailTransport` remains a narrow infra boundary provided by a live
   Layer
6. Resend-specific naming is removed from the domain model
7. provider result mapping becomes Cloudflare-specific and explicit
8. config is renamed to Cloudflare-native variables rather than wrapped in
   compatibility aliases
9. this pass is a clean replacement, not a dual-provider migration

## Approaches Considered

### Approach 1: Cloudflare REST API via official Node SDK

Use the official `cloudflare` package from `apps/api`, instantiate a client
with an API token, and call the Email Sending endpoint from the transport.

Pros:

- fits the current Node runtime with minimal architectural change
- uses an official package instead of hand-rolled `fetch`
- keeps all auth email logic in one runtime
- easy to unit test through injected client dependencies
- no new deployable infrastructure

Cons:

- requires Cloudflare account credentials in the API runtime
- does not gain any Worker-specific binding features

### Approach 2: Direct REST calls with `fetch`

Skip the SDK and call Cloudflare's email endpoint directly.

Pros:

- one less dependency
- minimal runtime abstraction

Cons:

- loses official request/response typings
- duplicates client concerns that the SDK already handles
- worse fit for a repo that prefers packages when a supported package exists

### Approach 3: Email Worker plus binding

Create a Cloudflare Worker dedicated to email sending and call it from
`apps/api`.

Pros:

- keeps Cloudflare email credentials off the Node API runtime
- aligns with Cloudflare's Worker-native email model

Cons:

- introduces a second runtime, deployable, and local-dev path
- adds Wrangler and Worker-specific tooling with no current codebase precedent
- turns a narrow provider swap into a broader platform change

### Recommendation

Choose Approach 1.

It is the smallest clean design that fits the current codebase and keeps the
email boundary app-owned. If the API later moves onto Cloudflare infrastructure,
we can revisit a Worker-native transport then.

## Architecture

### Domain Ownership

`apps/api` continues to own auth email delivery policy.

Responsibilities that stay in the auth domain:

- validate password reset email input
- compose the auth email subject and body
- define typed auth email errors
- map provider failures into auth-domain failures
- wire auth email delivery into Better Auth

Responsibilities that belong only to the provider adapter:

- Cloudflare client construction
- request formatting for the Cloudflare API
- response interpretation for Cloudflare delivery outcomes
- Cloudflare-specific failure decoding

This keeps the provider behind a narrow boundary and preserves a clean path for
future verification mail on the same service.

### Service Shape

`AuthEmailSender` remains the primary business-facing service and should
continue to be implemented with `Effect.Service`.

The transport remains a narrow runtime-injected boundary. Keeping
`AuthEmailTransport` as an infra tag is acceptable here because it represents a
provider integration boundary rather than business logic.

The service design should stay narrow:

- `sendPasswordResetEmail`

We should not use this migration as an excuse to introduce a wide generic mail
API.

### Provider Layer

Add a new live transport layer:

- `CloudflareAuthEmailTransportLive`

Remove:

- `ResendAuthEmailTransportLive`
- the Resend package dependency

The authentication module should compose:

- `AuthEmailSender.Default`
- `CloudflareAuthEmailTransportLive`

There should be no provider flag, no branching live layer, and no compatibility
fallback.

## Domain Model Cleanup

### Replace `idempotencyKey` With `deliveryKey`

The current input shape is still named for the Resend feature. Cloudflare's
current Email Service documentation does not expose an equivalent provider-side
idempotency mechanism for the send path we intend to use.

Because this is a greenfield app, we should rename the field to something
provider-neutral:

- `deliveryKey`

`deliveryKey` means:

- a stable app-owned correlation key for a logical email send attempt
- a value we can log and potentially use for future deduplication work
- not a promise that the provider itself deduplicates requests

This also lets us remove the Resend-specific max-length validation rule. The
field should remain a validated non-empty string, but it should no longer claim
provider-specific semantics in the auth domain.

### Transport Message Shape

The transport message shape should remain simple:

- `to`
- `subject`
- `text`
- `html`
- optional `deliveryKey`

Do not add broad optional features such as attachments, CC/BCC, raw MIME, or
arbitrary headers in this pass.

## Configuration Model

### Required Runtime Config

Replace the current config contract with Cloudflare-native values:

- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_FROM_NAME` with default `"Task Tracker"`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Remove:

- `RESEND_API_KEY`

Config must continue to load through `Config` and fail fast with tagged config
errors.

### Config Loading Rules

The config layer should:

- validate that `AUTH_EMAIL_FROM` is a valid email address
- validate that `AUTH_EMAIL_FROM_NAME` is non-empty after defaults
- validate that `CLOUDFLARE_ACCOUNT_ID` is present and non-empty
- validate that `CLOUDFLARE_API_TOKEN` is present and non-empty

We should not read from `process.env` directly anywhere in the auth email
implementation.

### Local And Test Entry Points

The repo currently injects placeholder Resend credentials in dev and Playwright
entry points to satisfy auth startup config. That pattern can remain, but the
variables need to change.

Update these entry points to use placeholder Cloudflare values:

- `scripts/dev.mjs`
- `scripts/dev.test.mjs`
- `apps/app/playwright.config.ts`

This keeps auth startup deterministic in non-production environments while
still allowing real credentials to be supplied explicitly.

## Error Model

The current design uses a generic `AuthEmailDeliveryError`. This migration is a
good opportunity to sharpen the transport-side error model so it aligns better
with Effect best practices.

Introduce explicit tagged errors for distinct failure reasons, for example:

- `AuthEmailConfigurationError`
- `AuthEmailRequestError`
- `AuthEmailRejectedError`
- `PasswordResetDeliveryError`

Suggested semantics:

- `AuthEmailRequestError`: network failures, authentication failures, 5xx, or
  malformed provider responses
- `AuthEmailRejectedError`: Cloudflare accepted the request shape but reported
  a non-deliverable recipient outcome such as a permanent bounce
- `PasswordResetDeliveryError`: app-facing auth-domain failure returned from
  `AuthEmailSender`

`AuthEmailSender` should continue to expose auth-specific errors and map
provider errors using `catchTag` or `catchTags`, not `catchAll`.

This keeps the auth boundary explicit without leaking provider jargon upward.

## Cloudflare Transport Behavior

### Request Construction

The Cloudflare transport should:

- construct a `Cloudflare` SDK client from the loaded API token
- call the Email Sending API with:
  - `account_id`
  - `from`
  - `to`
  - `subject`
  - `text`
  - `html`
- format `from` as `"Name <email@example.com>"`

We should not send raw MIME or custom headers in this pass.

### Response Mapping

Cloudflare's API returns recipient-level delivery buckets such as:

- `delivered`
- `queued`
- `permanent_bounces`

For the auth use case, treat outcomes as follows:

- success if the single recipient appears in `delivered`
- success if the single recipient appears in `queued`
- failure with `AuthEmailRejectedError` if the recipient appears in
  `permanent_bounces`
- failure with `AuthEmailRequestError` if the response is structurally invalid
  for our single-recipient expectation

This design explicitly accepts `queued` as success because the app boundary is
responsible for provider handoff, not mailbox delivery guarantees.

### Logging And Tracing

The transport and sender should use structured `Effect.log` calls rather than
`console.log`.

At minimum, log:

- provider name
- recipient
- delivery key
- outcome bucket

Where useful, annotate spans using `Effect.fn` and
`Effect.annotateCurrentSpan(...)` for the delivery key and recipient.

## Better Auth Integration

The Better Auth integration remains the same in structure:

- Better Auth generates the password reset URL and token
- `Authentication` delegates to `AuthEmailSender.sendPasswordResetEmail`

The only meaningful change at this layer is the input rename from
`idempotencyKey` to `deliveryKey` and the updated provider live layer.

We should not introduce app-owned reset endpoints, wrapper HTTP routes, or
provider-specific logic in the Better Auth config.

## Testing Strategy

### Unit Tests

Update the existing auth email tests to reflect the Cloudflare design.

Coverage should include:

- config loading succeeds with the new required variables
- config loading fails with missing or invalid Cloudflare variables
- `AuthEmailSender` composes the expected password reset content
- `AuthEmailSender` rejects malformed runtime input
- `AuthEmailSender` maps transport failures into
  `PasswordResetDeliveryError`
- the Cloudflare transport formats the expected request payload
- the Cloudflare transport treats `delivered` as success
- the Cloudflare transport treats `queued` as success
- the Cloudflare transport maps `permanent_bounces` into an explicit tagged
  error
- the Cloudflare transport maps thrown SDK failures into an explicit tagged
  error

### Integration Scope

We do not need live Cloudflare API tests in the default test suite.

The provider boundary is narrow enough that injected-client unit tests are the
best default. A manual smoke test against a real Cloudflare account can exist as
an operational verification step outside the automated suite.

## Documentation Changes

Update the auth documentation to reflect the new provider and config contract:

- `docs/architecture/auth.md`
- `docs/architecture/auth-next-steps.md`

At minimum, document:

- the new required environment variables
- that Cloudflare is now the auth email provider
- that the domain model uses a provider-neutral `deliveryKey`
- that the current boundary remains reusable for email verification later

## Rollout Plan

This pass should be implemented as one clean replacement:

1. add the Cloudflare transport and config changes
2. update tests
3. update local/test entry points
4. update auth docs
5. remove Resend code and dependency

Because this is greenfield, do not build a provider toggle or compatibility
bridge.

## Risks

### Cloudflare Platform Risk

Cloudflare Email Service is currently documented as beta. The design contains
that risk by keeping provider behavior isolated to one transport layer and by
avoiding provider leakage into the auth domain.

### Delivery Deduplication Risk

This migration intentionally stops claiming provider-side idempotency.

That is acceptable for this pass because:

- the current system already uses an in-process background task model
- durable retries are already a separately tracked concern
- a provider-neutral `deliveryKey` still preserves a clean path to app-level
  deduplication later

### Operational Configuration Risk

Cloudflare Email Service requires Cloudflare DNS and domain onboarding. This is
an operational precondition, not a code path. The implementation should fail
fast on missing runtime credentials, and rollout should not begin until the
domain is configured.

## Open Questions

There are no code-level open questions blocking implementation.

Operationally, implementation should assume:

- the sending domain will be onboarded in Cloudflare before rollout
- a suitable Cloudflare API token with email-sending permission will be
  provisioned
- the target Cloudflare account plan supports the intended production usage

## Implementation Sketch

Expected backend files after the migration:

- `apps/api/src/domains/identity/authentication/auth-email.ts`
- `apps/api/src/domains/identity/authentication/auth-email-config.ts`
- `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.ts`
- `apps/api/src/domains/identity/authentication/auth.ts`

Expected removals:

- `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts`
- Resend-specific tests and config references
- the `resend` dependency from `apps/api/package.json`

## References

- Cloudflare Email Service overview:
  <https://developers.cloudflare.com/email-service/>
- Cloudflare Email Service REST API:
  <https://developers.cloudflare.com/email-service/api/send-emails/rest-api/>
- Cloudflare Email Service send-email quickstart:
  <https://developers.cloudflare.com/email-service/get-started/send-emails/>
- Cloudflare Email Service domain configuration:
  <https://developers.cloudflare.com/email-service/configuration/domains/>
- Cloudflare Email Service email authentication:
  <https://developers.cloudflare.com/email-service/concepts/email-authentication/>
- Cloudflare Email Service pricing:
  <https://developers.cloudflare.com/email-service/platform/pricing/>
- Cloudflare TypeScript SDK:
  <https://developers.cloudflare.com/api/node/>
- Cloudflare SDK email send method:
  <https://developers.cloudflare.com/api/node/resources/email_sending/methods/send/>
