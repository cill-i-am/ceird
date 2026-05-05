# Labels Core

`@ceird/labels-core` is the shared organization-label contract package. It is
consumed by the API handlers, the app's typed Effect HTTP client, and jobs
contracts that assign organization labels to jobs.

## Important Files

| File              | Purpose                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded organization label IDs.                                                                       |
| `src/domain.ts`   | Runtime schemas for label names, label name normalization, and ISO datetime values.                   |
| `src/dto.ts`      | Label create/update inputs, label DTOs, and label list response schemas.                              |
| `src/errors.ts`   | Typed public label access-denied, storage, not-found, and name-conflict errors with HTTP annotations. |
| `src/http-api.ts` | Effect `HttpApi` contract group for organization label CRUD.                                          |
| `src/index.ts`    | Public package exports.                                                                               |

## Commands

```bash
pnpm --filter @ceird/labels-core test
pnpm --filter @ceird/labels-core check-types
pnpm --filter @ceird/labels-core build
```

## Boundary

Put organization-label runtime schemas, DTOs, branded IDs, HTTP contract
pieces, and public typed errors here. Job-label assignment remains job-owned,
but label definitions are independent organization data. Keep SQL repositories,
authorization, and React state in `apps/api` or `apps/app`.
