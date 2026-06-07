# Route-Aware Proximity Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared contracts, domain services, Google Routes integration, cache, cost guard, and Agent actions for traffic-aware nearby Jobs and Sites.

**Architecture:** Add a shared `@ceird/proximity-core` package for origin, route summary, route display-line, provider metadata, and cost-guard contracts. Jobs and Sites keep separate public endpoints and row DTOs, while the domain Worker uses one internal proximity service backed by Google Routes, bounded candidate queries, `Effect.Cache`, and current organization authorization. The Agent gets registry-owned read actions that call the same domain service and project list responses without route geometry.

**Tech Stack:** Effect Schema, Effect HttpApi, Effect services and `Effect.Cache`, Google Routes API `computeRouteMatrix` and `computeRoutes`, Google Places autocomplete/details, Drizzle/Postgres repositories, Cloudflare Workers service bindings, Vitest.

---

## Reference Material

- Product/design source: `docs/planned-features/2026-06-03-route-aware-job-proximity.md`
- UI reference source: `docs/planned-features/2026-06-04-route-aware-job-proximity-ui-lock-in.md`
- Product glossary: `CONTEXT.md`
- API architecture: `docs/architecture/api.md`
- Package boundaries: `docs/architecture/packages.md`
- Google Routes matrix reference: <https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix>
- Google Routes route reference: <https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes>
- Google Routes billing and quotas: <https://developers.google.com/maps/documentation/routes/usage-and-billing>

## Locked Product Rules

- "Closest" means shortest traffic-aware driving time, never straight-line distance.
- Near me is a filter mode. Apply selected filters first, rank eligible mapped candidates by driving time second.
- Jobs and Sites use separate endpoints and Agent actions.
- Jobs default to active statuses: `new`, `triaged`, `in_progress`, `blocked`.
- Sites proximity considers all mapped, non-archived sites, then reports active job count and highest active priority for context.
- Route-rank at most 100 eligible candidates, return 10 by default, allow `limit` up to 25, and expose cap metadata when more than 100 candidates exist.
- No pagination for proximity endpoints.
- Use driving mode only, with `TRAFFIC_AWARE`.
- Route display lines are requested only when `includeRouteLines` is true.
- Current browser/device location must be passed by the app at request time. Do not infer location from IP or saved history.
- Use typed origins as a two-step autocomplete/details fallback.
- Use `GOOGLE_MAPS_API_KEY` as the underlying credential for v1. Optional future split keys may fall back to it.
- Cache only server-side route provider work using bounded process-local `Effect.Cache`.
- Responses include normalized provider metadata, not raw Google payloads.

## File Structure

- Create `packages/proximity-core/package.json`
- Create `packages/proximity-core/tsconfig.json`
- Create `packages/proximity-core/src/domain.ts`
- Create `packages/proximity-core/src/dto.ts`
- Create `packages/proximity-core/src/errors.ts`
- Create `packages/proximity-core/src/http-api.ts`
- Create `packages/proximity-core/src/index.ts`
- Test `packages/proximity-core/src/index.test.ts`
- Modify `packages/jobs-core/package.json`
- Modify `packages/jobs-core/src/dto.ts`
- Modify `packages/jobs-core/src/errors.ts`
- Modify `packages/jobs-core/src/http-api.ts`
- Modify `packages/jobs-core/src/index.ts`
- Modify `packages/jobs-core/src/index.test.ts`
- Modify `packages/sites-core/package.json`
- Modify `packages/sites-core/src/dto.ts`
- Modify `packages/sites-core/src/errors.ts`
- Modify `packages/sites-core/src/http-api.ts`
- Modify `packages/sites-core/src/index.ts`
- Modify `packages/sites-core/src/index.test.ts`
- Modify `packages/agents-core/package.json`
- Modify `packages/agents-core/src/actions/jobs.ts`
- Modify `packages/agents-core/src/actions/sites.ts`
- Modify `packages/agents-core/src/action-definitions.ts`
- Modify `packages/agents-core/src/index.test.ts`
- Modify `packages/identity-core/src/index.ts`
- Modify `packages/identity-core/src/index.test.ts`
- Create `apps/domain/src/domains/identity/preferences/http.ts`
- Create `apps/domain/src/domains/identity/preferences/repository.ts`
- Create `apps/domain/src/domains/identity/preferences/schema.ts`
- Create `apps/domain/src/domains/identity/preferences/service.ts`
- Test `apps/domain/src/domains/identity/preferences/*.test.ts`
- Create `apps/domain/src/domains/proximity/google-routes-provider.ts`
- Create `apps/domain/src/domains/proximity/google-origin-provider.ts`
- Create `apps/domain/src/domains/proximity/cost-guard.ts`
- Create `apps/domain/src/domains/proximity/service.ts`
- Create `apps/domain/src/domains/proximity/http.ts`
- Create `apps/domain/src/domains/proximity/test-provider.ts`
- Test `apps/domain/src/domains/proximity/*.test.ts`
- Modify `apps/domain/src/domains/jobs/repositories.impl.ts`
- Modify `apps/domain/src/domains/jobs/repositories.ts`
- Modify `apps/domain/src/domains/jobs/service.ts`
- Modify `apps/domain/src/domains/jobs/http.ts`
- Modify `apps/domain/src/domains/jobs/service.test.ts`
- Modify `apps/domain/src/domains/sites/repositories.ts`
- Modify `apps/domain/src/domains/sites/service.ts`
- Modify `apps/domain/src/domains/sites/http.ts`
- Modify `apps/domain/src/domains/sites/service.test.ts`
- Modify `apps/domain/src/domains/agents/action-registry.ts`
- Modify `apps/domain/src/domains/agents/action-registry.test.ts`
- Modify `apps/domain/src/http-api.ts`
- Modify `apps/domain/src/server.ts`
- Modify `apps/domain/src/platform/cloudflare/env.ts`
- Modify `apps/domain/src/platform/cloudflare/runtime.ts`
- Modify `apps/domain/infra/cloudflare-worker.ts`
- Modify `apps/app/src/features/api/app-api-client.ts`
- Modify `docs/architecture/api.md`
- Modify `docs/architecture/packages.md`
- Modify `docs/architecture/system-overview.md`

