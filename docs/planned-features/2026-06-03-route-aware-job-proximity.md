# Route-Aware Job And Site Proximity Design

## Purpose

Tradespeople need to ask Ceird which jobs and sites are quickest to reach from
their current location. The answer must reflect real driving routes rather than
straight-line distance so it matches field work in estates, cul-de-sacs, one-way
systems, and other road layouts.

## Locked Decisions

- "Closest job" means shortest driving time from the user's explicitly shared
  current device location.
- Route distance is supporting context, not the primary sort.
- Near me is a filtering concern. It applies selected filters first, computes
  routes for eligible candidates, excludes no-route destinations, then orders
  the remaining results by driving time.
- Priority remains an ordinary job filter. If a priority filter is selected,
  such as `urgent`, the proximity request only considers jobs matching that
  priority and orders those matching jobs by driving time.
- Existing job priority means `urgent > high > medium > low > none`.
- The Sites surface gets its own route-aware "near me" sort/filter. Sites sort
  by driving time to the site location.
- Sites proximity includes all mapped, non-archived sites by default, not only
  sites with active jobs.
- Route-aware site rows include route summary data plus site work context such
  as active job count and highest active job priority.
- The Sites proximity cap uses the same v1 logic as jobs: route-rank up to 100
  eligible mapped sites, return 10 by default, allow up to 25, and clearly label
  the response when more than 100 eligible mapped sites exist.
- If more than 100 eligible mapped sites exist, v1 sends the 100 most recently
  updated eligible sites to Google Routes. This mirrors the job proximity
  candidate rule and avoids a hidden approximate-distance prefilter.
- Route-aware proximity results are computed live on demand for v1.
- Driving time is traffic-aware current driving time, not traffic-unaware
  typical travel time.
- V1 uses Google Routes `TRAFFIC_AWARE` routing preference.
  `TRAFFIC_AWARE_OPTIMAL` is deferred unless real usage shows ranking quality
  is insufficient.
- V1 uses driving routes only. It does not expose route preference controls such
  as avoid tolls, avoid motorways, vehicle type, or route optimization.
- V1 exposes a result limit so users can ask for more or fewer route-ranked
  jobs. The default result limit is 10 and the v1 maximum is 25.
- The backend route-ranks up to 100 eligible active mapped jobs. When more than
  100 eligible jobs exist, the response clearly labels that route ranking was
  limited to 100 jobs.
- If more than 100 eligible active mapped jobs exist, v1 sends the 100 most
  recently updated eligible jobs to Google Routes. This mirrors the current jobs
  list ordering and avoids a hidden approximate-distance prefilter.
- Responses report excluded active jobs by reason, such as no site, unverified
  site location, missing coordinates, or no driving route found.
- Individual destinations with no driving route are excluded from route-ranked
  rows and reported in exclusion metadata as `no_driving_route`. Result rows
  must always have a usable driving time.
- Proximity and route preview responses include normalized provider metadata
  needed for transparency and UI behavior, such as `routeStatus`,
  `routeUnavailableReason`, `trafficAware`, `computedAt`,
  `provider: "google_routes"`, and provider request kind.
- Responses must not expose raw Google response objects, raw provider status
  blobs, or Google payloads to the app, agent, logs, or persisted records.
- V1 uses dedicated route-aware proximity read endpoints/actions rather than
  overloading the normal cursor-paginated jobs or sites lists.
- Proximity and route preview HTTP endpoints use `POST` even though they are
  read-only operations. Treat them as read computations with complex/private
  body input, not mutations.
- Proximity and route preview endpoints remain read-only in Ceird permissions
  and agent action kind. They should be idempotent in practice for the same body
  at the same point in time, subject to live traffic changes.
- Proximity and route preview HTTP responses use `Cache-Control: no-store`
  because request and response data may include current-location-derived route
  context. Cost control comes from the server-side `Effect.Cache`, not HTTP or
  browser caching.
- Proximity endpoints return a bounded top-N result set, not cursor-paginated
  pages. They accept `limit`, default to 10 results, cap at 25 results, and
  return cap/exclusion metadata alongside the result rows.
- The requested `limit` applies after exclusions. The backend route-ranks up to
  100 eligible candidates, drops destinations with no usable driving route, then
  returns the top `limit` usable rows.
