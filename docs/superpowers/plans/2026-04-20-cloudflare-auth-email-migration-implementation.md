# Cloudflare Auth Email Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Resend-backed auth email transport in `apps/api` with a Cloudflare Email Service transport, remove Resend-specific config and semantics, and keep the auth email boundary narrow, Effect-native, and ready for future verification email work.

**Architecture:** Keep Better Auth as the source of truth for password reset behavior and URL generation. In `apps/api`, preserve `AuthEmailSender` as the auth-domain `Effect.Service`, keep the provider boundary narrow behind `AuthEmailTransport`, rename the provider-coupled `idempotencyKey` input to provider-neutral `deliveryKey`, and replace the live provider Layer with a Cloudflare SDK-backed transport. Update local/dev/test runtime config so auth startup depends on `AUTH_EMAIL_FROM`, `AUTH_EMAIL_FROM_NAME`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` instead of Resend.

**Tech Stack:** Better Auth, Effect, Effect Schema, Config, Cloudflare Node SDK, Vitest, Turbo

---

## File Structure

**Create:**

- `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.ts` — Cloudflare Email Service transport and live Layer
- `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.test.ts` — transport tests for request shape and response/error mapping

**Modify:**

- `apps/api/package.json` — remove `resend`, add `cloudflare`
- `apps/api/src/domains/identity/authentication/auth-email.ts` — rename `idempotencyKey` to `deliveryKey`, remove Resend-specific validation, and keep the sender narrow and provider-neutral
- `apps/api/src/domains/identity/authentication/auth-email-config.ts` — replace Resend config with Cloudflare account/token config
- `apps/api/src/domains/identity/authentication/auth-email-errors.ts` — replace generic provider failure shape with more explicit tagged request/rejection errors
- `apps/api/src/domains/identity/authentication/auth-email.test.ts` — update sender/config tests for `deliveryKey` and Cloudflare config
- `apps/api/src/domains/identity/authentication/auth.ts` — compose `CloudflareAuthEmailTransportLive` and update Better Auth hook input
- `scripts/dev.mjs` — inject placeholder Cloudflare auth email env values for local startup
- `scripts/dev.test.mjs` — update tests for the new startup env contract
- `apps/app/playwright.config.ts` — inject placeholder Cloudflare auth email env values for auth e2e startup
- `docs/architecture/auth.md` — document Cloudflare as the provider and the new runtime env contract
- `docs/architecture/auth-next-steps.md` — replace Resend-specific wording with the Cloudflare-backed boundary description

**Delete:**

- `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts`
- `apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts`

## Task 1: Replace Provider-Coupled Domain Semantics

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth-email.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email-errors.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.test.ts`

- [ ] **Step 1: Update the auth email input model to use `deliveryKey`**

Rename the password reset input field and transport field:

- `idempotencyKey` → `deliveryKey`

Rules:

- keep it as a validated non-empty string
- remove the Resend-specific max-length rule
- do not describe it as provider idempotency in comments or tests
- keep the message shape limited to `to`, `subject`, `text`, `html`, and optional `deliveryKey`

Expected: the auth-domain model no longer leaks Resend semantics.

- [ ] **Step 2: Keep `AuthEmailSender` aligned with Effect best practices**

Ensure `AuthEmailSender` remains the business-facing `Effect.Service` and that
its main operation remains narrow:

- `sendPasswordResetEmail`

Rules:

- keep validation and email composition in the sender
- use `Effect.fn(...)` for the service method if not already present
- keep `AuthEmailTransport` as a runtime-injected infra boundary only
- do not widen this into a generic transactional email service

Expected: the sender remains app-owned business logic and the provider remains an implementation detail.

- [ ] **Step 3: Sharpen the tagged error model**

Replace the current broad delivery error shape with explicit errors that match the approved design:

- `AuthEmailConfigurationError`
- `AuthEmailRequestError`
- `AuthEmailRejectedError`
- `PasswordResetDeliveryError`

Rules:

- define all errors with `Schema.TaggedError`
- include a `message` field on every error
- keep any optional provider detail in typed fields such as `cause`
- use `catchTag` or `catchTags` when mapping transport errors inside `AuthEmailSender`
- do not collapse different failure reasons into one generic provider error if the caller needs to reason about them differently

Expected: provider request failures and recipient rejection outcomes are distinct in the domain model.

- [ ] **Step 4: Update the sender tests first**

Revise `apps/api/src/domains/identity/authentication/auth-email.test.ts` to cover:

- `deliveryKey` instead of `idempotencyKey`
- password reset message composition
- malformed runtime input rejection
- HTML escaping
- transport error mapping into `PasswordResetDeliveryError`
- config loading expectations for Cloudflare env vars

Expected: the tests fail before the implementation changes are completed.

## Task 2: Replace Resend Config With Cloudflare Config

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth-email-config.ts`
- Modify: `apps/api/src/domains/identity/authentication/auth-email.test.ts`

- [ ] **Step 1: Change the config contract**

Replace the auth email config shape with:

- `from`
- `fromName`
- `cloudflareAccountId`
- `cloudflareApiToken`

Loaded from:

- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_FROM_NAME`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Remove:

- `resendApiKey`
- `RESEND_API_KEY`

- [ ] **Step 2: Validate config through `Config`**

Keep all runtime configuration loading inside `Config`.

Rules:

- validate `AUTH_EMAIL_FROM` as an email address
- default `AUTH_EMAIL_FROM_NAME` to `"Ceird"`
- validate `CLOUDFLARE_ACCOUNT_ID` as non-empty
- validate `CLOUDFLARE_API_TOKEN` as non-empty
- map failures into `AuthEmailConfigurationError`
- do not read `process.env` directly in the auth email modules

Expected: auth startup fails fast with clear tagged config errors when Cloudflare credentials are missing or invalid.

- [ ] **Step 3: Update config tests**

Revise config-related assertions in `auth-email.test.ts` to prove:

- missing Cloudflare env vars fail
- valid Cloudflare env vars load successfully
- invalid sender addresses still fail

Expected: config tests describe the new runtime contract exactly.

## Task 3: Implement The Cloudflare Transport

**Files:**

- Create: `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.ts`
- Create: `apps/api/src/domains/identity/authentication/cloudflare-auth-email-transport.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Replace the package dependency**

Run:

```bash
pnpm --filter api remove resend
pnpm --filter api add cloudflare
```

Expected: `apps/api/package.json` no longer references `resend` and includes the official `cloudflare` package instead.

- [ ] **Step 2: Add the Cloudflare transport implementation**

Create `cloudflare-auth-email-transport.ts` with a factory plus live Layer.

Rules:

- load config from `loadAuthEmailConfig`
- construct the Cloudflare SDK client with the API token
- format `from` as `"Name <email@example.com>"`
- call the Cloudflare Email Sending API with:
  - `account_id`
  - `from`
  - `to`
  - `subject`
  - `text`
  - `html`
- treat `delivered` as success
- treat `queued` as success
- treat `permanent_bounces` as `AuthEmailRejectedError`
- map SDK or network failures to `AuthEmailRequestError`
- use `Effect.tryPromise` and tagged error mapping
- use structured `Effect.log` for send attempts and outcomes

Expected: the Cloudflare adapter is the only live transport implementation.

- [ ] **Step 3: Keep the transport easy to unit test**

Design the transport factory to accept an injected Cloudflare email client or client factory for tests.

Rules:

- avoid hard-coding client construction deep inside the send method
- keep the dependency surface small enough to fake in tests
- do not require network access for unit tests

Expected: transport behavior can be tested with deterministic fake responses.

- [ ] **Step 4: Write transport tests**

Create `cloudflare-auth-email-transport.test.ts` covering:

- request payload uses the configured sender
- `deliveryKey` is preserved for logging/correlation expectations if represented in the test seam
- `delivered` response succeeds
- `queued` response succeeds
- `permanent_bounces` maps to `AuthEmailRejectedError`
- thrown client failures map to `AuthEmailRequestError`
- malformed or unexpected single-recipient responses fail explicitly

Expected: provider behavior is fully captured at the adapter boundary.

## Task 4: Wire Cloudflare Into Authentication Runtime

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth.ts`

