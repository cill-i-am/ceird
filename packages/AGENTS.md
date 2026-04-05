# Package Context

This subtree contains reusable workspace packages rather than deployable apps.

- Keep package APIs small, explicit, and easy to compose from apps or other packages.
- Prefer moving shared contracts, domain logic, and cross-cutting helpers into packages instead of duplicating them in apps.
- Avoid app-specific assumptions in reusable packages unless the package exists specifically to own that runtime concern.
- Treat exports and package boundaries as stable internal contracts for the monorepo: prefer clear entrypoints over deep imports.
- When a package crosses a runtime boundary, use `Schema` or `Config` at that boundary and keep purely internal helpers lightweight.
