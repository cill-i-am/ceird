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
| `/organization/settings`           | `_app._org.organization.settings.tsx` | Organization settings and labels.                              |
| `/sites`                           | `_app._org.sites.tsx`                 | Sites list.                                                    |
| `/sites/new`                       | `_app._org.sites.new.tsx`             | New site flow.                                                 |
| `/sites/$siteId`                   | `_app._org.sites.$siteId.tsx`         | Site detail route.                                             |
| `/health`                          | `health.ts`                           | App stack/stage health response for Alchemy and Worker checks. |

`apps/app/src/router.tsx` configures scroll restoration, intent preloading, the
router-scoped TanStack Query client, SSR Query dehydration/hydration, and typed
route registration. The root route is declared with
`createRootRouteWithContext<AppRouterContext>()` so route loaders and route
components can share the same Query client. Intent preloads and loader results
stay fresh briefly so sidebar hover/preload and quick back-and-forth navigation
do not immediately repeat API-backed loaders; product mutations, organization
switches, and active-organization sync still call `router.invalidate(...)` when
fresh data is required. Breadcrumb labels are declared through route
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
Form-heavy route pages should group their `component` with
`codeSplitGroupings` as well; auth, settings, and administration forms import
validation/form libraries that are unnecessary for unrelated first paint.
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
When tenant hosts are enabled, the switcher sets the Better Auth active
organization and then navigates the browser to that organization's tenant host
while preserving the current path. Production tenant URLs are
`https://{orgSlug}.ceird.app`; non-production tenant URLs are
`https://{orgSlug}--{tenantStageAlias}.ceird.app`. Selecting the already active
organization still navigates to its tenant host when the user is on a neutral
host. If tenant mode is disabled, or the computed tenant URL matches the current
page, switching falls back to the same-router invalidation path.
TanStack Start request middleware wired from
`apps/app/src/features/auth/app-context-middleware.ts` hydrates auth request
context once for routes that need it. Organization pages also prefetch the
organization list and active member role in parallel before router loading, so
`_app`, `_app/_org`, and child loaders can reuse request context instead of
serializing Better Auth `get-session`, organization list, and member-role calls.
The `_app` route remains the authenticated-shell boundary; child organization
routes reuse that parent session through
`ensureActiveOrganizationIdForSession(...)` and then load only route-specific
state. Internal guard redirects use typed router targets so client-side
navigation and SSR stay on the same route transition path; raw `href` redirects
are reserved for external or intentionally document-level navigation.
Tenant host parsing lives in `apps/app/src/lib/tenant-host.ts`. The parser
treats configured system hosts as neutral, ignores hosts outside the tenant base
domain, and resolves only valid non-reserved organization slugs from the first
DNS label. Tenant URL generation also refuses any computed hostname that matches
the configured reserved-host list.
Server request context prefers the organization requested by a tenant host over
the session's active organization, then synchronizes the Better Auth active
organization after route resolution. Package-local Vite/Playwright servers run
with tenant mode disabled by default, so `127.0.0.1:4173` and
`127.0.0.1:3001` keep the regular neutral-host behavior.

Authenticated layout and navigation live under:

- `features/auth/authenticated-app-layout.tsx`
- `features/auth/authenticated-shell-home.tsx`
- `components/app-layout.tsx`
- `components/app-sidebar.tsx`
- `components/app-navigation.ts`
- `components/nav-main.tsx`
- `components/nav-user.tsx`
- `components/app-page-header.tsx`

The authenticated app shell also mounts the global Ceird Agent entry point in
`features/agent/global-agent-chat.tsx`. It is app-level rather than
route-level: the fixed launcher, `Mod+J` hotkey, and command bar action are
available anywhere an active organization exists. The shell entry stays
intentionally small; it lazy-loads
`features/agent/global-agent-chat-panel.tsx` only after the user opens the
drawer, keeping `agents/react`, `@cloudflare/ai-chat/react`, and the Agent API
client out of normal authenticated page startup. Desktop opens a right-side
drawer and mobile uses the existing bottom drawer behavior. The browser app
prepares or reuses the current user's active thread through the Agent thread
API, authorizes that thread with a short-lived connect token, and then connects
to the Agent Worker. Product mutations still execute only through the Agent
Worker and private domain action registry; the app chat surface owns
presentation, thread selection, and connection setup.

