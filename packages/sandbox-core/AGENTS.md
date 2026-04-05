# Sandbox Core Context

This package is the typed source of truth for sandbox domain contracts shared by the CLI and sandboxed services.

- Keep this package focused on sandbox naming, domain models, runtime specs, and boundary validation.
- Prefer pure, deterministic helpers in core code. Put Node, Docker, filesystem, and process side effects behind the `./node` entrypoint or in `sandbox-cli`.
- Use strong types, brands, and `Schema`-backed contracts at every persistence, environment, and cross-package boundary.
- `sandbox-core` should describe sandbox behavior and data, not orchestrate the sandbox lifecycle itself.
- When adding new sandbox capabilities, put shared contracts here first, then consume them from the CLI or apps.
