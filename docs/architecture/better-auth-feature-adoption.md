# Better Auth Feature Adoption

Audited on 2026-06-06 from the Better Auth v1.6 docs, local Better Auth 1.6.11
source under `opensrc/`, and the current Ceird auth, organization, settings,
API, and MCP code.

## Goal

Catalog the Better Auth feature/plugin surface and identify where Ceird should
adopt more Better Auth capabilities to improve account security, organization
security, user convenience, and future enterprise readiness.

Read this with
[`better-auth-implementation-gaps.md`](better-auth-implementation-gaps.md),
which identifies the current implementation gaps, and
[`auth-organization-permission-matrix.md`](auth-organization-permission-matrix.md),
which maps the current Better Auth/Ceird authorization split.

## Adoption Principles

- Keep Better Auth as the identity/session/OAuth/organization authority.
- Add Ceird policy at domain boundaries where product rules are sharper than
  Better Auth defaults.
- Prefer security features that reduce credential theft and account recovery
  risk before adding convenience-only sign-in methods.
- Add schema-affecting plugins only with inspected Drizzle migrations and
  focused route/client tests.
- Keep enterprise features deferred until the product has organizations that
  need them, but avoid architecture that would make them painful later.

## Plugin Adoption Checklist

Use this checklist before adopting any new Better Auth plugin. It is deliberately
short because plugin work is easiest to keep safe when the same boundary checks
happen every time.

1. Check the current Better Auth docs and the local package source listed in
   `opensrc/sources.json`. If docs and source disagree, trust local source for
   implementation behavior and record the docs gap.
2. Identify server plugin config, runtime environment variables, and secret
   material before editing code.
3. Identify app client plugin config and user-facing methods before changing UI.
4. Inspect required Better Auth tables or columns. Update
   `apps/domain/src/domains/identity/authentication/schema.ts` and generate a
   Drizzle migration under `apps/domain/drizzle` for persistence changes.
5. Add or update focused domain tests around Better Auth server config,
   endpoint behavior, hooks, and schema decoding.
6. Add or update focused app tests around client methods, route guards, form
   states, cache invalidation, and user-facing errors.
7. Update `docs/architecture/auth.md` and any matching frontend/API/package
   architecture guide in the same change.
8. Run narrow package checks while iterating, then `pnpm check-types`,
   `pnpm test`, `pnpm lint`, `pnpm format`, and `git diff --check` before
   handoff.
9. For user-facing workflows, add browser verification against a confirmed
   Alchemy stage and capture screenshots for the final report.

## Core Feature Catalog

| Feature area                          | Ceird status               | Adoption note                                                                       |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| Framework-agnostic TypeScript auth    | Adopted                    | Better Auth is mounted in `apps/domain` and consumed from TanStack Start.           |
| Email/password auth                   | Adopted                    | Enabled server-side and exposed by login/signup pages.                              |
| Email verification                    | Partially adopted          | Verification emails are sent, but verification is not a trust boundary.             |
| Password reset                        | Adopted                    | Reset delivery and completion are implemented; resets revoke other sessions.        |
| Profile update                        | Adopted                    | Settings uses Better Auth user update.                                              |
| Change email                          | Adopted                    | Settings uses Better Auth email change confirmation.                                |
| Change password                       | Adopted                    | Settings uses Better Auth password change with other-session revocation.            |
| Account deletion                      | Not adopted                | Useful for GDPR/self-service, but needs data retention policy first.                |
| Session management                    | Partially adopted          | Session lookup and sign-out exist; no active-session management UI.                 |
| Social sign-on                        | Not adopted                | Useful for Google Workspace convenience once account-linking policy is defined.     |
| Account linking                       | Not adopted                | Should come with social/passkey rollout and clear duplicate-account handling.       |
| Built-in rate limiter                 | Adopted                    | Database-backed with custom rules and observability.                                |
| Database adapters/schema generation   | Adopted manually           | Drizzle adapter is used, but schema is repo-owned and must be updated deliberately. |
| Trusted origins/dynamic base URL      | Adopted                    | Stage and tenant host origins are explicitly configured.                            |
| Cookie prefix/cross-subdomain cookies | Adopted                    | Stage-specific prefixes and parent domains are configured.                          |
| Versioned secrets                     | Not adopted                | Add before production secret rotation becomes risky.                                |
| Hooks and schema customization        | Adopted                    | Organization validation and email delivery use hooks.                               |
| Organization/access control           | Adopted with custom policy | Better Auth owns membership; Ceird owns domain authorization.                       |

