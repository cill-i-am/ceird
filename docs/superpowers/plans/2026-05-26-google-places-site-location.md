# Google Places Site Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace strict site address entry with a Google Places-first location model that allows unverified, partial, or empty locations and preserves a path to Address Validation.

**Architecture:** Move the shared contract from required postal address fields to an optional location payload. Keep Google calls server-side behind a `SiteLocationProvider`, persist location quality and provider metadata in the domain database, and let app and agent workflows save either Google-resolved or unverified locations. Maps and future distance queries use only `hasUsableCoordinates`.

**Tech Stack:** TypeScript, Effect `Schema`/`HttpApi`, Drizzle/PostgreSQL, TanStack React app, Vitest, Google Places API.

---

## File Structure

Create or replace these focused units:

- Create `apps/domain/src/domains/sites/location-provider.ts`: Google Places autocomplete and place detail provider plus local/development layers.
- Create `apps/domain/src/domains/sites/location-provider.test.ts`: provider request, decoding, timeout, and failure tests.
- Create `apps/app/src/features/sites/site-location-input.tsx`: reusable Location combobox used by site create and edit.
- Create `apps/app/src/features/sites/site-location-input.test.tsx`: UI behavior tests for selecting Google suggestions and saving manual text.
- Modify `packages/sites-core/src/domain.ts`: location status, provider, Google place id, session token, latitude/longitude, and API key schemas.
- Modify `packages/sites-core/src/dto.ts`: optional location payloads, autocomplete/detail DTOs, and site response shape.
- Modify `packages/sites-core/src/errors.ts`: replace geocoding errors with location provider and location resolution errors.
- Modify `packages/sites-core/src/http-api.ts`: add authenticated location lookup endpoints and update site create/update errors.
- Modify `packages/sites-core/src/index.ts` and `packages/sites-core/src/index.test.ts`: exports and contract tests.
- Modify `packages/jobs-core/src/dto.ts`, `packages/jobs-core/src/errors.ts`, and `packages/jobs-core/src/http-api.ts`: consume the new `CreateSiteInput` and location errors for inline site creation.
- Modify `apps/domain/src/domains/sites/schema.ts`: nullable address/coordinate columns plus location status and Google metadata columns.
- Modify `apps/domain/src/domains/sites/repositories.ts`: map rows to the new `SiteOption` DTO and persist location fields.
- Create `apps/domain/src/domains/sites/location-resolution.ts`: pure helpers that turn optional location input into repository-ready site location records.
- Modify `apps/domain/src/domains/sites/service.ts`: resolve optional location input through `SiteLocationProvider` and save unverified sites without provider calls.
- Modify `apps/domain/src/domains/sites/http.ts`: route autocomplete and place detail endpoints to `SitesService`.
- Modify `apps/domain/src/domains/jobs/service.ts`: reuse the same location resolver for inline site creation.
- Modify `apps/domain/src/server.ts`, `apps/domain/src/worker.test.ts`, `apps/domain/src/platform/cloudflare/runtime.ts`, `apps/domain/src/domains/mcp/http.ts`, and related tests: compose `SiteLocationProvider` instead of `SiteGeocoder`.
- Modify site app files under `apps/app/src/features/sites/`: replace address fields with the Location control and new status language.
- Modify job app files under `apps/app/src/features/jobs/`: send inline site location payloads and rename map/status copy to `Unverified Location`.
- Modify agent files under `packages/agents-core/src/actions/sites.ts`, `packages/agents-core/src/actions/jobs.ts`, `apps/domain/src/domains/agents/actions.ts`, and tests: expose the new optional location payload.
- Modify architecture docs `docs/architecture/api.md`, `docs/architecture/data-layer.md`, `docs/architecture/local-development-and-infra.md`, `docs/architecture/jobs-v1-spec.md`, and `docs/architecture/packages.md`.
- Generate a Drizzle migration under `apps/domain/drizzle/` and inspect the SQL before committing it.

## Task 1: Shared Site Contracts

**Files:**

- Modify: `packages/sites-core/src/domain.ts`
- Modify: `packages/sites-core/src/dto.ts`
- Modify: `packages/sites-core/src/errors.ts`
- Modify: `packages/sites-core/src/http-api.ts`
- Modify: `packages/sites-core/src/index.ts`
- Test: `packages/sites-core/src/index.test.ts`

- [ ] **Step 1: Add failing DTO and API contract tests**

Append these tests in `packages/sites-core/src/index.test.ts` near the existing site DTO tests:

```ts
import {
  CreateSiteInputSchema,
  SiteLocationAutocompleteInputSchema,
  SiteLocationPlaceDetailsInputSchema,
  SiteLocationProviderError,
  SiteLocationResolutionError,
  SiteOptionSchema,
} from "./index.js";

it("allows sites to be created without a location", () => {
  expect(
    Schema.decodeUnknownSync(CreateSiteInputSchema)({
      name: "North Gate Works",
    })
  ).toEqual({ name: "North Gate Works" });
});

it("allows manual partial site locations without postal fields", () => {
  expect(
    Schema.decodeUnknownSync(CreateSiteInputSchema)({
      name: "Road entrance",
      location: {
        country: "IE",
        kind: "manual",
        rawInput: "near the old quarry gate",
      },
    })
  ).toEqual({
    name: "Road entrance",
    location: {
      country: "IE",
      kind: "manual",
      rawInput: "near the old quarry gate",
    },
  });
});

it("allows Google place site locations with a session token", () => {
  expect(
    Schema.decodeUnknownSync(CreateSiteInputSchema)({
      name: "Dublin Port",
      location: {
        displayText: "Dublin Port",
        kind: "google_place",
        placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
        rawInput: "dub port",
        secondaryText: "Dublin, Ireland",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      },
    })
  ).toMatchObject({
    location: {
      kind: "google_place",
      placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
    },
  });
});

it("rejects extra location fields from the browser", () => {
  expect(() =>
    Schema.decodeUnknownSync(CreateSiteInputSchema)({
      name: "Dublin Port",
      location: {
        displayText: "Dublin Port",
        kind: "google_place",
        latitude: 53.3498,
        placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
        rawInput: "dub port",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      },
    })
  ).toThrow();
});

it("decodes unverified site responses without coordinates", () => {
  expect(
    Schema.decodeUnknownSync(SiteOptionSchema)({
      displayLocation: "near the old quarry gate",
      hasUsableCoordinates: false,
      id: "0190e1b2-1f6b-7000-8000-000000000001",
      labels: [],
      locationStatus: "unverified",
      name: "Road entrance",
      rawLocationInput: "near the old quarry gate",
    })
  ).toMatchObject({
    displayLocation: "near the old quarry gate",
    hasUsableCoordinates: false,
    locationStatus: "unverified",
  });
});

it("decodes Google-resolved site responses with provider metadata", () => {
  expect(
    Schema.decodeUnknownSync(SiteOptionSchema)({
      addressComponents: [
        {
          languageCode: "en",
          longText: "Dublin",
          shortText: "Dublin",
          types: ["locality", "political"],
        },
      ],
      country: "IE",
      displayLocation: "Dublin Port",
      formattedAddress: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
      hasUsableCoordinates: true,
      id: "0190e1b2-1f6b-7000-8000-000000000002",
      labels: [],
      latitude: 53.3478,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.1956,
      name: "Dublin Port",
      rawLocationInput: "dub port",
    })
  ).toMatchObject({
    hasUsableCoordinates: true,
    locationProvider: "google_places",
    locationStatus: "google_resolved",
  });
});

it("decodes location autocomplete and place detail inputs", () => {
  expect(
    Schema.decodeUnknownSync(SiteLocationAutocompleteInputSchema)({
      country: "IE",
      input: "dub port",
      sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    })
  ).toMatchObject({ input: "dub port" });

  expect(
    Schema.decodeUnknownSync(SiteLocationPlaceDetailsInputSchema)({
      placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
      rawInput: "dub port",
      sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    })
  ).toMatchObject({ placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4" });
});

it("exports location provider errors", () => {
  expect(
    new SiteLocationProviderError({
      message: "Location provider failed",
      reason: "http_error",
    })._tag
  ).toBe("@ceird/sites-core/SiteLocationProviderError");

  expect(
    new SiteLocationResolutionError({
      message: "Location could not be resolved",
      placeId: "places/missing",
    })._tag
  ).toBe("@ceird/sites-core/SiteLocationResolutionError");
});
```

