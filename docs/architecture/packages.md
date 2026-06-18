# Shared Packages

## Package Boundaries

The `packages` workspace contains shared code that is not owned by one runtime
application. Keep package APIs narrow and source-backed. Move code into a
package when more than one workspace needs the same runtime contract or domain
primitive.

## `@ceird/activity-core`

Path: `packages/activity-core`

Exports shared global activity feed contracts:

- `ActivityEventId`
- activity event, target, source, and status literals
- v1 retention constants: 30 days and latest 5,000 events per organization
- product-safe activity event display payload and row DTO schemas

Use this package when app, domain, sync-facing tests, and future feed emitters
need the same product-facing activity event contract. Keep SQL repositories,
authorization, product write-path emission, sync authorization, and UI behavior
out of this package.

## `@ceird/comments-core`

Path: `packages/comments-core`

Exports shared comment primitives used by target-specific packages:

- `CommentId`
- `CommentBodySchema`
- base comment and editable-comment DTO schemas
- add-comment input/response schemas

The base comment DTOs are domain/shared primitives and may include raw domain
author ids. Browser-facing target packages define product-safe response DTOs
with target ids and product actor ids, such as `workItemId` in
`@ceird/jobs-core` or `siteId` in `@ceird/sites-core`, rather than extending
raw user-id fields. Keep authorization, SQL ownership rows, and target-specific
service behavior out of this package.

## `@ceird/agents-core`

Path: `packages/agents-core`

Exports shared agent primitives and contracts used by the domain Worker and
Agent Worker:

- `AgentThreadId`, `AgentActionRunId`, and `AgentInstanceName`
- agent action names, action kinds, action statuses, and operation ids
- org/user/thread instance-name helpers
- connect-token payload schemas and signing/verification helpers
- thread DTOs, action request/response DTOs, and Effect `HttpApi` groups
- the route-origin sideband frame schema plus
  `agent-origin-<uuid>` `ceirdProximityOriginContextId` request-body key for
  matching an ephemeral `ProximityOriginInput` to one Agent turn without
  exposing current-location coordinates or signed typed-origin details in
  visible chat text or the persisted AI chat request body; Agent runtime caches
  must keep those frame payloads short-lived and delete them when consumed

The root export includes the Effect `HttpApi` groups used by app/domain clients.
The Agent Worker imports `@ceird/agents-core/runtime` instead; that subpath keeps
the same IDs, DTO schemas, action registry metadata, connect-token helpers, and
internal agent paths, but leaves HTTP API group construction out of the Worker
bundle.

Use this package for payloads and ids that cross between `apps/domain`,
`apps/agent`, and future bot/client surfaces. Keep AI model setup, Cloudflare
Agent runtime state, SQL repositories, authorization, and action
implementations out of this package.

## `@ceird/identity-core`

Path: `packages/identity-core`

Exports shared identity and organization primitives:

- `OrganizationId`
- organization slug schema, generation, retry suffixing, reserved system slug
  checks, and the shared `isOrganizationSlug` predicate
- organization role literals and role subsets
- product-safe actor projection DTOs for member, agent, and system display in
  activity and comments without exposing Better Auth user/session/account data
- `ProductMemberActorSummarySchema`, the shared decoded product read shape for
  `product_member_actor_summaries` Electric rows, preserving organization, user,
  and product actor ids before app data-plane consumers join assignment display
  rows
- role helpers such as `isAdministrativeOrganizationRole`,
  `isInternalOrganizationRole`, and `isExternalOrganizationRole`
- organization summary schemas
- create/update organization input schemas
- public invitation preview schema
- user preference DTOs and `UserPreferencesApiGroup`, including the global
  route-proximity location opt-in
- connected-app grant DTOs, scope-group schemas, disconnect input/response
  schemas, and typed connected-app errors used by app settings, domain identity
  handlers, and MCP consent enforcement
- `IdentityApiGroup` endpoints for organization security activity plus
  current-user connected-app listing and disconnect
- decode helpers for untrusted payloads

Use this package when app, API adapter, MCP adapter, and domain code need the
same organization, membership, current-user identity, or connected-app wire
contract. Do not put Better Auth adapter configuration or database queries here;
those belong in `apps/domain`.

## `@ceird/domain-core`

Path: `packages/domain-core`

Exports the shared contract for calling the private domain Worker:

- `DomainServiceBinding`, the typed Cloudflare service binding shape exposed to
  protocol adapters
