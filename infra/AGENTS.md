# Root Infra Context

This directory owns infrastructure-as-code helpers for Ceird's root
`alchemy.run.ts` stack.

- Keep stage orchestration, shared Cloudflare resources, Neon, Hyperdrive,
  queues, and deployment credentials in the root stack or this directory.
- App-owned Cloudflare resource modules under `apps/*/infra` may import Alchemy
  to declare their own Worker/Vite resources, bindings, and configured env
  contracts.
- Do not leak Alchemy or provider SDK dependencies into request handlers,
  domain services, or shared domain packages.
- Treat stage configuration and deployment credentials as boundary inputs:
  validate them with `Config` or `Schema` before provisioning resources.
- Keep app and API Worker deployment resources aligned with the local runtime
  contracts exposed by `apps/app` and `apps/api`.
- Prefer explicit deploy, destroy, and bootstrap commands over hidden side
  effects. Make destructive or stateful operations easy to inspect before they
  run.
- When provider behavior is unclear, check `opensrc/` and the local patches
  before changing resource code.
