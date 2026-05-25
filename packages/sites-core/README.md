# Sites Core

`@ceird/sites-core` is the shared sites contract package. It is consumed by the
domain HTTP handlers, the app's typed Effect HTTP client, and jobs contracts
that need site IDs or site option DTOs.

## Important Files

| File              | Purpose                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded site IDs.                                                                                 |
| `src/domain.ts`   | Runtime schemas for site coordinates, country, geocoding provider, and ISO datetime values.       |
| `src/dto.ts`      | Site create/update inputs, site option DTOs, comments, labels, and site options response schemas. |
| `src/errors.ts`   | Typed public site, geocoding, access-denied, and storage errors with HTTP annotations.            |
| `src/http-api.ts` | Effect `HttpApi` contract group for sites.                                                        |
| `src/index.ts`    | Public package exports.                                                                           |

## Commands

```bash
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/sites-core check-types
pnpm --filter @ceird/sites-core build
```

## Boundary

Put site-owned runtime schemas, DTOs, branded IDs, HTTP contract pieces, and
public typed errors here. Keep geocoding, SQL repositories, authorization, and
React state in `apps/domain` or `apps/app`.
