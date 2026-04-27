# Google Site Geocoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make site coordinates server-derived from structured Irish address data using Google Geocoding, remove default manual coordinate/pin entry from the frontend, and keep MapLibre as the read-only map renderer.

**Architecture:** Coordinates become derived persistence data. The shared jobs contract accepts structured site address fields but not latitude/longitude on create, the API geocodes site addresses before writing site records, and the frontend renders stored coordinates without exposing coordinate editing or pin placement. Google lives behind an Effect service so another Eircode-capable provider can replace it without changing UI components or DTO consumers.

**Tech Stack:** Effect services and Config, `@effect/platform` HTTP API, Drizzle/Postgres, shared `@task-tracker/jobs-core` Schema DTOs, TanStack React frontend, existing MapLibre/MapCN-style map primitives.

---

## File Structure

- Modify `packages/jobs-core/src/domain.ts`
  - Add country and provider-facing site address schemas.
- Modify `packages/jobs-core/src/dto.ts`
  - Remove `latitude`/`longitude` from `CreateSiteInputSchema`.
  - Add required `addressLine1`, `county`, `country`.
  - Require `eircode` when `country === "IE"`.
  - Keep `latitude`/`longitude` in response schemas for read-only map rendering.
- Modify `packages/jobs-core/src/errors.ts`
  - Add `SiteGeocodingFailedError` with HTTP 422.
- Modify `packages/jobs-core/src/http-api.ts`
  - Add `SiteGeocodingFailedError` to standalone and inline site creation paths.
- Modify `packages/jobs-core/src/index.ts`
  - Export the new schemas, types, and error.
- Create `apps/api/src/domains/jobs/site-geocoding-config.ts`
  - Load `SITE_GEOCODER_MODE`, `GOOGLE_MAPS_API_KEY`, and Google request defaults through Effect `Config`.
- Create `apps/api/src/domains/jobs/site-geocoder.ts`
  - Define provider-neutral `SiteGeocoder` service.
  - Implement Google Geocoding adapter plus deterministic stub mode for local/dev/tests.
- Modify `apps/api/src/domains/jobs/schema.ts`
  - Add `country`, `geocoding_provider`, and `geocoded_at` columns to `sites`.
- Add migration under `apps/api/drizzle/`
  - Add site country/geocoding metadata columns and constraints.
- Modify `apps/api/src/domains/jobs/repositories.ts`
  - Persist and return `country`, `geocodingProvider`, and `geocodedAt`.
- Modify `apps/api/src/domains/jobs/sites-service.ts`
  - Geocode standalone site creation before opening the DB transaction.
- Modify `apps/api/src/domains/jobs/service.ts`
  - Geocode inline site creation before opening the DB transaction.
- Modify `apps/api/src/domains/jobs/http.ts`
  - Provide the live `SiteGeocoder` layer to job/site handlers.
- Modify `packages/sandbox-core/src/runtime-spec.ts`, `packages/sandbox-cli/src/runtime.ts`, and `packages/sandbox-cli/docker/sandbox.compose.yaml`
  - Pass `SITE_GEOCODER_MODE=stub` in sandbox development.
- Modify `scripts/dev.mjs` and `apps/app/playwright.config.ts`
  - Use stub geocoding for local dev and Playwright startup.
- Modify `apps/app/src/features/sites/sites-create-sheet.tsx`
  - Remove latitude/longitude fields.
  - Add country to the submitted payload, defaulting to Ireland.
  - Validate address fields required by the shared schema before submitting.
- Modify `apps/app/src/features/jobs/jobs-create-sheet.tsx`
  - Remove nested location drawer pin picker and latitude/longitude state.
  - Keep structured address entry for inline site creation.
- Delete `apps/app/src/features/jobs/jobs-site-pin-picker.tsx`
- Delete `apps/app/src/features/jobs/jobs-site-pin-picker-canvas.tsx`
- Delete `apps/app/src/features/jobs/jobs-site-pin-picker-canvas.test.tsx`
- Modify `apps/app/src/features/jobs/jobs-coverage-map.tsx`
  - Rename “without pin” copy to “without mapped location” for old/unmapped data.
- Modify tests:
  - `packages/jobs-core/src/index.test.ts`
  - `apps/api/src/domains/jobs/sites-service.test.ts`
  - `apps/api/src/domains/jobs/service.test.ts`
  - `apps/api/src/domains/jobs/http.integration.test.ts`
  - `apps/api/src/domains/jobs/repositories.integration.test.ts`
  - `apps/app/src/features/sites/sites-create-sheet.test.tsx`
  - `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
  - `apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
- Modify docs:
  - `docs/architecture/jobs-v1-spec.md`

---

### Task 1: Update Shared Site Contracts

**Files:**
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Test: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write failing shared schema tests**

Add tests to `packages/jobs-core/src/index.test.ts` proving that site creation no longer accepts user-supplied coordinates, requires an Irish address, requires an Eircode for Ireland, and still returns coordinates in site option responses.

