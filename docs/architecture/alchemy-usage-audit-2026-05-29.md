# Alchemy Usage Audit

Date: 2026-05-29

Refresh basis: updated after pulling `origin/main` through commit `dc069bca`
on 2026-05-29.

## Scope

This audit reviews Ceird's Alchemy v2 usage across the root stack, app-owned
Cloudflare resource modules, stage configuration, Neon/Hyperdrive/Drizzle
database path, custom Cloudflare tenant routing providers, CI workflows, local
developer workflows, and Worker runtime boundaries.

It compares the implementation against the current Alchemy v2 documentation:

- [Stack](https://v2.alchemy.run/concepts/stack/)
- [Binding](https://v2.alchemy.run/concepts/binding/)
- [State Store](https://v2.alchemy.run/concepts/state-store/)
- [Cloudflare Worker](https://v2.alchemy.run/providers/cloudflare/worker/)
- [Hyperdrive tutorial](https://v2.alchemy.run/tutorial/cloudflare/hyperdrive/)
- [Drizzle tutorial](https://v2.alchemy.run/tutorial/cloudflare/drizzle/)
- [Branch from a shared database](https://v2.alchemy.run/tutorial/cloudflare/branch-from-shared-database/)
- [Continuous Integration](https://v2.alchemy.run/guides/ci/)
- [Monorepos](https://v2.alchemy.run/guides/monorepo/)
- [Secrets and env vars](https://v2.alchemy.run/guides/secrets/)
- [Custom resource provider](https://v2.alchemy.run/guides/custom-provider/)
- [AI Gateway tutorial](https://v2.alchemy.run/tutorial/cloudflare/ai-gateway/)

No provider-mutating commands were run for this audit.

## Reference Architecture Update

The reference-architecture pass implemented the top non-destructive
recommendations from this audit:

- Agent model traffic now uses a managed `Cloudflare.AiGateway` binding and
  passes the gateway ID to `workers-ai-provider`.
- Agent and MCP `/health` endpoints report the Alchemy stack/stage identity
  without depending on downstream domain availability.
- `pnpm alchemy:doctor` and `pnpm alchemy:state-audit` provide read-only local
  and CI checks for stage safety, provider env, managed Neon/AI Gateway state,
  legacy tombstones, and tenant route drift.
- Preview and staging CI share
  `scripts/restore-alchemy-state-store-credentials.mjs` and run the state audit
  after deploy, allowing only the known legacy Drizzle tombstone.
- Tenant DNS/route custom providers now have `alchemy/Test/Vitest` lifecycle
  coverage in addition to focused provider unit tests.
- The unused Domain Worker `workerDatabaseUrl` helper was removed so deployed
  database resolution lives in the Cloudflare runtime boundary.
- The new [Alchemy Reference Architecture](./alchemy-reference-architecture.md)
  guide captures the policy for future Workers, bindings, secrets, preview
  resources, custom providers, AI Gateway, live state audits, and Effect Worker
  adoption.

## Executive Summary

Ceird's Alchemy usage is now very strong. The refreshed `origin/main` moved the
project materially closer to the current Alchemy v2 shape: it uses a single
source-defined root stack, remote Cloudflare state, explicit stages, native Neon
projects and branches, native Hyperdrive, `Drizzle.Schema`, Cloudflare Worker
resource bindings, app-owned infra modules, guarded CI preview stages, and an
Alchemy-native local dev wrapper.

The latest upstream changes resolved two of the biggest previous audit items:
the repo now tracks `alchemy@2.0.0-beta.52`, and `pnpm dev` now runs through
`scripts/alchemy-dev.mjs`, which derives intentional branch-based stages,
refuses detached worktrees without an explicit stage, loads `.env.local`,
starts Alchemy local RPC services, and configures local Worker origins.

The remaining highest-value improvements are now narrower:

- Retest beta-era workarounds now that beta.52 is in place, especially
  `alchemy/Drizzle/Providers` and manual service binding types.
- Retire the legacy `Drizzle.Migrations` tombstone once live state confirms it
  is safe.
- Keep watching for native Alchemy Cloudflare DNS/Worker-route resources that
  can replace Ceird's custom tenant-routing providers.
- Re-evaluate Alchemy's Effect Worker/Worker Layer style only when it removes
  real adapter code for a new or simplified Worker.

## Scorecard

| Area                  | Assessment        | Notes                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack and stage model | Excellent         | `alchemy.run.ts` owns one root stack, reads `Stack.stage`, and uses explicit stage-derived naming. The dev wrapper now derives branch-based stages and rejects detached worktrees without `--stage`.                                                                                                         |
| State store           | Excellent         | `Cloudflare.state()` is used, `.alchemy/` is ignored, and CI/local docs avoid checked-in state.                                                                                                                                                                                                              |
| Monorepo layout       | Excellent         | Root stack orchestrates shared infra while app-owned `apps/*/infra` modules own Worker declarations. This matches the single-stack monorepo recommendation for one deploy cadence.                                                                                                                           |
| Local Alchemy dev     | Excellent         | `pnpm dev` now runs a project wrapper around Alchemy local dev, loads `.env.local`, supplies local Worker origins, and uses the same native Hyperdrive binding locally while omitting only the deployed-only resource bindings that workerd still rejects.                                                   |
| Neon and Hyperdrive   | Excellent         | Parent stage creates the Neon project; child stages `Neon.Project.ref` the parent; Hyperdrive consumes `branch.origin`, not a pooled URI. Local Alchemy dev now uses beta.52's native local Hyperdrive path, while `DATABASE_URL` remains reserved for package-local domain runs outside the Worker runtime. |
| Drizzle deploy path   | Excellent         | `Drizzle.Schema` feeds `Neon.Branch` migration ordering; production and child migration directories are intentionally separated.                                                                                                                                                                             |
| Worker bindings       | Excellent         | Async Worker `env` declarations plus typed runtime env contracts match current Worker docs. The Agent Worker now uses a native AI Gateway resource, and local dev omits only unsupported email/queue/analytics bindings by leaving those `env` keys absent. Some manual typing remains for service bindings. |
| Effect-native runtime | Strong but uneven | Domain/API/MCP are Effect-based behind async Workers; Domain local database configuration is now typed and explicit. Agent routing improved, but still has the clearest upside from Effect-style cleanup.                                                                                                    |
| Custom providers      | Strong            | Tenant DNS/routes implement `read`, `reconcile`, `diff`, and idempotent-ish delete behavior with focused tests and Alchemy lifecycle tests. Native Alchemy does not currently expose a generic Worker route/DNS resource that covers the wildcard use case.                                                  |
| CI/previews           | Excellent         | Explicit `pr-<number>` stages, same-repo secret gates, protected environments, health probes, state reads, post-deploy state audits, shared credential restore, and destroy guardrails are in place.                                                                                                         |
| Observability         | Strong            | Worker health consistently reports stack/stage identity, and Agent health exposes its AI Gateway ID. AI Gateway gives model calls a managed Cloudflare observability point.                                                                                                                                  |
| Simplicity            | Strong            | The remaining complexity is explainable. The raw AI binding, duplicated database URL helper, and CI credential restore duplication have been removed; legacy tombstones and provider-layer casts remain the main cleanup candidates.                                                                         |

## Current Architecture Inventory

### Root stack

`alchemy.run.ts` declares the single `ceird` stack, merges Cloudflare, Drizzle,
Neon, custom tenant-routing, and legacy tombstone providers, and stores state in
Cloudflare. It reads the active stage through `Stack`, loads a validated
`InfraStageConfig`, creates database resources, then Cloudflare resources, and
returns operator-facing outputs without exposing the direct Neon connection URI.

Relevant code:

- `alchemy.run.ts`
- `infra/stages.ts`
- `infra/neon.ts`
- `infra/cloudflare-stack.ts`

This aligns well with Alchemy's stack concept: one stack groups resources,
providers, stage state, and outputs. It also matches the monorepo guide's
single-stack recommendation for projects where one team owns the app surfaces
and wants one deploy/destroy command per environment.

### Stage and config boundary

`infra/stages.ts` treats the Alchemy stage as the infrastructure identity. It
normalizes long or unusual branch names into provider-safe slugs, derives
Cloudflare names and hostnames, validates environment-driven config with
Effect `Config` and `Schema`, redacts secrets, and disables auth rate limiting
by default only for PR stages.

This is one of the better parts of the system. It prevents a second environment
axis from growing beside Alchemy's own stage model, and it keeps provider
naming deterministic.

The refreshed local dev wrapper strengthens this model. `scripts/alchemy-dev.mjs`
defaults to an intentional branch-derived stage, maps `main`/`master` to
`dev_$USER`, and fails fast in detached worktrees unless `--stage` is passed.
That directly matches the repository rule that Alchemy stages should be
task-specific and explicit.

### Neon, Drizzle, and Hyperdrive

The database path is strongly aligned with current best practice:

- Parent stage creates `Neon.Project("PostgresProject")`.
- Child stages use `Neon.Project.ref("PostgresProject", { stage: parent })`.
- `Drizzle.Schema("DatabaseSchema", ...)` generates Alchemy-managed SQL.
- `Neon.Branch("PostgresBranch", { migrationsDir })` applies migrations.
- Hyperdrive uses `branch.origin` via `database.hyperdriveOrigin`.
- Direct database URLs are not stack outputs; CI reads `PostgresBranch` state
  only for masked Playwright setup.
- Local Alchemy dev now keeps the Domain `DATABASE` Hyperdrive binding through
  beta.52's local provider support. `DATABASE_URL` remains the package-local
  fallback for non-Alchemy domain runs.

This is the exact shape Alchemy's current Hyperdrive/Drizzle/shared-database
guides push toward. The extra `makeAppliedMigrationsDir` dependency wrapper is
intentional: it keeps `Drizzle.Schema` ordered before the branch while letting
the parent stage apply checked-in historical migrations and child stages apply
the Alchemy-generated snapshot directory.

### Cloudflare Workers

The app/API/MCP/Agent/domain resources are app-owned modules under
`apps/*/infra`, orchestrated from `infra/cloudflare-stack.ts`. That ownership
split is good: infra controls shared topology; each surface owns its Worker
binding and env contract.

The async Worker resources use `env` and `Cloudflare.InferEnv` where it is
usable. API/MCP/Agent service bindings still need manual runtime env typing
because the typed resource does not infer the Cloudflare `Service` runtime shape
cleanly for these cross-Worker bindings.

The Domain Worker owns the Hyperdrive binding, auth email queue, and email
binding. Public API/MCP/Agent Workers talk to it through `DOMAIN` service
bindings. This keeps database access out of public adapters, which is the right
Cloudflare/Alchemy boundary for this app.

Local dev now uses Alchemy's dev context explicitly. `infra/cloudflare-stack.ts`
derives stage-scoped local browser origins such as
`https://app.codex-my-task.ceird.localhost`, passes those origins into
app-owned Worker env, skips tenant routing and the auth email queue consumer
locally, keeps the Domain `DATABASE` Hyperdrive binding through the native
beta.52 local provider path, and omits only the deployed-only
email/queue/analytics bindings that local workerd cannot provide. Alchemy still
owns the actual Workerd ports; `scripts/alchemy-dev.mjs` bridges those ports to
Portless static aliases. That is a good example of using Alchemy's dev mode as
a first-class control plane input instead of creating a parallel local stack.

### Runtime database usage

At runtime, the Domain Worker prefers `env.DATABASE.connectionString` and
creates a request-scoped `pg.Pool` with `max: 1`. That pool is shared by
regular Drizzle for Better Auth and `@effect/sql-pg` for domain repositories.
When `CEIRD_LOCAL_DEV=true`, it may instead read the redacted local
`DATABASE_URL` injected by Alchemy dev. Missing configuration now fails through
a typed `DomainWorkerDatabaseConfigurationError` with different local and
deployed messages.

This is compatible with the Hyperdrive guidance. Hyperdrive does the edge-side
pooling; request-scoped clients avoid long-lived Worker-global TCP assumptions.
Using both Drizzle and Effect SQL is also justified by current app constraints:
Better Auth wants Drizzle, while domain repositories are Effect SQL native.
The duplicate `workerDatabaseUrl` helper has been removed, so the deployed
Worker database boundary now lives in
`apps/domain/src/platform/cloudflare/runtime.ts`.

### Custom tenant routing providers

`infra/cloudflare-tenant-routing.ts` manages two custom resources:

- `Ceird.CloudflareTenantWildcardDnsRecord`
- `Ceird.CloudflareTenantWorkerRoute`

The wildcard DNS provider deliberately never deletes the zone-global wildcard
record during stage destroy. The Worker route provider deletes stage-owned
routes and refuses to silently overwrite unmanaged conflicts. Tests cover
foreign resources, pagination, no-script bypass routes, idempotent wildcard
retention, and validation that wildcard routes remain inside the zone.

The current `alchemy@2.0.0-beta.52` package has Worker `domain` support for
exact custom hostnames, but it does not expose a first-class generic Cloudflare
DNS record or Worker route resource that covers Ceird's wildcard tenant route
model. Keeping the custom providers is therefore justified for now.

### CI and local development

CI is intentionally Alchemy-native:

- Main deploy restores the Cloudflare state-store credentials, runs
  `pnpm alchemy deploy --stage main --yes`, then audits the live state.
- Preview deploy uses persistent `pr-<number>` stages, guarded by same-repo
  checks and protected GitHub environments.
- Preview and staging deploy run
  `pnpm alchemy:state-audit --tenant-routing-required` after deploy.
- Preview cleanup validates `pr-[0-9]+` before destroy.
- Workflows read the branch connection URI from Alchemy state only after deploy
  and mask it before putting it into `GITHUB_ENV`.
- Local docs consistently use `pnpm dev`, `.env.local`, and branch-derived or
  explicit task stages for provider operations.

The current state-store credential restore workaround is centralized in a
tested repository script. The workaround should still be retested after future
Alchemy/Cloudflare upgrades, but duplicated shell logic is gone.

Local dev is now substantially better than the previous direct CLI handoff:

- `pnpm dev` runs `node scripts/alchemy-dev.mjs`.
- The wrapper loads `.env.local`, sets `CEIRD_CLOUDFLARE=1`, defaults
  `ALCHEMY_PROFILE` to `ceird-env`, and keeps confirmations enabled unless
  `--yes` is passed.
- It starts Alchemy local RPC services through `alchemy/Local/RpcSpawner` and
  passes `ALCHEMY_EXEC_OPTIONS` to Alchemy's exec path.
- It uses `--experimental-transform-types` on Node versions that need it and
  suppresses the Node 26 module-register deprecation warning that the Alchemy
  beta currently emits.
- Local stack code uses `Alchemy.AlchemyContext.dev` to swap public origins to
  local proxy URLs, skip unsupported provider resources, and inject a redacted
  direct Neon branch URL only for the Domain Worker local database path.

This is a clean Alchemy-native local development model. The direct database URL
is an intentional local exception, not a deployed architecture change.

## Findings And Recommendations

### 1. Cloudflare AI Gateway for the Agent Worker

Priority: High

Current state:

- `infra/cloudflare-stack.ts` declares `Cloudflare.AiGateway("AgentAiGateway")`.
- `apps/agent/infra/cloudflare-worker.ts` binds the managed gateway as `AI` and
  injects `AGENT_AI_GATEWAY_ID`.
- The Agent runtime passes the gateway ID to `workers-ai-provider`.

Best-practice comparison:

Alchemy v2 already exposes `Cloudflare.AiGateway` and an AI Gateway binding in
the installed beta. The current docs present AI Gateway as the Cloudflare track
resource for model traffic, especially when Workers AI is involved.

Result and remaining recommendation:

The raw binding escape hatch has been removed. Keep gateway settings
conservative:

- `collectLogs: true` only if prompt logging is acceptable for the environment.
- `cacheTtl` only for idempotent read-style model calls.
- Gateway rate limits if model traffic needs a hard provider-side brake.
- DLP once the data-sensitivity model is defined.

Why it matters:

This was the clearest "not taking advantage of Alchemy yet" gap. It now gives
the Agent surface a managed operational point before model usage grows.

### 2. Complete the post-beta.52 cleanup pass

Priority: High

Current state:

- The repo now pins `alchemy@2.0.0-beta.52`.
- `pnpm dev` now runs through an Alchemy local dev wrapper.
- App-local package ownership is cleaner: the root package owns Alchemy rather
  than duplicating the dependency in app packages.
- The stack still imports `alchemy/Drizzle/Providers` and keeps some manual
  Worker service binding types.

Recommendation:

Treat beta.52 as a landed platform upgrade, then do a focused cleanup pass
against the workarounds that were previously tolerated for beta.40:

- Whether `alchemy/Drizzle/Providers` can become a top-level
  `alchemy/Drizzle` provider import.
- Whether Worker service binding inference improved enough to remove manual
  `Service` env types. After the `2.0.0-beta.52` upgrade, the answer is still
  "not yet" for Ceird's cross-Worker `DOMAIN` contracts even though the old
  `WorkerProps.bindings` shape is gone and Worker helpers should now write
  resources through `env`.
- Whether custom tenant routing can use any new native Cloudflare resources.

Run `pnpm run check-types:infra`, `pnpm run test:infra`, and the app-owned
Worker typechecks after each simplification. Run `alchemy plan` only after
confirming the target stage and credentials.

Why it matters:

Alchemy v2 is still beta. The upgrade itself is done, so the value now is
removing stale compatibility code without accidentally changing provider
behavior.

### 3. Keep the single-stack monorepo architecture

Priority: Keep

Current state:

- One `Alchemy.Stack("ceird")` owns app, API, MCP, Agent, domain Worker,
  queues, Hyperdrive, Neon, routes, and outputs.
- App-owned infra modules keep Worker declaration details close to each app.

Assessment:

This is the right shape. A multi-stack split would add cross-stack references,
deploy ordering, and more ways for stage identity to drift. Ceird's surfaces are
owned together and deployed together, so the single-stack model is simpler and
more correct.

Recommendation:

Do not split the stack unless ownership or deploy cadence actually changes.
If a split becomes necessary, introduce typed `Alchemy.Stack` handles and pin
cross-stack references deliberately instead of passing raw URLs through env.

### 4. Preserve the current Neon/Hyperdrive/Drizzle pattern

Priority: Keep

Current state:

- Child stages reuse the parent Neon project with `Neon.Project.ref`.
- Each stage owns a Neon branch.
- Hyperdrive points at `branch.origin`.
- Migrations are applied by the native branch resource.

Assessment:

This is the strongest part of the infrastructure. It matches current Alchemy
best practice for fast PR previews and avoids the common mistake of routing
Hyperdrive at the pooled Neon URI.

Recommendation:

Keep this shape. Only tune:

- `CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT` as real load data arrives.
- Hyperdrive caching after proving specific read queries are safe to cache.
- Parent branch protection after confirming Neon plan constraints.
- Retention windows based on preview branch restore needs and provider plan
  noise.

Do not expose `branch.connectionUri` as a stack output. The current masked state
read for Playwright is safer.

### 5. Consider Effect Worker or Worker Layer style selectively

Priority: Medium

Current state:

- Domain/API/MCP Workers are async Worker modules that run Effect at the
  request boundary.
- Domain runtime already builds Effect layers from Worker env and now has a
  typed local/deployed database configuration boundary.
- Agent routing is cleaner than before: `agent-router.ts` centralizes Durable
  Object routing, retry, jitter, and sanitized route errors.
- Agent Worker is still mostly imperative around request dispatch, CORS, and
  health handling.

Best-practice comparison:

Alchemy supports async Workers for plain handlers and Effect Workers/Worker
Layer for deploy-time binding plus runtime Effect handlers. The Effect style
lets `.bind(...)` produce typed handles instead of manually reading `env`
bindings.

Recommendation:

Do not rewrite every Worker just because the feature exists. Instead:

- Start with Agent, because it has the least Effect-native runtime shape and
  the clearest AI Gateway adoption path.
- Consider API/MCP after Agent if service binding wrappers become simpler.
- Treat Domain as a separate spike. It has the most complicated request-scoped
  database lifecycle, local Workerd fallback, queue handler, Better Auth, and
  background task behavior. The current async Worker shape is explicit and safe.

Success criteria for any Effect Worker migration:

- Runtime binding/env contracts get smaller, not larger.
- Request-scoped Hyperdrive connection behavior remains request-scoped.
- Queue handling remains easy to reason about.
- Bundle size and cold-start behavior are measured before and after.

### 6. Alchemy lifecycle tests for custom providers

Priority: Medium

Current state:

- Custom provider tests manually wire provider layers and mock `fetch`.
- Tests cover important edge cases and now include official Alchemy
  `Test.make`/`test.provider` lifecycle coverage.

Result and remaining recommendation:

The suite now exercises tenant Worker route create/update/delete and wildcard
DNS create/destroy retention through Alchemy scratch state. Keep the focused
unit tests because they cover conflict, pagination, and no-script bypass edge
cases more directly.

Why it matters:

The custom provider code is now part of the provider control plane. Testing it
through Alchemy's own lifecycle harness gives better confidence that future
Alchemy upgrades do not subtly change provider call contracts.

### 7. Retire the legacy Drizzle tombstone after state inspection

Priority: Medium

Current state:

- `infra/legacy-alchemy.ts` registers a tombstone provider for old
  `Drizzle.Migrations` state.
- The provider has no live resource behavior and exists to keep old state
  readable/deletable during the native migration transition.

Recommendation:

Inspect `main`, `staging`, and active preview state trees for
`Drizzle.Migrations`. Once no live stage needs it, remove:

- `infra/legacy-alchemy.ts`
- `infra/legacy-alchemy.test.ts`
- the provider merge in `alchemy.run.ts`

This is a simple cleanup that reduces provider-layer noise.

### 8. Centralize state-store credential restore logic

Priority: Medium

Current state:

- Main, preview, staging deploy, staging E2E, and cleanup jobs call
  `scripts/restore-alchemy-state-store-credentials.mjs`.
- The helper validates the JSON, writes Alchemy's canonical credentials file,
  and restricts file permissions.

Result and remaining recommendation:

The duplicated shell block is gone and covered by root script tests plus
workflow-contract tests. After future Alchemy/Cloudflare upgrades, re-test
whether CI jobs can use a cleaner bootstrap path. If Cloudflare
edge preview no longer blocks the state-store Worker, delete the workaround
entirely.

### 9. Keep manually managed GitHub secrets for now, but reassess credentials-as-code

Priority: Medium

Current state:

- The Alchemy CI guide recommends an optional `stacks/github.ts` that creates
  scoped CI credentials and writes GitHub secrets.
- Ceird intentionally uses manually managed GitHub environment secrets to avoid
  giving the stack token-management authority.

Assessment:

The current choice is defensible. It is more manual, but it keeps credential
creation authority outside the app infra stack.

Recommendation:

Keep the manual model until one of these becomes true:

- secret drift becomes a recurring operational issue;
- Cloudflare/Neon token scopes need regular rotation;
- there are multiple deployment repositories/environments;
- the team wants auditable credential changes in PRs.

If adopted later, create `stacks/github.ts` as a separate stack, not part of
`alchemy.run.ts`, and require explicit deploy approval.

### 10. Improve Agent health and stage observability

Priority: Low

Current state:

- App/API/domain health payloads expose stack and stage.
- Agent `/health` exposes `ok`, `service`, `stackName`, `stage`, and
  `aiGateway` when present.
- MCP exposes a minimal `/health` endpoint without forwarding to the domain
  Worker.

Recommendation:

Keep public health payloads minimal and non-secret. Add new managed resource
identifiers only when they help diagnose a deployed stage.

This is not an Alchemy correctness issue, but it improves stage diagnostics and
keeps preview health payloads consistent.

### 11. Consolidate the Domain Worker database URL boundary

Priority: Low

Current state:

- `apps/domain/src/platform/database/database-url.ts` now exports only the
  package-local `nodeDatabaseUrl` Config value.
- `apps/domain/src/platform/cloudflare/runtime.ts` now exports
  `readDomainWorkerDatabaseConfiguration`, which is the actual Worker runtime
  boundary and distinguishes Hyperdrive from local `DATABASE_URL`.

Result:

The duplicate Worker helper has been deleted. Keep future Worker database
configuration changes in `readDomainWorkerDatabaseConfiguration`.

### 12. Keep custom tenant providers, but document the native-resource watchpoint

Priority: Low

Current state:

- Custom providers are necessary for wildcard DNS and Worker route behavior.
- Native `Cloudflare.Worker` `domain` support covers exact custom hostnames,
  not the wildcard route plus no-script bypass model.

Recommendation:

Keep the custom providers. Add a short comment or doc note that they should be
rechecked when Alchemy exposes first-class Cloudflare DNS record or Worker route
resources. If native support appears, migrate only if it can preserve:

- managed/unmanaged conflict detection;
- no-script bypass routes;
- shared wildcard DNS retention on stage destroy;
- preview route deletion on destroy.

### 13. Tighten provider-layer type safety when convenient

Priority: Low

Current state:

- `alchemy.run.ts` merges provider layers and casts the result to
  `Layer.Layer<unknown, never, StackServices>` after `Layer.orDie`.

Assessment:

This is understandable because provider collections compose awkwardly, and the
stack CLI is a reasonable place to die on provider setup failures. Still, the
cast hides type detail from the compiler.

Recommendation:

On the beta.52 cleanup pass, try removing or narrowing the cast. If Alchemy
types still require it, isolate it in a named helper with a comment explaining
why it is the boundary where provider setup errors become fatal.

### 14. Keep Hyperdrive caching disabled until query safety is proven

Priority: Keep

Current state:

- Hyperdrive is configured with `caching: { disabled: true }`.

Assessment:

This is conservative and correct for an authenticated, multi-tenant,
transactional product. Hyperdrive query caching may be useful later, but it
should not be enabled globally without endpoint-level read semantics and tenant
cache-key safety.

Recommendation:

Leave it disabled. Revisit only for well-isolated, read-heavy, low-staleness
queries with explicit test coverage.

### 15. Clarify secret rotation for Alchemy-managed random secrets

Priority: Low

Current state:

- `Alchemy.Random("BetterAuthSecret")` and
  `Alchemy.Random("AgentInternalSecret")` generate per-stage secrets persisted
  in Alchemy state.

Assessment:

This is a good default. The missing piece is operator process, not code.

Recommendation:

Document how to intentionally rotate these secrets and what user impact to
expect. Better Auth secret rotation may invalidate sessions; agent internal
secret rotation affects domain-to-agent authorization.

## Things That Should Not Be Changed Casually

- Do not replace `branch.origin` with `connectionUri` or `pooledConnectionUri`
  for Hyperdrive.
- Do not output raw database URLs from the stack.
- Do not reintroduce a local Workerd `DATABASE_URL` fallback for Alchemy dev
  stages; package-local domain runs may still use `DATABASE_URL`, but
  Alchemy-managed Workers should use Hyperdrive.
- Do not split stack/stage identity into an additional `CEIRD_*_STAGE`
  environment axis.
- Do not move Alchemy imports into request handlers or shared domain packages.
- Do not run Alchemy `dev`, `deploy`, or `destroy` from automation without an
  explicit stage and appropriate credentials.
- Do not delete the shared wildcard DNS record on PR destroy.
- Do not enable Hyperdrive caching globally without tenant-aware cache-safety
  analysis.

## Suggested Roadmap

### Completed reference-architecture branch

1. Added `Cloudflare.AiGateway` to Agent infra.
2. Removed the raw `AgentWorkersAiBinding` helper.
3. Added Agent/MCP health stack/stage payloads.
4. Deleted the unused `workerDatabaseUrl` helper.
5. Added Alchemy doctor/state-audit scripts, CI audit hooks, lifecycle tests,
   and the reference architecture guide.

### Post-beta.52 simplification branch

1. Reassess CI state-store restore, Drizzle provider imports, service binding
   inference, and custom provider native alternatives.
2. Run `pnpm run check-types:infra`, `pnpm run test:infra`, and the app-owned
   Worker typechecks.
3. Run `alchemy plan` only after confirming stage and credentials if any
   provider behavior changes.
4. Update the relevant architecture guide if a workaround is removed.

### Provider hardening branch

1. Review state trees for legacy `Drizzle.Migrations`.
2. Remove the tombstone provider after live-state confirmation.
3. Keep `alchemy/Test/Vitest` lifecycle tests running during Alchemy upgrades.

## Final Assessment

Ceird is using Alchemy v2 very well. The biggest architectural bets are
correct: single stack, explicit stages, Cloudflare state, parent Neon project
with per-stage branches, Hyperdrive from `branch.origin`, native Drizzle schema
application, private domain Worker ownership of persistence, and branch-aware
Alchemy local dev.

The main opportunity is now narrower: retire legacy state once live inspection
confirms it is safe, keep checking whether native Alchemy resources can replace
custom tenant routing, and adopt Effect Worker/Worker Layer only where it
reduces adapter code rather than moving complexity around.