## Task 1: Shared Proximity Core Package

**Files:**

- Create: `packages/proximity-core/package.json`
- Create: `packages/proximity-core/tsconfig.json`
- Create: `packages/proximity-core/src/domain.ts`
- Create: `packages/proximity-core/src/dto.ts`
- Create: `packages/proximity-core/src/errors.ts`
- Create: `packages/proximity-core/src/http-api.ts`
- Create: `packages/proximity-core/src/index.ts`
- Test: `packages/proximity-core/src/index.test.ts`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Write failing core contract tests**

  Add tests that prove:
  - current location and typed-origin inputs decode as a discriminated union;
  - origin payloads reject unknown mode-specific fields;
  - `limit` accepts `1..25`;
  - route summaries require positive duration and non-negative distance;
  - display lines carry encoded polylines only when explicitly requested;
  - cost guard errors decode with retry metadata;
  - the `ProximityApiGroup` exposes origin autocomplete and place details paths.

  Example assertions:

  ```ts
  import {
    ProximityOriginInputSchema,
    ProximityLimitSchema,
    ProximityCostGuardError,
  } from "@ceird/proximity-core";
  import { Schema } from "effect";

  const decodeOrigin = Schema.decodeUnknownSync(ProximityOriginInputSchema);
  const decodeLimit = Schema.decodeUnknownSync(ProximityLimitSchema);

  expect(
    decodeOrigin({
      mode: "current_location",
      coordinates: { latitude: 53.349805, longitude: -6.26031 },
    }).mode
  ).toBe("current_location");

  expect(() =>
    decodeOrigin({
      displayText: "Dublin",
      mode: "current_location",
      coordinates: { latitude: 53.349805, longitude: -6.26031 },
    })
  ).toThrow();

  expect(decodeLimit(25)).toBe(25);
  expect(() => decodeLimit(26)).toThrow();

  expect(
    new ProximityCostGuardError({
      limit: 500,
      message: "Route quota guard blocked this request.",
      retryAfterSeconds: 60,
      scope: "actor",
    })._tag
  ).toBe("@ceird/proximity-core/ProximityCostGuardError");
  ```

  Run:

  ```bash
  pnpm --filter @ceird/proximity-core test
  ```

  Expected: FAIL because the package does not exist.

- [ ] **Step 2: Implement package metadata**

  Create `packages/proximity-core/package.json`:

  ```json
  {
    "name": "@ceird/proximity-core",
    "private": true,
    "type": "module",
    "exports": {
      ".": "./src/index.ts",
      "./dto": "./src/dto.ts",
      "./ids": "./src/domain.ts"
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "check-types": "tsc --noEmit -p tsconfig.json",
      "test": "vitest run"
    },
    "dependencies": {
      "@ceird/identity-core": "workspace:*",
      "@ceird/sites-core": "workspace:*",
      "effect": "4.0.0-beta.68"
    },
    "devDependencies": {
      "typescript": "5.9.2",
      "vitest": "3.2.4"
    }
  }
  ```

  Create `packages/proximity-core/tsconfig.json` by matching the simple core package tsconfig shape used by `packages/labels-core/tsconfig.json`.

