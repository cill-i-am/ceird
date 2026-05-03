# Web App Context

This app owns the user-facing TanStack Start experience.

- Follow the existing TanStack Router file-route structure. Do not edit `src/routeTree.gen.ts` by hand.
- Keep route loaders, server functions, and client components close to the feature that owns the workflow.
- Use shared contracts from `packages/` for API payloads and decoded boundary data instead of redefining domain shapes in UI code.
- For server-side app calls into the API, forward cookies and trusted proxy
  headers through the established server helper path rather than rebuilding
  request context in each feature.
- Preserve the existing design language: quiet operational screens, dense but legible data surfaces, and restrained motion that helps the workflow.
- Use the app hotkey layer for keyboard access. Avoid ad hoc `keydown` listeners.
- Prefer existing UI primitives, feature-local components, and established test patterns before adding new abstractions.

## Command Bar Coverage

The authenticated app has a Linear-style command bar. Any new user-facing action should be considered part of that command surface, not only the local button, menu, drawer, alert, or page UI.

- When adding navigation, create flows, filters, view switches, mutations, status transitions, row actions, bulk actions, or detail-panel actions, register the same capability in the command bar with `useRegisterCommandActions`.
- When adding alerts, banners, notices, or empty states with a meaningful follow-up action, expose that follow-up in the command bar when the same route/context is active.
- Prefer route-context registration from the component that already owns the behavior and permissions. Global actions belong in the authenticated shell; page actions belong in page components; detail actions belong in the mounted detail sheet/panel.
- Keep command labels action-oriented and specific, such as "Create site", "Switch to map view", or "Mark job completed".
- If a visible action is intentionally not represented in the command bar, document the reason in the PR or implementation notes.

## Browser Workflow Testing

- Use Vitest for feature state, schema, route-helper, and component behavior.
- Use Playwright for full auth, organization, jobs, sites, and browser routing
  workflows that need the app, API, and database together.
- Prefer existing page objects in `e2e/pages` for new E2E coverage, and add one
  when a workflow starts repeating selectors or setup.
- When changing responsive layouts, drawers, maps, command surfaces, or
  first-run/auth flows, verify the visual behavior in a real browser or with a
  Playwright screenshot in addition to unit tests.
