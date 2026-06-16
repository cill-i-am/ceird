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

| URL                                | Route file                                   | Purpose                                                                      |
| ---------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `/`                                | `_app._org.index.tsx`                        | Authenticated organization home.                                             |
| `/login`                           | `login.tsx`                                  | Sign in.                                                                     |
| `/signup`                          | `signup.tsx`                                 | Create account.                                                              |
| `/forgot-password`                 | `forgot-password.tsx`                        | Request password reset.                                                      |
| `/reset-password`                  | `reset-password.tsx`                         | Complete password reset.                                                     |
| `/verify-email`                    | `verify-email.tsx`                           | Show email verification result.                                              |
| `/accept-invitation/$invitationId` | `accept-invitation.$invitationId.tsx`        | Accept organization invitation.                                              |
| `/location-access`                 | `location-access.tsx`                        | Authenticated, shellless, skippable location-access onboarding.              |
| `/create-organization`             | `create-organization.tsx`                    | Create a team and optionally invite initial members.                         |
| `/settings`                        | `_app.settings.tsx`                          | User profile, email, password, and account security settings.                |
| `/activity`                        | `_app._org.activity.tsx`                     | Internal organization activity feed from Electric-backed activity events.    |
| `/jobs`                            | `_app._org.jobs.tsx`                         | Jobs list and saved views.                                                   |
| `/jobs-workspace`                  | `_app._org.jobs-workspace.tsx`               | Electric-native Jobs workspace preview shell.                                |
| `/members`                         | `_app._org.members.tsx`                      | Organization members and invitations.                                        |
| `/organization/security`           | `_app._org.organization.security.tsx`        | Owner/admin security activity review.                                        |
| `/organization/settings`           | `_app._org.organization.settings.tsx`        | Organization settings and labels.                                            |
| `/organization/settings/labels`    | `_app._org.organization.settings.labels.tsx` | Dedicated Labels settings shell for the Electric-native replacement surface. |
| `/sites`                           | `_app._org.sites.tsx`                        | Sites list.                                                                  |
| `/sites-workspace`                 | `_app._org.sites-workspace.tsx`              | Gated Electric-native Sites workspace shell.                                 |
| `/health`                          | `health.ts`                                  | App stack/stage health response for Alchemy and Worker checks.               |

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

Organization-scoped sheet overlays are not child routes. The `_app/_org` route
validates a typed `sheets` search param and renders the workspace sheet stack
above the active page. Examples include `/jobs?sheets=[{kind:"job.create"}]`
and `/sites?sheets=[{kind:"site.detail",siteId:"..."},{kind:"job.create",siteId:"..."}]`.
The stack stores only durable sheet identity and seed IDs; unsaved form fields
remain local to mounted sheet components. Opening a child sheet appends to the
stack so the parent draft stays mounted, and closing pops only the active
sheet. The renderer folds the URL stack into a real Vaul drawer tree, deriving
an explicit drawer kind (`root` or `nested`) and sheet layer (`active` or
`background`) for each entry. Only the active sheet is interactive, while Vaul
keeps the visible parent drawer mounted and applies the native nested-drawer
scale and displacement. Detail sheets load their provider and detail data inside
the stack. Create sheets keep async provider loading inside the real sheet body,
using the shared `Skeleton` component instead of swapping through a separate
loading drawer.

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
Authenticated onboarding routes that need the session but not the product
chrome, currently `/location-access` and `/create-organization`, live outside
the `_app` route and carry explicit auth or organization guards. The `_app`
layout still bypasses `AppLayout` when the latest router destination path or
active TanStack Router matches point at those shellless routes, so loading
transitions after signup or organization setup cannot briefly render onboarding
cards inside the sidebar shell while the destination route is resolving.
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

The Electric-native Sites replacement starts as a separate `/sites-workspace`
organization route rather than a canary under `/sites`. The route is
intentionally absent from primary navigation until realtime evidence passes, is
marked as a preview route in the UI, and fails closed with explicit
unavailable/degraded states instead of reading the old Sites Query Collection
path. Its first live slice renders the Sites workspace list/detail from a
browser-safe Electric read-model module, joining site rows, shared labels,
site-label assignments, related jobs, and the domain-owned active-job summary
projection in the feature data-plane layer. Search text, filter, sort, and the
selected detail row are route-backed search state with local selected-site and
recent-search restoration as convenience hooks; future saved views should attach
to those route search fields instead of adding parallel view state.