- [ ] **Step 3: Implement shared domain and DTO schemas**

  Define these concepts in `domain.ts` and `dto.ts`:

  ```ts
  export const ProximityLatitudeSchema = Schema.Number.pipe(
    Schema.check(
      Schema.isGreaterThanOrEqualTo(-90),
      Schema.isLessThanOrEqualTo(90)
    )
  );
  export const ProximityLongitudeSchema = Schema.Number.pipe(
    Schema.check(
      Schema.isGreaterThanOrEqualTo(-180),
      Schema.isLessThanOrEqualTo(180)
    )
  );

  export const ProximityCoordinatesSchema = Schema.Struct({
    latitude: ProximityLatitudeSchema,
    longitude: ProximityLongitudeSchema,
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const CurrentLocationOriginSchema = Schema.Struct({
    mode: Schema.Literal("current_location"),
    coordinates: ProximityCoordinatesSchema,
    accuracyMeters: Schema.optional(
      Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
    ),
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const TypedOriginSchema = Schema.Struct({
    mode: Schema.Literal("typed_origin"),
    displayText: Schema.Trim.pipe(
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(512))
    ),
    placeId: GooglePlaceId,
    coordinates: ProximityCoordinatesSchema,
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const ProximityOriginInputSchema = Schema.Union(
    CurrentLocationOriginSchema,
    TypedOriginSchema
  );
  ```

  Add route DTOs:

  ```ts
  export const ProximityLimitSchema = Schema.Number.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(25)
    )
  );

  export const RouteSummarySchema = Schema.Struct({
    computedAt: IsoDateTimeString,
    distanceMeters: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThanOrEqualTo(0))
    ),
    durationSeconds: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
    provider: Schema.Literal("google_routes", "test"),
    providerRequestKind: Schema.Literal(
      "matrix",
      "route_preview",
      "route_line"
    ),
    routeStatus: Schema.Literal("ok"),
    trafficAware: Schema.Boolean,
  });

  export const RouteDisplayLineSchema = Schema.Struct({
    encodedPolyline: Schema.String,
    polylineEncoding: Schema.Literal("encoded_polyline"),
    provider: Schema.Literal("google_routes", "test"),
  });
  ```

  Keep job and site row DTOs out of this package.

- [ ] **Step 4: Implement shared errors and origin endpoints**

  Add typed errors:
  - `ProximityAccessDeniedError`
  - `ProximityOriginResolutionError`
  - `ProximityProviderError`
  - `ProximityRouteUnavailableError`
  - `ProximityCostGuardError`
  - `ProximityInvalidRequestError`

  Add `ProximityApiGroup` with:
  - `POST /proximity/origins/autocomplete`
  - `POST /proximity/origins/place-details`

  These are read-only operations with body payloads. They should be `POST` for private/complex input and must be documented as non-mutating.

- [ ] **Step 5: Verify package boundary**

  Run:

  ```bash
  pnpm --filter @ceird/proximity-core test
  pnpm --filter @ceird/proximity-core check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add packages/proximity-core docs/architecture/packages.md
  git commit -m "Add shared proximity contracts"
  ```

## Task 2: Jobs, Sites, and Agent Contracts

**Files:**

- Modify: `packages/jobs-core/package.json`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Test: `packages/jobs-core/src/index.test.ts`
- Modify: `packages/sites-core/package.json`
- Modify: `packages/sites-core/src/dto.ts`
- Modify: `packages/sites-core/src/errors.ts`
- Modify: `packages/sites-core/src/http-api.ts`
- Modify: `packages/sites-core/src/index.ts`
- Test: `packages/sites-core/src/index.test.ts`
- Modify: `packages/agents-core/package.json`
- Modify: `packages/agents-core/src/actions/jobs.ts`
- Modify: `packages/agents-core/src/actions/sites.ts`
- Test: `packages/agents-core/src/index.test.ts`

