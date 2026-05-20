# Agent Worker Context

This app owns the public Cloudflare Agents SDK surface only.

- Keep durable chat/runtime state in the Cloudflare Agent Durable Object.
- Do not add direct Postgres, Hyperdrive, or product repository access here.
- Call `apps/domain` through the `DOMAIN` service binding for thread
  authorization and all Ceird actions.
- Treat `AGENT_INTERNAL_SECRET` as the boundary secret shared with the Domain
  Worker; never log it or send it to models.
- Keep client-specific transports, such as WhatsApp, as adapters over this
  worker rather than mixing them into domain action execution.
