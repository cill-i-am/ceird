# Infra Package Context

This package owns infrastructure-as-code and deployment orchestration for Ceird.

- Keep Alchemy, Distilled Cloud, Cloudflare, PlanetScale, Hyperdrive, queue, and deployment-stage concerns inside this package.
- Do not leak Effect 4 beta, Alchemy, or provider SDK dependencies into runtime apps or shared domain packages.
- Treat stage configuration and deployment credentials as boundary inputs: validate them with `Config` or `Schema` before provisioning resources.
- Keep app and API Worker deployment resources aligned with the local runtime contracts exposed by `apps/app` and `apps/api`.
- Prefer explicit deploy, destroy, and bootstrap scripts over hidden side effects. Make destructive or stateful operations easy to inspect before they run.
- When provider behavior is unclear, check `opensrc/` and the local patches before changing resource code.
