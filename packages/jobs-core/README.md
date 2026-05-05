# Jobs Core

`@ceird/jobs-core` is the shared jobs contract package. It is consumed by
the API handlers and the app's typed Effect HTTP client.

## Important Files

| File              | Purpose                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded IDs for work items, contacts, rate cards, collaborators, visits, costs, users, and organizations.                   |
| `src/domain.ts`   | Domain literals and field schemas for jobs, contacts, collaborators, activity, rate cards, visits, and costs.               |
| `src/dto.ts`      | Input, output, list, detail, option, activity, job-site/job-contact selection, rate-card, and cost DTO schemas.             |
| `src/errors.ts`   | Typed public errors with HTTP status annotations.                                                                           |
| `src/http-api.ts` | Effect `HttpApi` contract for jobs, rate cards, job-label assignment, collaborators, visits, comments, costs, and activity. |
| `src/index.ts`    | Public package exports.                                                                                                     |

## Commands

```bash
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/jobs-core check-types
pnpm --filter @ceird/jobs-core build
```

## Boundary

Put runtime schemas, DTOs, branded IDs, cost helpers, and public typed errors
here when they are job-owned and cross the app/API boundary. Site primitives
belong in `@ceird/sites-core`; organization label definitions belong in
`@ceird/labels-core`. Keep SQL repositories in `apps/api` and React state in
`apps/app`.
