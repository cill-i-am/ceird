# API Architecture

## Scope

`apps/api` is the public HTTP adapter. It keeps public root and health
responses local, then forwards all product, auth, and MCP-compatible HTTP
traffic to the private `apps/domain` Worker through a Cloudflare `DOMAIN`
service binding.

`apps/domain` is the backend/domain service. It exposes the Effect HTTP API for
jobs, sites, comments-backed collaboration, labels, organization configuration,
route-aware proximity computations, Better Auth under `/api/auth/*`, and MCP
tool execution. It owns database schema and migrations, authorization,
repositories, action execution, audit, and the Hyperdrive/Postgres binding.

`apps/mcp` is the standalone MCP adapter. It forwards MCP traffic to
`apps/domain` through the same `DOMAIN` service binding so MCP, public HTTP,
the Agent Worker, and bot/client surfaces share the same capability surface.

`apps/agent` is the Cloudflare Agents SDK runtime. It hosts `CeirdAgent`
Durable Objects for org/user/thread-scoped conversations, streams model output
through Workers AI, and executes Ceird actions by calling the private
`apps/domain` Worker through the same `DOMAIN` service binding.

`apps/sync` is the Electric SQL sync adapter. It exposes public shape endpoints
for browser sync clients, authorizes those named shapes through the private
`apps/domain` Worker, and forwards authorized requests to Electric SQL running
inside a Cloudflare Container.

## Entry Points

| Workspace     | File/path                                               | Purpose                                                                                                |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/api`    | `src/index.ts`                                          | Node development entrypoint for the public adapter.                                                    |
| `apps/api`    | `src/server.ts`                                         | Public root/health handling, request logger, and domain forwarding handler.                            |
| `apps/api`    | `src/worker.ts`                                         | Public API Cloudflare Worker adapter.                                                                  |
| `apps/api`    | `src/platform/cloudflare/env.ts`                        | API Worker binding contract for `DOMAIN`.                                                              |
| `apps/agent`  | `src/worker.ts`                                         | Public Agent Worker adapter, connect-token gate, and Agents SDK request routing.                       |
| `apps/agent`  | `src/ceird-agent.ts`                                    | `CeirdAgent` Durable Object runtime, system prompt, model streaming, and tool set.                     |
| `apps/agent`  | `src/tools.ts`                                          | AI SDK tool adapter derived from executable shared action registry metadata.                           |
| `apps/agent`  | `src/domain-client.ts`                                  | Internal client for the domain action API over the `DOMAIN` service binding.                           |
| `apps/sync`   | `src/worker.ts`                                         | Public sync Worker adapter and `ElectricSql` Durable Object export.                                    |
| `apps/sync`   | `src/platform/cloudflare/runtime.ts`                    | Effect-native sync authorization, CORS, Electric parameter injection, and forwarding.                  |
| `apps/sync`   | `src/platform/cloudflare/electric-sql-do.ts`            | Durable Object bridge to the Electric container TCP port.                                              |
| `apps/sync`   | `src/platform/cloudflare/electric-container-runtime.ts` | Node container entrypoint that starts Electric SQL.                                                    |
| `apps/sync`   | `src/platform/cloudflare/env.ts`                        | Sync Worker binding contract for `DOMAIN`, `ElectricSql`, and Electric source config.                  |
| `apps/domain` | `src/server.ts`                                         | Effect `HttpApi` construction, domain route composition, and web-handler factory.                      |
| `apps/domain` | `src/worker.ts`                                         | Private domain Cloudflare Worker adapter and auth email queue consumer.                                |
| `apps/domain` | `src/platform/cloudflare`                               | Domain Worker config, Hyperdrive, queue, email, Google Places location, and runtime layer composition. |
| `apps/domain` | `src/platform/database`                                 | Database runtime, schema barrel, config, errors, and test helpers.                                     |
| `apps/mcp`    | `src/worker.ts`                                         | Public MCP adapter Worker at `mcp.<stage>.ceird.app` that forwards to `DOMAIN`.                        |

Public system endpoints are defined in `apps/api/src/server.ts`:

- `GET /` returns a plain API marker string.
- `GET /health` returns a stack- and stage-aware `HealthPayload`.

The API Worker module adapts Cloudflare's promise-based `fetch` handler to
service-binding forwarding and public root/health responses. The MCP Worker is
also a forwarding adapter, but its fetch path is Effect-threaded so MCP traffic
gets structured forwarding logs, log spans, and a controlled `502` response when
the private domain service binding is unavailable. The single Effect-threaded domain runtime
boundary for product behavior lives in
`apps/domain/src/platform/cloudflare/runtime.ts`: it installs the Worker config
provider, builds the Hyperdrive-backed database layer, wires Better Auth
background tasks through `context.waitUntil`, uses the Google Places site
location provider layer, and composes auth queue delivery with the Cloudflare
email binding transport. Keeping this runtime boundary private lets multiple
clients share the same domain execution and audit path.
The health handler reads `ALCHEMY_STACK_NAME` and `ALCHEMY_STAGE` through the
same Effect config path and includes both values in its response, falling back
to `local` for package-local Node runs.

The API and MCP runtimes read only the `DOMAIN` service binding. The domain
runtime reads `DATABASE`, `AUTH_EMAIL_QUEUE`, and `AUTH_EMAIL`, plus resolved
configuration for Better Auth, MCP resource metadata, Google Maps, and auth
email delivery. Each app owns its Alchemy Worker binding and configured-env
declaration in its app-local `infra/cloudflare-worker.ts`; the root infra
stack still creates shared resources and passes stage-specific names, hostnames,
secrets, Hyperdrive, queues, and cross-service Worker references into those
app-owned declarations. Infra tests compare those app-owned binding/config keys
with the runtime contracts for API, MCP, Agent, sync, and domain Workers.
Secret and credential values stay typed as Alchemy deploy-time redacted inputs,
while runtime apps see resolved strings through Cloudflare Worker environment
values.

`apps/domain/src/server.ts` also intercepts MCP resource-server traffic before
falling through to the Effect `HttpApi` handler. The MCP route defaults to
`/mcp`, or to the path component of `MCP_RESOURCE_URL` when that environment
variable is set. Protected-resource metadata is served at
`/.well-known/oauth-protected-resource` and at the path-specific well-known URL,
for example `/.well-known/oauth-protected-resource/mcp`.

MCP HTTP is served through `effect/unstable/ai`'s `McpServer.layerHttp`, adapted
to the domain web-handler boundary after Better Auth OAuth bearer validation.
Bearer validation requires the OAuth token to include `sid`, `sub`, and an OAuth
client id from Better Auth's JWT `azp` claim, with `client_id` accepted for
compatible callers; the authorized-app cache is partitioned by session id, user
id, OAuth client id, and normalized scopes.
Before the cached MCP app is used, the domain Worker checks that a matching
Better Auth `oauth_consent` row still exists for the token user, client,
reference id, and scopes. Removing a connected app through the identity API
therefore blocks future MCP requests immediately, even while an issued access
token has time remaining. Consent-check storage failures fail closed and emit
sanitized warning telemetry.
The ordinary MCP consent, session, and membership lookups use the domain
`DomainDrizzle` service. They still fail closed on storage or runtime-layer
failures and do not change OAuth scopes, consent policy, or bearer-token
validation.
The standalone MCP Worker remains a forwarding adapter so generated/action UI,
Agents SDK Workers, and bot surfaces can call the same domain surface.

The identity HTTP group also exposes current-user connected-app management for
the account settings Security tab:

| Method   | Path                            | Purpose                                                                              |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`    | `/user/connected-apps`          | List user-approved OAuth/MCP clients without token or client-secret data.            |
| `DELETE` | `/user/connected-apps/:grantId` | Delete the consent, revoke refresh tokens, clear DB-backed access tokens, and audit. |

