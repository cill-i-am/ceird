# Web App Context

This app owns the user-facing TanStack Start experience.

- Follow the existing TanStack Router file-route structure. Do not edit `src/routeTree.gen.ts` by hand.
- Keep route loaders, server functions, and client components close to the feature that owns the workflow.
- Use shared contracts from `packages/` for API payloads and decoded boundary data instead of redefining domain shapes in UI code.
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