- [ ] **Step 1: Write failing endpoint and action tests**

  Add tests proving:
  - `jobs.rankNearbyJobs` is `POST /jobs/proximity`;
  - `jobs.getJobRoutePreview` is `POST /jobs/:workItemId/route-preview`;
  - `sites.rankNearbySites` is `POST /sites/proximity`;
  - `sites.getSiteRoutePreview` is `POST /sites/:siteId/route-preview`;
  - all proximity request bodies include `origin`, `limit`, and `includeRouteLines`;
  - job proximity accepts existing job filters and defaults are applied by the domain service, not by schema transforms;
  - agent actions include `ceird.jobs.proximity`, `ceird.sites.proximity`, `ceird.jobs.route_preview`, and `ceird.sites.route_preview` as executable read actions.

  Run:

  ```bash
  pnpm --filter @ceird/jobs-core test
  pnpm --filter @ceird/sites-core test
  pnpm --filter @ceird/agents-core test
  ```

  Expected: FAIL because contracts do not exist.

- [ ] **Step 2: Add job proximity DTOs**

  In `packages/jobs-core/src/dto.ts`, add:

  ```ts
  import {
    ProximityOriginInputSchema,
    ProximityLimitSchema,
    RouteDisplayLineSchema,
    RouteSummarySchema,
  } from "@ceird/proximity-core";

  export const JobProximityFiltersSchema = Schema.Struct({
    assigneeId: Schema.optional(UserId),
    coordinatorId: Schema.optional(UserId),
    labelId: Schema.optional(LabelId),
    priority: Schema.optional(JobPrioritySchema),
    siteId: Schema.optional(SiteId),
    status: Schema.optional(JobStatusSchema),
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const JobProximityRequestSchema = Schema.Struct({
    filters: Schema.optional(JobProximityFiltersSchema),
    includeRouteLines: Schema.optional(Schema.Boolean),
    limit: Schema.optional(ProximityLimitSchema),
    origin: ProximityOriginInputSchema,
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const JobProximityRowSchema = Schema.Struct({
    job: JobListItemSchema,
    route: RouteSummarySchema,
    routeLine: Schema.optional(RouteDisplayLineSchema),
    site: SiteOptionSchema,
  });
  ```

  Add a response schema with `items`, `excluded`, `capped`, `candidateCount`, `candidateLimit`, `computedAt`, and `limit`.

- [ ] **Step 3: Add site proximity DTOs**

  In `packages/sites-core/src/dto.ts`, add:

  ```ts
  export const SiteProximityFiltersSchema = Schema.Struct({
    query: Schema.optional(
      Schema.Trim.pipe(
        Schema.check(Schema.isMinLength(1), Schema.isMaxLength(256))
      )
    ),
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const SiteProximityRequestSchema = Schema.Struct({
    filters: Schema.optional(SiteProximityFiltersSchema),
    includeRouteLines: Schema.optional(Schema.Boolean),
    limit: Schema.optional(ProximityLimitSchema),
    origin: ProximityOriginInputSchema,
  }).annotate({ parseOptions: { onExcessProperty: "error" } });

  export const SiteProximityRowSchema = Schema.Struct({
    activeJobCount: Schema.Number.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
    ),
    highestActivePriority: Schema.optional(JobPrioritySchema),
    route: RouteSummarySchema,
    routeLine: Schema.optional(RouteDisplayLineSchema),
    site: SiteOptionSchema,
  });
  ```

  If importing `JobPrioritySchema` into `sites-core` creates an unacceptable dependency direction, move a shared priority literal into a neutral package first. Do not duplicate priority strings.

- [ ] **Step 4: Add HTTP endpoints**

  Add endpoints:

  ```ts
  HttpApiEndpoint.post("rankNearbyJobs", "/jobs/proximity", {
    payload: JobProximityRequestSchema,
    success: JobProximityResponseSchema,
    error: [
      JobAccessDeniedError,
      ProximityProviderError,
      ProximityCostGuardError,
      JobStorageError,
    ],
  });

  HttpApiEndpoint.post(
    "getJobRoutePreview",
    "/jobs/:workItemId/route-preview",
    {
      params: { workItemId: WorkItemId },
      payload: JobRoutePreviewRequestSchema,
      success: JobRoutePreviewResponseSchema,
      error: [
        JobNotFoundError,
        JobAccessDeniedError,
        ProximityProviderError,
        ProximityCostGuardError,
        JobStorageError,
      ],
    }
  );
  ```

  Mirror this shape in Sites with `SiteNotFoundError` and `SiteAccessDeniedError`.

- [ ] **Step 5: Add Agent action definitions**

  In `packages/agents-core/src/actions/jobs.ts`:

  ```ts
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Find nearby jobs",
      summary: "Read route-ranked jobs by driving time.",
      target: "jobs",
    },
    inputSchema: JobProximityRequestSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription:
      "Find Ceird jobs near an explicit origin. Use selected filters first, then order matching active mapped jobs by traffic-aware driving time.",
    modelName: "findNearbyJobs",
    name: "ceird.jobs.proximity",
  });
  ```

  Add equivalent site and route-preview actions. Keep model names distinct from existing `listJobs` and `listSites`.

