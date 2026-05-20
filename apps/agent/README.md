# Ceird Agent Worker

Public Cloudflare Worker for Ceird AI agents.

The Worker hosts the `CeirdAgent` Durable Object through Cloudflare's Agents SDK.
It verifies short-lived agent connection tokens issued by `apps/domain`, stores
conversation runtime state in the Agent Durable Object, and calls the Domain
Worker through the private `DOMAIN` service binding for thread activity and all
Ceird actions.

The Domain Worker remains the owner of organizations, threads, authorization,
Postgres records, and the idempotent action ledger.

Read tools are exposed to the model by default. Write and destructive tools are
gated behind `AGENT_MUTATION_TOOLS_ENABLED=true` until the client chat surface
can provide an explicit confirmation flow outside the model prompt.
