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
absent unless the selected Agent Worker runtime explicitly sets
`AGENT_MUTATION_TOOLS_ENABLED=true`. The normal Alchemy configuration omits that
flag for local, preview, and production stages. Even when enabled for a chosen
stage, write and destructive tools still require the client chat surface to
approve the action outside the model prompt before the Domain Worker receives an
action execution request.
