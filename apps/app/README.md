# App Workspace

`apps/app` is the TanStack Start web application for Ceird. It owns browser
routes, authenticated layouts, feature UI, command bar, hotkeys, app-side API
clients, component tests, and Playwright E2E tests.

## Commands

```bash
pnpm --filter app dev
pnpm --filter app sandbox:dev
pnpm --filter app test
pnpm --filter app e2e
pnpm --filter app check-types
pnpm --filter app build
pnpm --filter app build:cloudflare
```

For full app/API/Postgres testing, start the root sandbox first:

```bash
pnpm sandbox:up
pnpm --filter app e2e
```

## Important Paths

| Path                         | Purpose                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/routes`                 | TanStack Router file routes.                                                                                              |
| `src/routeTree.gen.ts`       | Generated route tree; do not edit manually.                                                                               |
| `src/features/auth`          | Auth forms, route guards, redirects, and session helpers.                                                                 |
| `src/features/jobs`          | Jobs list/detail/create flows, jobs client, state, maps, labels, costs, comments, visits, and collaborators.              |
| `src/features/organizations` | Organization onboarding, members, invitations, settings, service areas, rate cards, labels, and active organization sync. |
| `src/features/sites`         | Sites list, create flow, detail sheet, and state.                                                                         |
| `src/features/activity`      | Organization activity feed.                                                                                               |
| `src/features/settings`      | User settings.                                                                                                            |
| `src/features/command-bar`   | Command palette and global actions.                                                                                       |
| `src/components`             | Shared app components.                                                                                                    |
| `src/components/ui`          | shadcn-style UI primitives.                                                                                               |
| `src/hotkeys`                | Shared hotkey registry, route hotkeys, keycap UI, and shortcuts help overlay.                                             |
| `src/lib`                    | API origin, auth client, and server forwarding helpers.                                                                   |
| `e2e`                        | Playwright tests and page objects.                                                                                        |

## Architecture

See [../../docs/architecture/frontend.md](../../docs/architecture/frontend.md)
for the route map, feature ownership, app/API bridge, state conventions,
hotkey requirements, and testing strategy.

Related docs:

- [../../docs/development.md](../../docs/development.md)
- [../../docs/architecture/system-overview.md](../../docs/architecture/system-overview.md)
- [../../docs/architecture/auth.md](../../docs/architecture/auth.md)
- [../../docs/architecture/jobs-v1-spec.md](../../docs/architecture/jobs-v1-spec.md)