- `DomainHttpClient`, the minimal request/response client surface used by
  adapters and future clients
- `makeDomainServiceClient`, the production service-binding client
- `makeDomainOriginClient`, the package-local development origin client
- sync shape names, private sync authorization path helpers, sync
  authorization DTO schemas, and typed sync authorization errors used by
  `apps/domain`, `apps/sync`, and the public API boundary guard; named product
  shapes include raw domain tables and product-safe projections such as
  `site-active-job-summaries`, `site-comment-bodies`, and
  `work-item-comment-bodies`

Keep product repositories, Drizzle schema, authorization, action execution, and
audit behavior out of this package. Those are owned by `apps/domain`; this
package only describes how clients call that boundary. Sync authorization logic
still belongs in `apps/domain`; `@ceird/domain-core` only defines the wire
contract and allowed shape registry.

## `@ceird/jobs-core`

Path: `packages/jobs-core`

Exports the shared jobs contract:

- branded IDs for jobs, contacts, visits, collaborators, activity, users, and
  organizations
- domain literals and schemas for job kind, status, priority, collaborator
  access, visits, activity event types, and shared active/terminal status
  groupings
- job comment DTOs extended from `@ceird/comments-core`
- product activity DTOs that reference the shared `ProductActorSchema` for
  actor display
- DTO schemas and inferred DTO types
- write-response DTOs that pair canonical job/detail payloads with
  PostgreSQL/Electric mutation `txid` metadata for clients that need sync
  confirmation after domain-owned commands
- bounded authenticated home dashboard summary DTOs for exact counts and top
  rows without full tenant job/site hydration
- route-aware proximity request/response DTOs for ranking filtered jobs by
  driving time, defaulting to active jobs unless an explicit status filter such
  as completed, canceled, all, or a concrete active state is supplied
- typed `Schema.TaggedError` classes with HTTP status annotations
- `JobsApi`, an Effect `HttpApi` contract for jobs, job label assignment,
  collaborators, visits, comments, activity, and route-aware proximity

Subpath exports `@ceird/jobs-core/ids` and `@ceird/jobs-core/dto` are available
for runtimes, such as the Agent Worker, that need schemas without pulling in the
HTTP API construction surface.

This package is the source of truth for jobs payloads crossing the HTTP
boundary. Keep SQL repositories, React state, and service-layer authorization
out of this package.

## `@ceird/sites-core`

Path: `packages/sites-core`

Exports the shared sites contract:

- `SiteId`
- site country, location status/provider, Google place, latitude, and longitude
  schemas
- site create/update inputs, rich site option/detail DTOs, site options response,
  and cursor-paginated site list request/response DTOs; agent actions layer an
  additional `{ name, eircode }` site-create shortcut in `@ceird/agents-core`
  without changing the public sites DTO
- route-aware proximity request/response DTOs for ranking mapped sites and
  previewing one site route by driving time, including active-job summary fields
- Google Places autocomplete and place-details request/response DTOs
- product-safe site comment DTOs that reuse `@ceird/comments-core` comment
  primitives while exposing product actor ids/projections instead of raw user ids
- site label assignment inputs and endpoints; this package depends on
  `@ceird/labels-core` for label IDs and schemas
- typed site, access-denied, storage, location provider, and location resolution
  errors
- `SitesApi` and `SitesApiGroup`

Subpath exports `@ceird/sites-core/ids` and `@ceird/sites-core/dto` are
available for schema-only consumers that should not bundle HTTP API groups.

Sites are independent shared organization data. Keep Google Places provider
calls, future Address Validation integration, SQL repositories, authorization,
and React state in the domain Worker or app.

## `@ceird/proximity-core`

Path: `packages/proximity-core`

Exports shared route-aware proximity contracts used by jobs, sites, the domain
Worker, the browser app, and agent action schemas:

- current-location and signed typed-origin discriminated-union inputs
- Google Maps origin autocomplete/place-details request and response DTOs
- short-lived typed-origin proof token schemas and HMAC signing/verification
  helpers for server-issued typed origins
- route summary, display-only route-line, normalized metadata, and result-limit
  schemas
- proximity provider, provider request-kind, cost-guard scope, and exclusion
  literals
- typed proximity access-denied, provider, origin-resolution, route-unavailable,
  and cost-guard errors
- `ProximityApi` and `ProximityApiGroup` for shared origin lookup endpoints

