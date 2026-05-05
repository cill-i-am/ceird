# Shared Packages

## Package Boundaries

The `packages` workspace contains shared code that is not owned by one runtime
application. Keep package APIs narrow and source-backed. Move code into a
package when more than one workspace needs the same runtime contract or domain
primitive.

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
  access, rate-card line kind, cost line fields, comments, visits, and
  activity event types
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
- site create/update inputs, rich site option/detail DTOs, site options response
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

Labels are organization-level labels. Jobs may assign labels, but the label
definitions themselves are not job-owned.

## `@ceird/sandbox-core`

Path: `packages/sandbox-core`

Exports pure sandbox primitives:

- sandbox name, ID, hostname slug, and compose project name validation
- sandbox identity derivation from repo root, worktree path, and preferred branch
  name when available
- port allocation and URL-building shapes
- health payload schemas
- sandbox record reconciliation
- runtime spec construction for Docker Compose
- shared sandbox environment decoding under the `./node` export
- registry record schemas under the `./node` export

This package should stay side-effect-light. Process execution, Docker, and CLI
presentation belong in `packages/sandbox-cli`.

## `@ceird/sandbox-cli`

Path: `packages/sandbox-cli`

Implements the local sandbox command:

- `up`
- `down`
- `status`
- `list`
- `logs`
- `url`

The CLI uses Effect CLI and Node platform services. It validates a sandbox name,
loads shared environment, allocates ports, resolves runtime assets, starts
Docker Compose, applies migrations, waits for service health, persists registry
state, and formats status output.

Docker runtime assets live under `packages/sandbox-cli/docker`:

- `sandbox.compose.yaml`
- `sandbox-dev.Dockerfile`
- `sandbox-entrypoint.sh`
- `sandbox-bootstrap.mjs`
- `sandbox-bootstrap.d.mts`

## `@ceird/infra`

Path: `packages/infra`

Defines production infrastructure with Alchemy v2:

- stage config and resource naming in `src/stages.ts`
- PlanetScale Postgres resources in `src/planet-scale.ts`
- Cloudflare Hyperdrive wrapper in `src/cloudflare-hyperdrive.ts`
- Drizzle migration resource in `src/drizzle-migrations.ts`
- Cloudflare app/API/queue stack in `src/cloudflare-stack.ts`
- stack entrypoint in `alchemy.run.ts`

The stack deploys a Cloudflare Worker API, a Cloudflare Vite app, auth email
queues and dead-letter queue, Hyperdrive, and PlanetScale Postgres. It can also
run API Drizzle migrations during deployment when configured.

## Dependency Direction

Current intended dependency direction:

```text
apps/app
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core
  -> @ceird/sandbox-core

apps/api
  -> @ceird/identity-core
  -> @ceird/jobs-core
  -> @ceird/sites-core
  -> @ceird/labels-core
  -> @ceird/sandbox-core

packages/sandbox-cli
  -> @ceird/sandbox-core

packages/jobs-core
  -> @ceird/identity-core
  -> @ceird/sites-core
  -> @ceird/labels-core

packages/sites-core
  -> @ceird/identity-core

packages/labels-core
  -> @ceird/identity-core

packages/infra
  -> apps/api migrations and worker/app entrypoints by path
```

Core packages should not depend on `apps/*`.

## Testing

Each package has its own `test`, `build`, and `check-types` scripts where
applicable:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/labels-core test
pnpm --filter @ceird/sandbox-core test
pnpm --filter @ceird/sandbox-cli test
pnpm --filter @ceird/infra check-types
```

When changing a package contract, test both the package and the consuming app or
API path. Shared packages define boundaries; consumers prove those boundaries
still compose.
