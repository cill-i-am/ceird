# Domain Core

`@ceird/domain-core` contains the shared client contract for calling the private
`apps/domain` Worker.

It is intentionally small: protocol adapters use it to type the `DOMAIN`
Cloudflare service binding and to construct request/response clients for
production service bindings or package-local development origins.

It also defines the private sync authorization contract shared by the domain
Worker, public sync Worker, and public API boundary guard: allowed sync shape
names, `/sync/internal/*` path helpers, authorization response schemas, and
typed sync errors. The package does not decide whether a request is authorized;
that policy remains in `apps/domain`.

Product repositories, Drizzle schema, migrations, authorization, action
execution, audit/activity recording, and backend runtime wiring belong in
`apps/domain`, not this package.

Focused checks:

```bash
pnpm --filter @ceird/domain-core test
pnpm --filter @ceird/domain-core check-types
```