```ts
it("creates sites from address fields without accepting client coordinates", () => {
  const site = ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
    name: "Docklands Campus",
    addressLine1: "1 Custom House Quay",
    town: "Dublin",
    county: "Dublin",
    country: "IE",
    eircode: "D01 X2X2",
  });

  expect(site).toStrictEqual({
    name: "Docklands Campus",
    addressLine1: "1 Custom House Quay",
    town: "Dublin",
    county: "Dublin",
    country: "IE",
    eircode: "D01 X2X2",
  });

  expect(() =>
    ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      latitude: 53.3498,
      longitude: -6.2603,
    })
  ).toThrow(/latitude|longitude/);
});

it("requires an Eircode for Irish site creation", () => {
  expect(() =>
    ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
    })
  ).toThrow(/Irish sites require an Eircode/);
});

it("keeps geocoded coordinates on site option responses", () => {
  const siteOption = {
    id: siteId,
    name: "Docklands Campus",
    addressLine1: "1 Custom House Quay",
    county: "Dublin",
    country: "IE",
    eircode: "D01 X2X2",
    latitude: 53.3498,
    longitude: -6.2603,
    geocodingProvider: "google",
    geocodedAt: "2026-04-27T10:00:00.000Z",
  };

  expect(
    ParseResult.decodeUnknownSync(JobSiteOptionSchema)(siteOption)
  ).toStrictEqual(siteOption);
});
```

- [ ] **Step 2: Run the shared schema tests and verify failure**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts
```

Expected: FAIL because `country`, `geocodingProvider`, `geocodedAt`, and `SiteGeocodingFailedError` do not exist yet, and create schemas still accept coordinates.

- [ ] **Step 3: Add site country and geocoding schemas**

In `packages/jobs-core/src/domain.ts`, add:

```ts
export const SITE_COUNTRIES = ["IE", "GB"] as const;
export const SiteCountrySchema = Schema.Literal(...SITE_COUNTRIES);
export type SiteCountry = Schema.Schema.Type<typeof SiteCountrySchema>;

export const SITE_GEOCODING_PROVIDERS = ["google", "stub"] as const;
export const SiteGeocodingProviderSchema = Schema.Literal(
  ...SITE_GEOCODING_PROVIDERS
);
export type SiteGeocodingProvider = Schema.Schema.Type<
  typeof SiteGeocodingProviderSchema
>;
```

- [ ] **Step 4: Replace create-site DTO coordinate input**

In `packages/jobs-core/src/dto.ts`, import the new schemas and replace `CreateSiteInputSchema` with this structure:

```ts
export const CreateSiteInputSchema = Schema.Struct({
  name: Schema.Trim.pipe(Schema.minLength(1)),
  regionId: Schema.optional(RegionId),
  addressLine1: Schema.Trim.pipe(Schema.minLength(1)),
  addressLine2: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
  town: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
  county: Schema.Trim.pipe(Schema.minLength(1)),
  country: SiteCountrySchema,
  eircode: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
  accessNotes: Schema.optional(Schema.Trim.pipe(Schema.minLength(1))),
}).pipe(
  Schema.filter((site) => site.country !== "IE" || site.eircode !== undefined),
  Schema.annotations({
    message: () => "Irish sites require an Eircode",
  })
);
export type CreateSiteInput = Schema.Schema.Type<typeof CreateSiteInputSchema>;
```

Update `JobSiteOptionSchema` so it includes read-only geocoding fields:

```ts
country: SiteCountrySchema,
latitude: Schema.optional(SiteLatitudeSchema),
longitude: Schema.optional(SiteLongitudeSchema),
geocodingProvider: Schema.optional(SiteGeocodingProviderSchema),
geocodedAt: Schema.optional(IsoDateTimeString),
```

- [ ] **Step 5: Add the shared geocoding failure error**

In `packages/jobs-core/src/errors.ts`, add:

```ts
export const SITE_GEOCODING_FAILED_ERROR_TAG =
  "@task-tracker/jobs-core/SiteGeocodingFailedError" as const;
export class SiteGeocodingFailedError extends Schema.TaggedError<SiteGeocodingFailedError>()(
  SITE_GEOCODING_FAILED_ERROR_TAG,
  {
    message: Schema.String,
    country: SiteCountrySchema,
    eircode: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 422 })
) {}
```

Add `SiteGeocodingFailedError` to the `JobsError` union.

- [ ] **Step 6: Add the new error to jobs HTTP contracts**

In `packages/jobs-core/src/http-api.ts`, import `SiteGeocodingFailedError` and add `.addError(SiteGeocodingFailedError)` to:

```ts
HttpApiEndpoint.post("createJob", "/jobs")
HttpApiEndpoint.post("createSite", "/sites")
```

- [ ] **Step 7: Export the new public contract pieces**

In `packages/jobs-core/src/index.ts`, export:

```ts
SITE_COUNTRIES,
SITE_GEOCODING_PROVIDERS,
SiteCountrySchema,
SiteGeocodingProviderSchema,
SITE_GEOCODING_FAILED_ERROR_TAG,
SiteGeocodingFailedError,
```

and the corresponding `SiteCountry` and `SiteGeocodingProvider` types.

- [ ] **Step 8: Run shared package verification**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts
pnpm --filter @task-tracker/jobs-core check-types
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/jobs-core/src/domain.ts packages/jobs-core/src/dto.ts packages/jobs-core/src/errors.ts packages/jobs-core/src/http-api.ts packages/jobs-core/src/index.ts packages/jobs-core/src/index.test.ts
git commit -m "feat: make site coordinates server-derived"
```

---

### Task 2: Add Google Geocoding Boundary

**Files:**
- Create: `apps/api/src/domains/jobs/site-geocoding-config.ts`
- Create: `apps/api/src/domains/jobs/site-geocoder.ts`
- Test: `apps/api/src/domains/jobs/site-geocoder.test.ts`

