# Sandbox CLI

`@task-tracker/sandbox-cli` implements the per-worktree sandbox used for local
app/API/Postgres development.

## Commands

Run through root scripts:

```bash
pnpm sandbox:up
pnpm sandbox:status
pnpm sandbox:list
pnpm sandbox:url
pnpm sandbox:logs -- --service api
pnpm sandbox:down
```

Run directly from the package when working on the CLI:

```bash
pnpm --filter @task-tracker/sandbox-cli sandbox:up
pnpm --filter @task-tracker/sandbox-cli test
pnpm --filter @task-tracker/sandbox-cli check-types
pnpm --filter @task-tracker/sandbox-cli build
```

## Important Paths

| Path                            | Purpose                                             |
| ------------------------------- | --------------------------------------------------- |
| `src/cli.ts`                    | Effect CLI command definitions and output handling. |
| `src/lifecycle.ts`              | Pure startup/shutdown coordination.                 |
| `src/runtime.ts`                | Runtime service implementation.                     |
| `src/compose.ts`                | Docker Compose command integration.                 |
| `src/registry.ts`               | Sandbox registry persistence.                       |
| `src/http-health.ts`            | App/API health polling.                             |
| `src/sandbox-view.ts`           | User-facing status and URL output formatting.       |
| `docker/sandbox.compose.yaml`   | Compose services for Postgres, API, and app.        |
| `docker/sandbox-dev.Dockerfile` | Sandbox development image.                          |
| `docker/sandbox-entrypoint.sh`  | Container command dispatcher.                       |

See [../../docs/architecture/sandbox-and-infra.md](../../docs/architecture/sandbox-and-infra.md)
for the startup flow and runtime environment details.