- V1 does not persist route-ranking snapshots for pagination. Results are live,
  traffic-aware, and may change between requests.
- Jobs and Sites proximity are exposed as separate contracts. They may share an
  internal route-ranking service, but the public DTOs stay specific to job
  result rows and site result rows.
- Proximity endpoints inherit existing visibility and authorization boundaries.
  Jobs proximity must use the same job visibility rules as job listing,
  including external collaborators seeing only jobs granted to them. Sites
  proximity must use the same site-directory visibility as site listing, which
  is currently organization-wide/internal-only.
- Typed-origin resolution for proximity needs its own read-proximity permission
  boundary. Do not reuse the current site-location provider permission that is
  tied to site creation.
- Typed-origin autocomplete/details are exposed through a shared read-only
  proximity-origin API boundary, not through the site-location creation
  endpoints and not duplicated separately under Jobs and Sites. Jobs UI, Sites
  UI, and Agent proximity all use this boundary for temporary route origins.
- The proximity-origin boundary may reuse the same internal Google location
  provider capabilities as site location, but its API, permission, and DTOs
  should reflect temporary origin selection rather than persisted site mapping.
- Add a shared proximity package/domain boundary, such as
  `@ceird/proximity-core`, for route-aware concepts that cross Jobs, Sites,
  Agent, and Maps. This boundary should own origin schemas, route summary DTOs,
  route display-line DTOs, proximity errors, cost-guard errors, and provider
  contract types that are not inherently jobs or sites.
- The shared proximity boundary owns the public HTTP API group for temporary
  origin selection, such as `/proximity/origins/autocomplete` and
  `/proximity/origins/place-details`. These endpoints support typed-origin
  selection for Jobs, Sites, and Agent proximity. Place-details returns a
  short-lived server-signed typed-origin proof; Jobs/Sites route endpoints
  reject typed-origin bodies whose proof is missing, expired, or does not match
  the exact resolved origin.
- V1 keeps the existing `GOOGLE_MAPS_API_KEY` environment variable as the
  underlying Google credential. Do not block route-aware proximity on splitting
  production secrets into separate Places and Routes environment variables.
- Code should still separate the logical provider boundaries for Places-style
  origin selection and Routes-style route computation. If Ceird later adds
  separate Google credentials, that change should be localized to provider
  configuration rather than leaking through Jobs, Sites, Agent, or UI contracts.
- If separate Google credentials are introduced later, configure them as
  optional overrides with `GOOGLE_MAPS_API_KEY` as the fallback. For example,
  Routes configuration may read `GOOGLE_MAPS_ROUTES_API_KEY` first and fall back
  to `GOOGLE_MAPS_API_KEY`; Places configuration may do the same with a
  Places-specific override. This preserves today's deployment contract while
  making future key separation possible.
- Jobs and Sites keep their own proximity row DTOs and public endpoints/actions.
  They compose shared proximity DTOs into job-specific and site-specific result
  rows rather than moving job or site concepts into the shared proximity package.
- The Ceird agent exposes both proximity actions: `ceird.jobs.proximity` for
  route-ranked jobs and `ceird.sites.proximity` for route-ranked sites.
- Agent proximity tools follow the existing shared action registry pattern:
  define executable read actions in `@ceird/agents-core`, implement domain
  handlers in the domain agent action registry, and let the agent convert them
  into AI SDK tools from their schemas. Do not hand-wire separate proximity
  tools only inside the Agent Worker.
- The shared proximity endpoint may include display-line geometry for the app
  UI, but agent action responses should project out route geometry and return
  compact route summaries. The agent does not need large coordinate arrays to
  answer proximity questions.
- V1 adds separate one-to-one route preview contracts for specific jobs and
  sites. These are distinct from route-ranked proximity list contracts because
  "which matching jobs are closest?" and "how close is this known job or site?"
  are different user intents.
- One-to-one route preview contracts stay separate by target type. Use dedicated
  job and site preview contracts rather than a generic target-kind union, so
  authorization, not-found errors, and result rows stay explicit.
- One-to-one route previews call Google Routes `computeRoutes` directly. They
  do not call `computeRouteMatrix` because there is no candidate set to rank.
- One-to-one route previews fail clearly when the target job or site cannot be
  viewed by the actor, has no usable mapped destination, or has no driving route
  from the provided origin.