- [ ] **Step 1: Write geocoder tests**

Create `apps/api/src/domains/jobs/site-geocoder.test.ts` with tests for stub mode, successful Google response decoding, zero-result failure, malformed response failure, and provider request failure.

```ts
import {
  SITE_GEOCODING_FAILED_ERROR_TAG,
  type CreateSiteInput,
} from "@task-tracker/jobs-core";
import { ConfigProvider, Effect, Either } from "effect";

import {
  makeGoogleSiteGeocoder,
  SiteGeocoder,
} from "./site-geocoder.js";

const input = {
  name: "Docklands Campus",
  addressLine1: "1 Custom House Quay",
  town: "Dublin",
  county: "Dublin",
  country: "IE",
  eircode: "D01 X2X2",
} satisfies CreateSiteInput;

describe("SiteGeocoder", () => {
  it("resolves local stub coordinates without a Google key", async () => {
    const result = await Effect.runPromise(
      SiteGeocoder.geocode(input).pipe(
        Effect.provide(SiteGeocoder.Stub)
      )
    );

    expect(result).toStrictEqual({
      latitude: 53.3498,
      longitude: -6.2603,
      provider: "stub",
      geocodedAt: expect.stringMatching(/Z$/),
    });
  });

  it("maps a successful Google geocode response into coordinates", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        status: "OK",
        results: [
          {
            geometry: {
              location: {
                lat: 53.3498053,
                lng: -6.2603097,
              },
            },
          },
        ],
      })
    );

    const result = await Effect.runPromise(
      makeGoogleSiteGeocoder({ fetch }).geocode(input).pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([["GOOGLE_MAPS_API_KEY", "key_123"]])
          )
        )
      )
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("maps.googleapis.com/maps/api/geocode/json"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toMatchObject({
      latitude: 53.3498053,
      longitude: -6.2603097,
      provider: "google",
    });
  });

  it("fails with a domain error when Google returns no results", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        status: "ZERO_RESULTS",
        results: [],
      })
    );

    const result = await Effect.runPromise(
      makeGoogleSiteGeocoder({ fetch }).geocode(input).pipe(
        Effect.either,
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([["GOOGLE_MAPS_API_KEY", "key_123"]])
          )
        )
      )
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe(SITE_GEOCODING_FAILED_ERROR_TAG);
    }
  });
});
```

- [ ] **Step 2: Run geocoder tests and verify failure**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/site-geocoder.test.ts
```

Expected: FAIL because the geocoding files do not exist.

- [ ] **Step 3: Create geocoding config loader**

Create `apps/api/src/domains/jobs/site-geocoding-config.ts`:

```ts
import { Config, Effect } from "effect";

const SITE_GEOCODER_MODES = ["google", "stub"] as const;
export type SiteGeocoderMode = (typeof SITE_GEOCODER_MODES)[number];

export interface SiteGeocodingConfig {
  readonly mode: SiteGeocoderMode;
  readonly googleMapsApiKey: string;
}

const modeConfig = Config.string("SITE_GEOCODER_MODE").pipe(
  Config.withDefault("google"),
  Config.validate({
    message: `SITE_GEOCODER_MODE must be one of ${SITE_GEOCODER_MODES.join(", ")}`,
    validation: (value): value is SiteGeocoderMode =>
      SITE_GEOCODER_MODES.includes(value as SiteGeocoderMode),
  })
);

export const loadSiteGeocodingConfig = Effect.gen(function* () {
  const mode = yield* modeConfig;

  if (mode === "stub") {
    return {
      mode,
      googleMapsApiKey: "",
    } satisfies SiteGeocodingConfig;
  }

  const googleMapsApiKey = yield* Config.string("GOOGLE_MAPS_API_KEY").pipe(
    Config.validate({
      message: "GOOGLE_MAPS_API_KEY must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  );

  return {
    mode,
    googleMapsApiKey,
  } satisfies SiteGeocodingConfig;
});
```

- [ ] **Step 4: Create the geocoder service**

Create `apps/api/src/domains/jobs/site-geocoder.ts`:

```ts
import {
  SiteGeocodingFailedError,
  type CreateSiteInput,
  type SiteGeocodingProvider,
} from "@task-tracker/jobs-core";
import { Effect, Layer } from "effect";

import { loadSiteGeocodingConfig } from "./site-geocoding-config.js";

export interface GeocodedSiteLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly provider: SiteGeocodingProvider;
  readonly geocodedAt: string;
}

export class SiteGeocoder extends Effect.Service<SiteGeocoder>()(
  "@task-tracker/domains/jobs/SiteGeocoder",
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const config = yield* loadSiteGeocodingConfig;

      return config.mode === "stub"
        ? makeStubSiteGeocoder()
        : makeGoogleSiteGeocoder();
    }),
  }
) {
  static readonly Stub = Layer.succeed(SiteGeocoder, makeStubSiteGeocoder());
}

export function makeStubSiteGeocoder() {
  return {
    geocode: (_input: CreateSiteInput) =>
      Effect.sync(
        () =>
          ({
            latitude: 53.3498,
            longitude: -6.2603,
            provider: "stub",
            geocodedAt: new Date().toISOString(),
          }) satisfies GeocodedSiteLocation
      ),
  };
}