Shared mutation feedback uses a short minimum pending duration in
`apps/app/src/lib/mutation-feedback.ts`. Keep that default below a perceptual
delay threshold so successful auth, organization, member, job, and site
mutations do not feel slower than the network response; pass an explicit longer
duration only for flows that genuinely need extra transition time.

## Observability

Server-side app requests use the explicit TanStack Start server entry at
`apps/app/src/server.ts`. Deployed app Workers rely on Cloudflare observability
logs and traces configured by the infra stack.
The app's Cloudflare runtime env declaration lives in
`apps/app/src/cloudflare-env.d.ts`; it includes the app/API origins plus
Alchemy's injected stack and stage bindings, and the infra tests compare that
contract against the Vite Worker env declared by
`apps/app/infra/cloudflare-vite.ts`. The deployed app's `API_ORIGIN` and
`VITE_API_ORIGIN` are wired from the API Worker's Cloudflare domain output, with
the configured API hostname used only as the pre-resolution fallback. The app
Vite config does not manually define `VITE_API_ORIGIN`; the standard Vite env
flow and Alchemy's Cloudflare Vite resource own client-side env injection.
Server-side app helpers read the runtime `API_ORIGIN` from the
`cloudflare:workers` env binding, with `process.env` only as the package-local
Node fallback. Non-Cloudflare Vite and Vitest runs alias that module to a local
empty binding stub.
The `/health` server route reads Alchemy metadata from the same Worker env
binding and returns both `stackName` and `stage`, using `process.env` only as
the package-local fallback and `local` when no Alchemy metadata is available.

## Feature Folders

| Folder                   | Responsibility                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `features/auth`          | Login, signup, password reset, email verification, route guards, redirects, auth UI, and server session helpers.                                                                                                                                                                                                                     |
| `features/organizations` | Organization onboarding, active organization sync, settings, members, invitations, role access, and labels.                                                                                                                                                                                                                          |
| `features/jobs`          | Jobs list, create flow, detail drawer/sheet, state effects, API client bridge, saved views, location display, maps, collaborators, labels, comments, and visits.                                                                                                                                                                     |
| `features/sites`         | Sites list, site create flow, detail sheet, and site API state. The first Sites index refresh intentionally uses only supported site fields: name, address, and map readiness. Status, labels, lead, open job counts, saved views, updated timestamps, archive state, and bulk selection are product follow-ups, not placeholder UI. |
| `features/activity`      | Organization activity feed search and formatting.                                                                                                                                                                                                                                                                                    |
| `features/settings`      | User settings page schemas, search, and UI.                                                                                                                                                                                                                                                                                          |
| `features/command-bar`   | Command palette UI and global app actions.                                                                                                                                                                                                                                                                                           |
| `features/agent`         | App-level Ceird Agent launcher, thread API helpers, Agent Worker origin resolution, responsive chat drawer, and chat E2E page object.                                                                                                                                                                                                |

Shared app components live in `src/components`. shadcn-style primitives live in
`src/components/ui`. Hotkey infrastructure lives in `src/hotkeys`.

## API Access From The App

Domain API access is contract-based:

- `features/api/app-api-client.ts` composes the app-wide Effect client,
  including Agent thread and action groups from `@ceird/agents-core`.
- `features/agent/agent-client.ts` uses that app-wide client to list/create
  user threads and authorize Agent Worker connections for the current active
  organization.
