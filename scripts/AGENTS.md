# Scripts Context

This subtree owns root development helpers, local environment scripts, Portless
wrappers, opensrc sync, and Node test files for those helpers.

- Keep scripts runnable from the repository root unless the script name or
  package wrapper clearly says otherwise.
- Prefer explicit Node standard-library code over adding runtime dependencies
  for small orchestration helpers.
- Keep sandbox-facing scripts aligned with `packages/sandbox-core`,
  `packages/sandbox-cli`, and the root `pnpm sandbox:*` commands.
- When changing a script, add or update the colocated `*.test.mjs` coverage and
  run `pnpm test:scripts` or the relevant `node --test` command.
- Preserve clear terminal output for developer workflows. Failures should name
  the missing command, environment value, file path, or service that blocked the
  script.
