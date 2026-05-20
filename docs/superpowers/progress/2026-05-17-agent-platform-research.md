# Ceird Agent Platform Research

Date: 2026-05-17

## Goal

Choose an evidence-backed architecture direction for a Ceird agent that can let
an authenticated user ask for most Ceird actions in natural language, preserve
Ceird authorization and audit boundaries, keep a path open for WhatsApp, and
support generated UI through a constrained component catalog.

## Completion Gate

This research is complete when it identifies which compared projects should be
used as the agent runtime, model/tool loop, chat-channel adapter, and generated
UI layer, and records the proof required before implementation starts.

## Recommendation

Use the platforms as complements, not substitutes:

1. Use AI SDK as the first model/tool-loop layer.
2. Use Cloudflare Agents as the durable runtime once the web-app agent MVP needs
   persisted agent state, resumable chat, background work, or channel fan-out.
3. Treat Chat SDK as the future messaging-channel adapter for WhatsApp and other
   chat surfaces, not as the reasoning engine.
4. Treat TanStack AI as promising but too early for the core Ceird agent path.
   Borrow ideas from it, especially type-safe isomorphic tools, tool approval,
   lazy tool discovery, and AG-UI compatibility.
5. Use a json-render-style constrained UI catalog for generated UI. The agent
   should generate JSON specs that bind to Ceird components and server-verified
   actions, not arbitrary React code.

The practical starting point is an in-app Ceird agent backed by AI SDK and the
existing Effect services/MCP tool boundary. Cloudflare Agents becomes the
durability and real-time shell around that agent, and Chat SDK becomes a channel
ingress/egress layer after account linking and approval semantics are solid.

## Why This Fits Ceird

Ceird already has the important hard boundary: an OAuth-protected MCP resource
server in `apps/api` whose tools run through the same Effect domain services,
organization actor resolution, scopes, and authorization rules as the HTTP API.
That means the agent should not own business logic. It should plan, call typed
tools, ask for approval when needed, and render useful UI around the result.

The current repo shape supports this:

- `apps/app` is TanStack Start with React 19, route loaders, hotkeys, and a
  command-oriented product UI.
- `apps/api` owns Effect HTTP APIs, Better Auth, domain services, Drizzle
  migrations, the Cloudflare Worker entrypoint, and the current MCP surface.
- `packages/*-core` own shared DTOs, IDs, schemas, and HTTP contracts.
- Production infrastructure already targets Cloudflare Workers, Hyperdrive,
  Neon, and Queues through Alchemy.

That points to an "agent kernel over Ceird tools" design: keep Ceird actions in
Effect services and expose them as agent tools with strict schemas, scopes,
risk metadata, idempotency behavior, and audit labels.

## Comparison

| Project           | What it is best for                                                                                                                              | What it does not solve alone                                                    | Ceird fit                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK            | Mature TypeScript model/provider abstraction, streaming, ToolLoopAgent, MCP client support, UI hooks, generative UI patterns, testing helpers    | Durable execution, external chat-channel adapters, app-specific authorization   | Best first model/tool-loop choice. It can call Ceird MCP tools or direct server tools and works with TanStack Start.                      |
| Cloudflare Agents | Durable Object based agent instances, built-in SQL/state, WebSockets/SSE, AIChatAgent, scheduling, Workflows, human-in-loop, MCP exposure        | General web/app UI patterns, WhatsApp adapters, existing Ceird domain contracts | Best runtime once the agent needs persistence, background tasks, live state, and multi-channel continuity. Fits current Cloudflare infra. |
| Chat SDK          | Cross-platform bot layer for Slack, Teams, Google Chat, Discord, Telegram, WhatsApp, Messenger, Linear, GitHub; normalized events; cards/actions | LLM provider loop, durable workflows, Ceird authorization, generated web UI     | Best future WhatsApp/channel layer. It should forward normalized chat events into the same Ceird agent kernel.                            |
| TanStack AI       | Lightweight alpha AI SDK with type-safe tools, server/client tools, approvals, lazy discovery, AG-UI wire compatibility, framework adapters      | Durable runtime, channel adapters, maturity for core product bet                | Watch closely. Use later if its AG-UI and TanStack integration clearly beat AI SDK for the web agent.                                     |
| json-render       | Constrained generative UI from a component/action catalog, streaming JSON render, data binding, React/React Native, code export                  | Agent loop, auth, persistence, domain actions                                   | Good model for Ceird generated UI. Use catalog-limited JSON specs, not free-form generated code.                                          |

## Architecture Direction

### Phase 1: Web Agent MVP

- Add an agent endpoint or app server function that streams chat responses.
- Use AI SDK `streamText` or `ToolLoopAgent` with explicit loop limits,
  telemetry, deterministic tests, and provider configuration.
- Start with server-side tools that call existing Effect services directly, or
  bridge through the existing MCP server for a clean protocol proof.
- Expand the current MCP/tool registry beyond read/list/comment/label actions
  toward the real action set: create/patch/transition jobs, site actions,
  collaborator changes, service-area/rate-card updates, invitations, and org
  settings.