export function makeGoogleSiteGeocoder(options?: {
  readonly fetch?: typeof fetch;
}) {
  const requestFetch = options?.fetch ?? fetch;

  return {
    geocode: (input: CreateSiteInput) =>
      Effect.gen(function* () {
        const config = yield* loadSiteGeocodingConfig;
        const url = buildGoogleGeocodingUrl(input, config.googleMapsApiKey);
        const response = yield* Effect.tryPromise({
          try: () => requestFetch(url.toString(), { method: "GET" }),
          catch: (cause) =>
            makeSiteGeocodingFailedError(input, String(cause)),
        });

        if (!response.ok) {
          return yield* Effect.fail(
            makeSiteGeocodingFailedError(
              input,
              `Google Geocoding returned HTTP ${response.status}`
            )
          );
        }

        const payload = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (cause) =>
            makeSiteGeocodingFailedError(input, String(cause)),
        });

        return yield* decodeGoogleGeocodingPayload(input, payload);
      }),
  };
}
```

Add the helper functions in the same file:

```ts
function buildGoogleGeocodingUrl(input: CreateSiteInput, apiKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set(
    "address",
    [
      input.addressLine1,
      input.addressLine2,
      input.town,
      input.county,
      input.eircode,
      input.country === "IE" ? "Ireland" : "United Kingdom",
    ]
      .filter((part): part is string => part !== undefined)
      .join(", ")
  );
  url.searchParams.set("region", input.country.toLowerCase());
  url.searchParams.set("key", apiKey);

  return url;
}

function decodeGoogleGeocodingPayload(
  input: CreateSiteInput,
  payload: unknown
) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("status" in payload) ||
    payload.status !== "OK" ||
    !("results" in payload) ||
    !Array.isArray(payload.results) ||
    payload.results.length === 0
  ) {
    return Effect.fail(
      makeSiteGeocodingFailedError(
        input,
        "Google could not locate the site address"
      )
    );
  }

  const [result] = payload.results;
  const location =
    typeof result === "object" &&
    result !== null &&
    "geometry" in result &&
    typeof result.geometry === "object" &&
    result.geometry !== null &&
    "location" in result.geometry &&
    typeof result.geometry.location === "object" &&
    result.geometry.location !== null
      ? result.geometry.location
      : null;

  const latitude =
    location && "lat" in location && typeof location.lat === "number"
      ? location.lat
      : undefined;
  const longitude =
    location && "lng" in location && typeof location.lng === "number"
      ? location.lng
      : undefined;

  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return Effect.fail(
      makeSiteGeocodingFailedError(
        input,
        "Google returned an invalid site location"
      )
    );
  }

  return Effect.succeed({
    latitude,
    longitude,
    provider: "google" as const,
    geocodedAt: new Date().toISOString(),
  } satisfies GeocodedSiteLocation);
}

function makeSiteGeocodingFailedError(input: CreateSiteInput, cause: string) {
  return new SiteGeocodingFailedError({
    message:
      "We could not locate that site address. Check the Eircode and address details.",
    country: input.country,
    eircode: input.eircode,
  });
}
```

- [ ] **Step 5: Run geocoder verification**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/site-geocoder.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/jobs/site-geocoding-config.ts apps/api/src/domains/jobs/site-geocoder.ts apps/api/src/domains/jobs/site-geocoder.test.ts
git commit -m "feat: add site geocoding service"
```

---

### Task 3: Persist Geocoding Metadata

**Files:**
- Modify: `apps/api/src/domains/jobs/schema.ts`
- Add: `apps/api/drizzle/0007_site-geocoding.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Add: `apps/api/drizzle/meta/0007_snapshot.json`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Test: `apps/api/src/domains/jobs/repositories.integration.test.ts`

- [ ] **Step 1: Write repository integration assertions**

Update the site creation assertions in `apps/api/src/domains/jobs/repositories.integration.test.ts` so created site options include:

```ts
expect(createdSiteOption).toMatchObject({
  addressLine1: "1 Custom House Quay",
  country: "IE",
  eircode: "D01 X2X2",
  latitude: 53.3498,
  longitude: -6.2603,
  geocodingProvider: "google",
  geocodedAt: "2026-04-27T10:00:00.000Z",
});
```

Update repository create calls in the test to pass:

```ts
country: "IE",
eircode: "D01 X2X2",
latitude: 53.3498,
longitude: -6.2603,
geocodingProvider: "google",
geocodedAt: "2026-04-27T10:00:00.000Z",
```

- [ ] **Step 2: Run repository tests and verify failure**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts
```

Expected: FAIL because repository rows and schema do not include the new columns.

- [ ] **Step 3: Add site columns to Drizzle schema**

In `apps/api/src/domains/jobs/schema.ts`, add to the `site` table:

```ts
country: text("country").notNull().default("IE"),
geocodingProvider: text("geocoding_provider"),
geocodedAt: timestamp("geocoded_at", { withTimezone: true }),
```

Add checks:

```ts
check("sites_country_chk", sql`${table.country} in ('IE', 'GB')`),
check(
  "sites_geocoding_provider_chk",
  sql`${table.geocodingProvider} is null or ${table.geocodingProvider} in ('google', 'stub')`
),
check(
  "sites_geocoding_metadata_check",
  sql`(${table.latitude} is null and ${table.longitude} is null and ${table.geocodingProvider} is null and ${table.geocodedAt} is null) or (${table.latitude} is not null and ${table.longitude} is not null and ${table.geocodingProvider} is not null and ${table.geocodedAt} is not null)`
),
```

