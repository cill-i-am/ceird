# Better Auth MCP And Agent Auth Evaluation

Date: 2026-06-08
Linear: `TSK-69`
Status: Decision recorded

## Decision

Keep Ceird's current MCP authorization shape:

- Better Auth OAuth Provider remains the OAuth/OIDC authorization server.
- `@better-auth/oauth-provider`'s `mcpHandler` remains the MCP bearer
  validation wrapper.
- Ceird's domain Worker continues to own MCP tool execution, organization actor
  resolution, and tool-level scope checks.

Do not adopt Better Auth's standalone `mcp` plugin. The current Better Auth docs
say that plugin will soon be deprecated in favor of the OAuth Provider plugin,
and Ceird is already on the OAuth Provider path.

Do not adopt `@better-auth/agent-auth` in this project. It is directionally
interesting for a future public agent-capability platform, but the docs mark
the standard and plugin as unstable. It also solves a different problem from
Ceird's current MCP bearer validation: agent discovery, registration, approval,
and capability execution.

Keep Device Authorization as a separate decision under `TSK-68`. It is useful
for CLI and limited-input approval flows, but it should not be bundled into the
MCP/Agent Auth plugin decision without a concrete client UX.

## Why This Is The Better Default

Ceird's current implementation already matches Better Auth's forward direction
for MCP:

- OAuth Provider is installed with JWT support, authorization-code and refresh
  token grants, dynamic client registration, consent, OIDC metadata, issuer
  configuration, and MCP resource audiences.
- MCP bearer requests are validated with JWKS-backed JWT verification requiring
  the configured issuer and `MCP_RESOURCE_URL` audience.
- MCP token payloads must include `sid`, `sub`, and `client_id`, so tool
  execution can be tied back to a Better Auth session, user, OAuth client, and
  organization.
- `ceird:*` scopes are organization-scoped through OAuth consent reference ids
  and a custom access-token claim.
- Tool execution uses the same Effect domain services and organization
  authorization boundaries as the HTTP API.
- The MCP resource server already exposes protected-resource metadata at the
  root and path-specific well-known URLs.

Replacing this with the standalone `mcp` plugin would move Ceird onto the path
Better Auth itself is deprecating. It would also trade away Ceird-specific
controls that are now important product policy: organization-scoped consent,
public-client DCR guardrails, Ceird scope grouping, app-owned consent UX,
session/org actor validation, and domain-owned audit behavior.

Agent Auth should be revisited, but not as a hidden implementation detail. It
would introduce new product surfaces and persistence: agent identity, host
registration, capability discovery, approval flows, grants, replay-protected
JWTs, capability execution routes, and user-facing approval UI. That is a
product bet, not a drop-in replacement for OAuth Provider MCP authorization.

## Options Considered

| Option                                    | Fit For Current Project | Benefit                                                                                          | Cost / Risk                                                                                                                               | Decision                           |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Keep OAuth Provider plus `mcpHandler`     | High                    | Aligns with Better Auth's preferred MCP direction; preserves Ceird's org, consent, and tool auth | Leaves Ceird responsible for MCP tool policy and resource-server glue, which is appropriate because those are product-specific controls   | Adopt as the recorded policy       |
| Adopt standalone Better Auth `mcp` plugin | Low                     | Provides same-process MCP session helpers and legacy MCP OAuth endpoints                         | Docs say it will be deprecated; it is based on the legacy OIDC provider path; would duplicate or weaken current OAuth Provider controls   | Reject for Ceird                   |
| Use Better Auth MCP remote client wrapper | Low today               | Helpful if the MCP server is a separate service, repo, runtime, or language                      | Ceird's MCP endpoint is inside the domain Worker behind the same private service boundary, so this adds indirection without removing risk | Defer unless runtime split occurs  |
| Adopt `@better-auth/agent-auth` now       | Low today               | Standardized agent discovery, grants, approvals, capability JWTs, and audit hooks                | Plugin/standard are unstable; separate package source is not in `opensrc`; requires product decisions and approval UI                     | Defer until stable and product-led |
| Adopt Device Authorization in this spike  | Medium later            | Better CLI/limited-input authorization UX                                                        | Separate UX and client decision; not needed to decide MCP vs Agent Auth                                                                   | Keep in `TSK-68`                   |

## Current Ceird Baseline

Server configuration:

- `apps/domain/src/domains/identity/authentication/auth.ts` installs
  `jwt()` and `oauthProvider()` with:
  - dynamic client registration enabled
  - unauthenticated public-client registration enabled
  - Ceird scope allow/default lists
  - custom access-token claims for organization-scoped Ceird scopes
  - app-owned login and consent pages
  - organization-scoped post-login consent references
  - OAuth token hashing
  - valid audiences including the auth base URL and `MCP_RESOURCE_URL`
- The app client installs `oauthProviderClient()` in
  `apps/app/src/lib/auth-client.ts`.