- [ ] **Step 6: Verify contracts**

  Run:

  ```bash
  pnpm --filter @ceird/proximity-core test
  pnpm --filter @ceird/jobs-core test
  pnpm --filter @ceird/sites-core test
  pnpm --filter @ceird/agents-core test
  pnpm --filter @ceird/jobs-core check-types
  pnpm --filter @ceird/sites-core check-types
  pnpm --filter @ceird/agents-core check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add packages/jobs-core packages/sites-core packages/agents-core
  git commit -m "Add route-aware proximity contracts"
  ```

## Task 3: Google Routes Provider, Cache, and Cost Guard

**Files:**

- Create: `apps/domain/src/domains/proximity/google-routes-provider.ts`
- Create: `apps/domain/src/domains/proximity/cost-guard.ts`
- Create: `apps/domain/src/domains/proximity/test-provider.ts`
- Test: `apps/domain/src/domains/proximity/google-routes-provider.test.ts`
- Test: `apps/domain/src/domains/proximity/cost-guard.test.ts`
- Modify: `apps/domain/src/platform/cloudflare/env.ts`
- Modify: `apps/domain/src/platform/cloudflare/runtime.ts`
- Modify: `apps/domain/infra/cloudflare-worker.ts`

- [ ] **Step 1: Write failing provider tests**

  Cover:
  - `computeRouteMatrix` sends `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`;
  - field mask includes `originIndex,destinationIndex,status,condition,distanceMeters,duration,fallbackInfo`;
  - request uses `travelMode: "DRIVE"` and `routingPreference: "TRAFFIC_AWARE"`;
  - successful rows normalize duration strings like `"930s"` into `durationSeconds: 930`;
  - element status or non-route conditions become excluded rows, not successful route rows;
  - `computeRoutes` sends `POST https://routes.googleapis.com/directions/v2:computeRoutes` and requests `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline`;
  - repeated identical matrix requests within 30 seconds call `fetch` once;
  - failures use a short TTL or invalidate so a transient provider error is not cached for 30 seconds;
  - cache keys include origin, destinations, request kind, route preference, line flag, actor/org visibility scope, and a 10-minute current-location origin bucket.

  Run:

  ```bash
  pnpm --filter domain test -- src/domains/proximity/google-routes-provider.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement route provider service**

  Create a service with this shape:

  ```ts
  export interface RouteProvider {
    readonly rankDestinations: (
      input: RankDestinationsInput
    ) => Effect.Effect<
      RankDestinationsResult,
      ProximityProviderError | ProximityCostGuardError
    >;
    readonly getRoutePreview: (
      input: RoutePreviewInput
    ) => Effect.Effect<
      RoutePreviewResult,
      | ProximityProviderError
      | ProximityRouteUnavailableError
      | ProximityCostGuardError
    >;
    readonly getRouteLines: (
      input: RouteLinesInput
    ) => Effect.Effect<
      ReadonlyMap<string, RouteDisplayLine>,
      ProximityProviderError | ProximityCostGuardError
    >;
  }
  ```

  Implement a Google provider that:
  - uses `GOOGLE_MAPS_ROUTES_API_KEY` if present, otherwise `GOOGLE_MAPS_API_KEY`;
  - never exposes raw Google payloads outside the provider module;
  - stores only normalized route data in the cache;
  - logs provider failure kind, not raw coordinates, addresses, geometry, or provider payloads.

- [ ] **Step 3: Implement `Effect.Cache`**

  Use process-local bounded caches:

  ```ts
  const matrixCache =
    yield *
    Cache.make({
      capacity: 512,
      lookup: (key: MatrixCacheKey) => fetchGoogleRouteMatrix(key),
      timeToLive: (exit) =>
        Exit.isSuccess(exit) ? Duration.seconds(30) : Duration.seconds(2),
    });
  ```

  Add separate caches for:
  - matrix ranking;
  - top-N route display lines;
  - one-to-one route previews;
  - typed-origin place details, if not already reused from the origin provider.

  Do not use KV, Durable Objects, database persistence, browser cache, or URL cache state for v1.

- [ ] **Step 4: Implement app-level cost guard**

  Track cache-miss work only:
  - matrix elements;
  - computeRoutes route-line requests;
  - route preview requests;
  - origin autocomplete/details requests if they share the provider boundary.

  The guard should return `ProximityCostGuardError` with `retryAfterSeconds`, `scope`, and `limit`. Scope by organization and actor, plus agent thread when available. Use a process-local rolling window for v1 and document that Google Cloud quotas remain the billing-level guard.

- [ ] **Step 5: Verify provider tests**

  Run:

  ```bash
  pnpm --filter domain test -- src/domains/proximity
  pnpm --filter domain check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/domain/src/domains/proximity apps/domain/src/platform/cloudflare apps/domain/infra/cloudflare-worker.ts
  git commit -m "Add Google Routes proximity provider"
  ```

## Task 4: Domain Jobs and Sites Proximity Services

**Files:**

- Modify: `apps/domain/src/domains/jobs/repositories.impl.ts`
- Modify: `apps/domain/src/domains/jobs/repositories.ts`
- Modify: `apps/domain/src/domains/jobs/service.ts`
- Modify: `apps/domain/src/domains/jobs/http.ts`
- Test: `apps/domain/src/domains/jobs/service.test.ts`
- Modify: `apps/domain/src/domains/sites/repositories.ts`
- Modify: `apps/domain/src/domains/sites/service.ts`
- Modify: `apps/domain/src/domains/sites/http.ts`
- Test: `apps/domain/src/domains/sites/service.test.ts`
- Create: `apps/domain/src/domains/proximity/service.ts`
- Test: `apps/domain/src/domains/proximity/service.test.ts`

- [ ] **Step 1: Write failing service tests**

  Jobs tests:
  - default status filters include active statuses only;
  - explicit priority filter limits eligibility before route ranking;
  - external actors only see granted jobs;
  - jobs with no site, unmapped sites, and no driving route are reported in `excluded`;
  - more than 100 candidates uses the 100 most recently updated eligible jobs and returns cap metadata;
  - `limit` applies after route exclusions;
  - `includeRouteLines=false` does not call route-line provider work.

  Sites tests:
  - all mapped, non-archived sites are candidates by default;
  - search query filters before route ranking;
  - active job count and highest active priority are included;
  - more than 100 mapped candidates uses the 100 most recently updated eligible sites and returns cap metadata;
  - `includeRouteLines=false` does not call route-line provider work.

  Run:

  ```bash
  pnpm --filter domain test -- src/domains/jobs/service.test.ts src/domains/sites/service.test.ts src/domains/proximity/service.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Add repository candidate methods**

  Add methods:

  ```ts
  listProximityCandidates(
    organizationId: OrganizationId,
    filters: JobProximityFilters,
    access: JobsRepositoryAccess
  ): Effect.Effect<JobProximityCandidateSet, SqlError>
  ```

  and:

  ```ts
  listProximityCandidates(
    organizationId: OrganizationId,
    filters: SiteProximityFilters
  ): Effect.Effect<SiteProximityCandidateSet, SqlError>
  ```

  Each method returns:
  - `candidateCount` before the 100-candidate cap;
  - `candidates` already capped and ordered by `updated_at desc, id asc`;
  - exclusion counts for not mapped or missing coordinates where the repository can determine them without route calls.