- [ ] **Step 2: Run the focused contract tests and confirm the old contract fails**

Run:

```bash
pnpm --filter @ceird/sites-core test -- src/index.test.ts
```

Expected: FAIL with missing exports such as `SiteLocationAutocompleteInputSchema` or with `CreateSiteInputSchema` rejecting missing `addressLine1`.

- [ ] **Step 3: Implement domain constants and schemas**

Replace the geocoding-specific provider section in `packages/sites-core/src/domain.ts` with:

```ts
export const SITE_LOCATION_STATUSES = [
  "unverified",
  "google_resolved",
  "manually_adjusted",
  "validated",
  "needs_review",
] as const;
export const SiteLocationStatusSchema = Schema.Literals(SITE_LOCATION_STATUSES);
export type SiteLocationStatus = Schema.Schema.Type<
  typeof SiteLocationStatusSchema
>;

export const SITE_LOCATION_PROVIDERS = ["google_places", "stub"] as const;
export const SiteLocationProviderSchema = Schema.Literals(
  SITE_LOCATION_PROVIDERS
);
export type SiteLocationProvider = Schema.Schema.Type<
  typeof SiteLocationProviderSchema
>;

export const GooglePlaceId = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.brand("@ceird/sites-core/GooglePlaceId")
);
export type GooglePlaceId = Schema.Schema.Type<typeof GooglePlaceId>;

export const GooglePlacesSessionToken = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(8)),
  Schema.brand("@ceird/sites-core/GooglePlacesSessionToken")
);
export type GooglePlacesSessionToken = Schema.Schema.Type<
  typeof GooglePlacesSessionToken
>;
```

Keep `GoogleMapsApiKey`, `SiteCountrySchema`, `SiteLatitudeSchema`, and `SiteLongitudeSchema` in the same file.

- [ ] **Step 4: Implement DTOs for site input, responses, and lookup endpoints**

In `packages/sites-core/src/dto.ts`, replace the address-based input and response fields with this structure:

```ts
const GooglePlaceSiteLocationInputSchema = Schema.Struct({
  displayText: NonEmptyTrimmedString,
  kind: Schema.Literal("google_place"),
  placeId: GooglePlaceId,
  rawInput: NonEmptyTrimmedString,
  secondaryText: Schema.optional(NonEmptyTrimmedString),
  sessionToken: GooglePlacesSessionToken,
}).annotate({ parseOptions: { onExcessProperty: "error" } });

const ManualSiteLocationInputSchema = Schema.Struct({
  country: Schema.optional(SiteCountrySchema),
  kind: Schema.Literal("manual"),
  rawInput: NonEmptyTrimmedString,
}).annotate({ parseOptions: { onExcessProperty: "error" } });

export const SiteLocationInputSchema = Schema.Union(
  GooglePlaceSiteLocationInputSchema,
  ManualSiteLocationInputSchema
);
export type SiteLocationInput = Schema.Schema.Type<
  typeof SiteLocationInputSchema
>;

export const CreateSiteInputSchema = Schema.Struct({
  accessNotes: Schema.optional(NonEmptyTrimmedString),
  location: Schema.optional(SiteLocationInputSchema),
  name: NonEmptyTrimmedString,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;

export const GoogleAddressComponentSchema = Schema.Struct({
  languageCode: Schema.optional(Schema.String),
  longText: Schema.String,
  shortText: Schema.String,
  types: Schema.Array(Schema.String),
});
export type GoogleAddressComponent = Schema.Schema.Type<
  typeof GoogleAddressComponentSchema
>;

export const SiteOptionSchema = Schema.Struct({
  accessNotes: Schema.optional(Schema.String),
  addressComponents: Schema.optional(
    Schema.Array(GoogleAddressComponentSchema)
  ),
  addressLine1: Schema.optional(Schema.String),
  addressLine2: Schema.optional(Schema.String),
  country: Schema.optional(SiteCountrySchema),
  county: Schema.optional(Schema.String),
  displayLocation: Schema.String,
  eircode: Schema.optional(Schema.String),
  formattedAddress: Schema.optional(Schema.String),
  googlePlaceId: Schema.optional(GooglePlaceId),
  hasUsableCoordinates: Schema.Boolean,
  id: SiteId,
  labels: Schema.Array(LabelSchema),
  latitude: Schema.optional(SiteLatitudeSchema),
  locationProvider: Schema.optional(SiteLocationProviderSchema),
  locationResolvedAt: Schema.optional(IsoDateTimeString),
  locationStatus: SiteLocationStatusSchema,
  longitude: Schema.optional(SiteLongitudeSchema),
  name: Schema.String,
  rawLocationInput: Schema.optional(Schema.String),
  town: Schema.optional(Schema.String),
});
export type SiteOption = Schema.Schema.Type<typeof SiteOptionSchema>;
```

Add endpoint payload and response DTOs in the same file:

```ts
export const SiteLocationAutocompleteInputSchema = Schema.Struct({
  country: Schema.optional(SiteCountrySchema),
  input: NonEmptyTrimmedString,
  sessionToken: GooglePlacesSessionToken,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type SiteLocationAutocompleteInput = Schema.Schema.Type<
  typeof SiteLocationAutocompleteInputSchema
>;

export const SiteLocationSuggestionSchema = Schema.Struct({
  displayText: Schema.String,
  placeId: GooglePlaceId,
  secondaryText: Schema.optional(Schema.String),
});
export type SiteLocationSuggestion = Schema.Schema.Type<
  typeof SiteLocationSuggestionSchema
>;

export const SiteLocationAutocompleteResponseSchema = Schema.Struct({
  suggestions: Schema.Array(SiteLocationSuggestionSchema),
});
export type SiteLocationAutocompleteResponse = Schema.Schema.Type<
  typeof SiteLocationAutocompleteResponseSchema
>;

export const SiteLocationPlaceDetailsInputSchema = Schema.Struct({
  placeId: GooglePlaceId,
  rawInput: NonEmptyTrimmedString,
  sessionToken: GooglePlacesSessionToken,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type SiteLocationPlaceDetailsInput = Schema.Schema.Type<
  typeof SiteLocationPlaceDetailsInputSchema
>;

export const SiteLocationPlaceDetailsResponseSchema = Schema.Struct({
  addressComponents: Schema.Array(GoogleAddressComponentSchema),
  displayLocation: Schema.String,
  formattedAddress: Schema.String,
  googlePlaceId: GooglePlaceId,
  latitude: SiteLatitudeSchema,
  longitude: SiteLongitudeSchema,
});
export type SiteLocationPlaceDetailsResponse = Schema.Schema.Type<
  typeof SiteLocationPlaceDetailsResponseSchema
>;
```

Keep `UpdateSiteInputSchema = CreateSiteInputSchema` after the new create schema.

- [ ] **Step 5: Replace geocoding errors with location errors**

In `packages/sites-core/src/errors.ts`, replace `SiteGeocodingFailedError` and `SiteGeocodingProviderError` with:

```ts
export class SiteLocationResolutionError extends Schema.TaggedErrorClass<SiteLocationResolutionError>()(
  "@ceird/sites-core/SiteLocationResolutionError",
  {
    message: Schema.String,
    placeId: Schema.optional(Schema.String),
  }
) {}

export class SiteLocationProviderError extends Schema.TaggedErrorClass<SiteLocationProviderError>()(
  "@ceird/sites-core/SiteLocationProviderError",
  {
    httpStatus: Schema.optional(Schema.Number),
    message: Schema.String,
    providerMessage: Schema.optional(Schema.String),
    providerStatus: Schema.optional(Schema.String),
    reason: Schema.String,
  }
) {}
```

Update the exported error union to include these two tags.

