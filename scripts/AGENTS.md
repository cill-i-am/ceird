# Scripts Context

This subtree owns root development helpers, local environment scripts, opensrc
sync, and Node test files for those helpers.

- Keep scripts runnable from the repository root unless the script name or
  package wrapper clearly says otherwise.
- Prefer explicit Node standard-library code over adding runtime dependencies
  for small orchestration helpers.
- Keep Alchemy-facing scripts aligned with direct `pnpm alchemy ...` CLI usage
  and the infrastructure guide.
- When changing a script, add or update the colocated `*.test.mjs` coverage and
  run `pnpm test:scripts` or the relevant `node --test` command.
- Preserve clear terminal output for developer workflows. Failures should name
  the missing command, environment value, file path, or service that blocked the
  script.