- The consent UI in `apps/app/src/features/auth/oauth-consent-page.tsx` fetches
  public OAuth client metadata and submits Better Auth-native consent decisions.

MCP resource server:

- `apps/domain/src/domains/mcp/http.ts` wraps the Effect AI MCP server with
  `mcpHandler`.
- The wrapper verifies JWT bearer tokens with the OAuth issuer JWKS and the MCP
  resource audience.
- Token payload decoding requires `sid`, `sub`, and `client_id`; Ceird scopes
  are normalized and checked before tools run.
- The authorized MCP app cache is partitioned by session id, user id,
  organization id, OAuth client id, and normalized scopes.
- `apps/domain/src/domains/mcp/actor.ts` resolves the Better Auth session row,
  checks user/session consistency, resolves the active or token organization,
  and loads the member role before domain authorization runs.
- `apps/domain/src/domains/mcp/tools.ts` maps each MCP tool to a required
  Ceird scope.

Architecture docs already describe this as the source of truth:

- `docs/architecture/auth.md`
- `docs/architecture/api.md`

## Better Auth Findings

OAuth Provider:

- Current docs describe OAuth Provider as the plugin that turns Better Auth into
  an OAuth 2.1 provider with OIDC compatibility, Dynamic Client Registration,
  JWT-backed access tokens, JWKS verification, consent, token revocation,
  introspection, and MCP support.
- The OAuth Provider docs show resource-server JWT verification and the
  `mcpHandler` helper from `@better-auth/oauth-provider`, which is the helper
  Ceird already uses.
- The local source for `@better-auth/oauth-provider@1.6.11` confirms that
  `mcpHandler` verifies bearer tokens through `verifyAccessToken` and emits
  OAuth protected-resource challenges.

Standalone MCP plugin:

- Current docs say the standalone `mcp` plugin will soon be deprecated in favor
  of OAuth Provider.
- Its local source lives under `better-auth/src/plugins/mcp` and is based on
  the older OIDC Provider model.
- It provides same-process helpers such as `withMcpAuth` and `getMcpSession`,
  plus a remote MCP client wrapper for separate MCP services. Those are useful
  patterns, but they are not a better fit than Ceird's current in-domain
  `mcpHandler` integration.

Agent Auth:

- Current docs describe Agent Auth as identity, registration, discovery, and
  capability-based authorization for AI agents.
- The feature set includes OpenAPI and MCP adapters, discovery at
  `/.well-known/agent-configuration`, delegated/autonomous modes, device/CIBA
  approval, short-lived signed JWTs with replay protection, and lifecycle audit
  hooks.
- The docs explicitly mark the standard and plugin as unstable.
- `@better-auth/agent-auth` is not present in the current workspace
  dependencies or fetched `opensrc` package list. The fetched Better Auth
  monorepo has docs and CLI scaffolding references, not the package source that
  Ceird would need to review before adoption.

Device Authorization:

- Current docs position Device Authorization as the OAuth device grant for
  CLIs, smart TVs, IoT, and other limited-input clients.
- This is relevant to future MCP/CLI UX, but it is not needed to decide whether
  to replace Ceird's MCP authorization layer.

## Revisit Triggers

Reopen Agent Auth evaluation only when at least one of these is true:

- Better Auth removes the instability warning and publishes stable package
  source that is fetched into `opensrc`.
- Ceird has a concrete product requirement for third-party agent registration,
  capability discovery, or delegated/autonomous agent grants.
- Ceird wants external agents to call capabilities outside the existing
  authenticated browser session and private Agent Worker connect-token model.

Reopen MCP plugin evaluation only if Better Auth reverses the deprecation path
or Ceird moves MCP execution into a separate service where the remote MCP client
wrapper can remove meaningful custom code.

Reopen Device Authorization through `TSK-68` when CLI or limited-input approval
is a near-term product surface.

## Follow-Up Work

No implementation issue is recommended from `TSK-69`.

Keep these adjacent backlog items separate:

- `TSK-68`: Device Authorization for CLI/MCP or limited-input clients.
- Connected-app/consent management: user-visible OAuth client and consent
  review/revocation UX.
- API-key strategy: organization-owned integration credentials separate from
  MCP OAuth clients.
- Future Agent Auth spike: only after the stability and product triggers above
  are met.

## Sources

- Better Auth OAuth Provider docs:
  https://better-auth.com/docs/plugins/oauth-provider
- Better Auth MCP docs:
  https://better-auth.com/docs/plugins/mcp
- Better Auth Agent Auth docs:
  https://better-auth.com/docs/plugins/agent-auth
- Better Auth Device Authorization docs:
  https://better-auth.com/docs/plugins/device-authorization
- Local Better Auth source:
  `opensrc/repos/github.com/better-auth/better-auth/packages/oauth-provider/src/mcp.ts`
- Local standalone MCP plugin source:
  `opensrc/repos/github.com/better-auth/better-auth/packages/better-auth/src/plugins/mcp/index.ts`
