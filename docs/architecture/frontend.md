# Frontend Architecture

## Scope

`apps/app` is the browser and server-rendered web application. It is a
TanStack Start app using React 19, TanStack Router file routes, Effect clients,
Tailwind CSS, shadcn-style components, and Playwright E2E tests.

## Route Model

TanStack Router generates `apps/app/src/routeTree.gen.ts` from files in
`apps/app/src/routes`. Pathless `_app` and `_org` route files provide protected
layout and organization context without adding URL segments.

Current visible routes:

| URL                                | Route file                            | Purpose                                                       |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `/`                                | `_app._org.index.tsx`                 | Authenticated organization home.                              |
| `/login`                           | `login.tsx`                           | Sign in.                                                      |
| `/signup`                          | `signup.tsx`                          | Create account.                                               |
| `/forgot-password`                 | `forgot-password.tsx`                 | Request password reset.                                       |
| `/reset-password`                  | `reset-password.tsx`                  | Complete password reset.                                      |
| `/verify-email`                    | `verify-email.tsx`                    | Show email verification result.                               |
| `/accept-invitation/$invitationId` | `accept-invitation.$invitationId.tsx` | Accept organization invitation.                               |
| `/create-organization`             | `_app.create-organization.tsx`        | Create first or additional organization.                      |
| `/settings`                        | `_app.settings.tsx`                   | User settings.                                                |
| `/activity`                        | `_app._org.activity.tsx`              | Organization activity feed.                                   |
| `/jobs`                            | `_app._org.jobs.tsx`                  | Jobs list and saved views.                                    |
| `/jobs/new`                        | `_app._org.jobs.new.tsx`              | New job flow.                                                 |
| `/jobs/$jobId`                     | `_app._org.jobs.$jobId.tsx`           | Job detail route.                                             |
| `/members`                         | `_app._org.members.tsx`               | Organization members and invitations.                         |
| `/organization/settings`           | `_app._org.organization.settings.tsx` | Organization settings, service areas, rate cards, and labels. |
| `/sites`                           | `_app._org.sites.tsx`                 | Sites list.                                                   |
| `/sites/new`                       | `_app._org.sites.new.tsx`             | New site flow.                                                |
| `/sites/$siteId`                   | `_app._org.sites.$siteId.tsx`         | Site detail route.                                            |
| `/health`                          | `health.ts`                           | App health response for sandbox checks.                       |

`apps/app/src/router.tsx` configures scroll restoration, intent preloading, and
typed route registration. Breadcrumb labels are declared through route
`staticData`.

## Application Shell

`apps/app/src/routes/__root.tsx` owns the document shell. It injects the theme
initialization script before hydration, loads global CSS, wraps the app in
`TooltipProvider` and `HotkeysProvider`, and lazily loads TanStack devtools in
development.

Authenticated layout and navigation live under:

- `features/auth/authenticated-app-layout.tsx`
- `features/auth/authenticated-shell-home.tsx`
- `components/app-layout.tsx`
- `components/app-sidebar.tsx`
- `components/app-navigation.ts`
- `components/nav-main.tsx`
- `components/nav-secondary.tsx`
- `components/nav-user.tsx`
- `components/app-page-header.tsx`

## Feature Folders

| Folder                   | Responsibility                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth`          | Login, signup, password reset, email verification, route guards, redirects, auth UI, and server session helpers.                                                             |
| `features/organizations` | Organization onboarding, active organization sync, settings, members, invitations, role access, service areas, rate cards, and labels.                                       |
| `features/jobs`          | Jobs list, create flow, detail drawer/sheet, state effects, API client bridge, saved views, location display, maps, collaborators, labels, comments, visits, and cost lines. |
| `features/sites`         | Sites list, site create flow, detail sheet, and site API state.                                                                                                              |
| `features/activity`      | Organization activity feed search and formatting.                                                                                                                            |
| `features/settings`      | User settings page schemas, search, and UI.                                                                                                                                  |
| `features/command-bar`   | Command palette UI and global app actions.                                                                                                                                   |

Shared app components live in `src/components`. shadcn-style primitives live in
`src/components/ui`. Hotkey infrastructure lives in `src/hotkeys`.

## API Access From The App

Domain API access is contract-based:

- `features/jobs/jobs-client.ts` builds a composed Effect `HttpApiClient` from
  jobs, labels, sites, service-area, and rate-card API groups exported by
  `@ceird/jobs-core`, `@ceird/labels-core`, and `@ceird/sites-core`.
  App code imports site-owned DTOs from `@ceird/sites-core` and
  organization-label DTOs from `@ceird/labels-core`; `@ceird/jobs-core` only
  supplies job-owned DTOs and the job-label assignment contract.
- `features/jobs/jobs-server.ts` exposes isomorphic helpers. On the server it
  imports `jobs-server-ssr.ts`; in the browser it calls the same API through
  `fetch`.
- `features/jobs/jobs-server-ssr.ts` reads request headers, forwards cookies and
  proxy headers, and calls the API from the server runtime.

Organization and auth helpers call Better Auth endpoints directly because those
routes are owned by Better Auth rather than the jobs `HttpApi` contract:

- `lib/auth-client.ts`
- `lib/auth-client.server.ts`
- `features/auth/server-session.ts`
- `features/organizations/organization-server.ts`
- `features/auth/sign-out.ts`

Use `lib/server-api-forwarded-headers.ts` when server-side calls need the API to
preserve the original browser host/protocol for trusted proxy and cookie logic.

## State And Validation

Runtime payloads that cross the app/API boundary are decoded with shared Effect
schemas from `@ceird/jobs-core`, `@ceird/sites-core`, `@ceird/labels-core`, and
`@ceird/identity-core`.
Feature-local form/search schemas live next to the feature that owns them, for
example:

- `features/auth/auth-schemas.ts`
- `features/auth/password-reset-search.ts`
- `features/auth/email-verification-search.ts`
- `features/organizations/organization-schemas.ts`
- `features/organizations/organization-member-invite-schemas.ts`
- `features/settings/user-settings-schemas.ts`

UI state for API-backed feature workflows is kept in focused state modules such
as `jobs-state.ts`, `jobs-detail-state.ts`, `sites-state.ts`, and
`organization-configuration-state.ts`.

## Hotkeys

Keyboard access is part of feature work. Register shortcuts through the shared
hotkey layer:

- `hotkeys/hotkey-registry.ts`
- `hotkeys/use-app-hotkey.ts`
- `hotkeys/route-hotkeys.tsx`
- `hotkeys/shortcut-help-overlay.tsx`
- `hotkeys/hotkey-display.tsx`

New route navigation targets, primary workflow actions, command/menu items, and
icon-only controls should either register a shortcut or have an explicit reason
why a shortcut would be harmful or unnecessary. Show shortcuts with the shared
keycap and help overlay components.

## Styling

The app uses Tailwind CSS with shadcn-style primitives. Global styles,
theme tokens, and typography live in `src/styles.css`. The design direction is
documented in `PRODUCT.md`: calm, precise, light-mode-first, practical for
trades teams, and accessible.

Keep UI dense but readable. Prefer feature-complete controls and clear
workflow-specific layouts over decorative landing-page patterns.

## Tests

- Unit and component tests live next to routes, components, and features as
  `*.test.ts` or `*.test.tsx`.
- Vitest setup lives in `src/test/setup.ts`.
- Playwright config lives in `playwright.config.ts`.
- E2E tests live in `apps/app/e2e`.
- Page objects for E2E tests live in `apps/app/e2e/pages`.

Run app tests:

```bash
pnpm --filter app test
pnpm --filter app e2e
```
