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

| URL                                | Route file                            | Purpose                                                        |
| ---------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `/`                                | `_app._org.index.tsx`                 | Authenticated organization home.                               |
| `/login`                           | `login.tsx`                           | Sign in.                                                       |
| `/signup`                          | `signup.tsx`                          | Create account.                                                |
| `/forgot-password`                 | `forgot-password.tsx`                 | Request password reset.                                        |
| `/reset-password`                  | `reset-password.tsx`                  | Complete password reset.                                       |
| `/verify-email`                    | `verify-email.tsx`                    | Show email verification result.                                |
| `/accept-invitation/$invitationId` | `accept-invitation.$invitationId.tsx` | Accept organization invitation.                                |
| `/create-organization`             | `_app.create-organization.tsx`        | Create a team and optionally invite initial members.           |
| `/settings`                        | `_app.settings.tsx`                   | User settings.                                                 |
| `/activity`                        | `_app._org.activity.tsx`              | Organization activity feed.                                    |
| `/jobs`                            | `_app._org.jobs.tsx`                  | Jobs list and saved views.                                     |
| `/jobs/new`                        | `_app._org.jobs.new.tsx`              | New job flow.                                                  |
| `/jobs/$jobId`                     | `_app._org.jobs.$jobId.tsx`           | Job detail route.                                              |
| `/members`                         | `_app._org.members.tsx`               | Organization members and invitations.                          |
| `/organization/settings`           | `_app._org.organization.settings.tsx` | Organization settings, service areas, rate cards, and labels.  |
| `/sites`                           | `_app._org.sites.tsx`                 | Sites list.                                                    |
| `/sites/new`                       | `_app._org.sites.new.tsx`             | New site flow.                                                 |
| `/sites/$siteId`                   | `_app._org.sites.$siteId.tsx`         | Site detail route.                                             |
| `/health`                          | `health.ts`                           | App stack/stage health response for Alchemy and Worker checks. |

`apps/app/src/router.tsx` configures scroll restoration, intent preloading, and
typed route registration. Breadcrumb labels are declared through route
`staticData`.

Domain-heavy routes keep the route file as the lightweight routing boundary.
When a loader needs API contracts, server helpers, Effect schemas, or other
large feature dependencies, put the loader implementation in the owning
`features/*/*-route-loader.ts` module, statically import that module from the
route file, and group the route `loader` and `component` with TanStack Router
`codeSplitGroupings`. Do not nest a dynamic `import()` inside the loader; that
adds another chunk fetch before the loader can start its API work. Canvas and
map-heavy feature views should also be loaded behind feature-level lazy
boundaries so the authenticated shell does not pull map libraries or
visualization code into the initial chunk.
Route `validateSearch` functions run in the route manifest, so they should stay
small and avoid importing domain API contracts or boundary schemas when a local
query-string parser can preserve the same behavior.

## Application Shell

`apps/app/src/routes/__root.tsx` owns the document shell. It injects the theme
initialization script before hydration, loads global CSS, wraps the app in
`TooltipProvider` and `HotkeysProvider`, and lazily loads TanStack devtools in
development.

The sidebar header shows the active organization in the authenticated app shell,
using `_app/_org` route data on organization routes and the `_app` session
fallback elsewhere. Multi-organization users can open the organization switcher
from the sidebar or with `G O`. The switcher calls Better Auth's organization
list and set-active client APIs through
`features/organizations/organization-access.ts`, then calls
`router.invalidate({ sync: true })` after a successful switch so `_app`,
`_app/_org`, and child route loaders refresh session, active organization, role,
and organization-owned data together. If Better Auth accepts the switch but the
router refresh fails, the app reloads to avoid showing stale organization data
against the new active session.

Authenticated layout and navigation live under:

- `features/auth/authenticated-app-layout.tsx`
- `features/auth/authenticated-shell-home.tsx`
- `components/app-layout.tsx`
- `components/app-sidebar.tsx`
- `components/app-navigation.ts`
- `components/nav-main.tsx`
- `components/nav-user.tsx`
- `components/app-page-header.tsx`

## Observability

Server-side app requests use the explicit TanStack Start server entry at
`apps/app/src/server.ts`. Deployed app Workers rely on Cloudflare observability
logs and traces configured by the infra stack.
The app's Cloudflare runtime env declaration lives in
`apps/app/src/cloudflare-env.d.ts`; it includes the app/API origins plus
Alchemy's injected stack and stage bindings, and the infra tests compare that
contract against the Vite Worker env declared by
`infra/cloudflare-stack.ts`. The deployed app's `API_ORIGIN` and
`VITE_API_ORIGIN` are wired from the API Worker's Cloudflare domain output,
with the configured API hostname used only as the pre-resolution fallback. The
app Vite config does not manually define `VITE_API_ORIGIN`; the standard Vite
env flow and Alchemy's Cloudflare Vite resource own client-side env injection.
Server-side app helpers read the runtime `API_ORIGIN` from the
`cloudflare:workers` env binding, with `process.env` only as the package-local
Node fallback. Non-Cloudflare Vite and Vitest runs alias that module to a local
empty binding stub.
The `/health` server route reads Alchemy metadata from the same Worker env
binding and returns both `stackName` and `stage`, using `process.env` only as
the package-local fallback and `local` when no Alchemy metadata is available.

