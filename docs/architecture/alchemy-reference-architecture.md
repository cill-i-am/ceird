# Alchemy Reference Architecture

This guide is the implementation checklist for keeping Ceird's Alchemy stack
boringly excellent. It turns the audit recommendations into repeatable rules
for future infrastructure work.

## Add a Worker

Declare Workers in the app-owned `apps/*/infra` module and orchestrate them
from `infra/cloudflare-stack.ts`. Keep the root stack as the only stack unless
ownership or deploy cadence actually changes. Worker env should contain only
runtime configuration; Alchemy-injected `ALCHEMY_STACK_NAME` and
`ALCHEMY_STAGE` should not be reconstructed manually.

Every public Worker should expose `/health` with `ok`, `service`, `stackName`,
and `stage`. Private Workers may expose health only through internal bindings.
When a Worker depends on a managed resource with an operator-visible identity,
include the identifier in health if it helps diagnose a stage, as the Agent
Worker does with `aiGateway`.

## Add a Binding

Prefer native Alchemy resources in the Worker `env` object. Avoid raw
`worker.bind(...)` escape hatches unless there is no native resource shape and
the reason is documented beside the helper.

For service bindings, keep the app-owned binding resource type and runtime env
type aligned in `infra/cloudflare-stack.test.ts`. For database access, public
adapters should call the private domain Worker through `DOMAIN`; only the
domain Worker should bind Hyperdrive.

When local Alchemy dev must omit an unsupported binding, return an exact env
shape that leaves the binding key absent instead of present-with-`undefined`.
`alchemy@2.0.0-beta.52` still constrains `WorkerProps["env"]` as a binding map,
so optional `undefined` resource keys can leak into the type and break
`Cloudflare.Worker(...)` calls even when the runtime object looks correct.

The domain runtime should resolve database connectivity in one place: prefer
the Hyperdrive binding in deployed stages and local Alchemy dev. Allow
`DATABASE_URL` only for package-local domain runs or other non-Alchemy runtime
paths that bypass the Worker binding layer. Do not add parallel database URL
helpers outside `apps/domain/src/platform/cloudflare/runtime.ts`.

## Add a Secret

Use `Alchemy.Random` for per-stage generated secrets and `Redacted` for values
that originate in config. Document rotation impact before adding a new
Alchemy-managed secret. Do not return raw secret values or direct database URLs
from stack outputs.

GitHub Actions should restore state-store credentials only through
`scripts/restore-alchemy-state-store-credentials.mjs`; do not duplicate shell
snippets that create `~/.alchemy/credentials/default/cloudflare-state-store.json`.
The long-lived GitHub Actions Cloudflare API token and baseline GitHub
variables are declared in `alchemy.github.run.ts`. Reconcile that stack with a
bootstrap token that has account API-token write access; do not hand-create or
hand-rotate the deploy token in GitHub.

## Worker Observability

All Ceird Workers use `ceirdWorkerObservability`, which enables Workers logs,
invocation logs, and traces with an explicit `0.1` head sampling rate. Keep the
sampling rate named in `infra/cloudflare-worker-defaults.ts`; do not inline
per-Worker values unless a Worker has a documented volume or privacy reason.

Deployed app-owned Workers bind the native Alchemy
`Cloudflare.AnalyticsEngineDataset` named `WorkerAnalytics`; local Alchemy dev
omits that binding because workerd rejects Analytics Engine bindings. Runtime
request analytics are written through the Effect-native `WorkerObservability`
service from `@ceird/worker-observability`, which wraps a small Analytics
Engine boundary primitive. The service applies the stage-wide
`CEIRD_WORKER_ANALYTICS_SAMPLE_RATE` default of `0.1`, omits high-cardinality
request IDs from the data point payload, normalizes dynamic URL path segments,
uses a single Analytics Engine index of `{stage}:{adapter}`, and treats write
failures as telemetry loss only. Raise sampling per stage through
`CEIRD_WORKER_ANALYTICS_SAMPLE_RATE`; do not fork the request payload shape in
individual Workers.