- [ ] **Step 6: Add location lookup endpoints to the sites API group**

In `packages/sites-core/src/http-api.ts`, import the new DTOs and errors. Add these endpoints before `createSite`:

```ts
.add(
  HttpApiEndpoint.post("autocompleteSiteLocation", "/sites/location/autocomplete", {
    payload: SiteLocationAutocompleteInputSchema,
    success: SiteLocationAutocompleteResponseSchema,
    error: [SiteAccessDeniedError, SiteLocationProviderError],
  })
)
.add(
  HttpApiEndpoint.post("getSiteLocationPlaceDetails", "/sites/location/place-details", {
    payload: SiteLocationPlaceDetailsInputSchema,
    success: SiteLocationPlaceDetailsResponseSchema,
    error: [
      SiteAccessDeniedError,
      SiteLocationProviderError,
      SiteLocationResolutionError,
    ],
  })
)
```

Update `createSite` and `updateSite` to use `SiteLocationProviderError` and `SiteLocationResolutionError` instead of geocoding errors.

- [ ] **Step 7: Export the new symbols**

In `packages/sites-core/src/index.ts`, remove geocoding exports and add:

```ts
export {
  GooglePlaceId,
  GooglePlacesSessionToken,
  SITE_LOCATION_PROVIDERS,
  SITE_LOCATION_STATUSES,
  SiteLocationProviderSchema,
  SiteLocationStatusSchema,
} from "./domain.js";
export type {
  GooglePlaceId as GooglePlaceIdType,
  GooglePlacesSessionToken as GooglePlacesSessionTokenType,
  SiteLocationProvider as SiteLocationProviderType,
  SiteLocationStatus as SiteLocationStatusType,
} from "./domain.js";
export {
  SiteLocationAutocompleteInputSchema,
  SiteLocationAutocompleteResponseSchema,
  SiteLocationInputSchema,
  SiteLocationPlaceDetailsInputSchema,
  SiteLocationPlaceDetailsResponseSchema,
  SiteLocationSuggestionSchema,
} from "./dto.js";
export type {
  SiteLocationAutocompleteInput,
  SiteLocationAutocompleteResponse,
  SiteLocationInput,
  SiteLocationPlaceDetailsInput,
  SiteLocationPlaceDetailsResponse,
  SiteLocationSuggestion,
} from "./dto.js";
export {
  SiteLocationProviderError,
  SiteLocationResolutionError,
} from "./errors.js";
```

- [ ] **Step 8: Run package tests and commit**

Run:

```bash
pnpm --filter @ceird/sites-core test -- src/index.test.ts
pnpm --filter @ceird/sites-core check-types
```

Expected: both PASS.

Commit:

```bash
git add packages/sites-core/src
git commit -m "feat: add site location contracts"
```

## Task 2: Domain Schema And Migration

**Files:**

- Modify: `apps/domain/src/domains/sites/schema.ts`
- Generate: `apps/domain/drizzle/<timestamp>_<name>/migration.sql`
- Inspect: `apps/domain/drizzle/meta/_journal.json`
- Test: `apps/domain/src/platform/database/test-database.ts` through existing domain tests

- [ ] **Step 1: Add failing schema expectations in repository/service tests**

In `apps/domain/src/domains/sites/service.test.ts`, add a create test that saves a site with only a name:

```ts
it("creates an unverified site when location is omitted", async () => {
  const result = await runSitesServiceEffect(
    SitesService.create({
      name: "Laydown yard",
    })
  );

  expect(result).toMatchObject({
    displayLocation: "",
    hasUsableCoordinates: false,
    locationStatus: "unverified",
    name: "Laydown yard",
  });
});
```

Expected before implementation: FAIL because the schema and service still require address fields.

- [ ] **Step 2: Relax and extend the sites table**

In `apps/domain/src/domains/sites/schema.ts`, change the site columns to:

```ts
addressLine1: text("address_line_1"),
addressLine2: text("address_line_2"),
town: text("town"),
county: text("county"),
country: text("country"),
eircode: text("eircode"),
rawLocationInput: text("raw_location_input"),
displayLocation: text("display_location").notNull().default(""),
formattedAddress: text("formatted_address"),
googlePlaceId: text("google_place_id"),
addressComponents: jsonb("address_components").$type<
  readonly {
    readonly languageCode?: string;
    readonly longText: string;
    readonly shortText: string;
    readonly types: readonly string[];
  }[]
>(),
latitude: doublePrecision("latitude"),
longitude: doublePrecision("longitude"),
locationProvider: text("location_provider"),
locationResolvedAt: timestamp("location_resolved_at", { withTimezone: true }),
locationStatus: text("location_status").notNull().default("unverified"),
```

Import `jsonb` from `drizzle-orm/pg-core`. Remove the Irish Eircode-required check. Replace geocoding checks with:

```ts
check(
  "sites_location_status_chk",
  sql`${table.locationStatus} in ('unverified', 'google_resolved', 'manually_adjusted', 'validated', 'needs_review')`
),
check(
  "sites_location_provider_chk",
  sql`${table.locationProvider} is null or ${table.locationProvider} in ('google_places', 'stub')`
),
check(
  "sites_coordinates_pair_check",
  sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`
),
check(
  "sites_google_resolved_metadata_check",
  sql`${table.locationStatus} <> 'google_resolved' or (${table.latitude} is not null and ${table.longitude} is not null and ${table.locationProvider} is not null and ${table.locationResolvedAt} is not null and ${table.googlePlaceId} is not null)`
),
check(
  "sites_latitude_range_check",
  sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`
),
check(
  "sites_longitude_range_check",
  sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`
),
```

- [ ] **Step 3: Generate and inspect the migration**

Run from the repo root:

```bash
pnpm --filter domain db:generate
```

Expected: a new directory appears under `apps/domain/drizzle/`. Inspect `migration.sql` and confirm it:

- drops `not null` from `address_line_1`, `county`, `latitude`, `longitude`, `geocoding_provider`, and `geocoded_at`;
- adds `location_status`, `raw_location_input`, `display_location`, `formatted_address`, `google_place_id`, `address_components`, `location_provider`, and `location_resolved_at`;
- drops `sites_ie_eircode_required_chk`, `sites_geocoding_provider_chk`, and `sites_geocoding_metadata_check`;
- adds the new location status, provider, coordinate, and Google metadata checks.

- [ ] **Step 4: Run schema-level tests**

Run:

```bash
pnpm --filter domain test -- src/platform/database/database.test.ts src/domains/sites/service.test.ts
```

Expected before repository/service updates: the database migration portion passes and the service test still fails at TypeScript or implementation boundaries.

- [ ] **Step 5: Commit schema and migration**

```bash
git add apps/domain/src/domains/sites/schema.ts apps/domain/drizzle
git commit -m "feat: store site location quality"
```

## Task 3: Google Places Location Provider

**Files:**

- Create: `apps/domain/src/domains/sites/location-provider.ts`
- Create: `apps/domain/src/domains/sites/location-provider.test.ts`
- Delete after replacement: `apps/domain/src/domains/sites/geocoder.ts`
- Delete after replacement: `apps/domain/src/domains/sites/geocoder.test.ts`

- [ ] **Step 1: Write provider tests for development, autocomplete, details, and failures**

Create `apps/domain/src/domains/sites/location-provider.test.ts` with these tests:

```ts
import {
  SiteLocationProviderError,
  SiteLocationResolutionError,
} from "@ceird/sites-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeGoogleSiteLocationProvider,
  SiteLocationProvider,
} from "./location-provider.js";

const GOOGLE_MAPS_API_KEY = "test-google-key";
const sessionToken = "550e8400-e29b-41d4-a716-446655440000";