## Agent Runtime

Agent contracts live in `@ceird/agents-core`. That package defines thread IDs,
action run IDs, action names, action DTOs, `buildAgentInstanceName`, connect
token payloads, and the Effect `HttpApi` groups used by the domain Worker. The
Agent Worker imports the `@ceird/agents-core/runtime` subpath so its Worker
bundle gets the same runtime schemas and action metadata without also bundling
the domain/app HTTP API group layer.

The domain Worker owns the durable product side of agents:

| Method | Path                                                        | Purpose                                                                                          |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET`  | `/agent/actions`                                            | Return presentation-safe shared action manifest metadata for authenticated organization clients. |
| `POST` | `/agent/session/prepare`                                    | Idempotently prepare the current chat session with thread, action manifest, and connect token.   |
| `GET`  | `/agent/threads`                                            | List a user's threads in the active org.                                                         |
| `POST` | `/agent/threads`                                            | Create or reopen an org/user/thread record.                                                      |
| `POST` | `/agent/threads/:threadId/archive`                          | Archive a thread for the active user.                                                            |
| `POST` | `/agent/threads/:threadId/authorize`                        | Issue a short-lived Agent connect token.                                                         |
| `POST` | `/agent/internal/threads/:threadId/activity`                | Touch `lastMessageAt` from trusted Agent chat traffic.                                           |
| `POST` | `/agent/internal/threads/:threadId/current-location-access` | Validate that the thread owner can use current-location proximity origins.                       |
| `POST` | `/agent/internal/actions`                                   | Execute a domain-owned action for the Agent.                                                     |

Straightforward agent thread create/list/find/archive/touch and active-thread
actor resolution use `DomainDrizzle`. The current-thread prepare query remains
raw because it is protected by a transaction-scoped advisory lock.

Public agent chat traffic goes to:

| Method | Path                                    | Purpose                             |
| ------ | --------------------------------------- | ----------------------------------- |
| `*`    | `/agents/CeirdAgent/:agentInstanceName` | Route to the scoped Agent instance. |

The browser app does not construct agent instance names or connect tokens
itself. Its global chat surface calls `POST /agent/session/prepare` to
idempotently get the current user's active thread, the public action manifest,
and an initial short-lived connect token in one authenticated request. It uses
`POST /agent/threads/:threadId/authorize` only for later token refreshes before
reconnecting to the Agent Worker. The Agent Worker HTTP/WebSocket path owns chat
transport, while all product reads, writes, destructive operations,
idempotency, and audit still flow through private domain action execution.
For route-aware chat prompts, the app sends current-location coordinates through
an ephemeral Ceird WebSocket frame before the chat request and includes only an
opaque `ceirdProximityOriginContextId` in the chat request body. Cloudflare's AI
chat runtime persists the latest custom request body for continuations, so raw
coordinates must not travel through that body path. The Agent Worker sanitizes
incoming AI chat request bodies before the AI chat runtime handles them:
`messages`, `trigger`, and a valid `agent-origin-<uuid>`
`ceirdProximityOriginContextId` are preserved, while other custom/request body
fields are dropped. Before storing a sideband current-location frame,
`CeirdAgent` calls the internal current-location access endpoint for the thread.
Disabled or unverifiable preference state is fail-closed: the frame is consumed
and the Agent behaves as if no current location was supplied. Valid frames are
resolved against the in-memory sideband cache, pruned after a short TTL, deleted
as the turn starts, and passed to the generated Ceird tools as hidden runtime
context. The system prompt tells the model to use a placeholder
`current_location` origin for relevant tools; the tool executor swaps that
placeholder for the hidden origin before calling the domain. Raw coordinates
are not serialized into prompt text. If the Durable Object is evicted between
the sideband frame and the chat turn, the id is harmless and the Agent behaves
as if no current location was supplied.
Because AI chat messages and resumable stream chunks are also persisted,
`CeirdAgent` redacts proximity tool `origin` payloads, route display lines, and
exact current-location coordinate strings before those records are stored; live
responses can still render inline route maps, but stored chat history and stream
recovery chunks must not retain precise request-origin coordinates.

The instance name is `org:{orgId}:user:{userId}:thread:{threadId}`. The public
Agent route accepts a short-lived connect token as a bearer token or `token`
query parameter, verifies that it was signed by the domain-owned secret,
normalizes the route to the Agents SDK's kebab-case class path, and only then
delegates to Cloudflare's router. Browser preflight is answered before token
auth for the configured app origin, and the routed request has the `token` query
parameter and `Authorization` header stripped before it enters the Agents SDK
runtime. Browser clients should prefer bearer tokens; the query-token fallback
exists only for transports that cannot set headers.
The Agent Durable Object keeps chat/runtime state in the Agent store; product
state, authorization, thread activity timestamps, and action side effects
remain in the domain Worker.

Domain action execution is registry-driven in
`apps/domain/src/domains/agents/action-registry.ts`. Only actions marked
`executable` in `@ceird/agents-core` are required to have domain handlers;
planned actions remain in the shared manifest without being callable through
the private Agent execution boundary.
The Agent Worker derives model-callable AI SDK tools from
`AGENT_EXECUTABLE_ACTIONS`, using each action's registry-owned model name,
description, and input schema rather than maintaining a separate hand-written
tool contract.
Browser clients fetch the authenticated public manifest from
`GET /agent/actions`. The response uses the shared `{ actions: [...] }`
contract and includes display, model, kind, confirmation policy, and execution
status metadata only; input schemas and execution internals are not exposed.
Action execution remains private to `POST /agent/internal/actions`.

Current domain actions exposed to the Agent runtime are:

| Action                            | Kind        |
| --------------------------------- | ----------- |
| `ceird.labels.list`               | read        |
| `ceird.labels.create`             | write       |
| `ceird.labels.update`             | write       |
| `ceird.labels.delete`             | destructive |
| `ceird.sites.options`             | read        |
| `ceird.sites.list`                | read        |
| `ceird.sites.proximity`           | read        |
| `ceird.sites.route_preview`       | read        |
| `ceird.sites.create`              | write       |
| `ceird.sites.update`              | write       |
| `ceird.sites.comments.list`       | read        |
| `ceird.sites.comments.add`        | write       |
| `ceird.sites.assign_label`        | write       |
| `ceird.sites.remove_label`        | destructive |
| `ceird.jobs.options`              | read        |
| `ceird.jobs.list`                 | read        |
| `ceird.jobs.detail`               | read        |
| `ceird.jobs.proximity`            | read        |
| `ceird.jobs.route_preview`        | read        |
| `ceird.jobs.create`               | write       |
| `ceird.jobs.update`               | write       |
| `ceird.jobs.transition`           | write       |
| `ceird.jobs.reopen`               | write       |
| `ceird.jobs.activity.list`        | read        |
| `ceird.jobs.add_comment`          | write       |
| `ceird.jobs.visits.add`           | write       |
| `ceird.jobs.assign_label`         | write       |
| `ceird.jobs.remove_label`         | destructive |
| `ceird.jobs.collaborators.list`   | read        |
| `ceird.jobs.collaborators.attach` | write       |
| `ceird.jobs.collaborators.update` | write       |
| `ceird.jobs.collaborators.detach` | destructive |

`ceird.sites.create` accepts the canonical site create payload and an
agent-friendly Irish shortcut `{ name, eircode }`. The domain action handler
normalizes the shortcut into `{ name, location: { kind: "manual", country:
"IE", rawInput: eircode } }` and is the only caller that enables Google-first
manual location resolution.

Read tools are available to the model by default. Write and destructive tools
are exposed only when `AGENT_MUTATION_TOOLS_ENABLED=true`, and those tools still
require the confirmation-capable chat client to approve the action outside the
model prompt. Alchemy stage configuration does not set that flag by default;
absence of the flag is the normal production, preview, and local-dev posture.

### Agent Mutation Approval Readiness

The shared public manifest intentionally includes read, write, destructive, and
planned action metadata so the app can render labels, summaries, targets, and
risk treatment without exposing input schemas or private execution internals.
The Agent Worker toolset is narrower than the manifest:

- planned actions are never model-callable;
- read executable actions are model-callable by default;
- write and destructive executable actions are model-callable only when the
  selected Agent Worker runtime has `AGENT_MUTATION_TOOLS_ENABLED=true`;
- every model-callable write or destructive tool must be created with
  `needsApproval: true`.

Approval happens before domain action-run creation. The browser chat client
records the approve or reject decision with the conversation through the AI chat
approval response, and the Agent Worker only calls `POST /agent/internal/actions`
after the approved tool execution begins. The domain action-run ledger therefore
does not store an approval id. It stores the execution attempt itself:
`thread_id`, `action_name`, `operation_id`, sanitized input hash/size, status,
write-action result, and error category. Rejections before tool execution leave
no domain action-run row.

Enable mutation tools only for a named stage after an operator confirms the
target stage, credentials, and rollback owner. The safe enablement path is:

1. Keep the root/default Alchemy config unchanged.
2. Add an explicit stage-scoped opt-in by passing `enableMutationTools: true` to
   the Agent Worker resource for the selected stage, or apply an equivalent
   temporary Agent Worker env override for that stage only.
3. Run a non-mutating plan or inspect the Worker env diff first.
4. Run provider-mutating Alchemy deploy/dev commands only after explicit human
   confirmation of the target stage and credentials.

Stage verification should prove both sides of the gate:

1. With the flag absent, inspect Agent Worker configuration and verify only read
   executable tools are available to model turns.
2. With the flag set to exactly `true` in the chosen stage, verify a
   write/destructive prompt renders the app approval card from manifest metadata
   and cannot execute until the user approves.
3. Approve one low-risk write in the test stage and confirm the domain
   `agent_action_runs` row appears only after approval. Reject a second pending
   approval and confirm no domain action-run row is created for that rejection.
4. Confirm planned manifest actions still do not appear as Agent Worker tools.

Rollback is removing the stage-specific flag or opt-in and reconciling only the
chosen stage. New model turns then rebuild the toolset without write/destructive
tools. Existing completed or failed action-run ledger rows are retained for
audit and idempotent replay semantics; no database migration is required.

Route-aware proximity is exposed as read-only POST computations because requests
carry structured origin and filter payloads but do not mutate product state:

| Method | Path                               | Purpose                                                                             |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `POST` | `/proximity/origins/autocomplete`  | Return typed-origin suggestions for user-entered origin search text.                |
| `POST` | `/proximity/origins/place-details` | Resolve a selected typed-origin suggestion into coordinates and display text.       |
| `POST` | `/jobs/proximity`                  | Rank filtered jobs by traffic-aware driving time from the supplied origin.          |
| `POST` | `/jobs/:workItemId/route-preview`  | Preview driving distance/duration, and optionally display route line, for one job.  |
| `POST` | `/sites/proximity`                 | Rank mapped sites by traffic-aware driving time from the supplied origin.           |
| `POST` | `/sites/:siteId/route-preview`     | Preview driving distance/duration, and optionally display route line, for one site. |

The shared request shape lives in `@ceird/proximity-core`: origins are explicit
discriminated unions (`current_location` or `typed_origin`), result rows are
limited to 25 for v1, and responses include normalized metadata for candidate
limits/exclusions. Generic origin lookup handlers reuse the existing site
Google Places provider behind proximity-native DTOs and errors. The
place-details endpoint returns a short-lived server-signed `originToken` with
the resolved typed origin. Route ranking/preview handlers verify that token
against the exact typed-origin coordinates, display text, and place id before
provider work, so clients cannot mint or tamper with typed-origin coordinates.
Origin autocomplete and place-details calls are guarded separately from Routes
work with warm-isolate actor and organization limits because they spend Google
Places quota before route ranking begins. Route ranking/preview handlers
perform auth and target existence checks. They then reject `current_location`
origins unless the actor's `routeProximityLocationEnabled` preference is
enabled; if preference state cannot be read, the request fails closed before
route-provider work. `typed_origin` requests are not gated by this preference
but must carry the signed proof from `/proximity/origins/place-details`.
Handlers apply the selected filters first, cap routing work to the first 100
route-eligible candidates, and then call the route provider. Job proximity
defaults to active jobs; site proximity ranks mapped sites and includes
active-job summary fields
for the returned rows. When more than 100 route-eligible records match, response
metadata marks the candidate cap so clients can explain that the route ranking
was limited.
Agent proximity list tools deliberately omit route display lines to avoid route
geometry cost in ranked lists. Specific job/site route-preview tools can request
route geometry so the app can render an inline map indication and maps handoff
links in the chat drawer.

The domain Google Routes provider lives under
`apps/domain/src/domains/proximity/route-provider.ts`. It uses
`computeRouteMatrix` for multi-destination ranking and `computeRoutes` for
single-destination route previews/display lines, with `travelMode=DRIVE`,
`routingPreference=TRAFFIC_AWARE`, and narrow field masks. Provider work is
wrapped in warm-isolate `Effect.Cache`: successful lookups default to a 30
second TTL, failed lookups default to a 3 second TTL, and cache entries are
only an operations optimization, not product state. The warm provider is keyed
by the resolved Routes API key so repeated HTTP and Agent calls in the same
isolate share cache and cost-guard state even though the Cloudflare domain
Worker builds request handlers per fetch. The provider charges the app-level
cost guard only on cache misses. Initial guard thresholds are 500 route units
per actor per minute, 200 per Agent thread per minute when a thread id is
supplied, and 5,000 per organization per minute. These are conservative
defaults pending production quota tuning. Google Routes configuration is read
lazily when a route method is called, so non-proximity API, Agent, and MCP flows
can boot without a Routes key and route endpoints fail with typed provider
errors if the key is missing.

Route provider errors are normalized to proximity-core typed errors and never
return raw Google payloads. Logs include operation, status, reason, and safe
ids/counts only; they intentionally avoid raw origin coordinates, typed-origin
addresses, typed-origin proof tokens, route geometry, and raw provider
messages. The provider reads `GOOGLE_MAPS_ROUTES_API_KEY` when present and
falls back to the existing
`GOOGLE_MAPS_API_KEY`, so split key restrictions can be introduced later
without changing product API contracts. Google Cloud quota caps for Routes
`computeRouteMatrix` and `computeRoutes` still need to be configured before
production use; the app guard is a backstop, not the provider quota source of
truth.

Every action call includes a domain operation id. The domain action-run ledger
stores `thread_id`, `action_name`, `operation_id`, status, input hash/size,
write-action results, and error metadata. Repeated successful mutating calls
with the same thread and operation id return the original result, while
repeated failed calls are rejected instead of re-executed. Fresh in-flight calls
are rejected as already running. Running action rows older than 15 minutes are
recovered to a terminal failed state and return the same typed rejection, so a
crashed Agent request cannot block an operation id forever. Read action results
are not durably copied into the ledger; a successful replay re-runs the read.
For route-aware proximity actions, the input hash/size is computed after
sanitizing `origin` payloads down to their mode, so the ledger does not retain
coordinate-derived fingerprints or typed-origin proof tokens.
The ledger does not wrap action execution in a long-lived transaction. Actual
action implementations use the domain authorization, repository, and
activity-recording paths rather than bypassing domain behavior, and those
services own their own write transaction boundaries.

The public API adapter does not forward `/agent/internal/*` or
`/sync/internal/*`; those surfaces are intended for private Worker
service-binding calls from `apps/agent` and `apps/sync` to `apps/domain`.

## Sync Runtime

Sync contracts live in `@ceird/domain-core`. That package defines the allowed
shape names, the private sync authorization path helper, typed sync
authorization responses, and sync-specific HTTP errors. The public sync Worker
never accepts caller-supplied Electric `table`, `where`, `params[...]`, or
`secret` values.

The domain Worker owns the private authorization endpoint:

| Method | Path                                         | Purpose                                                              |
| ------ | -------------------------------------------- | -------------------------------------------------------------------- |
| `GET`  | `/sync/internal/shapes/:shapeName/authorize` | Authorize a named Electric shape for the current organization actor. |

The sync Worker exposes the public Electric-compatible shape endpoints:

| Method | Path                    | Purpose                                                 |
| ------ | ----------------------- | ------------------------------------------------------- |
| `GET`  | `/v1/shape?shape=:name` | Request an authorized named shape through Electric SQL. |
| `GET`  | `/v1/shapes/:name`      | Path-param equivalent for named shape clients.          |
| `GET`  | `/health`               | Sync Worker health probe.                               |

The sync Worker forwards the original cookies and headers only to the private
domain authorization request. After authorization succeeds, it strips cookies,
authorization, origin, forwarded-host, and Cloudflare headers before forwarding
to Electric. It then injects the domain-approved table, predicate, positional
params, and the `ELECTRIC_SOURCE_SECRET` configured by Alchemy. Electric itself
runs in the `ElectricSql` Cloudflare Container behind a Durable Object bridge,
which starts the container on demand and forwards requests to port `3000`.
The named `labels` shape is the active organization-label definition stream:
the domain-approved predicate is
`organization_id = $1 AND archived_at IS NULL`, matching the public labels list
contract without letting browser callers provide `where` or `params` values.
The named `activity-events` shape is the global feed's bounded recent
projection: the domain-approved predicate is
`organization_id = $1 AND retained_until > $2`, with `$2` set to the domain
Worker's current time. `retained_until` already encodes the 30-day activity
retention rule, so stale rows are excluded even if cleanup has not run yet.
Browser callers cannot provide the cutoff, table, predicate, params, or
Electric source secret.

## Observability

The API enables a custom Effect HTTP request logger for the Node server and
structured forwarding logs in the Cloudflare Worker adapter. Both paths record
method, status, and redacted path only; query strings are not logged, and
`/health` is skipped to keep probe noise out of operational logs. Typed domain
HTTP handlers also wrap service calls with `observeApiOperation`, which adds an
operation log span and emits structured fields when a jobs, labels, sites,
route-aware proximity, or organization activity operation fails.
Storage failures and defects log at warning level, while expected typed domain
failures log at info level. Those fields include the API domain, service,
operation, failure tag, failure message, safe entity identifiers when present,
and failure cause when present.

Cloudflare API requests carry an `x-request-id` header. The public API Worker
accepts a caller-provided value or generates one, forwards it through the
private `DOMAIN` service binding, returns it on the response, and logs it with
the Cloudflare ray id when available. API Worker forwarding logs include
`api.forwardMs` and total `http.durationMs`. Domain Worker request logs include
the same request id, ray id, total duration, handler construction time,
handler execution time, database initialization timing, and auth critical-path
timings when the request touches Better Auth.

Background auth email delivery uses the same structured failure vocabulary.
Password reset, verification, email-change confirmation, and organization
invitation delivery failures are reported through the authentication failure
reporters. Cloudflare queue delivery failures log the email kind, delivery key,
source tag, and source cause before retrying. Deployed Workers rely on
Cloudflare observability logs and traces configured by the infra stack.
Auth email scheduling through Cloudflare Queues records `auth.emailQueueSendMs`
under the active request observation and emits a background task completion log
with the same request id when Better Auth schedules email work with
`context.waitUntil`.
The standalone MCP Worker emits its own forwarding log for each domain call
with method, status, and path-only URL metadata, then relies on the domain
Worker for OAuth, tool execution, authorization, and domain audit logs.

## Authentication Domain

Authentication lives in `apps/domain/src/domains/identity/authentication`.

Core files:

| File                                               | Responsibility                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `auth.ts`                                          | Better Auth creation, organization plugin hooks, public invitation preview handler, CORS integration, and HTTP mounting. |
| `config.ts`                                        | Better Auth runtime config, trusted origins, cookie-domain logic, and rate-limit config.                                 |
| `schema.ts`                                        | Better Auth Drizzle tables and relations.                                                                                |
| `auth-email.ts`                                    | Auth email payloads and send orchestration.                                                                              |
| `auth-email-config.ts`                             | Auth email sender config loaded from runtime configuration.                                                              |
| `auth-email-transport.ts`                          | Auth email transport capability plus deterministic local/development and deployed Cloudflare binding provider layers.    |
| `auth-email-queue.ts`                              | Queue payload handling.                                                                                                  |
| `auth-email-scheduler.ts`                          | Background scheduling boundary for auth emails.                                                                          |
| `cloudflare-email-binding-auth-email-transport.ts` | Cloudflare Email Worker binding transport.                                                                               |

Better Auth owns standard auth routes under `/api/auth/*`. The domain Worker
also exposes a public invitation preview route matched by
`/api/public/invitations/:invitationId/preview`, returning a masked email,
organization name, and role for pending non-expired invitations.

Auth email senders depend on the `AuthEmailTransport` capability rather than a
specific provider. Package-local Node composition uses
`AuthEmailTransport.Local`, which always uses deterministic development
delivery. The deployed Worker queue composes
`AuthEmailTransport.CloudflareBinding` directly, so missing Worker bindings or
invalid sender config fail through the Effect layer/config boundary instead of
being selected by an environment variable.

Organization rules are enforced through Better Auth plugin hooks and shared
decoders from `@ceird/identity-core`. Only organization name can be
updated through the supported update path, and writable roles are decoded
against the shared role schema.

## MCP Resource Server

MCP tools live in `apps/domain/src/domains/mcp` as Effect AI `Tool` and
`Toolkit` registrations. They call the same domain services as the HTTP API.
The MCP
resource server validates the bearer token through Better Auth's OAuth Provider
support before the request reaches the Effect AI router. Tool execution receives
the verified request identity through an Effect request-runtime context, resolves
the current organization actor from the token's Better Auth session id and
subject, and then lets the existing labels, sites, and jobs authorization rules
decide access.

Initial MCP tools:

| Tool                       | Domain service method                  | Scope         |
| -------------------------- | -------------------------------------- | ------------- |
| `ceird.labels.list`        | `LabelsService.list`                   | `ceird:read`  |
| `ceird.sites.options`      | `SitesService.getOptions`              | `ceird:read`  |
| `ceird.jobs.list`          | `JobsService.list`                     | `ceird:read`  |
| `ceird.jobs.detail`        | `JobsService.getDetail`                | `ceird:read`  |
| `ceird.jobs.options`       | `JobsService.getOptions`               | `ceird:read`  |
| `ceird.jobs.activity.list` | `JobsService.listOrganizationActivity` | `ceird:admin` |
| `ceird.jobs.add_comment`   | `JobsService.addComment`               | `ceird:write` |
| `ceird.jobs.assign_label`  | `JobsService.assignLabel`              | `ceird:write` |
| `ceird.jobs.remove_label`  | `JobsService.removeLabel`              | `ceird:write` |

`ceird:admin` satisfies all MCP tool scope checks. `ceird:write` does not imply
read access, and `ceird:read` does not imply write access. All tools fail closed
when the bearer token lacks a Better Auth session id, lacks a subject, lacks an
OAuth client id, or lacks the required Ceird scope.
MCP currently exposes list/detail/options/comment/label tools only. Its domain
tool layer provides an explicit unavailable route-proximity service so existing
MCP tools do not initialize Google Routes configuration or provider cache until
route-aware MCP tools are intentionally added.

## Identity Preferences

User preferences are exposed through `@ceird/identity-core` and implemented in
`apps/domain/src/domains/identity/preferences`.

| Endpoint            | Method  | Purpose                                                     |
| ------------------- | ------- | ----------------------------------------------------------- |
| `/user/preferences` | `GET`   | Return the current authenticated user's global preferences. |
| `/user/preferences` | `PATCH` | Update supported user preference fields.                    |

The first preference is `routeProximityLocationEnabled`, a global opt-in that
lets the app ask the current browser/device for live location when running
route-aware Jobs, Sites, or Agent proximity flows. The preference table stores
only this boolean and timestamps. Current coordinates remain request-time
payloads for proximity operations and must not be written to `user_preferences`.
The app uses this flag before prompting for browser geolocation; the domain also
enforces it for jobs/sites current-location route endpoints and Agent sideband
current-location frames.

## Jobs Domain

Jobs live in `apps/domain/src/domains/jobs` and are exposed through
`@ceird/jobs-core`.
Jobs may reference sites and organization labels, but site definitions and
label definitions are owned by their own API domains.

Core files:

| File                   | Responsibility                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `http.ts`              | Binds jobs contract endpoints to Effect services and configures CORS.                                                              |
| `service.ts`           | Main jobs use cases: list, create, patch, transition, reopen, comments, visits, job-label assignment, collaborators, and options.  |
| `repositories.ts`      | SQL repository layer for jobs, contacts, activity, members, collaborators, and job-label assignment rows.                          |
| `authorization.ts`     | Role and access checks for jobs operations.                                                                                        |
| `actor-access.ts`      | Actor resolution error mapping.                                                                                                    |
| `activity-recorder.ts` | Work item activity events.                                                                                                         |
| `schema.ts`            | Jobs-owned Drizzle tables and relations, including job-label assignment rows. Job comments are stored through the comments domain. |
| `errors.ts`            | API-domain error helpers where needed.                                                                                             |

The jobs service flow is:

1. Load the current actor.
2. Map actor resolution failures to access-denied errors.
3. Enforce authorization for the requested operation.
4. Read or mutate through repositories.
5. Record activity for auditable changes.
6. Return DTOs defined in the owning shared core package.

Current actor resolution lives in `apps/domain/src/domains/organizations`
because sites,
labels, and jobs all need the same organization actor boundary. Better Auth
session data is treated as untrusted: session user and active organization IDs
are decoded into branded IDs, malformed identity data fails with a typed
actor-resolution error, and session lookup failures remain typed storage
failures instead of defects.

External organization members can have collaborator-style access to specific
jobs. Elevated internal roles can manage organization-wide configuration such
as labels and sites through the owning domain.

## Comments Domain

Reusable comments persistence lives in `apps/domain/src/domains/comments` and shared DTO
primitives live in `@ceird/comments-core`. The API stores comment content in a
single `comments` table and keeps target ownership in separate join tables:

- `work_item_comments` links comments to jobs.
- `site_comments` links comments to sites.

The core `comments` row owns author, organization, body, creation timestamp,
and edit metadata (`updated_at`, `updated_by_user_id`). Target join tables own
the target foreign key and ordering timestamp. Database triggers enforce exactly
one ownership target per comment, validate that comment authors/editors are
members of the comment organization without pinning historical comments to
membership rows after a member is removed, and delete a shared comment after its
ownership row is removed.

Site comments are internal-only at the service authorization layer for now.
Site `accessNotes` remain part of the site record and are not deprecated by the
comments API.

## Jobs API Endpoints

Endpoint definitions live in `packages/jobs-core/src/http-api.ts`; API handlers
live in `apps/domain/src/domains/jobs/http.ts`.

| Method   | Path                                              | Handler name                  |
| -------- | ------------------------------------------------- | ----------------------------- |
| `GET`    | `/jobs`                                           | `listJobs`                    |
| `GET`    | `/jobs/options`                                   | `getJobOptions`               |
| `GET`    | `/jobs/member-options`                            | `getJobMemberOptions`         |
| `GET`    | `/jobs/external-member-options`                   | `getJobExternalMemberOptions` |
| `GET`    | `/jobs/external-options`                          | `getExternalJobOptions`       |
| `GET`    | `/home/dashboard-summary`                         | `getHomeDashboardSummary`     |
| `POST`   | `/jobs`                                           | `createJob`                   |
| `GET`    | `/activity`                                       | `listOrganizationActivity`    |
| `GET`    | `/jobs/:workItemId`                               | `getJobDetail`                |
| `PATCH`  | `/jobs/:workItemId`                               | `patchJob`                    |
| `POST`   | `/jobs/:workItemId/transitions`                   | `transitionJob`               |
| `POST`   | `/jobs/:workItemId/reopen`                        | `reopenJob`                   |
| `POST`   | `/jobs/:workItemId/comments`                      | `addJobComment`               |
| `POST`   | `/jobs/:workItemId/visits`                        | `addJobVisit`                 |
| `POST`   | `/jobs/:workItemId/labels`                        | `assignJobLabel`              |
| `DELETE` | `/jobs/:workItemId/labels/:labelId`               | `removeJobLabel`              |
| `GET`    | `/jobs/:workItemId/collaborators`                 | `listJobCollaborators`        |
| `POST`   | `/jobs/:workItemId/collaborators`                 | `attachJobCollaborator`       |
| `PATCH`  | `/jobs/:workItemId/collaborators/:collaboratorId` | `updateJobCollaborator`       |
| `DELETE` | `/jobs/:workItemId/collaborators/:collaboratorId` | `detachJobCollaborator`       |

`GET /home/dashboard-summary` is a bounded aggregate response for the
authenticated organization home route. It returns exact job, site, and member
counts plus at most five active job rows and five active-site rows, so the home
route does not load every job, site, or member option to build first paint.

`GET /jobs` is cursor-paged and accepts bounded primary-list filters including
`limit`, `cursor`, `status`, `assigneeId`, `coordinatorId`, `priority`,
`labelId`, `siteId`, and text `query`. `status=active` excludes terminal jobs,
`status=all` removes the status predicate, and `assigneeId=unassigned` filters
for jobs without an assignee. The app `/jobs` route sends its search/filter
state through this query contract instead of loading every tenant job and
filtering the complete array in the browser.

`GET /jobs/external-options` is external-only. It returns `JobOptionsResponse`
with `members: []` and derives labels, contacts, and sites only from jobs
visible through the current collaborator's grants.

## Labels Domain

Labels live in `apps/domain/src/domains/labels` and are exposed through
`@ceird/labels-core`. Labels are organization-level definitions; jobs and sites
assign those labels through join tables and assignment behavior owned by the
jobs and sites domains.

`GET /labels` returns `LabelsResponse` unchanged. Label definition write
endpoints (`POST /labels`, `PATCH /labels/:labelId`, and
`DELETE /labels/:labelId`) return `LabelWriteResponse`:
`{ label, mutation: { txid } }`. The `label` field is the canonical
server-confirmed row. The `mutation.txid` is PostgreSQL/Electric confirmation
metadata for opt-in Electric collection mutation handlers; non-Electric browser
commands map the response back to `Label` before reconciling local state.
The sync `labels` shape covers active labels only; archived labels are excluded
by the domain-approved Electric predicate.

Core files:

| File               | Responsibility                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| `http.ts`          | Binds label contract endpoints to `LabelsService` and configures CORS.    |
| `service.ts`       | Label list, create, update, and archive use cases with organization auth. |
| `repositories.ts`  | SQL repository layer for the organization-owned `labels` table.           |
| `schema.ts`        | Labels Drizzle table and relations.                                       |
| `id-generation.ts` | Label ID generation.                                                      |

## Sites Domain

Sites live in `apps/domain/src/domains/sites` and are exposed through
`@ceird/sites-core`. Jobs can reference sites, and sites can have internal
comments through the comments domain. Site access notes remain a single
structured field on the site itself for operational access instructions.

Core files:

| File                     | Responsibility                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `http.ts`                | Binds sites contract endpoints to Effect services and configures CORS.                      |
| `service.ts`             | Site list, create, update, options, internal comments, and site-label assignment use cases. |
| `repositories.ts`        | SQL repository layer for sites and site-label assignment methods.                           |
| `schema.ts`              | Sites and site-label assignment rows and relations.                                         |
| `location-provider.ts`   | Google Places autocomplete/place-details capability plus development and Google layers.     |
| `location-resolution.ts` | Maps omitted, manual, and Google place inputs into persisted site location records.         |
| `id-generation.ts`       | Site ID generation.                                                                         |

Site and job services depend on the `SiteLocationProvider` capability, not on a
provider-specific implementation. Runtime entrypoints choose the provider layer:
package-local Node composition uses `SiteLocationProvider.Local`, which selects
Google Places when `GOOGLE_MAPS_API_KEY` is present and falls back to
deterministic development suggestions/details when it is absent. The Cloudflare
Worker composition uses `SiteLocationProvider.Google`, so deployed domain
startup fails fast without the Google Maps key. Environment variables configure
provider credentials; they do not select provider topology.

Site creation accepts omitted, manual, or Google place locations. Omitted and
manual locations are persisted as `unverified` so partial addresses can be saved
without blocking the workflow. The one exception is internal agent-created sites:
`ceird.sites.create` may accept `{ name, eircode }`, normalizes it to a manual
Irish location, and asks `SitesService.create` to resolve manual locations with a
Google-first strategy. That internal path canonicalizes Irish Eircodes such as
`V31R968` to `V31 R968`, infers Ireland unless the caller explicitly provided
Great Britain, tries Places Autocomplete, resolves the first suggestion through
Place Details with the same session token, and persists Google metadata plus the
canonical `eircode` and original raw input. If autocomplete returns no
suggestions or provider/details resolution fails, the agent path falls back to an
`unverified` manual location with the canonical Eircode. Normal UI typed manual
locations do not set this option and therefore remain unverified unless the user
selects a Google place. Google place inputs are resolved through Places place
details before opening the write transaction; provider latency and provider
failures stay outside Postgres transactions. The app stores Google's raw
`placeId` value; the provider constructs Place Details URLs as
`/v1/places/{placeId}` at the HTTP boundary and forwards the autocomplete
session token to Place Details to keep Google billing session-aware. Site updates
preserve the existing location when `location` is omitted and explicitly clear it
when `location: null` is sent. This design intentionally keeps
Google place IDs, address components, formatted addresses, and
unverified/manual raw input in the site record so Google Address Validation can
be added later as a stricter validation step without redesigning the API shape.
Unverified rows must not expose usable coordinates; maps and future radius
queries should trust `hasUsableCoordinates`, not latitude/longitude alone.

## Labels API Endpoints

Endpoint definitions live in `packages/labels-core/src/http-api.ts`; API
handlers live in `apps/domain/src/domains/labels/http.ts`.

| Method   | Path               | Handler name  |
| -------- | ------------------ | ------------- |
| `GET`    | `/labels`          | `listLabels`  |
| `POST`   | `/labels`          | `createLabel` |
| `PATCH`  | `/labels/:labelId` | `updateLabel` |
| `DELETE` | `/labels/:labelId` | `deleteLabel` |

## Sites API Endpoints

Endpoint definitions live in `packages/sites-core/src/http-api.ts`; API
handlers live in `apps/domain/src/domains/sites/http.ts`.

| Method   | Path                             | Handler name                  |
| -------- | -------------------------------- | ----------------------------- |
| `GET`    | `/sites`                         | `listSites`                   |
| `GET`    | `/sites/options`                 | `getSiteOptions`              |
| `POST`   | `/sites/location/autocomplete`   | `autocompleteSiteLocation`    |
| `POST`   | `/sites/location/place-details`  | `getSiteLocationPlaceDetails` |
| `POST`   | `/sites`                         | `createSite`                  |
| `PATCH`  | `/sites/:siteId`                 | `updateSite`                  |
| `GET`    | `/sites/:siteId/comments`        | `listSiteComments`            |
| `POST`   | `/sites/:siteId/comments`        | `addSiteComment`              |
| `POST`   | `/sites/:siteId/labels`          | `assignSiteLabel`             |
| `DELETE` | `/sites/:siteId/labels/:labelId` | `removeSiteLabel`             |

`GET /sites` is cursor-paginated with `cursor` and `limit` query parameters.
Responses return `{ items, nextCursor }` and use the stable directory order
`name asc, id asc`. `GET /sites/options` provides bundled internal form support
data for workflows that need site choices.

## Database

The domain Worker uses Drizzle with Postgres. Package-local `db:generate` and
`db:migrate` pass Drizzle Kit's `--ignore-conflicts` flag because the historical
bootstrap migration graph contains known non-commutative branches. Remove that
flag only after the historical migration graph is linearized or otherwise made
commutative.

| Area                  | Files                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Database config       | `src/platform/database/config.ts`, `database-url.ts`                  |
| Database runtime      | `src/platform/database/database.ts`                                   |
| Test database helpers | `src/platform/database/test-database.ts`                              |
| Schema barrel         | `src/platform/database/schema.ts`                                     |
| Migrations            | `drizzle/*/migration.sql`, `drizzle/*/snapshot.json`                  |
| Alchemy deltas        | `drizzle-alchemy/*/migration.sql`, generated snapshots when available |
| Drizzle CLI config    | `drizzle.config.ts`                                                   |

`databaseSchema` in `apps/domain/src/platform/database/schema.ts` merges
authentication, identity preferences, activity, comments, labels, sites, and
jobs tables.
Keep schema changes in the domain that owns the tables, then export through the
schema barrel. The Alchemy stack also loads this barrel through `Drizzle.Schema`.
The parent native Neon branch applies `apps/domain/drizzle`, so historical SQL
files remain the bootstrap path. Forked local and preview branches apply
`drizzle-alchemy` only, so Alchemy-generated deltas can run after the fork
without replaying the bootstrap tree. In infra this is modeled as separate
generated and applied migration directories.

The `site_labels` table joins `sites` to organization `labels` and enforces the
same organization on both sides through composite organization foreign keys.
The `site_active_job_summaries` table is a domain-owned projection keyed by
`(site_id, organization_id)`. Job create, patch, transition, and reopen writes
refresh affected site rows, and the schema migration backfills existing
non-terminal jobs. Sites read paths consume this projection so active job count
and highest active priority are not recomputed in route-local UI code.
The `agent_threads` and `agent_action_runs` tables are owned by the agents
domain and indexed for the common org/user thread listing path and idempotent
action replay lookups.
Product activity/comment actor display uses `product_activity_actors`, a
domain-owned projection safe for Electric sync. The domain Worker updates member
actor rows from Better Auth user/member data when comments or activity are
written, but only `product_activity_actors` is shape-authorized. The private
`product_activity_actor_sources` table keeps user, agent-thread, and system
lookup keys out of synced product data.
Global feed activity uses `activity_events`, a bounded product-facing read model
owned by the activity domain. Rows carry stable ids, organization scope, event
and target metadata, a product-safe `actor_id`, display payload, status,
created time, and `retained_until`. The public Electric shape is bounded by a
domain-owned `retained_until` cutoff predicate, while the repository prunes
expired rows and keeps only the latest 5,000 events per organization. The
latest-5,000 guardrail is enforced by retention cleanup because Electric shape
predicates cannot express an ordered per-organization limit. Product write paths
emit into this model through follow-up activity issues rather than in the
projection and shape slice.
Route-aware proximity adds indexes for the hot ranking paths: active jobs can
reuse the existing `work_items_organization_active_updated_at_idx`, site active
job summaries use `work_items_organization_site_active_priority_idx`, and mapped
site proximity uses `sites_organization_routeable_updated_at_idx`. Migration
`apps/domain/drizzle/20260606234802_route_proximity_indexes/migration.sql` and
the matching `apps/domain/drizzle-alchemy/20260606234802_route_proximity_indexes/migration.sql`
were added manually because `drizzle-kit generate` is currently blocked by an
unrelated pre-existing non-commutative migration conflict in the historical
`sites` check-constraint migrations; rerun generation once that branch conflict
is resolved to refresh snapshots.
User preferences are stored in `user_preferences`, keyed by `user_id` with a
cascading foreign key to Better Auth's `user` table. The table stores
timezone-aware `created_at` and `updated_at` timestamps, the route-proximity
location opt-in boolean, and no coordinate columns. Migration
`apps/domain/drizzle/20260607043800_user_preferences/migration.sql` and the
matching `drizzle-alchemy` migration add the table manually for the same
generation-blocking reason described above.

## Errors And Runtime Schemas

Public API errors live in the package that owns the contract:
`packages/jobs-core/src/errors.ts`, `packages/sites-core/src/errors.ts`, and
`packages/labels-core/src/errors.ts`. Domain code should return those shared
errors when a frontend client needs typed behavior.
Agent action rejection errors use a typed `actionName` field when the failure
can be attributed to a known registry action; unsupported malformed action
names stay in the error message rather than crossing the boundary as a typed
action name.

Use Effect `Config` for environment loading and Effect `Schema` for external
payload boundaries. Plain TypeScript types are fine for internal computed
values that never cross an untrusted boundary.
The domain TypeScript scope enables `noUncheckedIndexedAccess`, so repository
rows, parsed URL segments, regex groups, and disposal/result arrays must be
narrowed before use. Keep those checks close to the boundary that proves the
value exists, and continue using `Config`/`Schema` for runtime validation
rather than replacing boundary decoding with ad hoc casts.

## Testing

API tests live next to source files as `*.test.ts` or `*.integration.test.ts`.
Run them with:

```bash
pnpm --filter api test
```

Database-backed integration tests create an isolated database from a base
Postgres URL. By default they use the local app database URL, but
`API_TEST_DATABASE_URL` or `TEST_DATABASE_URL` can point them at a specific
Postgres instance for focused coverage.

High-risk API changes should include tests for the service behavior,
authorization behavior, repository behavior when SQL is involved, and HTTP
contract behavior when endpoint payloads or errors change.