The authenticated app shell also mounts the global Ceird Agent entry point in
`features/agent/global-agent-chat.tsx`. It is app-level rather than
route-level: `AppLayout` owns the Agent drawer open state, the authenticated
header exposes the visible `Ask Ceird` action when an active organization and
current role are available, and the command bar action plus `Mod+J` hotkey open
that same drawer. The header action uses dialog semantics, accurate expanded
state, and the shared shortcut display for `Mod+J`; there is no fixed
bottom-right launcher. The shell entry stays intentionally small; it
lazy-loads `features/agent/global-agent-chat-panel.tsx` only after the user
opens the drawer, keeping `agents/react`, `@cloudflare/ai-chat/react`, and the
Agent API client out of normal authenticated page startup. Desktop opens a
right-side drawer and mobile uses the existing bottom drawer behavior. The
first-open drawer state presents read capabilities as usable, frames write and
destructive manifest entries conservatively as approval-gated metadata unless a
runtime availability signal proves otherwise, and offers prompt starter buttons
that fill the composer draft without sending. While an Agent turn is submitted,
streaming, or recovering, the composer exposes a Stop action wired to the
installed chat hook `stop()` control, surfaces recovery as `Recovering response`
instead of ordinary streaming, and registers the context-aware `Mod+.`
`agentStop` shortcut through the shared hotkey layer only while the stop action
is available. The browser app prepares or
reuses the current user's active thread through
`POST /agent/session/prepare`, which returns the thread, public action
manifest, and initial short-lived connect token before the drawer connects to
the Agent Worker. Later reconnects refresh the token through the thread
authorization endpoint. Product mutations still execute only through the Agent
Worker and private domain action registry; the app chat surface owns
presentation, approval review, thread selection, and connection setup.
When a chat prompt is clearly asking for "near me", closest jobs/sites, or
directions, the drawer either preflights browser geolocation or asks the user to
choose a typed origin resolved by the app. The chosen origin is sent through an
ephemeral Agent WebSocket frame. The following chat request body contains only
an opaque `ceirdProximityOriginContextId` so the Agent can match the turn to the
in-memory origin without persisting raw coordinates or typed-origin details in
the AI chat runtime's latest-body request context. The id uses the
`agent-origin-<uuid>` shape; the Agent strips any unsupported custom body fields
before handing the chat request to the AI chat runtime. The Agent cache prunes
stale sideband origins after a short TTL, so abandoned sends do not keep precise
origins indefinitely. The visible user message is not rewritten with
coordinates or typed-origin details. If the browser cannot provide current
location, or the user has current-location access disabled, the composer keeps
the draft and offers either an explicit preference-enabling action or a signed
typed-origin chooser. Agent persistence redacts request coordinates, typed
origin labels, route geometry, and model-facing route-origin payloads.
Route-aware Agent tool outputs render typed result rows and route preview cards
inline instead of raw JSON; route-preview cards lazy-load the existing MapLibre
map only when route geometry and browser map support are available. Stored chat
messages and resumable stream chunks redact proximity origins, route geometry,
and exact current-location coordinate strings.

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

