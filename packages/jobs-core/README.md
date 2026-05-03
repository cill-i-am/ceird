# Jobs Core

`@task-tracker/jobs-core` is the shared jobs contract package. It is consumed by
the API handlers and the app's typed Effect HTTP client.

## Important Files

| File              | Purpose                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded IDs for work items, sites, contacts, service areas, rate cards, labels, collaborators, visits, costs, users, and organizations. |
| `src/domain.ts`   | Domain literals and field schemas for jobs, contacts, sites, activity, labels, visits, and costs.                                       |
| `src/dto.ts`      | Input, output, list, detail, option, activity, site, configuration, and cost DTO schemas.                                               |
| `src/errors.ts`   | Typed public errors with HTTP status annotations.                                                                                       |
| `src/http-api.ts` | Effect `HttpApi` contract for jobs, sites, service areas, and rate cards.                                                               |
| `src/index.ts`    | Public package exports.                                                                                                                 |

## Commands

```bash
pnpm --filter @task-tracker/jobs-core test
pnpm --filter @task-tracker/jobs-core check-types
pnpm --filter @task-tracker/jobs-core build
```

## Boundary

Put runtime schemas, DTOs, branded IDs, cost helpers, and public typed errors
here when they cross the app/API boundary. Keep SQL repositories in `apps/api`
and React state in `apps/app`.
