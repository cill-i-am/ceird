# Worker Observability Context

This package owns runtime-neutral Cloudflare Worker request analytics helpers.
Keep it focused on aggregate-safe telemetry primitives: sampling, path
normalization, Analytics Engine datapoint shape, and failure isolation.

Adapters pass in runtime context such as `adapter`, `path`, `status`,
`requestId`, and the Worker environment. Do not add product-specific logging,
auth audit events, domain activity events, Alchemy resource declarations, or
Worker entrypoints here.