- [ ] **Step 4: Generate the Drizzle migration**

Run:

```bash
pnpm --filter api db:generate
```

Expected: a new migration adds `country`, `geocoding_provider`, `geocoded_at`, and constraints. Rename it to `0007_site-geocoding.sql` if Drizzle generates a random name.

The SQL must include these operations:

```sql
ALTER TABLE "sites" ADD COLUMN "country" text DEFAULT 'IE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoding_provider" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_country_chk" CHECK ("sites"."country" in ('IE', 'GB'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_provider_chk" CHECK ("sites"."geocoding_provider" is null or "sites"."geocoding_provider" in ('google', 'stub'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_metadata_check" CHECK (("sites"."latitude" is null and "sites"."longitude" is null and "sites"."geocoding_provider" is null and "sites"."geocoded_at" is null) or ("sites"."latitude" is not null and "sites"."longitude" is not null and "sites"."geocoding_provider" is not null and "sites"."geocoded_at" is not null));
```

- [ ] **Step 5: Update repository input and row mapping**

In `apps/api/src/domains/jobs/repositories.ts`, extend `CreateSiteRecordInput`:

```ts
readonly country: SiteCountry;
readonly geocodedAt: string;
readonly geocodingProvider: SiteGeocodingProvider;
```

Add insert fields in `SitesRepository.create`:

```ts
country: input.country,
geocoded_at: input.geocodedAt,
geocoding_provider: input.geocodingProvider,
latitude: input.latitude,
longitude: input.longitude,
```

Extend `JobSiteOptionRow` with:

```ts
readonly country: string;
readonly geocoded_at: string | Date | null;
readonly geocoding_provider: string | null;
```

Select the columns in `listOptions` and `getOptionById`:

```sql
sites.country,
sites.geocoded_at,
sites.geocoding_provider,
```

Map them in `mapJobSiteOptionRow`:

```ts
country: row.country as JobSiteOption["country"],
geocodedAt: nullableToUndefined(
  row.geocoded_at instanceof Date
    ? row.geocoded_at.toISOString()
    : row.geocoded_at
),
geocodingProvider: nullableToUndefined(
  row.geocoding_provider as JobSiteOption["geocodingProvider"] | null
),
```

- [ ] **Step 6: Run repository verification**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domains/jobs/schema.ts apps/api/src/domains/jobs/repositories.ts apps/api/src/domains/jobs/repositories.integration.test.ts apps/api/drizzle
git commit -m "feat: persist site geocoding metadata"
```

---

### Task 4: Geocode Before Site Creation

**Files:**
- Modify: `apps/api/src/domains/jobs/sites-service.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Test: `apps/api/src/domains/jobs/sites-service.test.ts`
- Test: `apps/api/src/domains/jobs/service.test.ts`
- Test: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Write service tests for server-side geocoding**

In `apps/api/src/domains/jobs/sites-service.test.ts`, update the harness with a `SiteGeocoder` mock:

```ts
const siteGeocoder = SiteGeocoder.make({
  geocode: (input) =>
    Effect.sync(() => {
      calls.geocodeSite += 1;
      expect(input).toMatchObject({
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
        eircode: "D01 X2X2",
      });

      return {
        latitude: 53.3498,
        longitude: -6.2603,
        provider: "google" as const,
        geocodedAt: "2026-04-27T10:00:00.000Z",
      };
    }),
});
```

Expect `SitesRepository.create` to receive:

```ts
{
  addressLine1: "1 Custom House Quay",
  county: "Dublin",
  country: "IE",
  eircode: "D01 X2X2",
  geocodedAt: "2026-04-27T10:00:00.000Z",
  geocodingProvider: "google",
  latitude: 53.3498,
  longitude: -6.2603,
}
```

Add a failure test:

```ts
it("does not create the site when address geocoding fails", async () => {
  const harness = makeHarness(makeActor("owner"), {
    geocode: () =>
      Effect.fail(
        new SiteGeocodingFailedError({
          message: "We could not locate that site address.",
          country: "IE",
          eircode: "D01 X2X2",
        })
      ),
  });

  const exit = await runSitesServiceExit(
    SitesService.create({
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
    }),
    harness
  );

  expect(getFailure(exit)?._tag).toBe(SITE_GEOCODING_FAILED_ERROR_TAG);
  expect(harness.calls.createSite).toBe(0);
});
```

Repeat the same pattern in `apps/api/src/domains/jobs/service.test.ts` for inline site creation through `JobsService.create`.

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/sites-service.test.ts src/domains/jobs/service.test.ts
```

Expected: FAIL because services still pass client coordinates and do not depend on `SiteGeocoder`.

- [ ] **Step 3: Geocode standalone site creation**

In `apps/api/src/domains/jobs/sites-service.ts`, import `SiteGeocoder` and add it to dependencies:

```ts
dependencies: [
  CurrentJobsActor.Default,
  JobsAuthorization.Default,
  JobsRepositoriesLive,
  SiteGeocoder.Default,
],
```

Load it inside the service:

```ts
const siteGeocoder = yield* SiteGeocoder;
```

Before `jobsRepository.withTransaction`, run:

```ts
const geocodedLocation = yield* siteGeocoder.geocode(input);
```

Pass derived fields to `sitesRepository.create`:

```ts
country: input.country,
geocodedAt: geocodedLocation.geocodedAt,
geocodingProvider: geocodedLocation.provider,
latitude: geocodedLocation.latitude,
longitude: geocodedLocation.longitude,
```

- [ ] **Step 4: Geocode inline job site creation before opening the transaction**

In `apps/api/src/domains/jobs/service.ts`, import `SiteGeocoder`, add `SiteGeocoder.Default` to dependencies, and load it:

```ts
const siteGeocoder = yield* SiteGeocoder;
```

Before `jobsRepository.withTransaction`, resolve inline geocoding:

```ts
const geocodedInlineSite =
  input.site?.kind === "create"
    ? yield* siteGeocoder.geocode(input.site.input)
    : undefined;