- [ ] **Step 3: Implement shared ranking service**

  `apps/domain/src/domains/proximity/service.ts` should:
  - normalize `limit` default to 10 and max 25;
  - normalize `includeRouteLines` default to false;
  - call `RouteProvider.rankDestinations` for capped candidates;
  - drop no-route destinations from rows and add `no_driving_route` exclusions;
  - sort by `durationSeconds asc`, then `distanceMeters asc`, then stable candidate order;
  - request route lines only for returned rows when `includeRouteLines=true`;
  - annotate spans with candidate count, capped flag, returned count, excluded count, cache hit/miss when available, and provider kind.

- [ ] **Step 4: Add Jobs service and HTTP handlers**

  Add `rankNearby` and `getRoutePreview` methods to `JobsService`. Use the same actor loading and authorization path as `list` and `getDetail`. Keep `POST /jobs/proximity` and `POST /jobs/:workItemId/route-preview` read-only in behavior and return no-store responses through the HTTP layer.

- [ ] **Step 5: Add Sites service and HTTP handlers**

  Add `rankNearby` and `getRoutePreview` methods to `SitesService`. Use the same internal-only organization visibility as the current Sites list. Keep site route preview separate from job route preview.

- [ ] **Step 6: Verify domain service behavior**

  Run:

  ```bash
  pnpm --filter domain test -- src/domains/proximity src/domains/jobs src/domains/sites
  pnpm --filter domain check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add apps/domain/src/domains/proximity apps/domain/src/domains/jobs apps/domain/src/domains/sites
  git commit -m "Add domain proximity services"
  ```