## Electric Container Boundary

The Electric SQL Cloudflare Container is deployed only for non-local Alchemy
stages that have stage-appropriate runtime storage credentials. Local
`alchemy dev` Workers run in workerd with local Durable Object namespaces, but
the Cloudflare Containers API validates attachment against a cloud Durable
Object namespace. Keep local dev on the Sync Worker path and let `ElectricSql`
fail explicitly with `electric_container_unavailable` if a local shape request
reaches the container bridge. Production and ordinary full-sync cloud stages
must provision the Sync Worker, `ElectricSql` Durable Object, Cloudflare
Container, R2 bucket, and Neon branch together. Pull-request previews and
ephemeral CI stages intentionally run the shallow sync authorization probe until
they have per-stage Electric runtime credentials.

The private domain Worker is the only Worker with Smart Placement enabled. It
owns Hyperdrive/database access, so it is the only current Worker where
placement can plausibly reduce database round-trip time. Benchmark before
enabling placement on public adapters.

WAF, API Shield, and Turnstile remain deferred until Alchemy has native support
or this repo carries a deliberate custom provider for them.

## Preview-safe resources

Preview resources must be stage-scoped, named from the Alchemy stage, and
destroyable from default-branch code. Shared resources such as the tenant
wildcard DNS record must not be deleted by preview cleanup. Any new preview
resource needs a workflow-contract test for deploy and cleanup stage guards.

## Native resource vs custom provider

Use native Alchemy resources first. A custom provider is justified only when a
native resource cannot represent Ceird's contract, such as wildcard tenant DNS
retention or no-script Worker route bypasses. Custom providers must implement
`read`, convergent `reconcile`, conservative `diff`, and idempotent delete
behavior, plus focused unit tests and at least one Alchemy lifecycle test.
Keep a watchpoint for new native Alchemy Cloudflare DNS or Worker-route
resources. If native resources can represent wildcard retention and no-script
bypass routes, migrate away from the custom providers.

## AI Gateway

Agent model traffic should be routed through a managed `Cloudflare.AiGateway`.
Keep gateway authentication enabled and prompt logging disabled by default
unless an environment explicitly opts into a reviewed logging policy. Set
model-call caching only for idempotent read-only prompts with a tenant-safe
cache key. The Agent Worker should receive the gateway ID through env, decode it
at the Worker boundary, and pass it to `workers-ai-provider`.

## Live state audit

Use `pnpm alchemy:state-audit --stage <stage>` for a safe, read-only audit
before removing tombstone providers or adopting resources. For deployed stages,
add `--tenant-routing-required` so missing tenant Worker routes or wildcard DNS
state is blocking. The audit checks for the managed Agent AI Gateway,
AI Gateway authentication/logging policy, Neon branch origin state, legacy
`Drizzle.Migrations`, tenant route patterns, and tenant wildcard DNS ownership.
It must never run Alchemy `deploy` or `destroy`.

Preview and staging CI should run the audit after deploy. Allow only known,
time-boxed findings such as `legacy_drizzle_migrations_state`; missing native
resources and route-pattern drift should remain blocking.

Use `pnpm alchemy:doctor -- --stage <stage>` before local provider-backed dev
when a worktree, env file, or Alchemy profile may be stale.

## Effect Worker evaluation

Ceird's request runtimes are already Effect-native inside the app packages,
while Alchemy owns the deploy-time resource graph. Keep using explicit Worker
entrypoints for the app, API, MCP, Agent, and domain adapters until
Alchemy's Effect Worker or Worker Layer removes real code rather than moving
adapter details into stack declarations. Re-evaluate for a new small public
Worker, or when an existing Worker has no Cloudflare Agents SDK, TanStack
Start, or service-binding adapter requirements.
