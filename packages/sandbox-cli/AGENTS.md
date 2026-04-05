# Sandbox CLI Context

This package owns sandbox operations and the developer-facing CLI experience.

- Optimize for reliable operational behavior over cleverness: startup, teardown, cleanup, and degraded-mode handling should be easy to reason about.
- Keep the CLI user experience explicit and reassuring. Surface progress, readiness, warnings, and failure hints clearly.
- Prefer Effect-native orchestration, typed errors, and structured logging over promise-first glue code or ad hoc console output.
- Keep Docker Compose, Portless, and process-management concerns in this package. Do not move those operational concerns into `sandbox-core`.
- Treat files under `docker/` as part of the runtime contract. Keep them aligned with the generated compose env, shared runtime assets, and CLI assumptions.
- Performance work here should preserve correctness first, then improve cold start, warm start, and teardown latency with measurable wins.