- One-to-one route preview contracts are shared by the dashboard and chat. Chat
  uses them when the user asks how close a specific job or site is. The
  dashboard uses them from selected rows, detail sheets, or map pins when a user
  wants a focused route preview.
- The chat UI renders custom inline components for proximity results based on
  structured agent tool outputs. List-style proximity answers should use compact
  cards with top results, driving time, route distance, and maps handoff actions,
  plus a "View in Jobs" or "View in Sites" action for the full dashboard map.
- If the user asks how close they are to a specific job or site, the chat should
  render an inline route preview with a small map, origin marker, destination
  marker, route display line, driving time, route distance, and maps handoff
  actions.
- Inline chat route previews are display-only. They must not include
  turn-by-turn directions, maneuver instructions, or live navigation.
- If an agent request says "near me" without naming jobs or sites, default to
  jobs because that is the primary field-work workflow. The agent may mention
  that nearby sites are also available.
- If an agent request asks for closest jobs "by priority" or "ordered by
  priority" without naming a specific priority, the agent asks a short
  clarifying question rather than inventing a priority-first sort. If the user
  asks for urgent, high, medium, low, or no-priority jobs near them, the agent
  applies that priority filter and orders matches by driving time.
- V1 proximity is explicit. The normal Jobs and Sites list pages do not request
  location, rerank, or call Google Routes on ordinary page load.
- V1 adds an explicit "Near me" control/query on Jobs and Sites. Using that
  control requests the user's location and shows route-ranked results.
- The dashboard experience should stay continuous. Near me renders through the
  same Jobs and Sites screens, row components, row actions, and detail sheets
  rather than sending users to a detached proximity results page.
- When Near me is active, the existing rows gain route summary columns or badges
  such as drive time and route distance, with helper text explaining that the
  values are traffic-aware driving routes.
- The Jobs and Sites map views are part of the v1 Near me experience. Near me
  should enhance the existing map surfaces rather than leaving route-ranked
  results as table-only output.
- Ceird should support one product map runtime, not parallel MapLibre and Google
  Maps UI stacks. Keep the existing MapLibre map runtime unless Google Maps
  Platform terms make displaying Google Routes content on MapLibre non-compliant
  for Ceird's billing/legal context. If Google Maps is required, migrate the
  product map surfaces to Google Maps as a deliberate platform change rather
  than introducing a second map library for Near me only.
- If a Google Maps migration is required, first evaluate a shadcn-compatible
  install path equivalent to the current `@mapcn/map` registry model. The
  migration should preserve Ceird's source-owned `components/ui/map.tsx`
  boundary, aliases, semantic styling, icon conventions, and hotkey behavior
  rather than introducing an opaque Google Maps wrapper directly into feature
  code.
- The current mapcn component is MapLibre-based. A Google Maps migration may
  need a different shadcn registry component or a Ceird-owned component copied
  into the app, but feature code should continue to consume a stable Ceird map
  primitive instead of calling the Google Maps UI SDK directly.
- If Google Maps is required for route display lines, run a spike to replace the
  current mapcn/MapLibre-backed primitive with a Google Maps-backed,
  shadcn-compatible Ceird map primitive before implementing Near me UI. The
  spike should verify markers, popups, controlled viewport, theme behavior,
  geolocation controls, hotkeys, tests, and route line rendering across existing
  Jobs and Sites map surfaces.
- The first gate for the Google Maps migration spike is a written
  terms/provider check for Ceird's billing and legal context. Only proceed to
  engineering validation of a Google Maps-backed map primitive if that check
  confirms the existing MapLibre runtime cannot display Google Routes route
  lines compliantly.
- The v1 proximity map shows the proximity origin and route-ranked job or site
  destinations so users can choose nearby work spatially without leaving the
  dashboard.
- The v1 proximity map also shows lightweight route display lines so users get
  an at-a-glance indication of route shape. Users still open Google Maps, Apple
  Maps, or another navigation app for live directions, navigation, and traffic
  review.
- Route display lines are part of the v1 product bar. Do not ship the Near me
  map experience as markers-only if route display lines are blocked on the
  current map runtime.
- Route line geometry is requested only for proximity responses that will render
  a map or route preview. List-only dashboard responses and agent list answers
  can return route-ranked rows with drive time and distance but no geometry.