## Feature Folders

| Folder                   | Responsibility                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth`          | Login, signup, password reset, email verification, route guards, redirects, auth UI, and server session helpers.                                                                                                                                                                                                                                   |
| `features/organizations` | Organization onboarding, active organization sync, settings, members, invitations, role access, service areas, rate cards, and labels.                                                                                                                                                                                                             |
| `features/jobs`          | Jobs list, create flow, detail drawer/sheet, state effects, API client bridge, saved views, location display, maps, collaborators, labels, comments, visits, and cost lines.                                                                                                                                                                       |
| `features/sites`         | Sites list, site create flow, detail sheet, and site API state. The first Sites index refresh intentionally uses only supported site fields: name, address, service area, and map readiness. Status, labels, lead, open job counts, saved views, updated timestamps, archive state, and bulk selection are product follow-ups, not placeholder UI. |
| `features/activity`      | Organization activity feed search and formatting.                                                                                                                                                                                                                                                                                                  |
| `features/settings`      | User settings page schemas, search, and UI.                                                                                                                                                                                                                                                                                                        |
| `features/command-bar`   | Command palette UI and global app actions.                                                                                                                                                                                                                                                                                                         |

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

The `/create-organization` onboarding route stays outside the app shell while
the first workspace is created. The client submits only the team name to
`features/organizations/organization-server.ts`; that server helper generates
the Better Auth organization slug, forwards auth cookies from the Better Auth
response, decodes the created organization summary, and returns that summary to
the client. The same onboarding page then offers an optional invite-members
step before navigating into the app. Skipping or completing this step enters the
active workspace; invite creation uses Better Auth's
`authClient.organization.inviteMember` with the newly created organization ID.

The `/members` route uses Better Auth organization client methods directly for
both active members and pending invitations. It loads current members with
`authClient.organization.listMembers`, keeps pending invitation management on
`listInvitations`, `inviteMember`, and `cancelInvitation`, and uses
`updateMemberRole` and `removeMember` for member row actions. The route remains
owner/admin gated through organization route context; row actions stay
menu-driven instead of hotkey-driven because role changes and removals are
per-row administrative actions that benefit from explicit focus, labels, and
disabled/pending states over global shortcuts.

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

New API-backed feature state should prefer TanStack DB collections for
reactive client-side entity state. Collections use shared Effect schemas through
`Schema.standardSchemaV1(...)` at the collection boundary, then call the typed
Effect HTTP client for server reads and writes. The current migrated slices are:

- `features/organizations/organization-configuration-state.tsx`, which keeps
  service areas and rate cards in route-scoped local collections while
  preserving pending/error mutation state for the existing UI.
- `features/sites/sites-state.ts`, which keeps route-loaded site options and
  per-site comments in scoped local collections, including optimistic comment
  state and organization-switch guards for in-flight mutations.
- `features/jobs/jobs-state.ts`, which owns the jobs route list, options,
  create mutation state, create notice, and list-item synchronization through a
  route-scoped TanStack DB provider. The provider preserves loader first-paint
  data, refreshes the collection after creates, falls back to an optimistic
  list item if that refresh fails, and validates collection writes with
  `JobListItemSchema`.
- `features/jobs/jobs-detail-state.ts`, which owns detail-sheet aggregate state
  and mutation feedback through a route-scoped React provider while continuing
  to call the typed Effect HTTP client at the browser API boundary.

Jobs route filters are local React state derived through a pure selector, and
the jobs page, create flow, and detail sheet read the provider APIs directly.
Do not add new Effect Atom state in app feature code; new API-backed state
should follow the TanStack DB/provider pattern unless a feature has a more
specific architecture note.

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

`G O` opens the organization switcher only when more than one organization is
available.

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
- Playwright targets an existing Alchemy stage by default through
  `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_API_URL`; set
  `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1` only when intentionally using the
  package-local server fallback.
- Auth E2E tests may read Better Auth verification tokens directly from a test
  database using `PLAYWRIGHT_DATABASE_URL` so password-reset browser flows can
  cover the email-token handoff without depending on a mailbox.
  Use `DATABASE_URL` only with `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1`; existing
  Alchemy-stage E2E runs should set the explicit stage database URL through
  `PLAYWRIGHT_DATABASE_URL`.
- Local operators can inspect the deployed stage database URL with
  `CEIRD_CLOUDFLARE=1 pnpm alchemy state get ceird <stage> PostgresBranch --env-file .env.local --stage <stage> | jq -r '.attr.connectionUri.__redacted__ // .attr.connectionUri'`.
  Keep that connection URI out of root stack outputs because deploy outputs are
  printed into logs.

Run app tests:

```bash
pnpm --filter app test
pnpm --filter app e2e
```
