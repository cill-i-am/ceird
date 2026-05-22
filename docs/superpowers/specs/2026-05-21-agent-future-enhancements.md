# Agent Future Enhancements

This is an exploration note, not an implementation plan. The current product
direction is still a global in-app Ceird agent drawer backed by the domain
action registry. These ideas are future jumping-off points once the core
agent/action/approval loop is stable.

## Managed Fibers

Cloudflare managed fibers should be considered for durable agent-turn work:
accepted replies, long-running tool chains, recoverable generation, cancellation,
inspection, and retry. This complements, rather than replaces, the Ceird domain
action-run ledger. Fibers protect the agent job lifecycle; the domain ledger
protects product writes from duplicate execution and replay drift.

Immediate next slot: enable `AIChatAgent.chatRecovery` on `CeirdAgent`. That
gives the in-app drawer recoverable streaming turns through the SDK's internal
`runFiber()` wrapper. Do not wrap every domain action in a new fiber: the domain
action-run ledger already owns idempotency for product writes. Use
`startFiber()` later for WhatsApp or webhook ingress, where provider delivery
retries need durable acceptance, dedupe by external message ID, inspection,
cancellation, and cleanup.

Useful follow-up questions:

- Which agent turns need recovery after a Durable Object restart?
- Which in-progress replies should users be able to cancel?
- What should happen when a model turn completed but delivery to the user did
  not?
- Should the app expose a small "current runs" surface, or keep this as
  internal observability first?

## MCP Connections

Ceird's internal API actions should continue to use the domain action registry,
not route through MCP by default. MCP is more interesting as an external
capability layer for tools Ceird does not own directly.

Likely first integrations:

- Gmail: find customer emails, summarize recent correspondence, draft replies,
  or attach context to a job.
- Google Calendar: schedule site visits, check availability, and create follow-up
  reminders.
- Google Drive: locate files, photos, reports, or inspection documents relevant
  to a site or job.

Each MCP connection needs explicit user or organization consent, scoped tokens,
auditable tool calls, and clear policy for what the agent can do without another
confirmation step. Gmail is especially sensitive: reads, drafts, and sends
should be separate capabilities.

## Scheduling And Workflows

Cloudflare Agent scheduling can let the agent wake itself later for reminders,
follow-ups, recurring summaries, and simple time-based nudges. Examples:

- "Remind me tomorrow to chase this blocked job."
- "Every Friday, summarize jobs that changed status."
- "If no one updates this planned job by Monday, ask me what to do."

Cloudflare Workflows are a better fit for longer multi-step processes that need
durable progress, retries, human approval, or external service calls over minutes
or hours. Scheduling is for wakeups; workflows are for durable processes.

## Future WhatsApp Adapter Pattern

WhatsApp should be deferred until the in-app agent and approval UI are solid.
When it arrives, treat WhatsApp as an authenticated external channel, not an
anonymous public bot. Every inbound phone number must resolve to a Ceird user and
organization membership before the agent can inspect or change organization
data.

The likely shape is:

- A Chat SDK runtime with a WhatsApp adapter.
- `agents/chat-sdk` state through `createChatSdkState()` and
  `ChatSdkStateAgent`.
- A provider identity mapping from WhatsApp account/phone/thread to Ceird
  organization, user, and agent thread.
- The same Ceird domain action registry and confirmation policy used by the
  in-app agent.
- Channel-specific rendering for confirmations, buttons, attachments, and
  fallback text.

Unknown or unlinked WhatsApp identities should only receive account-linking or
access-denied responses.

When WhatsApp ingress is implemented, wrap inbound delivery handling in
`startFiber("whatsapp-reply", ...)` with an idempotency key derived from the
provider delivery ID. The fiber should stash the external thread ID, Ceird
organization ID, Ceird user ID, agent thread ID, and outbound reply target
before the model turn starts. If delivery is retried, inspect by idempotency key
and return the retained status instead of starting a second visible reply.

Proof needed for WhatsApp fibers:

- Unit test duplicate delivery IDs return the retained managed-fiber status.
- Unit test cancellation records an aborted status and the callback checks
  `ctx.signal.aborted` before outbound replies.
- Integration test an interrupted fiber can be resolved through
  `onFiberRecovered()` or a later duplicate delivery.
- Manual Cloudflare proof: start a local stage, accept a delivery, stop the
  worker during reply generation, restart it, and verify recovery or retained
  interrupted status from `inspectFiberByKey()`.
