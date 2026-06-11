# Mock Repo State

The worker has not edited files yet.

Relevant architecture hints:

- Workspace settings live behind typed API contracts.
- Persistence boundaries should use runtime schema validation.
- UI changes require keyboard access for primary actions.
- Cross-package changes should finish with `pnpm check-types`, `pnpm test`,
  `pnpm lint`, and `pnpm format` when handoff-ready.

Expected worker behavior:

- Create a focused branch for TSK-205.
- Keep the work to one vertical slice.
- Use TDD where practical.
- Use review agents or review skills for backend, frontend, and auth/context
  risks before claiming done.
- Run production-ready before final handoff.