describe("site location provider", () => {
  it("development provider returns deterministic suggestions and details", async () => {
    const suggestions = await Effect.runPromise(
      SiteLocationProvider.autocomplete({
        input: "dub port",
        sessionToken,
      }).pipe(Effect.provide(SiteLocationProvider.Development))
    );

    expect(suggestions.suggestions[0]).toMatchObject({
      displayText: "dub port",
      placeId: expect.stringContaining("places/dev-"),
    });

    const details = await Effect.runPromise(
      SiteLocationProvider.resolvePlace({
        placeId: suggestions.suggestions[0]!.placeId,
        rawInput: "dub port",
        sessionToken,
      }).pipe(Effect.provide(SiteLocationProvider.Development))
    );

    expect(details).toMatchObject({
      displayLocation: "dub port",
      locationProvider: "stub",
      locationStatus: "google_resolved",
    });
  });

  it("calls Google Places autocomplete with a session token and field mask", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: async (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Response.json({
            suggestions: [
              {
                placePrediction: {
                  placeId: "places/abc",
                  structuredFormat: {
                    mainText: { text: "Dublin Port" },
                    secondaryText: { text: "Dublin, Ireland" },
                  },
                },
              },
            ],
          });
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider.autocomplete({
        country: "IE",
        input: "dub port",
        sessionToken,
      })
    );

    expect(result.suggestions).toEqual([
      {
        displayText: "Dublin Port",
        placeId: "places/abc",
        secondaryText: "Dublin, Ireland",
      },
    ]);
    expect(requests[0]!.url).toBe(
      "https://places.googleapis.com/v1/places:autocomplete"
    );
    expect(requests[0]!.headers.get("X-Goog-Api-Key")).toBe(
      GOOGLE_MAPS_API_KEY
    );
    expect(requests[0]!.headers.get("X-Goog-FieldMask")).toBe(
      "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat"
    );
    expect(await requests[0]!.json()).toMatchObject({
      input: "dub port",
      sessionToken,
      includedRegionCodes: ["ie"],
    });
  });

  it("calls Google Place Details with a narrow field mask", async () => {
    const requests: Request[] = [];
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: async (input, init) => {
          const request = new Request(input, init);
          requests.push(request);

          return Response.json({
            addressComponents: [
              {
                languageCode: "en",
                longText: "Dublin",
                shortText: "Dublin",
                types: ["locality", "political"],
              },
            ],
            formattedAddress: "Dublin Port, Dublin, Ireland",
            id: "places/abc",
            location: { latitude: 53.3478, longitude: -6.1956 },
          });
        },
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      provider.resolvePlace({
        placeId: "places/abc",
        rawInput: "dub port",
        sessionToken,
      })
    );

    expect(result).toMatchObject({
      displayLocation: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "places/abc",
      latitude: 53.3478,
      locationProvider: "google_places",
      longitude: -6.1956,
    });
    expect(requests[0]!.url).toBe(
      "https://places.googleapis.com/v1/places/abc"
    );
    expect(requests[0]!.headers.get("X-Goog-FieldMask")).toBe(
      "id,formattedAddress,addressComponents,location,viewport"
    );
  });

  it("fails unresolved details with SiteLocationResolutionError", async () => {
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: async () => Response.json({ id: "places/abc" }),
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      Effect.either(
        provider.resolvePlace({
          placeId: "places/abc",
          rawInput: "dub port",
          sessionToken,
        })
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(SiteLocationResolutionError);
    }
  });

  it("fails non-OK responses with SiteLocationProviderError", async () => {
    const provider = await Effect.runPromise(
      makeGoogleSiteLocationProvider({
        fetch: async () => new Response("nope", { status: 500 }),
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      })
    );

    const result = await Effect.runPromise(
      Effect.either(
        provider.autocomplete({
          input: "dub port",
          sessionToken,
        })
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toBeInstanceOf(SiteLocationProviderError);
      expect(result.left.reason).toBe("http_error");
    }
  });
});
```

- [ ] **Step 2: Run provider tests and confirm they fail**

Run:

```bash
pnpm --filter domain test -- src/domains/sites/location-provider.test.ts
```

Expected: FAIL because `location-provider.ts` does not exist.

- [ ] **Step 3: Implement provider service shape and development layer**

Create `apps/domain/src/domains/sites/location-provider.ts` with these exported types and the development implementation:

```ts
export interface ResolvedSiteLocation {
  readonly addressComponents: readonly GoogleAddressComponent[];
  readonly displayLocation: string;
  readonly formattedAddress: string;
  readonly googlePlaceId: GooglePlaceIdType;
  readonly latitude: SiteLatitude;
  readonly locationProvider: SiteLocationProviderType;
  readonly locationResolvedAt: IsoDateTimeStringType;
  readonly locationStatus: "google_resolved";
  readonly longitude: SiteLongitude;
  readonly rawLocationInput: string;
}

export interface SiteLocationProviderImplementation {
  readonly autocomplete: (
    input: SiteLocationAutocompleteInput
  ) => Effect.Effect<
    SiteLocationAutocompleteResponse,
    SiteLocationProviderError
  >;
  readonly resolvePlace: (
    input: SiteLocationPlaceDetailsInput
  ) => Effect.Effect<
    ResolvedSiteLocation,
    SiteLocationProviderError | SiteLocationResolutionError
  >;
}
```

Use the stable hash helpers from `geocoder.ts` for deterministic development coordinates. The development suggestion should build `placeId` as `places/dev-${stableHash(input.input).toString(16)}` and `displayText` as the trimmed input.

- [ ] **Step 4: Implement Google request handling**

In the same file, add:

```ts
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_FIELD_MASK =
  "id,formattedAddress,addressComponents,location,viewport";
const GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat";
const DEFAULT_GOOGLE_PLACES_REQUEST_TIMEOUT = Duration.seconds(5);
```

Implement `makeGoogleSiteLocationProvider` using `fetch` with:

```ts
headers: {
  "Content-Type": "application/json",
  "X-Goog-Api-Key": googleMapsApiKey,
  "X-Goog-FieldMask": fieldMask,
}
```

Use `POST` and a JSON body for autocomplete. Use `GET` for details at `https://places.googleapis.com/v1/${placeId}`. Decode only the field shapes named in the tests with Effect `Schema`. Add `Effect.timeoutOrElse` and map timeout/fetch/json/schema failures to `SiteLocationProviderError` with reasons `request_timeout`, `fetch_failed`, `json_decode_failed`, and `response_parse_failed`.

- [ ] **Step 5: Add Context service and config layers**

At the bottom of `location-provider.ts`, add:

```ts
export class SiteLocationProvider extends Context.Service<
  SiteLocationProvider,
  SiteLocationProviderImplementation
>()("@ceird/domains/sites/SiteLocationProvider") {
  static readonly autocomplete = (input: SiteLocationAutocompleteInput) =>
    SiteLocationProvider.use((service) => service.autocomplete(input));

  static readonly resolvePlace = (input: SiteLocationPlaceDetailsInput) =>
    SiteLocationProvider.use((service) => service.resolvePlace(input));

  static readonly Development = Layer.succeed(
    SiteLocationProvider,
    makeDevelopmentSiteLocationProvider()
  );

  static readonly Google = Layer.effect(
    SiteLocationProvider,
    Effect.gen(function* SiteLocationProviderGoogle() {
      const googleMapsApiKey = yield* googleMapsApiKeyConfig;

      return yield* makeGoogleSiteLocationProvider({
        googleMapsApiKey: Redacted.value(googleMapsApiKey),
      });
    })
  );

  static readonly Local = Layer.effect(
    SiteLocationProvider,
    Effect.gen(function* SiteLocationProviderLocal() {
      const googleMapsApiKey = yield* optionalLocalGoogleMapsApiKeyConfig;

      if (Option.isNone(googleMapsApiKey)) {
        return makeDevelopmentSiteLocationProvider();
      }

      return yield* makeGoogleSiteLocationProvider({
        googleMapsApiKey: Redacted.value(googleMapsApiKey.value),
      });
    })
  );
}
```

Reuse the `GOOGLE_MAPS_API_KEY` config name so deployed and local credentials stay in one environment variable.

- [ ] **Step 6: Run provider tests and commit**

Run:

```bash
pnpm --filter domain test -- src/domains/sites/location-provider.test.ts
pnpm --filter domain check-types
```

Expected: both PASS.

Commit:

```bash
git add apps/domain/src/domains/sites/location-provider.ts apps/domain/src/domains/sites/location-provider.test.ts
git rm apps/domain/src/domains/sites/geocoder.ts apps/domain/src/domains/sites/geocoder.test.ts
git commit -m "feat: add Google Places site location provider"
```

## Task 4: Domain Services And Repositories

**Files:**

- Modify: `apps/domain/src/domains/sites/repositories.ts`
- Create: `apps/domain/src/domains/sites/location-resolution.ts`
- Modify: `apps/domain/src/domains/sites/service.ts`
- Modify: `apps/domain/src/domains/jobs/service.ts`
- Test: `apps/domain/src/domains/sites/service.test.ts`
- Test: `apps/domain/src/domains/jobs/service.test.ts`

- [ ] **Step 1: Write service tests for unverified and Google-resolved saves**

Add these test cases to `apps/domain/src/domains/sites/service.test.ts`:

```ts
it("does not call the location provider for manual locations", async () => {
  const provider = {
    autocomplete: () => Effect.die("autocomplete should not be called"),
    resolvePlace: () => Effect.die("resolvePlace should not be called"),
  } satisfies ContextService<typeof SiteLocationProvider>;

  const result = await runSitesServiceEffect(
    SitesService.create({
      location: {
        country: "IE",
        kind: "manual",
        rawInput: "gate beside old quarry",
      },
      name: "Quarry gate",
    }).pipe(Effect.provide(Layer.succeed(SiteLocationProvider, provider)))
  );

  expect(result).toMatchObject({
    displayLocation: "gate beside old quarry",
    hasUsableCoordinates: false,
    locationStatus: "unverified",
    rawLocationInput: "gate beside old quarry",
  });
});

it("resolves Google place inputs before persisting", async () => {
  const provider = {
    autocomplete: () => Effect.die("autocomplete should not be called"),
    resolvePlace: () =>
      Effect.succeed({
        addressComponents: [],
        displayLocation: "Dublin Port",
        formattedAddress: "Dublin Port, Dublin, Ireland",
        googlePlaceId: "places/abc" as GooglePlaceIdType,
        latitude: 53.3478 as SiteLatitude,
        locationProvider: "google_places",
        locationResolvedAt: "2026-05-26T08:00:00.000Z" as IsoDateTimeStringType,
        locationStatus: "google_resolved" as const,
        longitude: -6.1956 as SiteLongitude,
        rawLocationInput: "dub port",
      }),
  } satisfies ContextService<typeof SiteLocationProvider>;

  const result = await runSitesServiceEffect(
    SitesService.create({
      location: {
        displayText: "Dublin Port",
        kind: "google_place",
        placeId: "places/abc" as GooglePlaceIdType,
        rawInput: "dub port",
        sessionToken:
          "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
      },
      name: "Dublin Port",
    }).pipe(Effect.provide(Layer.succeed(SiteLocationProvider, provider)))
  );

  expect(result).toMatchObject({
    displayLocation: "Dublin Port",
    googlePlaceId: "places/abc",
    hasUsableCoordinates: true,
    locationStatus: "google_resolved",
  });
});
```

Update imports in the test file to use `SiteLocationProvider` and location types instead of `SiteGeocoder`.

- [ ] **Step 2: Update repository input and row mapping**

In `apps/domain/src/domains/sites/repositories.ts`, replace `CreateSiteRecordInput` and `UpdateSiteRecordInput` location fields with:

```ts
export interface SiteLocationRecordInput {
  readonly addressComponents?: readonly GoogleAddressComponent[];
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly country?: SiteCountry;
  readonly county?: string;
  readonly displayLocation: string;
  readonly eircode?: string;
  readonly formattedAddress?: string;
  readonly googlePlaceId?: GooglePlaceIdType;
  readonly latitude?: SiteLatitude;
  readonly locationProvider?: SiteLocationProviderType;
  readonly locationResolvedAt?: IsoDateTimeString;
  readonly locationStatus: SiteLocationStatusType;
  readonly longitude?: SiteLongitude;
  readonly rawLocationInput?: string;
  readonly town?: string;
}

export interface CreateSiteRecordInput extends SiteLocationRecordInput {
  readonly accessNotes?: string;
  readonly name: string;
  readonly organizationId: OrganizationId;
}

export interface UpdateSiteRecordInput extends SiteLocationRecordInput {
  readonly accessNotes?: string;
  readonly name: string;
}
```

Update `SiteOptionRow`, every `select` list, `makeSiteValues`, and `mapSiteOptionRow` to use the new columns. In `mapSiteOptionRow`, derive:

```ts
const hasUsableCoordinates = row.latitude !== null && row.longitude !== null;
const displayLocation =
  row.display_location || row.formatted_address || row.raw_location_input || "";
```

Pass optional coordinates only when not `null`.

- [ ] **Step 3: Add site location resolution helpers**

Create `apps/domain/src/domains/sites/location-resolution.ts` with:

```ts
import type {
  SiteLocationInput,
  SiteLocationStatusType,
} from "@ceird/sites-core";
import { Context, Effect } from "effect";

import type { ResolvedSiteLocation } from "./location-provider.js";
import { SiteLocationProvider } from "./location-provider.js";

type SiteLocationProviderService = Context.Service.Shape<
  typeof SiteLocationProvider
>;

interface EmptyUnverifiedLocationRecord {
  readonly displayLocation: string;
  readonly locationStatus: Extract<SiteLocationStatusType, "unverified">;
}

interface ManualUnverifiedLocationRecord extends EmptyUnverifiedLocationRecord {
  readonly country?: Extract<SiteLocationInput, { kind: "manual" }>["country"];
  readonly rawLocationInput: string;
}

export type ResolvedSiteLocationRecord =
  | EmptyUnverifiedLocationRecord
  | ManualUnverifiedLocationRecord
  | ResolvedSiteLocation;

function emptyUnverifiedLocation() {
  return {
    displayLocation: "",
    locationStatus: "unverified" as const,
  };
}

function manualUnverifiedLocation(
  input: Extract<SiteLocationInput, { kind: "manual" }>
) {
  return {
    country: input.country,
    displayLocation: input.rawInput,
    locationStatus: "unverified" as const,
    rawLocationInput: input.rawInput,
  };
}

export const resolveCreateSiteLocation = Effect.fn("resolveCreateSiteLocation")(
  function* (
    input: SiteLocationInput | undefined,
    provider: SiteLocationProviderService
  ) {
    if (input === undefined) {
      return emptyUnverifiedLocation();
    }

    if (input.kind === "manual") {
      return manualUnverifiedLocation(input);
    }

    return yield* provider.resolvePlace({
      placeId: input.placeId,
      rawInput: input.rawInput,
      sessionToken: input.sessionToken,
    });
  }
);
```

- [ ] **Step 4: Wire create, update, autocomplete, and place detail service methods**

In `SitesService.make`, replace `siteGeocoder` with:

```ts
const siteLocationProvider = yield * SiteLocationProvider;
```

Update `create` to resolve the location before the repository call:

```ts
const location =
  yield * resolveCreateSiteLocation(input.location, siteLocationProvider);

const siteId =
  yield *
  sitesRepository.create({
    ...location,
    accessNotes: input.accessNotes,
    name: input.name,
    organizationId: actor.organizationId,
  });
```

Add service methods:

```ts
const autocompleteLocation = Effect.fn("SitesService.autocompleteLocation")(
  function* (input: SiteLocationAutocompleteInput) {
    const actor = yield* loadActor();
    yield* ensureCanViewOrganizationSiteOptions(actor, authorization);

    return yield* siteLocationProvider.autocomplete(input);
  }
);

const getLocationPlaceDetails = Effect.fn(
  "SitesService.getLocationPlaceDetails"
)(function* (input: SiteLocationPlaceDetailsInput) {
  const actor = yield* loadActor();
  yield* ensureCanViewOrganizationSiteOptions(actor, authorization);

  const location = yield* siteLocationProvider.resolvePlace(input);

  return {
    addressComponents: [...location.addressComponents],
    displayLocation: location.displayLocation,
    formattedAddress: location.formattedAddress,
    googlePlaceId: location.googlePlaceId,
    latitude: location.latitude,
    longitude: location.longitude,
  };
});
```