- Proximity contracts expose an explicit `includeRouteLines` option. If the user
  starts in list view and then opens the map, the app may make a second
  proximity request with `includeRouteLines=true`; the 30-second route cache
  should reuse the matrix ranking work and only add top-N route display-line
  lookups when needed.
- Existing ordinary Jobs and Sites marker maps do not call Google Routes just
  because a site is attached. Route display lines are only requested when a
  proximity origin exists, such as Near me, a route preview, or an agent
  distance question.
- The proximity map draws route display lines for every returned row in a muted
  style. Hovering or selecting a row, marker, or line highlights the matching
  route line and marker.
- Returned rows include a maps handoff action for driving directions from the
  proximity origin to the job or site destination.
- The primary handoff control is labeled "Open in Maps" and uses the best
  platform/default maps URL the app can construct for the current device. An
  attached dropdown exposes explicit "Open in Google Maps" and "Open in Apple
  Maps" choices.
- Maps handoff links are generated from the response origin and destination
  coordinates at render/click time. They must not require persisting the user's
  origin coordinates in URL state, local storage, or Ceird storage.
- Near me always respects the user's selected filters. Jobs proximity supports
  the Jobs screen's structured filters, including status, assignee,
  coordinator, priority, site, and label.
- Near me supports free-text search as a backend proximity filter. Text search
  is applied before the 100-candidate cap and route-ranking step so route calls
  are spent on text-matching jobs or sites.
- Asking for "jobs near me" without selecting extra filters uses the default
  active-job behavior. Users can clear or omit optional filters to see the
  broadest active route-ranked job set.
- The Jobs UI does not need a separate priority-first Near me sort in v1.
  Users who want urgent nearby work select the priority filter and Near me, and
  Ceird orders the urgent matches by driving time.
- Near me itself implies a mapped-only eligibility constraint because driving
  routes require coordinates. Other selected filters are still respected.
- The UI should represent the mapped-only constraint as locked state while Near
  me is active, such as a disabled "Mapped only" filter chip with helper text.
  Clearing Near me restores the user's previous mapped/unmapped filter state.
- Jobs proximity treats `active` as a first-class status group so the default
  Jobs screen filter maps cleanly to active jobs: new, triaged, in progress,
  and blocked.
- The proximity endpoint returns full proximity result rows with job, site, and
  route summary data. It should not return only job IDs that force the UI or
  agent into follow-up detail calls.
- The agent must not infer "me" from IP address, organization address, or last
  known location. It needs a current location shared for the request.
- Agent location sharing should be seamless. The chat UI requests browser
  geolocation permission and passes the resulting coordinates into the
  proximity action for that request; users should not have to manually type
  latitude and longitude.
- Location access is a user-level preference established during account
  creation or onboarding where possible. If the user has enabled it and the
  browser grants permission for the current device, Near me and agent proximity
  requests can fetch the latest browser location when needed without an extra
  Ceird prompt.
- The location access preference does not store raw coordinates. It records
  whether Ceird should attempt current-location flows for route-aware features.
- If location access was not enabled during onboarding, or if the current
  browser/device reports permission as prompt/denied/unavailable, the agent chat
  renders an inline "Share current location" action before calling proximity
  tools.
- Near me clients perform a location preflight before calling proximity
  endpoints or agent actions. If browser current location is denied,
  unavailable, or times out, Jobs/Sites screens show the typed-origin fallback
  instead of calling the backend with no origin. Agent chat keeps the draft and
  asks for location access until a future app-resolved signed typed-origin
  sideband is implemented.
- The backend still validates that every proximity or route preview request has
  exactly one usable origin. Missing, conflicting, or invalid origins fail with a
  typed input error; the client preflight is a UX optimization, not the
  authority.
- Proximity and route preview request schemas model origin as an explicit
  discriminated union with a mode enum, such as `current_location` or
  `typed_origin`. The selected mode defines the required payload shape. Do not
  model origin as multiple optional fields that the backend silently prioritizes.
- Use discriminated unions for request body sections where a selected mode or
  kind changes the required payload shape. This is the default pattern for
  dynamic route-aware request bodies because it keeps schemas, agent tools, and
  validation errors explicit.
