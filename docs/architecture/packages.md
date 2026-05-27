# Shared Packages

## Package Boundaries

The `packages` workspace contains shared code that is not owned by one runtime
application. Keep package APIs narrow and source-backed. Move code into a
package when more than one workspace needs the same runtime contract or domain
primitive.

## `@ceird/comments-core`

Path: `packages/comments-core`

Exports shared comment primitives used by target-specific packages:

- `CommentId`
- `CommentBodySchema`
- base comment and editable-comment DTO schemas
- add-comment input/response schemas

Target packages extend the base comment DTO with their own target IDs, such as
`workItemId` in `@ceird/jobs-core` or `siteId` in `@ceird/sites-core`. Keep
authorization, SQL ownership rows, and target-specific service behavior out of
this package.

## `@ceird/agents-core`

Path: `packages/agents-core`

Exports shared agent primitives and contracts used by the domain Worker and
Agent Worker:

- `AgentThreadId`, `AgentActionRunId`, and `AgentInstanceName`
- agent action names, action kinds, action statuses, and operation ids
- org/user/thread instance-name helpers
- connect-token payload schemas and signing/verification helpers
- thread DTOs, action request/response DTOs, and Effect `HttpApi` groups

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
- organization role literals and role subsets
- role helpers such as `isAdministrativeOrganizationRole`,
  `isInternalOrganizationRole`, and `isExternalOrganizationRole`
- organization summary schemas
- create/update organization input schemas
- public invitation preview schema
- decode helpers for untrusted payloads

Use this package when app, API adapter, MCP adapter, and domain code need the same organization or membership
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

Keep product repositories, Drizzle schema, authorization, action execution, and
audit behavior out of this package. Those are owned by `apps/domain`; this
package only describes how clients call that boundary.

## `@ceird/jobs-core`

Path: `packages/jobs-core`

Exports the shared jobs contract:

- branded IDs for jobs, contacts, visits, collaborators, activity, users, and
  organizations
- domain literals and schemas for job kind, status, priority, collaborator
  access, visits, and activity event types
- job comment DTOs extended from `@ceird/comments-core`
- DTO schemas and inferred DTO types
- typed `Schema.TaggedError` classes with HTTP status annotations
- `JobsApi`, an Effect `HttpApi` contract for jobs, job label assignment,
  collaborators, visits, comments, and activity

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
  and cursor-paginated site list request/response DTOs
- Google Places autocomplete and place-details request/response DTOs
- site comment DTOs extended from `@ceird/comments-core`
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

## `@ceird/labels-core`

Path: `packages/labels-core`

Exports the shared organization-label contract:

- `LabelId`
- label name schema and `normalizeLabelName`
- label create/update/list DTOs
- typed label access-denied, storage, not-found, and name-conflict errors
- `LabelsApi` and `LabelsApiGroup`

Labels are organization-level labels. Jobs and sites may assign labels through
their owning-domain assignment endpoints, but the label definitions themselves
are not job- or site-owned.

## Dependency Direction

Current intended dependency direction:

```text
apps/app
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core

apps/domain
  -> @ceird/agents-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core

apps/agent
  -> @ceird/agents-core/runtime
  -> apps/domain through the private service binding

apps/api
  -> @ceird/agents-core
  -> @ceird/domain-core
  -> apps/domain through the private service binding

apps/mcp
  -> @ceird/domain-core
  -> apps/domain through the private service binding

packages/jobs-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/sites-core
  -> @ceird/labels-core

packages/sites-core
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/labels-core

packages/comments-core
  -> @ceird/identity-core

packages/labels-core
  -> @ceird/identity-core
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
pnpm --filter @ceird/agents-core test
pnpm --filter @ceird/comments-core test
pnpm --filter @ceird/domain-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm run check-types:infra
```

When changing a package contract, test both the package and the consuming app or
API path. Shared packages define boundaries; consumers prove those boundaries
still compose.
