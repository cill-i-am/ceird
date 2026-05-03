# Identity Core

`@task-tracker/identity-core` contains shared identity and organization
contracts used by the app, API, and jobs core package.

## Exports

- `OrganizationId`
- organization role literals: `owner`, `admin`, `member`, `external`
- role subsets for administrative, internal, and invitable roles
- role helpers: `isAdministrativeOrganizationRole`,
  `isInternalOrganizationRole`, `isExternalOrganizationRole`
- organization summary schemas and list schemas
- create/update organization input schemas
- public invitation preview schema
- decode helpers for untrusted payloads

## Commands

```bash
pnpm --filter @task-tracker/identity-core test
pnpm --filter @task-tracker/identity-core check-types
pnpm --filter @task-tracker/identity-core build
```

## Boundary

Put shared identity DTOs and runtime schemas here when both frontend and
backend need the same contract. Keep Better Auth configuration, Drizzle schema,
and persistence logic in `apps/api`.
