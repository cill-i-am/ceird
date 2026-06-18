# Labels Core

`@ceird/labels-core` is the shared organization-label contract package. It is
consumed by the domain HTTP handlers, the app's typed Effect HTTP client, and jobs
contracts that assign organization labels to jobs.

## Important Files

| File              | Purpose                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded organization label IDs.                                                                                         |
| `src/domain.ts`   | Runtime schemas for label names, canonical OKLCH colors, optional descriptions, normalization, and ISO datetime values. |
| `src/dto.ts`      | Label create/update inputs, label DTOs, active/archived/all list query, read response, and list response schemas.       |
| `src/errors.ts`   | Typed public label access-denied, storage, not-found, name-conflict, and restore-conflict errors with HTTP annotations. |
| `src/http-api.ts` | Effect `HttpApi` contract group for organization label lifecycle endpoints.                                             |
| `src/index.ts`    | Public package exports.                                                                                                 |

## Commands

```bash
pnpm --filter @ceird/labels-core test
pnpm --filter @ceird/labels-core check-types
pnpm --filter @ceird/labels-core build
```

## Boundary

Put organization-label runtime schemas, DTOs, branded IDs, HTTP contract
pieces, and public typed errors here. Job-label assignment remains job-owned,
but label definitions are independent organization data. Labels carry canonical
OKLCH `color`, optional admin-facing `description`, and soft-archive lifecycle
state. Active label names are unique per organization after trim, whitespace
collapse, and case-insensitive normalization; archived names can be reused by
active labels, and restore conflicts are typed. Keep SQL repositories,
authorization, and React state in `apps/domain` or `apps/app`.