- `features/api/app-api-client.ts` builds a composed Effect `HttpApiClient`
  from jobs, labels, sites, agent, and activity-facing API groups exported by
  the shared core packages. App code imports site-owned DTOs from
  `@ceird/sites-core` and organization-label DTOs from `@ceird/labels-core`;
  `@ceird/jobs-core` only supplies job-owned DTOs and the job-label assignment
  contract.
- `features/jobs/jobs-server.ts` exposes isomorphic helpers. On the server it
  imports `jobs-server-ssr.ts`; in the browser it calls the same API through
  `fetch`.
- `features/jobs/jobs-server-ssr.ts` reads request headers, forwards cookies and
  proxy headers, and calls the API from the server runtime.

The frontend has two deliberately separate API lanes.

The app/auth lane owns shell identity and organization context. TanStack Start
request middleware reads the authenticated request once, and app-owned server
functions handle Better Auth operations that need server cookies or app shell
state. This lane includes:

- `lib/auth-client.ts`
- `lib/auth-client.server.ts`
- `features/auth/app-context-functions.ts`
- `features/auth/app-context-middleware.ts`
- `features/auth/server-session.ts`
- `features/organizations/organization-server.ts`
- `features/auth/sign-out.ts`

The app/auth lane may use short-lived browser caches for shell context only:
session, active organization, organization list, and current role. Client-side
auth route guards reuse the app auth context snapshot for a short window
through `features/auth/app-context-client-cache.ts`, so protected-route
navigation can share the same session and active-organization context read.
Organization route guards prefer hydrated app/request context for session and
organization-list reads, then fall back to Better Auth client organization APIs
for UI paths that do not yet have organization data in the snapshot. Those
fallback Better Auth organization-list and member-role promise caches live in
`features/organizations/organization-access-cache.ts`. Its
`clearOrganizationAccessClientCache()` helper clears the app-context snapshot,
organization-list cache, and member-role cache after sign-in, sign-up,
active-organization changes, first organization creation, invitation acceptance,
and sign-out so route transitions do not fan out repeated Better Auth requests
while identity state changes still force a fresh read.

The domain data lane calls the typed domain API directly for product data:
jobs, sites, activity, comments, labels, and TanStack DB-backed synced product
state as it expands. Keep these reads and writes outside app server functions.
The API/domain layer remains the product authorization, validation, and sync
boundary; the app shell must not proxy product data through app-owned
server-function middleware just to reuse auth context.

Route parents own shell context. The `/_app` parent establishes authenticated
session context, and the `/_app/_org` parent establishes the active
organization context. Child routes reuse parent route context and load only
their route-specific product data through the domain data lane. Product route
loaders may import the lane-neutral role/assertion helpers in
`features/organizations/organization-route-access.ts`, but must not import
`features/organizations/organization-access.ts` or the app-context cache/server
function modules; those modules belong to the app/auth lane and can trigger
extra shell reads from product navigation.

The `/create-organization` onboarding route stays outside the app shell while
the first workspace is created. The client submits only the team name to
`features/organizations/organization-server.ts`; that server helper generates
the Better Auth organization slug, forwards auth cookies from the Better Auth
response, sets the new organization as active for the current session when
Better Auth accepts the sync, decodes the created organization summary, and
returns that summary to the client. The same onboarding page then offers an optional invite-members
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
as `jobs-state.ts`, `jobs-detail-state.ts`, and `sites-state.ts`.

New API-backed feature state should prefer TanStack DB Query Collections for
reactive client-side entity state. TanStack Start route loaders remain the
server-rendered first-paint boundary and should seed the router Query client
with the same query key used by the matching Query Collection. Route-scoped
providers then create collections from that seeded cache and components
subscribe with the shared `useHydratedCollectionItems(...)` adapter for simple
whole-collection reads. The adapter starts the client collection subscription
early enough for disabled Query Collections to support explicit `refetch()`,
but its server and hydration snapshots keep using loader DTOs so TanStack DB
state does not render during the SSR pass. Use `useLiveQuery` only for
client-only derived DB queries with an explicit SSR strategy. Collections use
shared Effect schemas through
`Schema.standardSchemaV1(...)` at the collection boundary, then call the typed
Effect HTTP client for server reads and writes. The current migrated slices
are:

- `features/sites/sites-state.ts`, which keeps route-loaded site options and
  per-site comments in scoped Query Collections, including server-confirmed
  comment state and organization-switch guards for in-flight mutations.
- `features/jobs/jobs-state.ts`, which owns the jobs route list, options,
  create mutation state, create notice, and list-item synchronization through a
  route-scoped TanStack DB provider. The provider preserves loader first-paint
  data through Query seeding, refreshes the collection after creates, falls
  back to a server-confirmed list item if that refresh fails, and validates
  collection writes with `JobListItemSchema`.
- `features/jobs/jobs-detail-state.ts`, which owns detail-sheet aggregate state
  and mutation feedback through a route-scoped React provider while continuing
  to call the typed Effect HTTP client at the browser API boundary.

Jobs route filters are local React state derived through a pure selector, and
the jobs page, create flow, and detail sheet read the provider APIs directly.
Do not add new Effect Atom state in app feature code; new API-backed state
should follow the TanStack DB/provider pattern unless a feature has a more
specific architecture note.

TanStack Start loaders remain the first-paint and navigation-preload boundary
for API DTOs. Do not run TanStack DB collection `preload()` from SSR loaders;
route loaders should return decoded server data and seed the router Query
client with `seedRouteQueryData(...)`. Loader seeding should pass the request
start timestamp so a client-side preload cannot overwrite Query cache data that
was updated by a newer local/server-confirmed mutation. Providers should use
`seedQueryCollectionInitialData(...)` as the test/client fallback before
creating Query Collections. React components should subscribe to collection
state with `useHydratedCollectionItems(...)` unless they need a client-only
derived DB query. Do not call `useLiveQuery` in a Start SSR render path without
a server snapshot strategy; the current React DB hook uses `useSyncExternalStore`
without `getServerSnapshot` and will force client rendering under SSR.

Query Collection query keys must not accidentally nest unrelated collections
under a shared prefix. TanStack Query uses prefix matching for cache lookups, so
a comments collection key must not start with the sites collection key unless
the comments rows are valid members of that same cache family. API-backed
collection keys should include the active organization, viewer user, and viewer
role when responses can vary by session or authorization scope.

Route-scoped Query Collections should rely on TanStack DB's native collection
garbage collection rather than provider unmount cleanup. Live queries own
derived subscriptions and will report errors if a source collection is manually
cleaned up while a live query still depends on it. The shared route-scoped
collection GC time keeps old route collections short-lived without racing
React unmount order. Route-scoped providers should also ignore async mutation
or refresh result dispatches after unmount so in-flight operations can settle
without scheduling React state updates after navigation or test teardown.

Mutations should use TanStack DB's mutation story according to the server
contract:

- Use collection `utils.writeUpsert`, `writeDelete`, or `writeBatch` to
  reconcile canonical rows returned by the typed Effect HTTP client.
- Use `writeBatch` for full collection replacements that need deletes and
  upserts to appear atomically to live-query subscribers.
- Use `createOptimisticAction` when the UI can safely apply a local collection
  mutation immediately. Its `onMutate` callback must record at least one
  collection mutation, otherwise TanStack DB completes the transaction without
  calling `mutationFn`.
- Prefer server-confirmed writes for operations where the server enriches the
  row with generated IDs, geocoding, linked contacts/sites, permissions, or
  other canonical fields that the client cannot accurately predict.
- Query Collection fetch results are authoritative synced state. Race guards
  may preserve server-confirmed local writes, but they must not promote
  `$synced: false` optimistic rows into the fetched result.

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
  `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL`, and `PLAYWRIGHT_AGENT_URL`; set
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
