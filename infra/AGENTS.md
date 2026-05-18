# Root Infra Context

This directory owns infrastructure-as-code helpers for Ceird's root
`alchemy.run.ts` stack.

- Keep Alchemy, Cloudflare, Neon, Hyperdrive, queue, and deployment-stage
  concerns in the root stack or this directory.
- Do not leak Effect 4 beta, Alchemy, or provider SDK dependencies into runtime
  apps or shared domain packages.
- Treat stage configuration and deployment credentials as boundary inputs:
  validate them with `Config` or `Schema` before provisioning resources.
- Keep app and API Worker deployment resources aligned with the local runtime
  contracts exposed by `apps/app` and `apps/api`.
- Prefer explicit deploy, destroy, and bootstrap commands over hidden side
  effects. Make destructive or stateful operations easy to inspect before they
  run.
- When provider behavior is unclear, check `opensrc/` and the local patches
  before changing resource code.