- Add tool metadata:
  - scope: `ceird:read`, `ceird:write`, `ceird:admin`
  - risk: read, reversible write, destructive, external communication, admin
  - approval requirement and approval copy
  - idempotency key strategy
  - audit event type
  - optional UI affordance hints
- Keep all authorization in the same services the HTTP API uses.

### Phase 2: Durable Agent Runtime

- Add a Cloudflare Agent class, likely in a dedicated worker/app surface unless
  sharing the API Worker is clearly simpler.
- Name agent instances by stable Ceird context, for example
  `org:<organizationId>:user:<userId>` or by conversation id when isolation is
  required.
- Persist conversation state, pending approvals, run metadata, and resumable
  stream cursors in the agent's durable state or Ceird Postgres depending on the
  audit/query needs.
- Use Cloudflare Workflows for long-running, retryable work such as batch
  updates, external sync, scheduled follow-up, or approval flows that can wait
  for hours or days.

### Phase 3: WhatsApp And Other Channels

- Use Chat SDK as an adapter layer once the core web agent is reliable.
- Link WhatsApp users to Ceird users and active organizations through a one-time
  signed link or OAuth-style account linking.
- Convert Chat SDK events into the same internal agent message shape used by
  the web UI.
- Degrade generated UI into WhatsApp-friendly text, templates, quick replies,
  or links back to the web app for richer review.
- Treat WhatsApp as a channel, not as canonical state.

### Phase 4: Generated UI

- Define a Ceird UI catalog inspired by json-render:
  - safe layout primitives
  - job/site/activity cards
  - forms for bounded edits
  - approval panels
  - tables, filters, and detail summaries
  - action bindings that map to server-validated agent tools
- The model emits a JSON UI spec validated at runtime before rendering.
- Client actions dispatch action ids plus validated payloads back to the agent
  or API. The client never executes privileged actions from generated JSON.
- Use the same hotkey and command layer for durable UI actions when generated
  UI creates repeated or primary actions in the app.

## Platform Notes

### AI SDK

AI SDK is the most practical first dependency. Its docs describe it as a
TypeScript toolkit for AI apps and agents across React, TanStack Start, Node,
and other frameworks. It has two relevant parts: Core for model calls,
structured outputs, tool calls, and agents, and UI for chat/generative UI hooks.

Useful details:

- Current npm version checked during this research: `ai@6.0.184`.
- Docs show `ToolLoopAgent` for reusable model, prompt, and tool behavior.
- Loop control includes default step limits and stop conditions.
- MCP support includes production HTTP transport, auth headers/OAuth provider
  support, tool conversion, resources, prompts, and elicitation.
- Testing support includes mock language models and stream helpers.
- TanStack Start is an explicitly documented target.

Risks:

- AI SDK is Vercel-led, so avoid Vercel-only features for core Ceird behavior.
- Chat persistence and stream resumption are not automatic without storage.
- Need an adapter layer from Effect Schema/Effect services to AI SDK tool
  schemas to avoid duplicating contracts.

### Cloudflare Agents

Cloudflare Agents is the best fit for durable, long-lived Ceird agent sessions.
Cloudflare documents each agent as a Durable Object with SQL database,
WebSocket connections, scheduling, and state that survives restarts and
hibernation. Their own examples use AI SDK `streamText` inside `AIChatAgent`,
which supports combining Cloudflare as runtime with AI SDK as model loop.

Useful details:

- Current npm versions checked during this research:
  `agents@0.12.4` and `@cloudflare/ai-chat@0.7.0`.
- The starter includes streaming AI chat, server/client tools,
  human-in-the-loop approval, and scheduling.
- Agents can expose tools through MCP and connect to other MCP servers.
- Workflows are the right tool for durable multi-step jobs and long approvals.
- Adding Agents to an existing Worker requires Durable Object bindings,
  migrations, and `nodejs_compat`. Decorator-based callable methods require
  TypeScript/Vite support.

Risks:

- It adds Durable Object lifecycle and migration concerns.
- Ceird already has a rich Effect API runtime. Mixing Agent classes into that
  Worker should be a deliberate integration, not a casual import.
- Durable Object state must not become a second source of truth for Ceird domain
  data. Store agent conversation/run state there; keep business records in
  Postgres through existing services.

### Chat SDK

Chat SDK is a channel abstraction. Its adapter docs list WhatsApp support in
the platform matrix alongside Slack, Teams, Google Chat, Discord, Telegram,
GitHub, Linear, and Messenger. It handles webhook verification, incoming
message normalization, outgoing message conversion, event handlers, and rich
cards/actions where the target platform supports them.

Useful details:

- Current npm version checked during this research: `chat@4.28.1`.
- The docs present it as a universal chat layer for bots and agents.
- WhatsApp is included in the adapter feature matrix.
- Cards and actions are cross-platform but degrade according to platform
  capabilities.
- It explicitly pairs with AI SDK for streaming, tool calls, and structured
  outputs.

Risks:

- It does not solve account linking, tenant selection, authorization, audit, or
  long-running execution.
