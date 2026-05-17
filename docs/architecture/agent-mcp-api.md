# Agent MCP API

## Outcome

Ceird should expose its operational API through an authenticated HTTP MCP server
so an agent can work inside the same organization boundary as the web app:
create and update organizations, invite and manage members, configure labels,
service areas, rate cards, sites, jobs, comments, visits, costs, job labels,
collaborators, activity filters, and map-backed site/job views.

The first useful version should be a small, typed, auditable xmcp server mounted
next to `apps/api`, not a separate agent runtime. It should reuse the current
Effect services and Better Auth session/organization enforcement. Cloudflare
Agents SDK, Vercel AI SDK, and Code Mode are useful, but they fit different
jobs:

- Use xmcp for the MCP server framework, tool structure, middleware, structured
  outputs, annotations, and HTTP transport.
- Use Better Auth MCP/OAuth support for user authorization and bearer-token
  validation.
- Use Vercel AI SDK as a validation client and optional in-product agent client,
  not as the server foundation.
- Use Code Mode later if the MCP surface grows large enough that direct tools
  become expensive to load into model context.

## Current Feature Inventory

This inventory was verified against source contracts and a live sandbox on
May 16, 2026.

### Auth And Organizations

Better Auth owns `/api/auth/*` and the organization plugin. Current supported
user-facing operations include:

- sign up, sign in, sign out, session lookup, email verification, password
  reset, and resend verification
- create organization with generated slug
- list organizations and set the active organization
- update organization name only
- invite members as `admin`, `member`, or `external`
- list members and invitations
- cancel pending invitations
- accept invitations
- update member role
- remove members
- public invitation preview at
  `/api/public/invitations/:invitationId/preview`

The current auth schema includes user, organization, member, invitation,
session, account, verification, and rate-limit tables. It does not yet include
Better Auth MCP/OIDC OAuth tables such as `oauthApplication`,
`oauthAccessToken`, or `oauthConsent`.

### Jobs

Jobs are owned by `@ceird/jobs-core` and `apps/api/src/domains/jobs`.

Supported operations:

- list jobs with cursor, limit, status, assignee, coordinator, priority, site,
  label, and service-area filters
- read job options, member options, and external member options
- create jobs with title, external reference, priority, existing or inline site,
  and existing or inline contact
- get job detail
- patch title, external reference, priority, site, contact, assignee, and
  coordinator
- transition status across `new`, `triaged`, `in_progress`, `blocked`,
  `completed`, and `canceled`
- reopen jobs
- add comments
- log visits with ISO date, note, and duration minutes
- assign and remove organization labels
- add cost lines
- list, attach, update, and detach job collaborators
- list organization activity with actor, event type, date range, title, cursor,
  and limit filters

### Sites, Map Data, And Service Areas

Sites are owned by `@ceird/sites-core` and `apps/api/src/domains/sites`.

Supported operations:

- list service areas
- create and update service areas
- list sites with cursor pagination
- read bundled site/service-area form options
- create and update sites
- list and add site comments
- assign and remove site labels
- server-side geocode site addresses
- expose latitude, longitude, provider, and geocoded timestamp

Site form support data is available through the authenticated site-options
endpoint, while the cursor-paginated site list remains the scalable directory
surface for larger organizations.

The app uses those coordinates for the sites directory map state, site location
preview, Google Maps links, and jobs coverage map. The MCP server does not need
to render a map. It should expose map-ready site/job aggregates so agents can
answer questions like "which active jobs are mapped in Dublin North?".

### Labels And Rate Cards

Labels are owned by `@ceird/labels-core`.

Supported operations:

- list labels
- create labels
- update label names
- delete/archive labels, including cleanup of job assignments

Rate cards are owned by `@ceird/jobs-core`.

Supported operations:

- list rate cards
- create rate cards
- update rate card name and ordered lines

Line kinds are `labour`, `callout`, `material_markup`, and `custom`.

## Browser And API Proof

The live sandbox proof used:

- app: `https://codex-site-geocoder-provider-layers.app.ceird.localhost:1355`
- API: `https://codex-site-geocoder-provider-layers.api.ceird.localhost:1355`
- test user: `mcp-audit-owner-1778942985631@example.test`
- organization: `MCP Audit Field Team`

Browser proof:

- signed up through `/signup`
- created an organization through `/create-organization`
- invited `mcp-audit-member-1778942985631@example.test`
- entered the app shell and observed home, sidebar, hotkeys, email verification
  reminder, next actions, jobs, sites, activity, and members navigation
- opened jobs map view and verified one mapped job, zero unmapped jobs, mapped
  site rail, and status filters
- opened sites, members, organization settings, and activity pages

API proof:

- signed in through `/api/auth/sign-in/email`
- set active organization through `/api/auth/organization/set-active`
- created service area `Dublin North`
- created geocoded site `MCP Audit Site` with Google coordinates
  `53.35002060000001, -6.2597951`
- created label `Urgent access`
- created rate card `Standard 2026`
- created job `Repair loading bay shutter`
- transitioned it to `in_progress`
- added one comment
- logged one visit
- assigned the label
- added one cost line with subtotal `8500`
- verified activity events:
  `job_created`, `status_changed`, `visit_logged`, `label_added`,
  `cost_line_added`

## MCP Tool Model

The tool surface should be outcome-oriented, not a one-to-one dump of HTTP
endpoints. Agents do better when the tool names match business tasks, while the
implementation can still call the existing contracts internally.

### Read Tools

- `get_viewer_context`: return current user, active organization, role, and
  available organizations
- `list_organizations`: list organizations available to the user
- `list_members`: list current members and pending invitations
- `list_jobs`: filtered job list with pagination
- `get_job`: full job detail with comments, activity, visits, costs, contact,
  site, labels, and viewer access
- `list_job_options`: members, service areas, sites, contacts, and labels for
  planning mutations
- `list_activity`: filtered activity timeline
- `list_sites`: service areas and sites with geocoding/map readiness
- `get_site`: site detail plus related jobs when available
- `list_labels`
- `list_rate_cards`
- `get_jobs_map`: aggregate active jobs by mapped site, including unmapped jobs

### Write Tools

- `create_organization`
- `set_active_organization`
- `update_organization`
- `invite_member`
- `cancel_invitation`
- `update_member_role`
- `remove_member`
- `create_service_area`
- `update_service_area`
- `create_site`
- `update_site`
- `create_label`
- `update_label`
- `archive_label`
- `create_rate_card`
- `update_rate_card`
- `create_job`
- `update_job`
- `transition_job`
- `reopen_job`
- `add_job_comment`
- `log_job_visit`
- `assign_job_label`
- `remove_job_label`
- `add_job_cost_line`
- `list_job_collaborators`
- `attach_job_collaborator`
- `update_job_collaborator`
- `detach_job_collaborator`

Every write tool should return structured content with the updated entity,
domain errors in a stable shape, and a human-readable summary. Tools that change
access, membership, or remove data should be annotated as destructive or
privileged so clients can request confirmation when they support it.

## Authentication Recommendation

Remote HTTP MCP should use OAuth, not raw session cookies. The latest MCP
authorization spec is built around OAuth 2.1 for HTTP transports, with protected
resource metadata, authorization server discovery, PKCE, resource indicators,
bearer tokens, and scope-aware failures.

Better Auth now has MCP-provider support. Its MCP plugin handles OAuth routes,
token issuance, `withMcpAuth`, discovery metadata helpers, and a remote MCP auth
client that validates bearer tokens against a Better Auth server. The Better
Auth docs also warn that the MCP plugin will move toward the OAuth Provider
plugin, so Ceird should keep the integration thin and prefer the OAuth Provider
path when the upgraded Better Auth version supports it.

Recommended scopes:

- `ceird:read`: read viewer context, organizations, members, jobs, sites,
  labels, rate cards, and activity
- `ceird:write`: create and update jobs, sites, labels, service areas, rate
  cards, comments, visits, cost lines, and job labels
- `ceird:admin`: organization settings, invitations, member role changes,
  member removal, and collaborator grants

Authorization remains domain-owned. A token scope allows the MCP server to try
an operation, but organization role checks still happen through the existing
services and Better Auth organization hooks.

Implementation steps:

1. Add Better Auth MCP/OAuth provider configuration to `createAuthentication`.
2. Add the required OAuth tables to `authSchema` and generate a Drizzle
   migration.
3. Expose root discovery endpoints:
   `/.well-known/oauth-authorization-server` and
   `/.well-known/oauth-protected-resource`.
4. Mount `/mcp` on the API Worker or a sibling Worker.
5. Protect `/mcp` with `withMcpAuth` if in-process, or
   `createMcpAuthClient` if the MCP server is split out.
