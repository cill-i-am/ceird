# Cloudflare-Native Ceird Agent Direction

Date: 2026-05-17

Status: defined direction, not an implementation plan.

## Direction

Ceird should treat Cloudflare Agents SDK as the default runtime candidate for a
first real agent, because Ceird is already deployed on Cloudflare and the agent
needs durable state, real-time connections, scheduling, and eventually channel
fan-out.

The core direction is:

- Cloudflare Agents SDK owns agent runtime, durable conversation/run state,
  WebSocket or SSE interaction, scheduling, and agent instance identity.
- Ceird Effect services and the existing OAuth-protected MCP/tool boundary own
  all business actions, authorization, scopes, audit behavior, and Postgres
  writes.
- Workers AI, AI Gateway, OpenAI-compatible endpoints, or Effect AI are the
  preferred model-call options when we want to avoid putting Vercel AI SDK in
  the core loop.
- AI SDK remains an optional convenience layer, not a foundational dependency.
  It should be added only if the provider abstraction, stream helpers, or tool
  ecosystem clearly justify it.
- Chat SDK remains a later channel adapter for WhatsApp and similar messaging
  surfaces.
- Generated UI should use a constrained JSON/component catalog, inspired by
  json-render, where UI actions map back to server-validated Ceird tools.

In short: deploy a Cloudflare-native agent shell, keep Ceird domain logic in
Ceird, and make every external channel or generated UI surface route through the
same tool and authorization model.

## Alchemy Fit

Yes, this can fit Alchemy.

Ceird already provisions Cloudflare Workers, a Cloudflare Vite app, Queues,
Hyperdrive, Email bindings, and observability through
`packages/infra/src/cloudflare-stack.ts`.

Alchemy v2 exposes Cloudflare Durable Object support through
`Cloudflare.DurableObjectNamespace`. Current Alchemy docs show two relevant
paths:

- Effect-style Workers can `yield*` a Durable Object namespace in Worker init,
  which registers the Durable Object binding and class migration metadata and
  returns a typed namespace handle.
- Plain async Workers can declare a Durable Object namespace in the
  `Cloudflare.Worker(..., { bindings: { ... } })` props, with
  `Cloudflare.InferEnv` typing the `env` binding.

That maps onto Cloudflare Agents SDK because Agents are Durable Object-backed
classes. Cloudflare's Agents docs show the normal Wrangler shape as a Durable
Object binding whose `class_name` matches the exported Agent class, plus
`new_sqlite_classes` for SQLite storage and `nodejs_compat`.

For Ceird, the likely Alchemy shape is a Worker resource that exports a Ceird
agent class and binds it with `Cloudflare.DurableObjectNamespace`, rather than
hand-maintaining Wrangler config. We may either:

- add agent routing to the existing API Worker if integration stays small and
  auth/tool reuse is simplest, or
- create a dedicated agent Worker if we want a cleaner runtime boundary for
  WebSockets, model calls, stream recovery, and channel ingress.

That boundary choice is still open exploration, not decided here.

## Instance Granularity

The right mental model is not "a Worker per org" or "a Worker per user".

Deploy one Worker class per environment, then create many named Durable Object
or Agent instances inside that Worker. Each instance is addressed by a stable
name and has isolated durable state. Cloudflare Agents' default routing uses:

```text
/agents/{agent-class}/{instance-name}
```

So Ceird can choose names such as:

- `org:<organizationId>` for an organization-level coordinator.
- `org:<organizationId>:user:<userId>` for a user's assistant inside one
  organization.
- `org:<organizationId>:user:<userId>:thread:<threadId>` for separate
  conversations.
- `org:<organizationId>:channel:whatsapp:<channelAccountId>` for a channel
  bridge after account linking.

Preliminary bias:

- Use per-user or per-conversation agent instances for chat memory, pending
  approvals, user-specific work, and privacy.
- Use org-scoped instances only for shared coordination problems, such as
  organization-wide queues, shared live views, scheduled org follow-ups, or
  fan-out to multiple connected users.
- Avoid one global agent instance. Durable Objects are single-threaded
  coordination atoms; a global instance becomes a bottleneck and a messy
  security boundary.

All Ceird domain data remains in Neon/Postgres through Effect services. Durable
Object storage should hold agent-local state: message/run state, connection
state, pending approvals, resumable stream metadata, and scheduled reminders.

## Validation Needed Later

Before this becomes an implementation plan, the next exploration should prove:

- Alchemy can deploy a minimal Worker with an Agent/Durable Object namespace and
  SQLite class migration metadata in Ceird's current infra package.
- The Agent instance can be named by `organizationId + userId` or
  `organizationId + userId + threadId`.
- The Agent can call the existing Ceird MCP or Effect service boundary without
  duplicating business logic.
- Worker auth can resolve a Ceird user and active organization before selecting
  the Agent instance name.
- Durable Object storage is kept to agent-local state, while business records
  remain in Postgres.

## Sources Checked

- Ceird infra: `packages/infra/src/cloudflare-stack.ts`
- Ceird infra entrypoint: `packages/infra/alchemy.run.ts`
- Alchemy installed source:
  `packages/infra/node_modules/alchemy/src/Cloudflare/Workers/DurableObjectNamespace.ts`
- Alchemy docs:
  https://v2.alchemy.run/providers/cloudflare/durableobjectnamespace/
- Cloudflare Agents docs:
  https://developers.cloudflare.com/agents/
- Cloudflare Agents add-to-existing-project:
  https://developers.cloudflare.com/agents/getting-started/add-to-existing-project/
- Cloudflare Agents routing:
  https://developers.cloudflare.com/agents/api-reference/routing/
- Cloudflare Durable Objects rules:
  https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