## Plugin Catalog

This table follows the Better Auth docs plugin catalog and marks whether each
plugin is currently adopted in Ceird.

| Plugin                                                                            | Category                   | Ceird status                                 | Best-fit use in Ceird                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Two-Factor Authentication](https://better-auth.com/docs/plugins/2fa)             | Authentication/security    | Not adopted                                  | Owner/admin 2FA, TOTP, backup codes, trusted devices, step-up auth.                                        |
| [Passkey](https://better-auth.com/docs/plugins/passkey)                           | Authentication/security    | Not adopted                                  | Phishing-resistant sign-in and sensitive-action verification.                                              |
| [Magic Link](https://better-auth.com/docs/plugins/magic-link)                     | Authentication/UX          | Not adopted                                  | Low-friction invite acceptance or passwordless sign-in.                                                    |
| [Email OTP](https://better-auth.com/docs/plugins/email-otp)                       | Authentication/UX          | Not adopted                                  | Short-lived email codes for recovery or second-factor fallback.                                            |
| [Phone Number](https://better-auth.com/docs/plugins/phone-number)                 | Authentication/UX          | Not adopted                                  | Defer unless field workflows truly need phone-first accounts.                                              |
| [Anonymous](https://better-auth.com/docs/plugins/anonymous)                       | Authentication/guest       | Not adopted                                  | Defer until there are explicit guest/customer collaboration flows.                                         |
| [Username](https://better-auth.com/docs/plugins/username)                         | Authentication/UX          | Not adopted                                  | Defer; email identity fits the current B2B workflow better.                                                |
| [One Tap](https://better-auth.com/docs/plugins/one-tap)                           | Authentication/UX          | Not adopted                                  | Google-heavy teams could sign in faster after social auth policy exists.                                   |
| [Sign In With Ethereum](https://better-auth.com/docs/plugins/siwe)                | Authentication/web3        | Not adopted                                  | No current product fit.                                                                                    |
| [Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth)               | Authentication/integration | Not adopted                                  | Useful for non-standard identity providers before full SSO.                                                |
| [Multi Session](https://better-auth.com/docs/plugins/multi-session)               | Authentication/UX          | Not adopted                                  | Account switching in one browser; distinct from organization switching.                                    |
| [Last Login Method](https://better-auth.com/docs/plugins/last-login-method)       | Authentication/UX          | Not adopted                                  | Show the user's last successful auth method on login.                                                      |
| [Admin](https://better-auth.com/docs/plugins/admin)                               | Authorization/management   | Not adopted                                  | Internal support console for user/session management, with strict access controls.                         |
| [Organization](https://better-auth.com/docs/plugins/organization)                 | Authorization/management   | Adopted                                      | Core organization, member, invite, role, and active-org runtime.                                           |
| [SSO](https://better-auth.com/docs/plugins/sso)                                   | Enterprise auth            | Not adopted                                  | SAML SSO for larger contractors and enterprise customers.                                                  |
| [SCIM](https://better-auth.com/docs/plugins/scim)                                 | Enterprise provisioning    | Not adopted                                  | Directory sync for enterprise organizations after SSO demand exists.                                       |
| [Agent Auth](https://better-auth.com/docs/plugins/agent-auth)                     | API/agents                 | Not adopted                                  | Capability-scoped agent authorization; relevant to Ceird's agent/MCP direction, but docs mark it unstable. |
| [API Key](https://better-auth.com/docs/plugins/api-key)                           | API/tokens                 | Not adopted                                  | Organization-owned keys for integrations, with expiry, permissions, quotas, and revocation.                |
| [JWT](https://better-auth.com/docs/plugins/jwt)                                   | API/tokens                 | Adopted                                      | Used to support OAuth Provider JWT-backed tokens; direct session-token endpoint is disabled.               |
| [Bearer](https://better-auth.com/docs/plugins/bearer)                             | API/tokens                 | Not adopted                                  | Defer; OAuth Provider bearer validation already covers MCP.                                                |
| [One-Time Token](https://better-auth.com/docs/plugins/one-time-token)             | API/tokens                 | Not adopted                                  | Useful for single-use delegated actions or secure handoff links.                                           |
| [OAuth Proxy](https://better-auth.com/docs/plugins/oauth-proxy)                   | OAuth utility              | Not adopted                                  | Useful mainly for preview/development OAuth redirect constraints.                                          |
| [OAuth 2.1 Provider](https://better-auth.com/docs/plugins/oauth-provider)         | OAuth/OIDC provider        | Adopted                                      | MCP client authorization, consent, refresh tokens, and JWT access tokens.                                  |
| [OIDC Provider](https://better-auth.com/docs/plugins/oidc-provider)               | OAuth/OIDC provider        | Not adopted                                  | Evaluate only if Ceird needs to act as a general OIDC IdP beyond current MCP use.                          |
| [MCP](https://better-auth.com/docs/plugins/mcp)                                   | OAuth/MCP                  | Partially adopted via OAuth Provider package | Compare against current `mcpHandler` integration for narrower MCP auth patterns.                           |
| [Device Authorization](https://better-auth.com/docs/plugins/device-authorization) | OAuth/device               | Not adopted                                  | Strong fit for CLI, MCP, or limited-input device approval.                                                 |
| [Stripe](https://better-auth.com/docs/plugins/stripe)                             | Billing                    | Not adopted                                  | Product/billing fit only; security value is indirect.                                                      |
| [Polar](https://better-auth.com/docs/plugins/polar)                               | Billing                    | Not adopted                                  | Defer unless Polar is selected for billing.                                                                |
| [Autumn Billing](https://better-auth.com/docs/plugins/autumn)                     | Billing                    | Not adopted                                  | Defer until packaging/pricing work.                                                                        |
| [Creem](https://better-auth.com/docs/plugins/creem)                               | Billing                    | Not adopted                                  | Defer until packaging/pricing work.                                                                        |
| [Dodo Payments](https://better-auth.com/docs/plugins/dodopayments)                | Billing                    | Not adopted                                  | Defer until packaging/pricing work.                                                                        |
| [Commet](https://better-auth.com/docs/plugins/commet)                             | Billing                    | Not adopted                                  | Defer until packaging/pricing work.                                                                        |
| [Captcha](https://better-auth.com/docs/plugins/captcha)                           | Security/abuse             | Not adopted                                  | Add selectively to high-abuse public auth flows.                                                           |
| [Have I Been Pwned](https://better-auth.com/docs/plugins/have-i-been-pwned)       | Security/passwords         | Not adopted                                  | High-value, low-UX-cost password hardening.                                                                |
| [i18n](https://better-auth.com/docs/plugins/i18n)                                 | UX/accessibility           | Not adopted                                  | Useful when auth errors need localization or consistent user-facing copy.                                  |
| [Open API](https://better-auth.com/docs/plugins/open-api)                         | Developer tooling          | Not adopted                                  | Internal auth endpoint reference and generated tests, not public docs by default.                          |
| [Test Utils](https://better-auth.com/docs/plugins/test-utils)                     | Developer tooling          | Not adopted                                  | Could simplify auth integration and E2E setup.                                                             |
| [Dub](https://better-auth.com/docs/plugins/dub)                                   | Analytics/tracking         | Not adopted                                  | Defer; no current auth/security need.                                                                      |
| [Community plugins](https://better-auth.com/docs/plugins)                         | Ecosystem                  | Not adopted                                  | Evaluate case by case after first-party options are exhausted.                                             |

## Recommended Adoption Roadmap

### P0: Security Foundation

1. Add versioned Better Auth secret support.
   - Security value: enables planned secret rotation without invalidating the
     entire auth surface.
   - Implementation shape: parse a `BETTER_AUTH_SECRETS` style config value,
     pass Better Auth `secrets`, document rotation in `auth.md`, and keep the
     existing single secret as a migration fallback.

2. Make password policy explicit and add Have I Been Pwned.
   - Security value: blocks weak and known-compromised passwords at sign-up,
     reset, and change-password boundaries.
   - UX value: users get immediate guidance before account compromise risk
     becomes support work.

3. Add account session management.
   - Security value: users can revoke a lost device without changing password.
   - UX value: settings becomes the trusted place to understand account access.
   - Scope: list active sessions, revoke one session, revoke all other
     sessions, and explain password-reset/password-change revocation behavior.

4. Harden OAuth/MCP registration and consent policy.
   - Security value: reduces broad dynamic-client and admin-scope risk.
   - Scope: constrain write/admin scope registration, improve consent copy,
     audit registrations/grants, and decide if Device Authorization or MCP
     plugin support should replace custom flow pieces.

5. Define verified-email gates.
   - Security value: prevents unverified addresses from becoming organization
     owners, inviters, OAuth consent approvers, or future API key owners.
   - UX value: users see verification as a concrete next step, not passive
     banner noise.

### P1: Strong Auth And Better Sign-In UX

1. Add two-factor authentication for privileged users.
   - Start with TOTP and backup codes.
   - Require or strongly prompt 2FA for owners/admins.
   - Handle Better Auth's two-factor sign-in redirect in the login page.

2. Add passkeys after the 2FA foundation is in place.
   - Use passkeys for phishing-resistant login and step-up verification.
   - Decide whether passkeys replace passwords for some users or supplement
     them.

3. Add captcha selectively.
   - Start with sign-up, password reset request, and repeated resend flows.
   - Keep it conditional so normal sign-in is not made worse unnecessarily.

4. Add last-login-method hints.
   - Low schema risk when cookie-backed only.
   - Helps once multiple sign-in methods exist.

5. Evaluate magic link or email OTP for invitation flows.
   - Strong fit for invited users who do not think in terms of passwords.
   - Must be paired with anti-abuse delivery limits and clear account-linking
     behavior.

### P2: Product And Enterprise Expansion

1. Add organization-owned API keys when integrations need non-browser access.
   - Use Better Auth API Key organization ownership, permissions, expiration,
     quotas, and revocation.
   - Require verified email and preferably 2FA/passkey step-up for key creation.

2. Evaluate Device Authorization for CLI, MCP, and agent workflows.
   - Useful when a client cannot comfortably run a browser redirect.
   - Aligns better with human approval than copying long-lived tokens.

3. Pilot Agent Auth only behind a feature flag.
   - The docs describe it as unstable, but it is relevant to Ceird's agent
     direction because it provides capability grants, short-lived JWTs, replay
     protection, and audit hooks.
   - Use it to model narrow agent capabilities, not as a broad API key
     replacement.

4. Add SSO and SCIM for larger customers.
   - SSO should come before SCIM unless a customer explicitly needs directory
     sync first.
   - SCIM should be organization-scoped with owner/admin management and audit
     events.

5. Consider Better Auth teams only when crews/divisions are real product
   objects.
   - Do not introduce teams only as a future-proofing abstraction.
   - If adopted, map teams to field crews, branches, regions, or operational
     units with clear permissions.

6. Add internal admin tooling only after support workflows exist.
   - The Admin plugin can be valuable, but it creates a high-risk operator
     surface.
   - Gate it with internal-only routing, 2FA/passkey step-up, audit logging,
     and least-privilege permissions.

## Defer Or Avoid For Now

- Bearer plugin: current OAuth Provider bearer token validation already covers
  the MCP path, and adding a second bearer surface would increase audit burden.
- Anonymous plugin: useful only if Ceird adds explicit guest collaboration.
- Username and phone auth: not currently better than email identity for Ceird's
  B2B workflows.
- SIWE: no product fit.
- Billing plugins: defer until subscription packaging is designed.
- OAuth Proxy: useful mainly for provider redirect constraints in preview
  environments; not a security improvement by itself.
- Dub and marketing analytics plugins: out of scope for auth hardening.

## Source Links

- Better Auth introduction: https://better-auth.com/docs/introduction
- Better Auth plugin catalog: https://better-auth.com/docs/plugins
- Better Auth options reference: https://better-auth.com/docs/reference/options
- Better Auth email/password reference:
  https://better-auth.com/docs/authentication/email-password
- Two-factor plugin: https://better-auth.com/docs/plugins/2fa
- Passkey plugin: https://better-auth.com/docs/plugins/passkey
- API key plugin: https://better-auth.com/docs/plugins/api-key
- Organization plugin: https://better-auth.com/docs/plugins/organization
- OAuth Provider plugin: https://better-auth.com/docs/plugins/oauth-provider
- MCP plugin: https://better-auth.com/docs/plugins/mcp
- Device Authorization plugin:
  https://better-auth.com/docs/plugins/device-authorization
- Agent Auth plugin: https://better-auth.com/docs/plugins/agent-auth
- SSO plugin: https://better-auth.com/docs/plugins/sso
- SCIM plugin: https://better-auth.com/docs/plugins/scim
- Captcha plugin: https://better-auth.com/docs/plugins/captcha
- Have I Been Pwned plugin:
  https://better-auth.com/docs/plugins/have-i-been-pwned
- Multi Session plugin: https://better-auth.com/docs/plugins/multi-session
- Last Login Method plugin:
  https://better-auth.com/docs/plugins/last-login-method
- Magic Link plugin: https://better-auth.com/docs/plugins/magic-link
- Email OTP plugin: https://better-auth.com/docs/plugins/email-otp
