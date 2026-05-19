# Domain Core

`@ceird/domain-core` contains the shared client contract for calling the private
`apps/domain` Worker.

It is intentionally small: protocol adapters use it to type the `DOMAIN`
Cloudflare service binding and to construct request/response clients for
production service bindings or package-local development origins.

Product repositories, Drizzle schema, migrations, authorization, action
execution, audit/activity recording, and backend runtime wiring belong in
`apps/domain`, not this package.

Focused checks:

```bash
pnpm --filter @ceird/domain-core test
pnpm --filter @ceird/domain-core check-types
```