This package owns generic route/origin payload shape. It deliberately does not
depend on `@ceird/sites-core`; site-specific Google place and site-location
schemas remain in `@ceird/sites-core` to avoid package cycles. Keep provider
clients, cache policy, quota accounting, SQL repositories, authorization, and UI
state outside this package.

## `@ceird/worker-observability`

Path: `packages/worker-observability`

Exports shared Cloudflare Worker request telemetry helpers used by `apps/api`,
`apps/domain`, `apps/mcp`, `apps/sync`, and `apps/agent`:

- `WorkerObservability`, the Effect service consumed by Worker runtime
  adapters
- `makeWorkerObservabilityLive` for binding an environment-backed service
  layer
- `writeWorkerRequestAnalytics` and
  `makeWorkerRequestAnalyticsDataPoint` for direct Analytics Engine writes and
  testable datapoint shaping
- bounded sample-rate parsing, deterministic sampling, aggregate-safe path
  normalization, status-class bucketing, and duration normalization
- telemetry failure isolation so Analytics Engine write failures are request
  data loss only, not user-visible Worker failures

This package owns runtime-neutral Worker request analytics behavior. Keep
app-specific request logging, auth/security audit events, domain activity
events, Cloudflare resource declarations, and Worker entrypoints in their
owning apps or root `infra`.

## `@ceird/labels-core`

Path: `packages/labels-core`

Exports the shared organization-label contract:

- `LabelId`
- label name schema and `normalizeLabelName`
- label create/update/list DTOs
- `LabelWriteResponse`, which wraps the canonical label row with
  `mutation.txid` confirmation metadata for Electric-backed label mutation
  handlers
- typed label access-denied, storage, not-found, and name-conflict errors
- `LabelsApi` and `LabelsApiGroup`

Labels are organization-level labels. Jobs and sites may assign labels through
their owning-domain assignment endpoints, but the label definitions themselves
are not job- or site-owned.

## Dependency Direction

Current intended dependency direction:

```text
apps/app
  -> @ceird/activity-core
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core
  -> @ceird/proximity-core

apps/domain
  -> @ceird/activity-core
  -> @ceird/agents-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core
  -> @ceird/proximity-core
  -> @ceird/worker-observability

apps/agent
  -> @ceird/agents-core/runtime
  -> @ceird/worker-observability
  -> apps/domain through the private service binding

apps/api
  -> @ceird/agents-core
  -> @ceird/domain-core
  -> @ceird/worker-observability
  -> apps/domain through the private service binding

apps/mcp
  -> @ceird/domain-core
  -> @ceird/worker-observability
  -> apps/domain through the private service binding

apps/sync
  -> @ceird/domain-core
  -> @ceird/worker-observability
  -> apps/domain through the private service binding
  -> Electric SQL through the ElectricSql Durable Object/container

packages/jobs-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/proximity-core
  -> @ceird/sites-core
  -> @ceird/labels-core

packages/sites-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/labels-core
  -> @ceird/proximity-core

packages/agents-core
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/proximity-core
  -> @ceird/sites-core
  -> @ceird/labels-core

packages/proximity-core
  -> @ceird/identity-core

packages/comments-core
  -> @ceird/identity-core

packages/labels-core
  -> @ceird/identity-core

packages/activity-core
  -> @ceird/identity-core

packages/worker-observability
  -> effect
```

Core packages should not depend on `apps/*`.

Root infrastructure orchestration lives outside the package workspace in
`infra`, with the deploy stack entrypoint at `alchemy.run.ts`. Deployable apps
own their Cloudflare resource declarations under
`apps/*/infra`, but shared packages should not import root
infra code or app-owned Alchemy resource modules.

## Testing

Each package has its own `test`, `build`, and `check-types` scripts where
applicable:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter @ceird/activity-core test
pnpm --filter @ceird/agents-core test
pnpm --filter @ceird/comments-core test
pnpm --filter @ceird/domain-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm --filter @ceird/proximity-core test
pnpm --filter @ceird/worker-observability test
pnpm run check-types:infra
```

When changing a package contract, test both the package and the consuming app or
API path. Shared packages define boundaries; consumers prove those boundaries
still compose.

Shared core packages that own cross-runtime DTO and domain primitives should
prefer `noUncheckedIndexedAccess` once their local assumptions are guarded.
Use explicit element, tuple, and optional-value checks at package boundaries
rather than non-null assertions or broad casts.