## Task 5: Origin API and Agent Execution

**Files:**

- Create: `apps/domain/src/domains/proximity/google-origin-provider.ts`
- Modify: `apps/domain/src/domains/proximity/http.ts`
- Modify: `apps/domain/src/domains/agents/action-registry.ts`
- Test: `apps/domain/src/domains/agents/action-registry.test.ts`
- Modify: `apps/domain/src/http-api.ts`
- Modify: `apps/domain/src/server.ts`
- Modify: `apps/app/src/features/api/app-api-client.ts`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/system-overview.md`

- [ ] **Step 1: Write failing origin and Agent tests**

  Cover:
  - `/proximity/origins/autocomplete` and `/proximity/origins/place-details` use the current actor's organization authorization;
  - origin endpoints reuse Google Places implementation where safe but return proximity-origin DTOs;
  - `ceird.jobs.proximity` calls `JobsService.rankNearby`;
  - `ceird.sites.proximity` calls `SitesService.rankNearby`;
  - Agent list actions project out `routeLine`;
  - route preview actions keep enough structure for the app chat UI to render an inline route preview.

  Run:

  ```bash
  pnpm --filter domain test -- src/domains/proximity src/domains/agents/action-registry.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 2: Implement origin endpoints**

  Add handlers in `apps/domain/src/domains/proximity/http.ts` using a `ProximityService` method for origin autocomplete/details. These methods should share provider internals with site location where useful, but the public DTOs must stay temporary-origin specific.

- [ ] **Step 3: Wire the App API client**

  Add `ProximityApiGroup` to the composed `CeirdApi` in `apps/app/src/features/api/app-api-client.ts` so the UI can call origin endpoints without local fetch wrappers.

- [ ] **Step 4: Implement Agent action handlers**

  In `apps/domain/src/domains/agents/action-registry.ts`, add handlers for the four new read actions. Preserve existing action ledger behavior. Read action replay may re-run the read, consistent with current behavior.

- [ ] **Step 5: Verify Agent and API contracts**

  Run:

  ```bash
  pnpm --filter @ceird/agents-core test
  pnpm --filter domain test -- src/domains/agents src/domains/proximity src/domains/http.integration.test.ts
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add packages/agents-core apps/domain/src/domains/agents apps/domain/src/domains/proximity apps/domain/src/http-api.ts apps/domain/src/server.ts apps/app/src/features/api/app-api-client.ts docs/architecture/api.md docs/architecture/system-overview.md
  git commit -m "Expose proximity through API and agent actions"
  ```

## Task 6: Location Access Preference

**Files:**

- Modify: `packages/identity-core/src/index.ts`
- Test: `packages/identity-core/src/index.test.ts`
- Create: `apps/domain/src/domains/identity/preferences/schema.ts`
- Create: `apps/domain/src/domains/identity/preferences/repository.ts`
- Create: `apps/domain/src/domains/identity/preferences/service.ts`
- Create: `apps/domain/src/domains/identity/preferences/http.ts`
- Test: `apps/domain/src/domains/identity/preferences/service.test.ts`
- Test: `apps/domain/src/domains/identity/preferences/http.test.ts`
- Modify: `apps/domain/src/platform/database/schema.ts`
- Modify: `apps/domain/src/http-api.ts`
- Modify: `apps/domain/src/server.ts`
- Modify: `apps/app/src/features/api/app-api-client.ts`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Write failing location preference tests**

  Cover:
  - a new user defaults to `not_asked`;
  - updating to `enabled`, `dismissed`, or `blocked` requires the current authenticated user;
  - the API never stores coordinates, accuracy, addresses, or route origins;
  - repeated updates are idempotent and update `updatedAt`;
  - the app API client composes the new identity/user-preferences group.

  Example package test:

  ```ts
  import {
    LocationAccessPreferenceSchema,
    UpdateLocationAccessPreferenceInputSchema,
  } from "@ceird/identity-core";
  import { Schema } from "effect";

  expect(
    Schema.decodeUnknownSync(LocationAccessPreferenceSchema)("enabled")
  ).toBe("enabled");
  expect(() =>
    Schema.decodeUnknownSync(UpdateLocationAccessPreferenceInputSchema)({
      coordinates: { latitude: 53.3, longitude: -6.2 },
      locationAccessPreference: "enabled",
    })
  ).toThrow();
  ```

  Run:

  ```bash
  pnpm --filter @ceird/identity-core test
  pnpm --filter domain test -- src/domains/identity/preferences
  ```

  Expected: FAIL.