| Folder                     | Responsibility                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth`            | Login, signup, password reset, email verification, route guards, redirects, auth UI, and server session helpers.                                                                                                                                                                                                                                |
| `features/organizations`   | Organization onboarding, active organization sync, settings, members, invitations, role access, and labels.                                                                                                                                                                                                                                     |
| `features/jobs`            | Jobs list, create flow, detail drawer/sheet, state effects, API client bridge, saved views, location display, maps, collaborators, labels, comments, and visits.                                                                                                                                                                                |
| `features/jobs-workspace`  | Electric-native Jobs workspace preview route, live list controls, health/permission states, saved-view-ready route state, and shortcut affordances. It consumes feature-owned data-plane helpers and must not instantiate raw Electric streams or raw TanStack DB collection APIs in route/view code.                                           |
| `features/sites`           | Sites list, site create flow, detail sheet, and site API state. The first Sites index refresh intentionally uses only supported site fields: name, address, and map readiness. Status, labels, lead, open job counts, saved views, updated timestamps, archive state, and bulk selection are product follow-ups, not placeholder UI.            |
| `features/sites-workspace` | Electric-native Sites workspace preview route, browser-safe Electric read-model contracts, live list/detail derivation, permission/unavailable/degraded states, saved search/detail restoration hooks, and shortcut affordances. Route/view code consumes the feature data-plane module rather than constructing raw Electric streams directly. |
| `features/activity`        | Global organization Activity route, Electric-backed activity event and product-safe actor read-model contracts, local feed filters, health states, and activity row navigation.                                                                                                                                                                 |
| `features/settings`        | User settings page schemas, search, profile/email/password forms, account security sessions, and 2FA settings UI.                                                                                                                                                                                                                               |
| `features/command-bar`     | Command palette UI and global app actions.                                                                                                                                                                                                                                                                                                      |
| `features/agent`           | App-level Ceird Agent launcher, thread API helpers, Agent Worker origin resolution, responsive chat drawer, and chat E2E page object.                                                                                                                                                                                                           |
| `features/proximity`       | Shared route-aware proximity browser primitives: API bridge helpers, location access, maps handoff, typed-origin dialog control, route-ranking control, limit state, and display formatting.                                                                                                                                                    |

Shared app components live in `src/components`. shadcn-style primitives live in
`src/components/ui`. Hotkey infrastructure lives in `src/hotkeys`.

## API Access From The App

Domain API access is contract-based:

- `features/api/app-api-client.ts` composes the app-wide Effect client,
  including Agent thread and action groups from `@ceird/agents-core`.
- `features/agent/agent-client.ts` uses that app-wide client to prepare the
  current Agent session, keep legacy thread helpers available, and authorize
  Agent Worker reconnects for the current active organization.
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

The app TypeScript scope enables `noUncheckedIndexedAccess`. Route loaders,
server functions, data-plane helpers, and collection code should treat indexed
lookups as optional until they have an explicit guard or a schema/client
boundary has decoded the value. Prefer small narrowing helpers or early returns
for fixture arrays, query-key parts, URL/search segments, and collection rows
instead of non-null assertions or broad casts.

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

The `/location-access` onboarding route is an authenticated, shellless,
skippable account-level step reached after ordinary signup and after successful
invitation acceptance. Its loader reads the current
`routeProximityLocationEnabled` user preference, so users who already enabled
route proximity see the enabled state instead of being asked again. Enabling the
preference does not call browser geolocation or store coordinates; it only
allows future Near me flows to request fresh browser location when needed.

The `/create-organization` onboarding route also stays outside the app shell
while the first workspace is created. The client submits only the team name to
`features/organizations/organization-server.ts`; that server helper generates
the Better Auth organization slug, forwards auth cookies from the Better Auth
response, sets the new organization as active for the current session when
Better Auth accepts the sync, decodes the created organization summary, and
returns that summary to the client. The same onboarding page then offers an
optional invite-members step before navigating into the app. Skipping or
completing this step enters the active workspace; invite creation uses Better
Auth's `authClient.organization.inviteMember` with the newly created
organization ID.

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

## Map Primitive

Interactive map surfaces use the source-owned shadcn-style map primitive in
`apps/app/src/components/ui/map.tsx`. The primitive owns MapLibre imports and
imperative map calls for controls, markers, route display lines, route fitting,
and bounds fitting. Feature folders should compose `Map`, `MapMarker`,
`MapRouteLine`, `MapFitRouteBounds`, and `MapFitBounds` instead of importing
`maplibre-gl` or calling `useMap` directly. Proximity list/map features pass
response-owned display geometry into the primitive and keep row, marker, and
route-line selection state in React.

## State And Validation

Runtime payloads that cross the app/API boundary are decoded with shared Effect
schemas from `@ceird/jobs-core`, `@ceird/sites-core`, `@ceird/labels-core`, and
`@ceird/identity-core`.
User settings load the route-proximity location preference through
`features/settings/user-settings-route-loader.ts` and render it in the Location
tab. Enabling the setting means Ceird may ask the current browser for a fresh
device location when the user runs nearby Jobs, Sites, or Agent flows; the
setting itself stores only a boolean preference.
Jobs, Sites, and the location-access onboarding route read the same preference
and fail closed if it is unavailable. Near me stays available, but disabled
current-location access is replaced by the typed-origin flow. Agent chat checks
the preference only when a prompt needs current location; disabled or
unavailable preference state blocks geolocation and offers explicit preference
enablement or typed-origin selection.
Jobs Near me, Sites Near me, and Agent typed-origin selection share the
app-side origin dialog controller in
`features/proximity/proximity-origin-controller.ts`. That controller owns
autocomplete debouncing, Google Places session token rollover, suggestion
selection, typed-origin place resolution, and close/unmount cancellation. Jobs
and Sites compose it through
`features/proximity/proximity-run-controller.ts`, which adds route-ranking
request state and duplicate-request reuse. Feature surfaces still own their
domain-specific rendering, filters, hidden Agent context handoff, and copy.
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

New API-backed product entity state should prefer the TanStack DB data-plane
pattern documented in [TanStack DB Data Plane](tanstack-db-data-plane.md).
TanStack Start route loaders remain the server-rendered first-paint boundary,
but route/view files do not own product collections directly. Loaders return
typed seed envelopes, the organization route installs a scoped
`DataPlaneProvider`, and feature providers read/write registry-owned
collections through feature data-plane modules.

Collections use shared Effect schemas through `Schema.toStandardSchemaV1(...)`
at the collection boundary, then call the typed Effect HTTP client for server
reads and writes. Components subscribe with the shared
`useHydratedCollectionItems(...)` adapter for simple whole-collection reads.
Every seed envelope and collection contract also declares a page-aware
completeness mode from `data-plane/collection-contract.ts`. `complete-tenant`
means the collection covers the active organization scope and can support
tenant-wide derivations. `paged-query`, `filtered-query`, `entity-detail`, and
`sync-backed` are intentionally not interchangeable with tenant-complete data;
helpers such as `assertCompleteTenantCollection(...)` fail closed when a
component or selector requires complete organization data. The `/jobs` primary
list is a bounded `paged-query` collection keyed by cursor, limit, status,
assignee, coordinator, priority, label, site, text search, and its stable
updated-desc sort order. The `/sites` route first paint is also bounded to its
first cursor page and marks the `sites` seed as `paged-query`. Existing labels
and options collections stay available as eager `complete-tenant` collections
until their route slices move to bounded paging or explicit sync-backed
coverage.
The adapter starts the client collection subscription early enough for disabled
Query Collections to support explicit `refetch()`, but its server and hydration
snapshots keep using loader DTOs so TanStack DB state does not render during
the SSR pass. Use `useLiveQuery` only for client-only derived DB queries with
an explicit SSR strategy. The current migrated slices are:

- `features/jobs/jobs-data-plane.ts` and `features/jobs/jobs-state.ts`, where
  the route list is an eager, page-scoped collection, job options remain an
  eager scoped options collection, job details and collaborators are lazy
  per-record collections, and command reconciliation is seeded by Start loaders
  or detail sheets. The state provider is a compatibility facade for URL-backed
  filters, create feedback, notices, bounded refresh, and existing hooks.
- `features/sites/sites-data-plane.ts` and `features/sites/sites-state.ts`,
  where the primary Sites route collection is a bounded cursor page,
  site-related job subsets are bounded page/filter collections, and site
  comments are lazy per-site collections exposed through public reader hooks.
- `features/activity/activity-data-plane.ts`, where the global Activity route
  reads the bounded `activity-events` Electric shape and the complete-tenant
  `product-activity-actors` shape, joins product-safe actors locally, and
  applies event/entity/status filters over synced rows without caller-supplied
  Electric predicates. The Activity route is available to internal organization
  members and surfaces connecting, ready, empty, unavailable, stale, degraded,
  and permission-aware states.
- `features/labels/labels-data-plane.ts`, where organization labels have a
  first-class scoped collection so job/site label commands declare and update a
  real data-plane root, plus a Settings Labels helper that consumes the active
  `labels` Electric shape directly and surfaces disabled/unavailable sync
  health without API fallback.
- `features/organizations/organization-labels-settings-page.tsx`, where the
  dedicated Labels settings route renders active labels from the
  Electric-backed Settings Labels collection, filters the hydrated collection
  locally for search, exposes connecting/ready/empty/unavailable/permission
  states, and presents accessible edit/archive row actions that defer mutation
  behavior to the label-write slice. The old API-backed labels panel in
  organization settings remains during rollout.
- `features/jobs-workspace/jobs-workspace-live-list.ts`, where the
  Electric-native Jobs workspace subscribes to the Jobs read-model collections,
  derives visible live rows from jobs, label assignments, labels, site
  summaries, and contact summaries only after the full required collection
  graph is healthy/live-query ready, and surfaces explicit graph sync health
  instead of falling back to the legacy Jobs route data path.
- `features/jobs/jobs-detail-state.ts`, which is now a detail-sheet facade over
  job detail and collaborator collections plus command mutation feedback.

Jobs route filters are decoded from URL search and converted to
`JobListQuery` before the loader calls `GET /jobs`; the page still keeps an
uncontrolled fallback for isolated tests but production route filtering is
server/query-backed rather than a selector over a complete tenant array. The
jobs page, create flow, and detail sheet read the provider APIs directly.
Do not add new Effect Atom state in app feature code; new API-backed state
should follow the TanStack DB/provider pattern unless a feature has a more
specific architecture note.

TanStack Start loaders remain the first-paint and navigation-preload boundary
for API DTOs. Do not run TanStack DB collection `preload()` from SSR loaders;
route loaders should return decoded server data and seed the router Query
client with `createDataPlaneSeed(...)` and `applyDataPlaneSeed(...)`. Loader
seeding should pass the request start timestamp so a client-side preload cannot
overwrite Query cache data that was updated by a newer local/server-confirmed
mutation. Providers should use `seedQueryCollectionInitialData(...)` as the
test/client fallback before creating Query Collections. React components should
subscribe to collection state with `useHydratedCollectionItems(...)` unless
they need a client-only derived DB query. Do not call `useLiveQuery` in a Start
SSR render path without a server snapshot strategy; the current React DB hook
uses `useSyncExternalStore` without `getServerSnapshot` and will force client
rendering under SSR.

Query Collection query keys must not accidentally nest unrelated collections
under a shared prefix. TanStack Query uses prefix matching for cache lookups, so
a comments collection key must not start with the sites collection key unless
the comments rows are valid members of that same cache family. API-backed
collection keys should include the active organization, viewer user, and viewer
role when responses can vary by session or authorization scope.

Route-scoped root collections should rely on TanStack DB's native collection
garbage collection rather than provider unmount cleanup. Live queries own
derived subscriptions and will report errors if a source collection is manually
cleaned up while a live query still depends on it. The shared route-scoped
collection GC time keeps old route collections short-lived without racing React
unmount order. Per-record registry entries such as detail, collaborator,
comment, and related-job scopes may use feature-owned delete helpers on unmount
when they are tied to a specific sheet/detail lifecycle. Route-scoped providers
should also ignore async mutation or refresh result dispatches after unmount so
in-flight operations can settle without scheduling React state updates after
navigation or test teardown.

Mutations should use the data-plane command layer according to the server
contract:

- Use feature-owned data-plane write helpers to reconcile canonical rows
  returned by the typed Effect HTTP client. Product state facades should not
  call raw collection `utils.write*` APIs directly.
- Use the shared replacement helpers for full collection replacements that need
  deletes and upserts to appear atomically to live-query subscribers.
- Declare a named command with affected collections, optimistic policy, and
  reconciliation behavior before touching a product collection.
- Record command lifecycle in the session mutation journal.
- Use `createOptimisticAction` when the UI can safely apply a local collection
  mutation immediately. Its `onMutate` callback must record at least one
  collection mutation, otherwise TanStack DB completes the transaction without
  calling `mutationFn`.
- Prefer server-confirmed writes for operations where the server enriches the
  row with generated IDs, Google Places location resolution, linked
  contacts/sites, permissions, or other canonical fields that the client cannot
  accurately predict.
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
  `*.test.ts`, `*.browser.test.ts`, or `*.browser.test.tsx`.
- Runtime-neutral and server-facing `*.test.ts` files run in the `app-node`
  Vitest project.
- Browser-mode tests use `*.browser.test.ts` or `*.browser.test.tsx` and run in
  the `app-browser-chromium` Vitest project. They share the app Vitest setup but
  run in Chromium through `@vitest/browser-playwright`.
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
pnpm --filter app test:browser
pnpm --filter app test:node
pnpm --filter app e2e
```
