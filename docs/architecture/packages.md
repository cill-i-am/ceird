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

Use this package when app and API code need the same organization or membership
contract. Do not put Better Auth adapter configuration or database queries here;
those belong in `apps/api`.

## `@ceird/jobs-core`

Path: `packages/jobs-core`

Exports the shared jobs contract:

- branded IDs for jobs, contacts, rate cards, visits, collaborators, cost
  lines, activity, users, and organizations
- domain literals and schemas for job kind, status, priority, collaborator
  access, rate-card line kind, cost line fields, visits, and
  activity event types
- job comment DTOs extended from `@ceird/comments-core`
- DTO schemas and inferred DTO types
- cost summary helpers
- typed `Schema.TaggedError` classes with HTTP status annotations
- `JobsApi`, an Effect `HttpApi` contract for jobs, rate cards, job label
  assignment, collaborators, visits, comments, costs, and activity

This package is the source of truth for jobs payloads crossing the HTTP
boundary. Keep SQL repositories, React state, and service-layer authorization
out of this package.

## `@ceird/sites-core`

Path: `packages/sites-core`

Exports the shared sites and service-area contract:

- `SiteId` and `ServiceAreaId`
- site country, geocoding provider, latitude, and longitude schemas
- site create/update inputs, rich site option/detail DTOs, site options response,
  and cursor-paginated site list request/response DTOs
- site comment DTOs extended from `@ceird/comments-core`
- site label assignment inputs and endpoints; this package depends on
  `@ceird/labels-core` for label IDs and schemas
- service-area create/update/list DTOs
- typed site, service-area, access-denied, storage, and geocoding errors
- `SitesApi`, `SitesApiGroup`, and `ServiceAreasApiGroup`

Sites are independent shared organization data. Keep geocoding, SQL
repositories, authorization, and React state in the API or app.

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

apps/api
  -> @ceird/comments-core
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core

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

Root infrastructure lives outside the package workspace in `infra`, with the
deploy stack entrypoint at `alchemy.run.ts`. It may point at app/API deploy
entrypoints and API migrations by path, but shared packages should not import
root infra code.

## Testing

Each package has its own `test`, `build`, and `check-types` scripts where
applicable:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter @ceird/comments-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm run check-types:infra
```

When changing a package contract, test both the package and the consuming app or
API path. Shared packages define boundaries; consumers prove those boundaries
still compose.