6. Convert the Better Auth MCP session user id into the same current-actor
   boundary used by jobs, sites, and labels.

## Stack Decision

### Recommended First Build

Build an in-repo xmcp slice under `apps/api/src/domains/mcp`:

- `xmcp` for tools, middleware, HTTP transport, structured outputs, and tool
  annotations
- Better Auth MCP/OAuth for auth
- Effect services for actual business operations
- `Schema` at the MCP input/output boundary
- shared DTO schemas from `@ceird/*-core`
- optional generated OpenAPI JSON from `OpenApi.fromApi(AppApi)` for docs,
  validation, and future Code Mode

This keeps one deployment boundary, one auth database, one actor model, and one
set of domain services.

### Cloudflare Agents SDK

Use Cloudflare `McpAgent` when the MCP server itself needs durable per-agent
state, cached external API calls, elicitation, embedded SQL state, or a
first-party in-product agent. Cloudflare documents that MCP servers can also be
stateless with the official MCP SDK, so `McpAgent` is not mandatory for the
first server.

Cloudflare Agents SDK is more compelling for a later "Ceird agent" that uses
Ceird MCP plus Gmail, Calendar, or external contractor systems, because its MCP
client persists connections and handles OAuth connection flows.

### Vercel AI SDK

Use Vercel AI SDK as a consumer and verifier. Its `createMCPClient` supports
HTTP MCP transport, optional OAuth providers, tool discovery, explicit typed
schemas, typed tool outputs from `structuredContent`, resources, prompts, and
elicitation. This is ideal for:

- an automated MCP smoke test
- an in-product chat/assistant client
- validating that tool schemas are usable by AI SDK agents

It is not the primary server framework.

### xmcp

xmcp is a strong TypeScript MCP framework with file-system tool registration,
middleware, HTTP and stdio transports, deployment docs, and a Better Auth
integration. It is the preferred first server framework for Ceird because it
lets us build a conventional MCP surface without inventing our own routing and
tool-loading layer.

Ceird should use xmcp directly, but not its packaged Better Auth adapter as the
primary integration. The adapter spike below means auth should be custom xmcp
middleware that validates Better Auth OAuth tokens, resolves a `CeirdMcpSession`,
and then calls existing Effect services.

### xmcp Better Auth Adapter Spike

The MCP layer should use `xmcp`, but Ceird should not use
`@xmcp-dev/better-auth@0.0.11` as the primary integration. Package inspection on
May 16, 2026 found:

- `xmcp@0.6.10` peers React 19 and Zod 3 or 4, and depends on
  `@modelcontextprotocol/sdk` plus `jose`.
- `@xmcp-dev/better-auth@0.0.11` peers `xmcp@^0.1.9-canary.1` and depends on
  `better-auth@1.3.4`, Express 4, React 18, and React Router 7.
- The adapter exports `betterAuthProvider(auth: BetterAuthConfig)` where
  `BetterAuthConfig` requires a `pg` pool, `baseURL`, `secret`, and optional
  email/password or Google provider config.
- The adapter creates a new Better Auth instance, installs the MCP plugin with
  its own `/auth/sign-in` login page, handles `/api/auth/*`,
  `/.well-known/oauth-authorization-server`, and `/mcp` with an Express router,
  and serves bundled auth UI.
- The adapter does not accept Ceird's existing Better Auth instance, does not
  expose Drizzle schema mapping hooks, and does not reuse the app's login or
  consent UI.

Use Better Auth OAuth Provider as the token authority after upgrading the app
and API Better Auth packages together to `1.6.11` or newer. Re-check the plugin
schema with the Better Auth CLI before generating the migration.

### Code Mode

Code Mode should be a second phase, not the first phase. Cloudflare's current
Code Mode material shows two useful patterns:

- direct tools can be converted into a TypeScript API and called by
  model-generated code
- large OpenAPI surfaces can be exposed with only `search()` and `execute()`

Ceird's current API is small enough for direct, outcome-based tools. Once the
surface grows beyond the point where tool descriptions are cheap, generate an
OpenAPI spec from `AppApi`, wrap it with Code Mode, and expose a compact
`search_api` plus `execute_api` pair for broad automation while keeping
high-risk operations as explicit tools.

## Validation Plan

Proof needed before calling the MCP server production-ready:

1. Contract inventory test:
   Generate a manifest from `AppApi`, Better Auth organization wrappers, and
   MCP tool registration. Fail if a supported public API operation has no MCP
   decision: exposed, intentionally grouped into an outcome tool, or
   intentionally excluded.

2. Schema test:
   For each tool, decode inputs and structured outputs with Effect `Schema`.
   Include happy paths and representative decode failures.

3. Auth discovery test:
   Verify `/.well-known/oauth-protected-resource`,
   `/.well-known/oauth-authorization-server`, dynamic client registration or
   client metadata support, token endpoint, and `WWW-Authenticate` challenges.

4. Scope test:
   Verify read-only tokens cannot mutate data, write tokens cannot administer
   members, and admin tools still enforce organization roles.

5. Actor boundary test:
   Use two organizations and two users. Verify a token can only see and mutate
   data in the user's active or explicitly selected organization.

6. End-to-end MCP smoke test:
   Use an MCP HTTP client to call:
   `get_viewer_context`, `create_service_area`, `create_site`, `create_label`,
   `create_job`, `transition_job`, `add_job_comment`, `log_job_visit`,
   `assign_job_label`, `add_job_cost_line`, `get_jobs_map`, and
   `list_activity`.

7. AI SDK consumer test:
   Use `createMCPClient` with explicit schemas and output schemas for a small
   subset of tools. Confirm structured outputs validate and tools can be used
   by an AI SDK agent loop.

8. Browser parity test:
   In the sandbox, create data through MCP and verify the app displays the same
   jobs list, jobs map, sites directory, activity timeline, and organization
   settings data.

9. Audit and safety test:
   Confirm mutating tools either create domain activity records or are covered
   by auth/organization logs. Confirm destructive/privileged tools are named and
   annotated so clients can request confirmation.

## Implementation Plan

1. Add `xmcp` and the chosen Better Auth MCP/OAuth support to `apps/api`.
2. Extend Better Auth config with MCP/OAuth provider support and add OAuth
   tables/migration.
3. Add `apps/api/src/domains/mcp` with:
   - server factory
   - auth/session adapter
   - current actor resolver
   - tool registration modules by domain
   - structured result/error helpers
4. Start with read tools and low-risk writes for jobs, sites, labels, service
   areas, and rate cards.
5. Add admin tools after scope and organization-role tests are in place.
6. Add an API route or Worker handler for `/mcp` plus well-known discovery
   endpoints.
7. Add manifest, schema, scope, and actor-boundary tests.
8. Add an AI SDK MCP client smoke test.
9. Add sandbox E2E coverage that creates data through MCP and verifies the app.
10. Revisit Code Mode once tool count or schema size becomes a measurable
    context burden.

## Source Notes

Local source of truth:

- `docs/architecture/api.md`
- `docs/architecture/auth.md`
- `docs/architecture/frontend.md`
- `packages/jobs-core/src/http-api.ts`
- `packages/sites-core/src/http-api.ts`
- `packages/labels-core/src/http-api.ts`
- `packages/*-core/src/dto.ts`
- `apps/api/src/domains/identity/authentication/auth.ts`
- `apps/api/src/domains/identity/authentication/schema.ts`

External docs checked on May 16, 2026:

- Better Auth MCP plugin:
  `https://better-auth.com/docs/plugins/mcp`
- MCP authorization spec:
  `https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`
- Vercel AI SDK MCP docs:
  `https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools`
- Vercel AI SDK `createMCPClient` reference:
  `https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client`
- Cloudflare Agents `McpAgent` docs:
  `https://developers.cloudflare.com/agents/api-reference/mcp-agent-api/`
- Cloudflare Agents MCP OAuth client docs:
  `https://developers.cloudflare.com/agents/guides/oauth-mcp-client/`
- Cloudflare Code Mode MCP post:
  `https://blog.cloudflare.com/code-mode-mcp/`
- Cloudflare Code Mode post:
  `https://blog.cloudflare.com/code-mode/`
- Cloudflare Dynamic Workers post:
  `https://blog.cloudflare.com/dynamic-workers/`
- xmcp docs:
  `https://xmcp.dev/docs`
- xmcp authentication docs:
  `https://xmcp.dev/docs/guides/authentication`
- xmcp Better Auth integration:
  `https://xmcp.dev/docs/integrations/better-auth`
