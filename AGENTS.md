# Agent Context

## Project Status

This is a greenfield project and has not been released.

- Do not optimize for backward compatibility.
- Do not preserve workarounds unless they still make clear architectural sense.
- Prefer clean, sweeping refactors over incremental patching when that improves the codebase.
- It is fine to reshape APIs, folder structure, and internal architecture when needed.
- Keep the code simple and readable.
- Ensure maximum type safety.
- Always leave the codebase better than you found it.

## Dependency Source

This repo keeps fetched dependency source code in `opensrc/` for local agent context.

- Check `opensrc/sources.json` for the current fetched package list.
- Use those local sources when behavior is unclear from types alone.
- Do not commit files from `opensrc/`; the directory is intentionally gitignored.