Return both methods from the service object and add static helpers if the existing pattern needs them.

- [ ] **Step 5: Update jobs inline site creation**

In `apps/domain/src/domains/jobs/service.ts`, remove the pre-transaction geocode block. Import `SiteLocationProvider` from `../sites/location-provider.js` and `resolveCreateSiteLocation` from `../sites/location-resolution.js`.

Update `resolveCreateSiteId` to receive `locationProvider` and resolve inside the transaction:

```ts
if (input.kind === "existing") {
  return Effect.succeed<SiteId | undefined>(input.siteId);
}

return Effect.gen(function* () {
  const location = yield* resolveCreateSiteLocation(
    input.input.location,
    locationProvider
  );

  return yield* sitesRepository.create({
    ...location,
    accessNotes: input.input.accessNotes,
    name: input.input.name,
    organizationId,
  });
});
```

Add a test in `apps/domain/src/domains/jobs/service.test.ts` proving inline site creation accepts:

```ts
site: {
  input: {
    location: {
      kind: "manual",
      rawInput: "north yard",
    },
    name: "North yard",
  },
  kind: "create",
}
```

and returns a created job linked to a site option whose `locationStatus` is `unverified`.

- [ ] **Step 6: Run service tests and commit**

Run:

```bash
pnpm --filter domain test -- src/domains/sites/service.test.ts src/domains/jobs/service.test.ts
pnpm --filter domain check-types
```

Expected: both PASS.

Commit:

```bash
git add apps/domain/src/domains/sites/repositories.ts apps/domain/src/domains/sites/location-resolution.ts apps/domain/src/domains/sites/service.ts apps/domain/src/domains/jobs/service.ts apps/domain/src/domains/sites/service.test.ts apps/domain/src/domains/jobs/service.test.ts
git commit -m "feat: save unverified and Google-resolved sites"
```

## Task 5: Runtime, HTTP, MCP, And Agent Composition

**Files:**

- Modify: `apps/domain/src/domains/sites/http.ts`
- Modify: `apps/domain/src/server.ts`
- Modify: `apps/domain/src/platform/cloudflare/runtime.ts`
- Modify: `apps/domain/src/worker.test.ts`
- Modify: `apps/domain/src/domains/mcp/http.ts`
- Modify: `apps/domain/src/domains/mcp/http.test.ts`
- Modify: `apps/domain/src/domains/agents/actions.ts`
- Test: `apps/domain/src/worker.test.ts`
- Test: `apps/domain/src/domains/mcp/http.test.ts`

- [ ] **Step 1: Add HTTP handler tests for location endpoints**

In the existing HTTP API tests that exercise `SitesHttpLive`, add assertions that `autocompleteSiteLocation` and `getSiteLocationPlaceDetails` are registered and return provider results. Use a stub provider:

```ts
const siteLocationProvider = SiteLocationProvider.of({
  autocomplete: () =>
    Effect.succeed({
      suggestions: [
        {
          displayText: "Dublin Port",
          placeId: "places/abc" as GooglePlaceIdType,
          secondaryText: "Dublin, Ireland",
        },
      ],
    }),
  resolvePlace: () =>
    Effect.succeed({
      addressComponents: [],
      displayLocation: "Dublin Port",
      formattedAddress: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "places/abc" as GooglePlaceIdType,
      latitude: 53.3478 as SiteLatitude,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z" as IsoDateTimeStringType,
      locationStatus: "google_resolved" as const,
      longitude: -6.1956 as SiteLongitude,
      rawLocationInput: "dub port",
    }),
});
```

- [ ] **Step 2: Wire the new HTTP handlers**

In `apps/domain/src/domains/sites/http.ts`, add:

```ts
.handle("autocompleteSiteLocation", ({ payload }) =>
  sitesService
    .autocompleteLocation(payload)
    .pipe(observeSitesOperation("autocompleteSiteLocation"))
)
.handle("getSiteLocationPlaceDetails", ({ payload }) =>
  sitesService
    .getLocationPlaceDetails(payload)
    .pipe(observeSitesOperation("getSiteLocationPlaceDetails"))
)
```

- [ ] **Step 3: Replace runtime composition types**

In `apps/domain/src/server.ts`, replace `SiteGeocoder` imports and type names with:

```ts
import { SiteLocationProvider } from "./domains/sites/location-provider.js";

type ApiSiteLocationProviderLive = Layer.Layer<
  SiteLocationProvider,
  unknown,
  never
>;
```

Rename `siteGeocoderLive` options to `siteLocationProviderLive` and default to `SiteLocationProvider.Local`.

In `apps/domain/src/platform/cloudflare/runtime.ts`, replace:

```ts
export const DomainWorkerSiteGeocoderLive = SiteGeocoder.Google;
```

with:

```ts
export const DomainWorkerSiteLocationProviderLive = SiteLocationProvider.Google;
```

Update `worker.test.ts` expectations from geocoder to location provider and keep `GOOGLE_MAPS_API_KEY` as the required deployed key.

- [ ] **Step 4: Update MCP and agent action runtime dependencies**

In `apps/domain/src/domains/mcp/http.ts` and tests, replace `SiteGeocoder` with `SiteLocationProvider`. Update missing runtime error copy to:

```ts
new Error("MCP runtime is missing SiteLocationProvider; pass runtimeLive");
```

In `apps/domain/src/domains/agents/actions.ts`, replace the `siteGeocoder` dependency fields with `siteLocationProvider`, and provide `Layer.succeed(SiteLocationProvider, dependencies.siteLocationProvider)`.

- [ ] **Step 5: Run composition tests and commit**

Run:

```bash
pnpm --filter domain test -- src/worker.test.ts src/domains/mcp/http.test.ts src/domains/agents/actions.test.ts
pnpm --filter domain check-types
```

Expected: all PASS.

Commit:

```bash
git add apps/domain/src/domains/sites/http.ts apps/domain/src/server.ts apps/domain/src/platform/cloudflare/runtime.ts apps/domain/src/worker.test.ts apps/domain/src/domains/mcp/http.ts apps/domain/src/domains/mcp/http.test.ts apps/domain/src/domains/agents/actions.ts
git commit -m "feat: expose site location provider through domain runtime"
```

## Task 6: App Location Input

**Files:**

- Create: `apps/app/src/features/sites/site-location-input.tsx`
- Create: `apps/app/src/features/sites/site-location-input.test.tsx`
- Modify: `apps/app/src/features/sites/site-create-form.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/api/app-api-server.ts`
- Modify: `apps/app/src/features/api/app-api-server-ssr.ts`
- Test: `apps/app/src/features/sites/site-create-form.test.tsx`

- [ ] **Step 1: Write UI tests for manual and Google-selected locations**

Create `apps/app/src/features/sites/site-location-input.test.tsx` with:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SiteLocationInput } from "./site-location-input.js";