- When the browser has already granted location permission, the chat submit flow
  uses that permission to request the current position without another Ceird
  prompt. Ceird still asks the browser for a current position; it does not read
  a persisted Ceird location.
- Current browser location uses the existing high-accuracy browser geolocation
  behavior: a request timeout around 10 seconds and browser-cached positions no
  older than about 30 seconds.
- Proximity responses should include origin accuracy when the browser provides
  it so the UI and agent can explain when the origin is approximate.
- Proximity responses echo an origin summary for the request. Include origin
  kind (`current_location` or `typed_origin`), a display label, coordinates for
  this response, accuracy when available, and computed-at time.
- Echoed origin data may be used by the current UI to explain results and by the
  v1 proximity map to place the starting marker. It must not be persisted to
  Ceird storage, URL state, local storage, or application logs.
- V1 proximity is explicit run/refresh only. It does not live-update route
  rankings as the user moves.
- The expected field workflow is point-in-time: a tradesperson finishes a job,
  asks for nearby work, drives to the next job or site, then repeats the
  request when they need the next route-ranked set.
- Near me results include a computed-at timestamp and a refresh action so users
  can rerun the route ranking when they need updated traffic or location.
- V1 does not use background geolocation polling or live route refreshes. This
  avoids surprise location tracking and surprise Google Routes cost.
- V1 wraps Google Routes provider calls in bounded, process-local `Effect.Cache`
  instances. The cache is for in-flight deduplication and short-lived repeated
  requests, such as a user repeatedly pressing refresh or asking the agent the
  same proximity question from the same location.
- Route cache entries are memory-only. They must not be persisted to Ceird
  storage, Cloudflare KV, Durable Objects, application logs, browser storage, or
  URL state in v1.
- Route cache keys include the normalized route inputs needed to identify the
  same computation, such as origin bucket, destination ids/coordinates, routing
  mode, routing preference, requested filters, result limit, and whether display
  line geometry is requested. Raw origin coordinates and Google response payloads
  must not be logged.
- Route cache keys are scoped to the same organization and actor visibility
  context as the request. Internal users and external collaborators should not
  share list-proximity cache entries unless the cached layer is a pure
  provider-call cache with no business metadata and the endpoint still rebuilds
  authorized result rows.
- Authorization, filter application, and candidate selection run before cache
  lookup. Cached route data must never let a user see a job or site they could
  not see through the ordinary Jobs or Sites list.
- Current-location origins use an approximately 10-metre origin bucket for the
  route cache key so browser GPS jitter does not defeat deduplication. The first
  Google Routes lookup still uses the actual request coordinates; later
  same-bucket requests inside the success TTL may reuse that computed result.
- Route cache TTLs are short because driving time is traffic-aware and
  point-in-time. Use dynamic TTLs: successful matrix, display-line, and route
  preview lookups live for 30 seconds, while provider failures expire after
  about 2 seconds or are invalidated so a transient Google failure does not
  poison Near me.
- Explicit refresh uses the route cache inside the 30-second success TTL. The UI
  and agent should show `computedAt` so users can tell when repeated refreshes
  reused a just-computed route result.
- The route cache is a best-effort runtime optimization, not product state. It
  does not guarantee cross-worker or cross-deploy reuse, and the response
  `computedAt` timestamp should reflect when the cached route result was
  actually computed.
- V1 includes a lightweight Ceird application-level route cost guard, separate
  from Google Cloud quotas. The guard protects user experience and spend before
  provider quotas are hit.
- The route cost guard counts cache-miss provider work, not cache hits. Track at
  least Google Routes matrix elements, `computeRoutes` route-line requests, and
  one-to-one route preview requests.
- The guard is scoped by organization and actor, with agent-thread granularity
  where available, so one user or looping agent thread cannot exhaust route
  capacity for the whole organization.
- When the guard blocks a request, return a typed retryable error with a clear
  message such as "Route lookup limit reached, try again shortly" and include a
  `retryAfter` hint where possible. The UI should show this directly; the agent
  should stop retrying and explain the limit.
- V1 guard thresholds are configuration, not product entitlements. Start with a
  simple rolling-window limit and tune from observed usage before adding more
  complex billing or quota controls.
- V1 includes a lightweight onboarding step that asks for location access,
  explains that Ceird uses it to find route-aware nearby jobs and sites, and
  lets the user continue without granting permission.
