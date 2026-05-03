# Sandbox Core

`@task-tracker/sandbox-core` contains pure sandbox primitives shared by the API,
app, and sandbox CLI.

## Exports

The root export provides:

- sandbox identity, name, slug, ID, and compose project validation
- sandbox URL and port helpers
- sandbox status and health payload schemas
- runtime spec construction
- sandbox record reconciliation
- sandbox naming errors

The `./node` export provides:

- shared sandbox environment loading from `.env`, `.env.local`, and process env
- sandbox registry record schemas and errors

## Commands

```bash
pnpm --filter @task-tracker/sandbox-core test
pnpm --filter @task-tracker/sandbox-core check-types
pnpm --filter @task-tracker/sandbox-core build
```

## Boundary

Keep deterministic logic here. Docker Compose execution, process handling,
terminal output, and command parsing belong in `@task-tracker/sandbox-cli`.