- WhatsApp interaction surfaces are constrained. Rich generated UI should mostly
  become a link, template, or approval prompt, not a complex embedded app.

### TanStack AI

TanStack AI is appealing because Ceird already uses TanStack Start, Router,
Form, Hotkeys, and Devtools. Its docs emphasize a lightweight type-safe SDK,
server/client tools, tool approvals, lazy tool discovery, AG-UI compatibility,
provider adapters, and no vendor service layer.

Useful details:

- Current npm version checked during this research: `@tanstack/ai@0.18.0`.
- The docs label TanStack AI as alpha.
- Server tools execute on the backend; client tools execute in the browser.
- Tool approval and lazy tool discovery are first-class.
- AG-UI client-to-server compliance is documented.

Risks:

- Alpha status makes it a weaker core bet for the first Ceird agent.
- It does not provide durable runtime, WhatsApp/channel adapters, or business
  authorization.
- Its strongest ideas can be implemented in Ceird's own tool registry while the
  ecosystem matures.

### json-render

json-render is a strong reference for safe generated UI. Its public site
describes a flow where the developer defines a component/action catalog, AI
generates JSON constrained to that catalog, and the app renders progressively.

Useful details:

- Current npm versions checked during this research:
  `@json-render/core@0.19.0` and `@json-render/react@0.19.0`.
- It supports component/action guardrails, streaming render, data binding, React
  and React Native, and code export.
- Its model maps well to Ceird because generated UI can be data, not code.

Risks:

- json-render uses Zod in examples, while Ceird boundary contracts use Effect
  Schema. We should either define a small Zod catalog only for UI generation or
  generate JSON Schema from Effect-owned schemas.
- Generated UI actions must be mapped to real Ceird tools and reauthorized on
  the server.

## Validation Already Done

- Read Ceird `README.md`, `docs/README.md`, system overview, API architecture,
  frontend architecture, and sandbox/infrastructure guide.
- Verified Ceird has an existing OAuth-protected MCP resource server and current
  MCP tool registry in `apps/api/src/domains/mcp`.
- Verified package posture from root, app, API, and infra `package.json` files.
- Checked `opensrc/sources.json`; current local source cache includes Effect,
  TanStack Start/Router/Form, Better Auth, Drizzle, and related dependencies,
  but not AI SDK, Cloudflare Agents, Chat SDK, or json-render.
- Checked current npm package versions listed above.
- Read primary docs:
  - https://tanstack.com/ai/latest
  - https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk
  - https://tanstack.com/ai/latest/docs/tools/tool-approval
  - https://tanstack.com/ai/latest/docs/tools/lazy-tool-discovery
  - https://tanstack.com/ai/latest/docs/migration/ag-ui-compliance
  - https://ai-sdk.dev/docs/introduction
  - https://ai-sdk.dev/docs/agents/building-agents
  - https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools
  - https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces
  - https://ai-sdk.dev/docs/getting-started/tanstack-start
  - https://chat-sdk.dev
  - https://chat-sdk.dev/docs/adapters
  - https://chat-sdk.dev/docs/cards
  - https://agents.cloudflare.com
  - https://developers.cloudflare.com/agents/
  - https://developers.cloudflare.com/agents/getting-started/add-to-existing-project/
  - https://developers.cloudflare.com/agents/concepts/human-in-the-loop/
  - https://json-render.dev

## Proof Required Before Implementation

Before committing to the stack, build four narrow spikes:

1. AI SDK plus Ceird tools:
   - Create one server-only agent path that can call at least one read tool and
     one write tool against the existing domain services or MCP server.
   - Prove unauthorized scopes fail before service mutation.
   - Prove deterministic tests with AI SDK mock models.

2. Approval gate:
   - Mark one sensitive action, such as deleting/removing or inviting/changing a
     role, as requiring approval.
   - Prove the model cannot execute it until the user approves.
   - Persist an audit record with requester, approver, payload, result, and
     timestamps.

3. Cloudflare Agent runtime:
   - Add a minimal Agent Durable Object in an isolated spike branch or worker.
   - Prove state persists across hibernation/restart and streams resume or
     recover acceptably.
   - Prove it can call the same Ceird tool boundary without duplicating domain
     logic.

4. Generated UI:
   - Define a tiny Ceird catalog with `JobSummary`, `ApprovalPanel`, `FieldSet`,
     `ActionButton`, and `ResultTable`.
   - Generate and validate a JSON UI spec for a real agent response.
   - Render it inside the app with existing design tokens.
   - Prove actions dispatch back to server-validated tools only.

WhatsApp should wait until those pass. Its proof is then:

- Chat SDK webhook receives a WhatsApp-style message.
- Account linking resolves a Ceird user and organization.
- The message reaches the same agent kernel.
- A write action requires approval and responds through a platform-appropriate
  template or quick reply.

## Decision

Build the Ceird agent around an internal tool registry and AI SDK first. Add
Cloudflare Agents when persistence, live state, and background workflows become
the bottleneck. Add Chat SDK for WhatsApp after the core action model and
approval flow work in the web app. Prototype generated UI with a constrained
json-render-style catalog rather than unconstrained component generation.