- [ ] **Step 1: Replace the live provider Layer**

Update the auth runtime wiring to compose:

- `AuthEmailSender.Default`
- `CloudflareAuthEmailTransportLive`

Remove the Resend live layer entirely.

- [ ] **Step 2: Update Better Auth password reset delivery input**

Change the `sendResetPassword` hook input passed to `AuthEmailSender.sendPasswordResetEmail`:

- `idempotencyKey: ...` → `deliveryKey: ...`

Rules:

- keep the existing deterministic key format unless there is a strong reason to improve it
- treat the key as an app-owned correlation value, not provider dedupe
- keep Better Auth integration otherwise unchanged

Expected: the Better Auth hook still hands off one narrow auth email request, but with provider-neutral semantics.

## Task 5: Update Local, Dev, And Test Runtime Wiring

**Files:**

- Modify: `scripts/dev.mjs`
- Modify: `scripts/dev.test.mjs`
- Modify: `apps/app/playwright.config.ts`

- [ ] **Step 1: Replace placeholder Resend env values**

Update local startup defaults to inject placeholder values for:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Keep:

- `AUTH_EMAIL_FROM`
- `AUTH_EMAIL_FROM_NAME`

Remove placeholder references to `RESEND_API_KEY`.

- [ ] **Step 2: Update runtime tests**

Revise `scripts/dev.test.mjs` and any related startup assertions so they prove:

- default local startup injects Cloudflare placeholders
- explicit overrides are preserved

Expected: local startup still satisfies auth email config deterministically.

- [ ] **Step 3: Update Playwright startup env**

Revise `apps/app/playwright.config.ts` so auth e2e startup uses the Cloudflare env contract.

Expected: auth e2e startup continues to boot the API without requiring real provider credentials.

## Task 6: Update Documentation And Remove Resend References

**Files:**

- Modify: `docs/architecture/auth.md`
- Modify: `docs/architecture/auth-next-steps.md`
- Delete: `apps/api/src/domains/identity/authentication/resend-auth-email-transport.ts`
- Delete: `apps/api/src/domains/identity/authentication/resend-auth-email-transport.test.ts`

- [ ] **Step 1: Update architecture docs**

Revise the auth docs to reflect:

- Cloudflare as the auth email provider
- the new required env vars
- the provider-neutral `deliveryKey`
- the continued reuse of the auth email boundary for future verification mail

- [ ] **Step 2: Remove stale Resend code paths**

Delete:

- `resend-auth-email-transport.ts`
- `resend-auth-email-transport.test.ts`

Then scan for leftover references:

```bash
rg -n "resend|RESEND_API_KEY|idempotencyKey" apps/api docs scripts apps/app
```

Expected: no stale Resend-specific naming remains in live code or current architecture docs.

## Task 7: Verify The Migration

**Files:**

- Modify any touched files as needed

- [ ] **Step 1: Run focused tests during implementation**

Run:

```bash
pnpm --filter api test
pnpm --filter app test
node scripts/dev.test.mjs
```

Expected: auth email unit tests, auth runtime tests, and startup env tests all pass after the swap.

- [ ] **Step 2: Run repo-wide checks before finishing**

Run:

```bash
pnpm check-types
pnpm test
```

Expected: the Cloudflare swap is clean across the workspace.

- [ ] **Step 3: Manual smoke-check assumptions**

Before rollout, verify operational preconditions outside the test suite:

- the sending domain is onboarded in Cloudflare Email Service
- the required DNS records are configured
- the Cloudflare API token can send mail for the intended account

Expected: runtime credentials and domain setup are ready before non-local use.