describe("SiteLocationInput", () => {
  it("saves manual text as an unverified location", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SiteLocationInput
        label="Location"
        onChange={onChange}
        value={{
          inputText: "",
          selectedLocation: undefined,
        }}
      />
    );

    await user.type(
      screen.getByRole("combobox", { name: "Location" }),
      "old quarry gate"
    );

    expect(onChange).toHaveBeenLastCalledWith({
      inputText: "old quarry gate",
      selectedLocation: {
        country: undefined,
        kind: "manual",
        rawInput: "old quarry gate",
      },
    });
    expect(screen.getByText("Unverified Location")).toBeInTheDocument();
  });

  it("selects a Google suggestion and shows Google resolved", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SiteLocationInput
        label="Location"
        loadSuggestions={async () => ({
          suggestions: [
            {
              displayText: "Dublin Port",
              placeId: "places/abc",
              secondaryText: "Dublin, Ireland",
            },
          ],
        })}
        onChange={onChange}
        value={{ inputText: "", selectedLocation: undefined }}
      />
    );

    await user.type(
      screen.getByRole("combobox", { name: "Location" }),
      "dub port"
    );
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Dublin Port"));

    expect(onChange).toHaveBeenLastCalledWith({
      inputText: "dub port",
      selectedLocation: {
        displayText: "Dublin Port",
        kind: "google_place",
        placeId: "places/abc",
        rawInput: "dub port",
        secondaryText: "Dublin, Ireland",
        sessionToken: expect.any(String),
      },
    });
    expect(screen.getByText("Google resolved")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new UI tests and confirm they fail**

Run:

```bash
pnpm --filter app test -- src/features/sites/site-location-input.test.tsx
```

Expected: FAIL because `site-location-input.tsx` does not exist.

- [ ] **Step 3: Implement the Location combobox**

Create `apps/app/src/features/sites/site-location-input.tsx` with:

```tsx
export interface SiteLocationInputValue {
  readonly inputText: string;
  readonly selectedLocation?: SiteLocationInputDto;
}

interface SiteLocationInputProps {
  readonly label: string;
  readonly loadSuggestions?: (
    input: SiteLocationAutocompleteInput
  ) => Promise<SiteLocationAutocompleteResponse>;
  readonly onChange: (value: SiteLocationInputValue) => void;
  readonly value: SiteLocationInputValue;
}
```

Import `SiteLocationInput` from `@ceird/sites-core` as `SiteLocationInputDto`. Use `cmdk` for the suggestions menu, a local `crypto.randomUUID()` session token per mounted search session, and existing app form styles from `site-create-form.tsx`. Do not register a global hotkey for this field because it is a local text-entry control and global keys would interfere while typing. Keep the status badge text exactly `Google resolved` or `Unverified Location`.

The change handler should emit:

```ts
function buildManualLocation(
  inputText: string
): SiteLocationInputDto | undefined {
  const rawInput = inputText.trim();

  if (rawInput.length === 0) {
    return undefined;
  }

  return {
    kind: "manual",
    rawInput,
  };
}
```

When a suggestion is chosen, emit the `google_place` location with `displayText`, `secondaryText`, `placeId`, `rawInput`, and `sessionToken`.

- [ ] **Step 4: Update the app API server helpers**

In `apps/app/src/features/api/app-api-server.ts`, import the new site location DTO types and add browser helpers beside `listCurrentBrowserSites`:

```ts
async function autocompleteCurrentBrowserSiteLocation(
  payload: SiteLocationAutocompleteInput
): Promise<SiteLocationAutocompleteResponse> {
  return await runBrowserAppApiClient(
    "SitesClient.autocompleteSiteLocation",
    (client) =>
      client.sites.autocompleteSiteLocation({
        payload,
      })
  );
}

async function getCurrentBrowserSiteLocationPlaceDetails(
  payload: SiteLocationPlaceDetailsInput
): Promise<SiteLocationPlaceDetailsResponse> {
  return await runBrowserAppApiClient(
    "SitesClient.getSiteLocationPlaceDetails",
    (client) =>
      client.sites.getSiteLocationPlaceDetails({
        payload,
      })
  );
}

const autocompleteCurrentServerSiteLocationIsomorphic = createIsomorphicFn()
  .server(async (payload: SiteLocationAutocompleteInput) => {
    const { autocompleteCurrentServerSiteLocationDirect } =
      await importAppApiServerSsr();
    return await autocompleteCurrentServerSiteLocationDirect(payload);
  })
  .client((payload: SiteLocationAutocompleteInput) =>
    autocompleteCurrentBrowserSiteLocation(payload)
  );

const getCurrentServerSiteLocationPlaceDetailsIsomorphic = createIsomorphicFn()
  .server(async (payload: SiteLocationPlaceDetailsInput) => {
    const { getCurrentServerSiteLocationPlaceDetailsDirect } =
      await importAppApiServerSsr();
    return await getCurrentServerSiteLocationPlaceDetailsDirect(payload);
  })
  .client((payload: SiteLocationPlaceDetailsInput) =>
    getCurrentBrowserSiteLocationPlaceDetails(payload)
  );

export function autocompleteCurrentServerSiteLocation(
  payload: SiteLocationAutocompleteInput
): Promise<SiteLocationAutocompleteResponse> {
  return autocompleteCurrentServerSiteLocationIsomorphic(payload);
}

export function getCurrentServerSiteLocationPlaceDetails(
  payload: SiteLocationPlaceDetailsInput
): Promise<SiteLocationPlaceDetailsResponse> {
  return getCurrentServerSiteLocationPlaceDetailsIsomorphic(payload);
}
```

Create matching SSR direct functions in `apps/app/src/features/api/app-api-server-ssr.ts`:

```ts
export async function autocompleteCurrentServerSiteLocationDirect(
  payload: SiteLocationAutocompleteInput
): Promise<SiteLocationAutocompleteResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "SitesServer.autocompleteSiteLocation",
    (client) => client.sites.autocompleteSiteLocation({ payload })
  );
}

export async function getCurrentServerSiteLocationPlaceDetailsDirect(
  payload: SiteLocationPlaceDetailsInput
): Promise<SiteLocationPlaceDetailsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "SitesServer.getSiteLocationPlaceDetails",
    (client) => client.sites.getSiteLocationPlaceDetails({ payload })
  );
}
```

- [ ] **Step 5: Replace site create draft address fields**

In `apps/app/src/features/sites/site-create-form.tsx`, replace address fields with:

```ts
interface SiteCreateDraft {
  readonly accessNotes: string;
  readonly location: SiteLocationInputValue;
  readonly name: string;
}

function buildCreateSiteInputFromDraft(
  draft: SiteCreateDraft
): CreateSiteInput {
  return {
    ...(draft.accessNotes.trim().length === 0
      ? {}
      : { accessNotes: draft.accessNotes.trim() }),
    ...(draft.location.selectedLocation === undefined
      ? {}
      : { location: draft.location.selectedLocation }),
    name: draft.name.trim(),
  };
}
```

Update form validation so only `name` is required. Remove address line, county, country, and Eircode validation copy.

- [ ] **Step 6: Run app form tests and commit**

Run:

```bash
pnpm --filter app test -- src/features/sites/site-location-input.test.tsx src/features/sites/site-create-form.test.tsx
pnpm --filter app check-types
```

Expected: both PASS.

Commit:

```bash
git add apps/app/src/features/sites/site-location-input.tsx apps/app/src/features/sites/site-location-input.test.tsx apps/app/src/features/sites/site-create-form.tsx apps/app/src/features/sites/sites-create-sheet.tsx apps/app/src/features/api/app-api-server.ts apps/app/src/features/api/app-api-server-ssr.ts
git commit -m "feat: add Places-backed site location input"
```

## Task 7: App Site, Job, And Map Surfaces

**Files:**

- Modify: `apps/app/src/features/sites/site-location.ts`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-page.tsx`
- Modify: `apps/app/src/features/sites/sites-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-coverage-map.tsx`
- Test: `apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
- Test: `apps/app/src/features/sites/sites-page.test.tsx`

- [ ] **Step 1: Update location helper tests**

Add tests to `apps/app/src/features/sites/site-location.test.ts`:

```ts
it("builds display lines for unverified sites", () => {
  expect(
    buildSiteAddressLines({
      displayLocation: "old quarry gate",
      hasUsableCoordinates: false,
      id: "0190e1b2-1f6b-7000-8000-000000000001",
      labels: [],
      locationStatus: "unverified",
      name: "Quarry gate",
      rawLocationInput: "old quarry gate",
    })
  ).toEqual(["old quarry gate"]);
});

it("does not build map URLs without usable coordinates", () => {
  expect(
    buildGoogleMapsUrl({
      displayLocation: "old quarry gate",
      hasUsableCoordinates: false,
      id: "0190e1b2-1f6b-7000-8000-000000000001",
      labels: [],
      locationStatus: "unverified",
      name: "Quarry gate",
    })
  ).toBeUndefined();
});
```

Run:

```bash
pnpm --filter app test -- src/features/sites/site-location.test.ts
```

Expected: FAIL until helpers use `hasUsableCoordinates`.

- [ ] **Step 2: Update display helpers**

In `apps/app/src/features/sites/site-location.ts`, change coordinate checks to:

```ts
export function hasSiteCoordinates(
  site: Pick<SiteOption, "hasUsableCoordinates">
) {
  return site.hasUsableCoordinates;
}
```

Build address lines from:

```ts
[
  site.displayLocation,
  site.formattedAddress === site.displayLocation
    ? undefined
    : site.formattedAddress,
  site.town,
  site.county,
].filter(
  (line): line is string => typeof line === "string" && line.trim().length > 0
);
```

Build map URLs only when `hasUsableCoordinates` is true and both `latitude` and `longitude` exist.

- [ ] **Step 3: Replace status copy in site pages and detail sheets**

In `apps/app/src/features/sites/sites-page.tsx`, replace `Mapped` with `Google resolved` for `google_resolved`, `Manually adjusted` for `manually_adjusted`, `Validated` for `validated`, and `Unverified Location` for `unverified` or `needs_review`. Replace `Unmapped` and `Needs location` copy with `Unverified Location`.

In `apps/app/src/features/sites/sites-detail-sheet.tsx`, replace address edit fields with the `SiteLocationInput` and initialize:

```ts
location: {
  inputText: site.rawLocationInput ?? site.displayLocation,
  selectedLocation: site.googlePlaceId === undefined
    ? site.rawLocationInput === undefined
      ? undefined
      : { kind: "manual", rawInput: site.rawLocationInput }
    : {
        displayText: site.displayLocation,
        kind: "google_place",
        placeId: site.googlePlaceId,
        rawInput: site.rawLocationInput ?? site.displayLocation,
        sessionToken: crypto.randomUUID(),
      },
}
```

- [ ] **Step 4: Update job create inline site draft**

In `apps/app/src/features/jobs/jobs-create-sheet.tsx`, update inline site creation to use the same `SiteLocationInputValue` shape and submit:

```ts
site: {
  kind: "create",
  input: {
    ...(inlineSite.location.selectedLocation === undefined
      ? {}
      : { location: inlineSite.location.selectedLocation }),
    name: inlineSite.name.trim(),
  },
}
```

Remove inline Eircode and county validation from the job sheet.

- [ ] **Step 5: Update map rail behavior and tests**

In `apps/app/src/features/jobs/jobs-coverage-map.test.tsx`, assert that unverified jobs remain in the rail:

```tsx
expect(screen.getByText("Unverified Location")).toBeInTheDocument();
expect(screen.getByText("2 jobs hidden from the map")).toBeInTheDocument();
```

In `jobs-coverage-map.tsx`, replace map inclusion filters with `site.hasUsableCoordinates === true`. Update empty-state copy from `Needs location` or `unmapped` to `Unverified Location`.

- [ ] **Step 6: Run app tests and commit**

Run:

```bash
pnpm --filter app test -- src/features/sites/site-location.test.ts src/features/sites/sites-page.test.tsx src/features/jobs/jobs-coverage-map.test.tsx src/features/jobs/jobs-create-sheet.test.tsx
pnpm --filter app check-types
```

Expected: all PASS.

Commit:

```bash
git add apps/app/src/features/sites apps/app/src/features/jobs
git commit -m "feat: show unverified site locations in app workflows"
```

## Task 8: Jobs Core, Agents, Docs, And Full Verification

**Files:**

- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/agents-core/src/actions/sites.ts`
- Modify: `packages/agents-core/src/actions/jobs.ts`
- Modify: `apps/domain/src/domains/agents/action-registry.ts`
- Modify: `apps/domain/src/domains/agents/action-registry.test.ts`
- Modify: `apps/app/src/test/app-domain-boundaries.test.ts`
- Modify: `apps/domain/src/domains/domain-boundaries.test.ts`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/data-layer.md`
- Modify: `docs/architecture/local-development-and-infra.md`
- Modify: `docs/architecture/jobs-v1-spec.md`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Update jobs-core and agent tests**

In `packages/jobs-core/src/dto.ts`, ensure inline site creation still imports `CreateSiteInputSchema` from `@ceird/sites-core`. Add a test proving this input is accepted:

```ts
expect(
  Schema.decodeUnknownSync(CreateJobInputSchema)({
    priority: "normal",
    site: {
      input: {
        location: {
          kind: "manual",
          rawInput: "old quarry gate",
        },
        name: "Quarry gate",
      },
      kind: "create",
    },
    title: "Inspect access road",
  })
).toMatchObject({
  site: {
    input: {
      location: {
        kind: "manual",
      },
    },
  },
});
```

In `packages/jobs-core/src/errors.ts` and `packages/jobs-core/src/http-api.ts`, replace geocoding error imports with `SiteLocationProviderError` and `SiteLocationResolutionError`.

In `packages/agents-core/src/actions/sites.ts`, update the create-site action description to say:

```ts
"Create a site with a name and optional location. Use location.kind='manual' for partial or unverified text, or location.kind='google_place' only when a placeId and sessionToken came from Ceird's location picker.";
```

- [ ] **Step 2: Update boundary tests**

In `apps/app/src/test/app-domain-boundaries.test.ts`, replace expected exports:

```ts
expect(exportedNames).toContain("SiteLocationProviderError");
expect(exportedNames).toContain("SiteLocationProvider");
expect(exportedNames).not.toContain("SiteGeocodingProvider");
```

In `apps/domain/src/domains/domain-boundaries.test.ts`, replace:

```ts
expect(domains).toContain("sites/location-provider.ts");
expect(domains).not.toContain("jobs/site-location-provider.ts");
```

- [ ] **Step 3: Update architecture docs with Address Validation direction**

In `docs/architecture/api.md`, replace the site geocoder section with a site location provider section that documents:

- `SiteLocationProvider` owns Google Places Autocomplete and Place Details;
- the browser sends `placeId`, `sessionToken`, display text, and raw input only;
- Address Validation is intentionally deferred and should be added through the same provider boundary as a verification layer;
- deployed Workers still require `GOOGLE_MAPS_API_KEY`.

In `docs/architecture/data-layer.md`, document `location_status`, nullable coordinates, `google_place_id`, `address_components`, and `display_location`.

In `docs/architecture/local-development-and-infra.md`, update the `GOOGLE_MAPS_API_KEY` row to say it enables Google Places location lookup and falls back to the development provider locally when absent.

In `docs/architecture/jobs-v1-spec.md`, add that maps and future radius queries include only sites with `hasUsableCoordinates` and report excluded jobs with `Unverified Location`.

In `docs/architecture/packages.md`, update the `@ceird/sites-core` package contract summary with optional `location`.

- [ ] **Step 4: Run package and boundary tests**

Run:

```bash
pnpm --filter @ceird/jobs-core test
pnpm --filter @ceird/agents-core test
pnpm --filter app test -- src/test/app-domain-boundaries.test.ts
pnpm --filter domain test -- src/domains/domain-boundaries.test.ts src/domains/agents/action-registry.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm check-types
pnpm test
pnpm lint
pnpm format
```

Expected: all PASS, with domain DB integration tests skipped only when the local database URLs are unavailable through existing test guards.

- [ ] **Step 6: Final commit**

```bash
git add packages/jobs-core/src packages/agents-core/src apps/domain/src/domains/agents apps/app/src/test apps/domain/src/domains/domain-boundaries.test.ts docs/architecture
git commit -m "docs: document Places-first site locations"
```

## Implementation Notes

- Keep Address Validation out of the first implementation. The data model and docs must mention that this is a future verification layer so the next slice can add a `validated` status without changing site creation semantics.
- Preserve cost control by keeping field masks server-side and using a session token from autocomplete through place details.
- Do not trust browser-supplied coordinates or provider payloads. Persist only data decoded by the domain provider.
- Keep empty location valid. Empty, manual, and provider-failed location flows all produce `locationStatus: "unverified"` unless the user selected and saved a Google place.
- Avoid a global hotkey for the Location field. It is a text input, and the command menu is discoverible through focus and keyboard navigation inside the field.