- V1 keeps Google Routes `computeRouteMatrix` as the route-ranking step. Route
  display lines are requested after ranking, only for the returned top-N usable
  result rows.
- Add a deterministic fake route provider for tests and explicit local
  development. It should simulate route matrix and route preview responses from
  coordinates, including no-route and timeout cases, so tests can cover ranking,
  exclusions, cache behavior, cost-guard behavior, and UI states without calling
  Google.
- The fake route provider is never a production fallback and must not be exposed
  as straight-line ordering in the real Near me product. Production route-aware
  proximity either uses Google Routes successfully or fails explicitly.
- V1 route display lines use Google Routes `computeRoutes` with overview
  polyline geometry for display. Prefer GeoJSON LineString output so MapLibre
  can render lines directly without a client-side encoded-polyline decoder.
- If route ranking succeeds but display-line geometry fails for some returned
  rows, v1 still returns the ranked rows with driving time and route distance.
  Those rows are marked so the map can omit the unavailable line and still show
  the destination pin.
- V1 proximity results include route summary fields plus display-only route
  line geometry for returned rows: driving time, route distance, traffic-aware
  indicator, origin accuracy, computed-at timestamp, destination/site metadata,
  and overview route geometry.
- V1 does not request, return, or store turn-by-turn directions, step
  polylines, traffic-on-polyline details, maneuver instructions, or navigation
  instructions.
- If Google Routes is unavailable, times out, or returns an unrecoverable
  failure for the route-ranking request, v1 fails the proximity request
  explicitly.
- V1 must not silently fall back to straight-line ordering when the user asks
  for Near me. The UI and agent can keep showing ordinary Jobs/Sites data, but
  the route-ranked proximity result should say routing is unavailable.
- V1 does not persist user location in Ceird. Current location is used for the
  request/session only, relying on normal browser permission behavior.
- V1 must not persist raw user origin coordinates, route requests, or route
  results. The endpoint may hold coordinates in memory long enough to call
  Google Routes and build the response.
- Logs and telemetry should avoid raw origin coordinates and route payloads.
  Use coarse operational metadata such as result count, excluded count, cap hit,
  latency, and provider error type.
- V1 records coarse route cost and quality telemetry: route request kind, cache
  hit/miss, matrix element count, route-line request count, route preview count,
  excluded counts by reason, cap-hit count, provider latency bucket, provider
  error type, and route cost-guard blocks.
- Route telemetry must not include raw current-location coordinates, typed-origin
  addresses, typed-origin proof tokens, destination addresses, route geometry,
  Google response payloads, or per-user movement history.
- Typed-origin fallback is available uniformly in the Jobs UI and Sites UI. It
  supports desktop planning, denied-permission browsers, and planning from
  somewhere other than the user's current location.
- If browser location is denied or unavailable, or if the user chooses to plan
  from another place, they can provide a typed origin such as a town, address,
  or Eircode. The backend resolves typed origins through a server-side Google
  location boundary before route-ranking.
- Typed origins should require Google suggestion selection or confirmation
  where possible. The app should not silently auto-pick an ambiguous free-text
  origin.
- Typed-origin UX is a two-step flow where possible: autocomplete or search for
  an origin, then confirm/select the intended Google-backed place before calling
  proximity or route preview. The route endpoint should receive a structured
  typed-origin payload, not raw ambiguous free text.
- Typed-origin autocomplete/details should use Google session tokens so the
  selection flow is grouped correctly for billing and result quality.
- Agent typed-origin chat support is a follow-up. It should use the same
  app-resolved signed origin contract as the dashboard flow, either by passing a
  typed-origin sideband from the app or by giving the Agent a dedicated
  autocomplete/details tool. Ambiguous typed-origin requests must ask for
  confirmation rather than silently choosing the first Google result.
- V1 considers active jobs by default: new, triaged, in progress, and blocked.
  Completed and canceled jobs are excluded unless a later feature explicitly
  includes state filtering.

## External API Notes

- Google Maps Platform terms prohibit caching Google Maps Content except where
  service-specific terms allow it. The current Routes API service-specific terms
  allow temporary caching of latitude/longitude values, but they do not create a
  broad permission to persist route durations, distances, traffic data, or
  polylines. V1 therefore uses only short-lived in-process caching for request
  deduplication and cost control.
