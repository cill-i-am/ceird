# Worker Observability

`@ceird/worker-observability` is the shared Cloudflare Worker request
telemetry package. API, domain, MCP, sync, and agent Workers use it to record
aggregate-safe request analytics without letting telemetry failures affect user
requests.

## Owns

- `WorkerObservability`, an Effect service for Worker runtime adapters.
- `makeWorkerObservabilityLive`, which binds the service to a Worker
  environment.
- Analytics Engine datapoint shaping for stage, adapter, method, normalized
  path, status class, stack name, status code, and request duration.
- Bounded sampling, deterministic request seeds, path normalization, status
  bucketing, and safe handling of failed Analytics Engine writes.

## Does Not Own

- Product-specific request logs.
- Auth, security, audit, or domain activity events.
- Alchemy resource declarations or Worker entrypoints.
- App-specific route or adapter policy beyond the adapter name passed in by the
  caller.

## Commands

```bash
pnpm --filter @ceird/worker-observability test
pnpm --filter @ceird/worker-observability check-types
pnpm --filter @ceird/worker-observability build
```