```

Update `resolveCreateSiteId` signature:

```ts
function resolveCreateSiteId(
  organizationId: OrganizationId,
  input: CreateJobSiteInput | undefined,
  geocodedInlineSite: GeocodedSiteLocation | undefined,
  sitesRepository: SitesRepository
)
```

When `input.kind === "create"`, require `geocodedInlineSite` and pass its values to the repository create call:

```ts
country: input.input.country,
geocodedAt: geocodedInlineSite.geocodedAt,
geocodingProvider: geocodedInlineSite.provider,
latitude: geocodedInlineSite.latitude,
longitude: geocodedInlineSite.longitude,
```

- [ ] **Step 5: Provide the geocoder layer to HTTP handlers**

In `apps/api/src/domains/jobs/http.ts`, import `SiteGeocoder` and add:

```ts
Layer.provide(SiteGeocoder.Default),
```

to `JobsHttpLive` after the service layers.

- [ ] **Step 6: Update HTTP integration payloads**

In `apps/api/src/domains/jobs/http.integration.test.ts`, remove client coordinates from `/sites` and inline job site payloads. Add:

```ts
country: "IE",
county: "Dublin",
eircode: "D01 X2X2",
```

Make integration setup use stub geocoding:

```ts
process.env.SITE_GEOCODER_MODE = "stub";
```

Add cleanup for `SITE_GEOCODER_MODE` in the existing previous-env restore helper.

- [ ] **Step 7: Run API verification**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/sites-service.test.ts src/domains/jobs/service.test.ts src/domains/jobs/http.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/domains/jobs/sites-service.ts apps/api/src/domains/jobs/service.ts apps/api/src/domains/jobs/http.ts apps/api/src/domains/jobs/sites-service.test.ts apps/api/src/domains/jobs/service.test.ts apps/api/src/domains/jobs/http.integration.test.ts
git commit -m "feat: geocode sites on create"
```

---

### Task 5: Update Local, Sandbox, and Playwright Runtime

**Files:**
- Modify: `scripts/dev.mjs`
- Modify: `apps/app/playwright.config.ts`
- Modify: `packages/sandbox-core/src/runtime-spec.ts`
- Modify: `packages/sandbox-cli/src/runtime.ts`
- Modify: `packages/sandbox-cli/docker/sandbox.compose.yaml`
- Test: `packages/sandbox-core/src/runtime-spec.test.ts`
- Test: `packages/sandbox-cli/src/lifecycle.test.ts`
- Test: `packages/sandbox-cli/src/cli.test.ts`

- [ ] **Step 1: Write runtime env tests**

Update sandbox runtime tests so generated API env includes:

```ts
SITE_GEOCODER_MODE: "stub",
```

and does not require `GOOGLE_MAPS_API_KEY` for sandbox startup.

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```bash
pnpm --filter @task-tracker/sandbox-core test -- src/runtime-spec.test.ts
pnpm --filter @task-tracker/sandbox-cli test -- src/lifecycle.test.ts src/cli.test.ts
```

Expected: FAIL because sandbox env does not include geocoder mode yet.

- [ ] **Step 3: Add local dev stub mode**

In `scripts/dev.mjs`, add:

```ts
const DEFAULT_SITE_GEOCODER_MODE = "stub";
```

and include in `createDevEnvironment`:

```ts
SITE_GEOCODER_MODE:
  baseEnvironment.SITE_GEOCODER_MODE ?? DEFAULT_SITE_GEOCODER_MODE,
```

- [ ] **Step 4: Add Playwright stub mode**

In `apps/app/playwright.config.ts`, add the API web server env:

```ts
SITE_GEOCODER_MODE: "stub",
```

- [ ] **Step 5: Add sandbox stub mode**

In `packages/sandbox-core/src/runtime-spec.ts`, add to `BaseSandboxRuntimeOverrides`:

```ts
SITE_GEOCODER_MODE: Schema.Literal("stub"),
```

and in `buildSandboxRuntimeOverrides`:

```ts
SITE_GEOCODER_MODE: "stub",
```

In `packages/sandbox-cli/src/runtime.ts`, add `SITE_GEOCODER_MODE: "stub"` to `buildComposeFallbackEnvironmentOverrides`.

In `packages/sandbox-cli/docker/sandbox.compose.yaml`, pass to the API service:

```yaml
SITE_GEOCODER_MODE: ${SITE_GEOCODER_MODE}
```

- [ ] **Step 6: Run runtime verification**

Run:

```bash
pnpm --filter @task-tracker/sandbox-core test -- src/runtime-spec.test.ts
pnpm --filter @task-tracker/sandbox-cli test -- src/lifecycle.test.ts src/cli.test.ts
pnpm --filter @task-tracker/sandbox-core check-types
pnpm --filter @task-tracker/sandbox-cli check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/dev.mjs apps/app/playwright.config.ts packages/sandbox-core/src/runtime-spec.ts packages/sandbox-core/src/runtime-spec.test.ts packages/sandbox-cli/src/runtime.ts packages/sandbox-cli/src/lifecycle.test.ts packages/sandbox-cli/src/cli.test.ts packages/sandbox-cli/docker/sandbox.compose.yaml
git commit -m "chore: use stub site geocoding in dev"
```

---

### Task 6: Remove Frontend Manual Coordinates

**Files:**
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx`
- Delete: `apps/app/src/features/jobs/jobs-site-pin-picker.tsx`
- Delete: `apps/app/src/features/jobs/jobs-site-pin-picker-canvas.tsx`
- Delete: `apps/app/src/features/jobs/jobs-site-pin-picker-canvas.test.tsx`

- [ ] **Step 1: Update UI tests for address-only site creation**

In `apps/app/src/features/sites/sites-create-sheet.test.tsx`, remove typing into Latitude/Longitude and expect:

```ts
expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
expect(screen.queryByLabelText("Longitude")).not.toBeInTheDocument();
```

Update the create expectation:

```ts
expect(mockedCreateSite).toHaveBeenCalledWith({
  addressLine1: "1 Custom House Quay",
  county: "Dublin",
  country: "IE",
  eircode: "D01 X2X2",
  name: "Docklands Campus",
  regionId,
  town: "Dublin",
});
```

Add a validation test:

```ts
it("requires enough address detail before submitting", async () => {
  const user = userEvent.setup();
  render(<SitesCreateSheet />);

  await user.type(screen.getByLabelText("Site name"), "Docklands Campus");
  await user.click(screen.getByRole("button", { name: /create site/i }));

  expect(screen.getByText("Add address line 1.")).toBeInTheDocument();
  expect(screen.getByText("Add county.")).toBeInTheDocument();
  expect(screen.getByText("Add Eircode.")).toBeInTheDocument();
  expect(mockedCreateSite).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run frontend tests and verify failure**

Run:

```bash
pnpm --filter app test -- src/features/sites/sites-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx
```

Expected: FAIL because the form still renders coordinate fields and pin picker.

- [ ] **Step 3: Remove coordinates from standalone site form state**

In `apps/app/src/features/sites/sites-create-sheet.tsx`, remove:

```ts
readonly latitude: string;
readonly longitude: string;
```

from `SitesCreateFormState`, remove coordinate field errors from `SitesCreateFieldErrors`, and add:

```ts
readonly addressLine1?: string;
readonly county?: string;
readonly eircode?: string;
```

to `SitesCreateFieldErrors`.

Set default country in `defaultFormState`:

```ts
country: "IE",
```

Remove `validateCoordinates` and `toOptionalCoordinate`.

- [ ] **Step 4: Validate address fields in standalone site form**

Replace the address validation portion with:

```ts
addressLine1:
  values.addressLine1.trim().length === 0
    ? "Add address line 1."
    : undefined,
county:
  values.county.trim().length === 0 ? "Add county." : undefined,
eircode:
  values.eircode.trim().length === 0 ? "Add Eircode." : undefined,
```

Mark `AuthFormField` instances invalid using the matching field errors.

- [ ] **Step 5: Build standalone site create payload without coordinates**

In `buildCreateSiteInput`, return:

```ts
return {
  accessNotes: toOptionalTrimmedString(values.accessNotes),
  addressLine1: values.addressLine1.trim(),
  addressLine2: toOptionalTrimmedString(values.addressLine2),
  county: values.county.trim(),
  country: "IE",
  eircode: values.eircode.trim(),
  name: values.name.trim(),
  regionId: selectedRegion?.id,
  town: toOptionalTrimmedString(values.town),
};
```

- [ ] **Step 6: Remove inline job pin UI**

In `apps/app/src/features/jobs/jobs-create-sheet.tsx`:

- Remove `JobsSitePinPicker` import.
- Remove `siteLatitude` and `siteLongitude` from form state.
- Remove `parsedSiteCoordinates`, `validateSiteCoordinates`, `resolveSiteCoordinateDraft`, `parseCoordinate`, and `formatCoordinate`.
- Remove the nested `Site location` drawer.
- Replace the current “Location” row with inline address fields inside the create-site drawer.
- Ensure inline create payload includes:

```ts
addressLine1: values.siteAddressLine1.trim(),
county: values.siteCounty.trim(),
country: "IE",
eircode: values.siteEircode.trim(),
```

and does not include `latitude` or `longitude`.

- [ ] **Step 7: Validate inline job site address**

In the `validate(values)` helper, when `values.siteSelection === INLINE_CREATE_VALUE`, add:

```ts
siteAddressLine1:
  values.siteAddressLine1.trim().length === 0
    ? "Add address line 1."
    : undefined,
siteCounty:
  values.siteCounty.trim().length === 0 ? "Add county." : undefined,
siteEircode:
  values.siteEircode.trim().length === 0 ? "Add Eircode." : undefined,
```

Add these fields to the `JobsCreateFieldErrors` interface and wire them to the matching `AuthFormField` components.

- [ ] **Step 8: Delete pin picker files**

Delete:

```bash
apps/app/src/features/jobs/jobs-site-pin-picker.tsx
apps/app/src/features/jobs/jobs-site-pin-picker-canvas.tsx
apps/app/src/features/jobs/jobs-site-pin-picker-canvas.test.tsx
```

Then run:

```bash
rg -n "JobsSitePinPicker|siteLatitude|siteLongitude|Latitude|Longitude" apps/app/src/features/jobs apps/app/src/features/sites
```

Expected: no frontend create form references to manual coordinate entry remain.

- [ ] **Step 9: Run frontend verification**

Run:

```bash
pnpm --filter app test -- src/features/sites/sites-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/app/src/features/sites/sites-create-sheet.tsx apps/app/src/features/sites/sites-create-sheet.test.tsx apps/app/src/features/jobs/jobs-create-sheet.tsx apps/app/src/features/jobs/jobs-detail-sheet.integration.test.tsx
git rm apps/app/src/features/jobs/jobs-site-pin-picker.tsx apps/app/src/features/jobs/jobs-site-pin-picker-canvas.tsx apps/app/src/features/jobs/jobs-site-pin-picker-canvas.test.tsx
git commit -m "feat: remove manual site pin entry"
```

---

### Task 7: Polish Map Copy and Docs

**Files:**
- Modify: `apps/app/src/features/jobs/jobs-coverage-map.tsx`
- Modify: `apps/app/src/features/jobs/jobs-coverage-map.test.tsx`
- Modify: `docs/architecture/jobs-v1-spec.md`

- [ ] **Step 1: Update map copy tests**

In `apps/app/src/features/jobs/jobs-coverage-map.test.tsx`, change expectations from:

```ts
expect(screen.getByText(/1 without pin/i)).toBeInTheDocument();
```

to:

```ts
expect(screen.getByText(/1 without mapped location/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run coverage map tests and verify failure**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-coverage-map.test.tsx
```

Expected: FAIL because copy still says “without pin”.

- [ ] **Step 3: Replace pin wording**

In `apps/app/src/features/jobs/jobs-coverage-map.tsx`, replace user-facing copy:

```tsx
Add a site pin to make this view useful.
```

with:

```tsx
Add a geocoded site address to make this view useful.
```

Replace the unmapped count label with:

```tsx
{unmappedJobs.length} without mapped location
```

- [ ] **Step 4: Document the new location model**

In `docs/architecture/jobs-v1-spec.md`, add a “Site Location Model” section:

```md
### Site Location Model

Site coordinates are server-derived data. Users provide structured address
fields for a site, with Ireland as the current default country. Irish sites
require `addressLine1`, `county`, `country: "IE"`, and `eircode`.

The API geocodes the address before writing the site. If geocoding fails, the
site is not created and the API returns `SiteGeocodingFailedError` with HTTP
422. The frontend never accepts manual latitude or longitude values in normal
site/job creation flows.

Stored `latitude` and `longitude` values are read-only to the UI and are used
by the existing MapLibre map components for previews, coverage maps, and links
out to Google Maps. Google-specific geocoding behavior stays isolated behind
the API `SiteGeocoder` service.
```

- [ ] **Step 5: Run docs and app verification**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-coverage-map.test.tsx
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/jobs/jobs-coverage-map.tsx apps/app/src/features/jobs/jobs-coverage-map.test.tsx docs/architecture/jobs-v1-spec.md
git commit -m "docs: describe geocoded site locations"
```

---

### Task 8: Full Verification

**Files:**
- No new file edits unless verification reveals a defect.

- [ ] **Step 1: Run package-level tests touched by this plan**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test
pnpm --filter api test -- src/domains/jobs/site-geocoder.test.ts src/domains/jobs/sites-service.test.ts src/domains/jobs/service.test.ts src/domains/jobs/repositories.integration.test.ts src/domains/jobs/http.integration.test.ts
pnpm --filter app test -- src/features/sites/sites-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.integration.test.tsx src/features/jobs/jobs-coverage-map.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run type checks**

Run:

```bash
pnpm --filter @task-tracker/jobs-core check-types
pnpm --filter api check-types
pnpm --filter app check-types
pnpm --filter @task-tracker/sandbox-core check-types
pnpm --filter @task-tracker/sandbox-cli check-types
```

Expected: PASS.

- [ ] **Step 3: Run workspace checks**

Run:

```bash
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 4: Boot sandbox and smoke-test site creation**

Run:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Expected: sandbox starts with `SITE_GEOCODER_MODE=stub`; creating a site with address line 1, county, and Eircode succeeds and the created site renders with a map preview/coverage pin.

- [ ] **Step 5: Shut down sandbox**

Run:

```bash
pnpm sandbox:down
```

Expected: sandbox services stop cleanly.

- [ ] **Step 6: Final commit**

```bash
git status --short
git add .
git commit -m "feat: geocode site addresses on the server"
```

---

## Self-Review

**Spec coverage:** This plan removes manual frontend coordinates/pinning from normal site creation, requires structured Irish address data, geocodes on the server, stores derived coordinates, preserves read-only MapLibre rendering, and keeps Google behind a provider boundary.

**Placeholder scan:** No task contains placeholder implementation notes. Every task names exact files, expected commands, and concrete behavior.

**Type consistency:** `country`, `geocodingProvider`, and `geocodedAt` are introduced in shared schemas, persisted in API repository rows, and returned to frontend consumers. Create DTOs do not carry `latitude` or `longitude`; response DTOs still do.

**Residual risks:** Google Geocoding storage/display terms should be reviewed before production launch. The implementation intentionally isolates Google so the provider can be swapped if the terms or cost profile become unsuitable.
