# Jobs Core

`@ceird/jobs-core` is the shared jobs contract package. It is consumed by
the domain HTTP handlers and the app's typed Effect HTTP client.

## Important Files

| File              | Purpose                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded IDs for work items, contacts, collaborators, visits, users, and organizations.                                       |
| `src/domain.ts`   | Domain literals and field schemas for jobs, contacts, collaborators, activity, and visits.                                   |
| `src/dto.ts`      | Input, output, list, detail, option, activity, job-site/job-contact selection, collaborator, visit, comment, and label DTOs. |
| `src/errors.ts`   | Typed public errors with HTTP status annotations.                                                                            |
| `src/http-api.ts` | Effect `HttpApi` contract for jobs, job-label assignment, collaborators, visits, comments, and activity.                     |
| `src/index.ts`    | Public package exports.                                                                                                      |

## Commands

```bash
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/jobs-core check-types
pnpm --filter @ceird/jobs-core build
```

## Boundary

Put runtime schemas, DTOs, branded IDs, and public typed errors here when they
are job-owned and cross the app/domain boundary. Site primitives
belong in `@ceird/sites-core`; organization label definitions belong in
`@ceird/labels-core`. Keep SQL repositories in `apps/domain` and React state in
`apps/app`.
