# Sites Core

`@ceird/sites-core` is the shared sites and service-area contract package. It
is consumed by the API handlers, the app's typed Effect HTTP client, and jobs
contracts that need site IDs or site option DTOs.

## Important Files

| File              | Purpose                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `src/ids.ts`      | Branded site and service-area IDs.                                                                   |
| `src/domain.ts`   | Runtime schemas for site coordinates, country, geocoding provider, and ISO datetime values.          |
| `src/dto.ts`      | Site create/update inputs, site option DTOs, site options response, and service-area DTO schemas.    |
| `src/errors.ts`   | Typed public site, service-area, geocoding, access-denied, and storage errors with HTTP annotations. |
| `src/http-api.ts` | Effect `HttpApi` contract groups for sites and service areas.                                        |
| `src/index.ts`    | Public package exports.                                                                              |

## Commands

```bash
pnpm --filter @ceird/sites-core test
pnpm --filter @ceird/sites-core check-types
pnpm --filter @ceird/sites-core build
```

## Boundary

Put site-owned runtime schemas, DTOs, branded IDs, HTTP contract pieces, and
public typed errors here. Keep geocoding, SQL repositories, authorization, and
React state in `apps/api` or `apps/app`.
