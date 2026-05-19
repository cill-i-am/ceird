# API App Context

This app is a public HTTP adapter over the private Ceird domain Worker.

- Keep the API Worker thin: root/health handling, request logging, and
  service-binding forwarding belong here.
- Do not add product repositories, Drizzle schema, Better Auth runtime logic,
  authorization policy, or domain services to this app.
- Runtime contracts that cross the public boundary should stay in `packages/*`
  or the private domain Worker surface.
- Cloudflare binding drift should be caught through infra type tests that
  compare the API `DOMAIN` binding with Alchemy stack declarations.