- [ ] **Step 2: Add identity-core preference contracts**

  Add schemas:

  ```ts
  export const LOCATION_ACCESS_PREFERENCES = [
    "not_asked",
    "enabled",
    "dismissed",
    "blocked",
  ] as const;

  export const LocationAccessPreferenceSchema = Schema.Literals(
    LOCATION_ACCESS_PREFERENCES
  );

  export const UserPreferencesSchema = Schema.Struct({
    locationAccessPreference: LocationAccessPreferenceSchema,
    updatedAt: IsoDateTimeString,
  });

  export const UpdateLocationAccessPreferenceInputSchema = Schema.Struct({
    locationAccessPreference: Schema.Literal("enabled", "dismissed", "blocked"),
  }).annotate({ parseOptions: { onExcessProperty: "error" } });
  ```

  Add a small `UserPreferencesApiGroup` with:
  - `GET /user/preferences`;
  - `PATCH /user/preferences/location-access`.

- [ ] **Step 3: Add persistence without storing location**

  Add a `user_preferences` table with:
  - `user_id` primary key referencing Better Auth `user.id`;
  - `location_access_preference` text not null default `not_asked`;
  - `created_at`;
  - `updated_at`.

  Generate and inspect the Drizzle migration:

  ```bash
  pnpm --filter domain db:generate
  ```

  Expected: migration only creates `user_preferences` and supporting constraints/indexes.

- [ ] **Step 4: Implement preference service and HTTP handlers**

  The service reads the current authenticated user from the existing auth context, creates a default row on first read, and updates only the preference enum. It must reject any payload with coordinates or origin details through strict schema decoding.

- [ ] **Step 5: Wire the app client**

  Add `UserPreferencesApiGroup` to `apps/app/src/features/api/app-api-client.ts` so onboarding, settings, Jobs, Sites, and Agent chat can read and update the global preference.

- [ ] **Step 6: Verify preference behavior**

  Run:

  ```bash
  pnpm --filter @ceird/identity-core test
  pnpm --filter domain test -- src/domains/identity/preferences
  pnpm --filter domain check-types
  pnpm --filter app check-types
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add packages/identity-core apps/domain/src/domains/identity/preferences apps/domain/src/platform/database/schema.ts apps/domain/drizzle apps/app/src/features/api/app-api-client.ts docs/architecture
  git commit -m "Add user location access preference"
  ```

## Task 7: Full Logic Verification

**Files:**

- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/packages.md`
- Modify: `docs/architecture/system-overview.md`

- [ ] **Step 1: Update architecture docs**

  Document:
  - `@ceird/proximity-core` boundary and dependency direction;
  - `POST` read-computation endpoints and no-store behavior;
  - Google Routes provider, field masks, cache, app-level cost guard, and provider metadata normalization;
  - Agent read actions and geometry projection rules;
  - Google Cloud quota reminder for Routes matrix elements, route previews, Places origin selection, and Maps JS if future map migration happens.

- [ ] **Step 2: Run focused package and domain checks**

  Run:

  ```bash
  pnpm --filter @ceird/proximity-core test
  pnpm --filter @ceird/jobs-core test
  pnpm --filter @ceird/sites-core test
  pnpm --filter @ceird/agents-core test
  pnpm --filter domain test -- src/domains/proximity src/domains/jobs src/domains/sites src/domains/agents
  pnpm --filter @ceird/proximity-core check-types
  pnpm --filter @ceird/jobs-core check-types
  pnpm --filter @ceird/sites-core check-types
  pnpm --filter @ceird/agents-core check-types
  pnpm --filter domain check-types
  ```

  Expected: PASS.

- [ ] **Step 3: Run handoff checks**

  Run:

  ```bash
  pnpm check-types
  pnpm test
  pnpm lint
  pnpm format
  ```

  Expected: PASS.

  Commit:

  ```bash
  git add docs/architecture
  git commit -m "Document route-aware proximity logic architecture"
  ```

## Self-Review Checklist

- [ ] No straight-line distance ranking is introduced.
- [ ] No raw Google payload, coordinates, geometry, or provider messages are logged or returned.
- [ ] No browser, HTTP, KV, Durable Object, or database cache is used for route results in v1.
- [ ] No hidden approximate-distance prefilter is added.
- [ ] Jobs and Sites public contracts remain separate.
- [ ] Current-location and typed-origin bodies use discriminated unions.
- [ ] Route preview contracts are separate for jobs and sites.
- [ ] Agent actions are registry-owned and read-only.
- [ ] `GOOGLE_MAPS_API_KEY` remains the v1 fallback credential.
- [ ] Google Cloud quota setup is documented as an operational rollout step.
