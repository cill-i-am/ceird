# Identity Core Context

This package owns shared identity and organization contracts.

- Keep the package runtime-neutral. Do not add Better Auth runtime configuration, HTTP handlers, database access, or app-specific session logic here.
- Model organization IDs, roles, invitation previews, input schemas, and DTOs with `Schema` when they cross app, domain, persistence, or test boundaries.
- Export small, explicit decode helpers and inferred types for consumers that need boundary validation.
- Keep role and organization semantics centralized here so the domain Worker and web app do not drift.
- Avoid broad convenience exports that make consumers depend on internals.