- Before implementing route display lines on the existing MapLibre map, verify
  Ceird's applicable Google Maps Platform service terms and billing region. Some
  terms restrict using Routes API content with non-Google maps; if that applies,
  route display lines require a product-wide Google Maps migration before Near
  me ships.
- If Ceird later wants a shared or durable route-result cache, revisit the
  current Google Maps Platform and EEA service terms before implementation.

## UI Lock-In Phase

- Keep this document as product and design context. Do not turn it into a code
  implementation plan; create a separate implementation plan when the feature is
  ready to build.
- The UI lock-in artifacts and component direction are captured in
  [Route-Aware Job And Site Proximity UI Lock-In](./2026-06-04-route-aware-job-proximity-ui-lock-in.md).
- Before implementation, run a UI lock-in phase using Impeccable's product
  register and image generation to validate the Near me experience visually and
  behaviorally.
- The UI lock-in phase should produce concrete desktop and mobile directions for
  the Jobs Near me dashboard, Sites Near me dashboard, proximity map, inline
  agent proximity result, one-to-one route preview, onboarding location access,
  typed-origin fallback, route-limit/cost-guard error, and route-provider failure
  states.
- Use image generation for product UI exploration and review artifacts, such as
  screen mockups, map-result compositions, and state thumbnails. Do not use it
  to introduce decorative AI visuals, synthetic construction illustrations,
  purple glow, glassmorphism, or other anti-brand imagery.
- The UI lock-in phase should preserve Ceird's existing product design language:
  dense but clear rows, continuous dashboard workspace, restrained color,
  shadcn-style primitives, shortcut discoverability, and map surfaces that feel
  operational rather than marketing-led.
- Lock interaction behavior alongside visuals: filter chips, locked mapped-only
  state, origin sharing, refresh/computed-at treatment, row and marker
  selection sync, route line hover/focus states, maps handoff controls, and
  agent inline component actions.
- The phase should end with approved UI reference artifacts and a short
  component/interaction spec that a later implementation plan can translate into
  Ceird source-owned components.

## Operational Rollout Notes

- Before enabling route-aware proximity in production, configure Google Cloud
  quotas and budget alerts for the Google Maps Platform APIs used by this
  feature. At minimum, set intentional limits for Routes API `computeRouteMatrix`
  elements, Routes API `computeRoutes` requests, Places typed-origin resolution,
  and Google Maps JavaScript map loads if Ceird migrates from MapLibre to Google
  Maps.
- Quotas should match Ceird's expected usage envelope for field teams and agent
  calls rather than Google defaults. They are the provider-side backstop for
  runaway cost, separate from any Ceird application-level rate guard.

## Follow-Up Enhancements

- Let users choose job state/status filters for route-aware proximity queries,
  including completed or canceled jobs when they intentionally ask for them.
- Add a clearer UI identifier for nearby sites that have jobs attached, beyond
  route distance and active job count.
- Evolve Jobs and Sites toward a dense operational dashboard/filter model where
  "Near me" is a composable filter alongside state, priority, assignee, labels,
  and mapped/unmapped status.
- Consider moving ordinary Jobs and Sites list search backend-side so the normal
  list and proximity filter semantics stay aligned. Today the Jobs screen's
  free-text search is client-side.
- Add richer route previews, alternative routes, traffic-on-polyline styling, or
  turn-by-turn navigation later only if Ceird takes on an explicit navigation
  or route-review workflow.
- Revisit candidate caps for large organizations once real usage shows the
  latency and Google Routes cost profile.
- Compare `TRAFFIC_AWARE` and `TRAFFIC_AWARE_OPTIMAL` on real Irish route
  samples before changing routing preference.
- Revisit the user-facing maximum result limit after the product needs batch
  dispatch or territory-planning workflows. The v1 maximum of 25 is a product
  limit, not a Google API ceiling.
- Consider adding cheap approximate straight-line distance metadata to ordinary
  list views when an origin is available. Ordinary `GET /jobs` must not call
  Google Routes for every list load.
- Do not label straight-line approximate distance as "closest." If approximate
  distance appears in ordinary lists, show copy such as "approx. distance" and
  use a tooltip or equivalent helper text to explain whether the value is
  straight-line distance or traffic-aware driving time.
