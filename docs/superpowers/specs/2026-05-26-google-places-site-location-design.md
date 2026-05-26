# Google Places Site Location Design

## Purpose

Site creation should be fast enough for real construction work, where the user
may only know a partial location, site nickname, nearby road, entrance, or
customer-provided description. Ceird should lean fully into Google for address
collection and normalization when a Google place is selected, but it should not
block site creation when the location is incomplete.

This design replaces the current strict address-and-geocode gate with a
Places-first location model. Sites can be saved with a Google-resolved location
or an **Unverified Location**. The model is shaped so future Address Validation
and location-aware agent queries can be added without changing the meaning of a
site.

## Goals

- Let users create and update sites from partial location information.
- Use Google Places Autocomplete and Place Details as the primary location
  collection path.
- Store Google place identity, formatted address, address components, and
  coordinates when a suggestion is selected.
- Preserve the user's original location text even when Google resolves it.
- Make unresolved locations useful but visibly marked as **Unverified
  Location**.
- Keep maps and future radius queries limited to sites with usable coordinates.
- Keep Address Validation explicitly deferred but planned for, with storage and
  service boundaries that can support it later.
- Keep Google keys, field masks, rate limiting, billing observability, and
  provider failures on the server side.

## Non-Goals

- Do not make postal-address validation mandatory for site creation.
- Do not build Address Validation in the first pass.
- Do not build the full agent query, "jobs within X kilometers of my location,
  ordered by severity", in this slice.
- Do not expose raw latitude/longitude editing as the default site creation
  path.
- Do not preserve the current required `addressLine1`, `county`, Irish
  `eircode`, latitude, and longitude constraints as compatibility shims.

## Product Model

Ceird should treat a site location as a working operational fact, not a
postal-address gate. A user can create a site with a name and whatever location
text they have. If they select a Google suggestion, Ceird stores a resolved
Google-backed location. If they do not, Ceird stores their text and marks the
site as **Unverified Location**.

Location status should be first class:

- `unverified`: user-provided partial or manual location, no trusted coordinate
  yet.
- `google_resolved`: selected Google place with usable coordinate and component
  data.
- `manually_adjusted`: user corrected or confirmed a site point or address
  manually.
- future `validated`: Address Validation verdict accepted.
- future `needs_review`: validation, place, or manually confirmed data failed
  or conflicted.

This model lets Ceird be honest about location quality without turning
uncertainty into a blocking error. Future agent responses can include only
coordinate-backed jobs for distance queries and explain which jobs were excluded
because their site locations are unverified.

## Address Validation Direction

Address Validation should be added later as a verification layer, not as the
first creation mechanism. It is best suited to checking postal-address quality
when Ceird needs higher confidence, such as before dispatch, before an agent
performs a distance-sensitive query, or when a user explicitly asks to verify a
site.

The first version should still prepare for Address Validation:

- reserve room for validation status, verdict, granularity, provider payload
  summaries, and validation timestamps;
- keep a provider-neutral location service boundary so validation can be added
  beside Places;
- persist original input, Google place fields, and resolved components so future
  validation can compare user input, Places output, and validation verdicts;
- design the UI status language so `validated` is an additive improvement over
  `google_resolved`, not a rewrite of the flow.

Future validation should be SKU-aware. Google bills a successful
`ValidateAddress` request under Address Validation SKUs, and an Autocomplete
session that terminates in `ValidateAddress` uses the Address Validation
Enterprise session path. Ceird should choose deliberately between validating
inside the autocomplete session, validating after Place Details as a separate
operation, validating on demand, or validating only for high-confidence
workflows.

## API And Data Shape

The shared site create/update contract should accept a location payload rather
than individual required address fields:

```ts
type SiteLocationInput =
  | {
      kind: "google_place";
      placeId: string;
      sessionToken: string;
      displayText: string;
      secondaryText?: string;
      rawInput: string;
    }
  | {
      kind: "manual";
      rawInput: string;
      country?: "IE" | "GB";
    };
```

For `google_place`, the domain should call Google Place Details server-side with
a narrow field mask. Store the selected place's stable identity and display
data, including:

- Google place id;
- original user input;
- display text and secondary text used in the picker;
- formatted address;
- address components;
- latitude and longitude;
- optional viewport or bounds when returned;
- provider name and resolved timestamp;
- location status `google_resolved`.

For `manual`, the domain should store:

- original user input;
- optional country;
- no coordinates;
- provider fields left empty;
- location status `unverified`.

Site response DTOs should expose:

```ts
locationStatus: "unverified" |
  "google_resolved" |
  "manually_adjusted" |
  "validated" |
  "needs_review";
hasUsableCoordinates: boolean;
displayLocation: string;
```

Existing address fields can remain as derived display fields where useful, but
they should no longer be the source of truth for creation.

The browser should not submit Google provider payloads as trusted data. It may
submit a `placeId`, session token, display text, raw input, and a server-issued
selection reference if the implementation caches Place Details results. The
domain service remains responsible for resolving or loading the trusted provider
data that gets persisted.

## Google Boundary

Ceird should not put a broad Google key in the browser. Add authenticated,
server-side location endpoints or equivalent server functions:

- `POST /sites/location/autocomplete`
- `POST /sites/location/place-details`
- later `POST /sites/:siteId/location/validate`

The app should generate a fresh session token per address search session and
pass it through autocomplete and details requests. The autocomplete endpoint
returns predictions. The Place Details endpoint can finalize a selected
prediction for preview and may return a short-lived server-resolved selection
reference for create/update. If the implementation does not cache finalized
selections, create/update can resolve Place Details on save instead. The
implementation should avoid calling Place Details twice for the same selection.

The server owns:

- field masks;
- country/location bias policy;
- request timeout and provider error handling;
- cost-aware logging;
- rate limiting;
- response decoding with Effect `Schema`;
- provider abstraction for local stub behavior and tests.

The Google Places documentation says autocomplete is built around partial user
input and predictions, Place Details returns requested place fields through
field masks, and session tokens group autocomplete with the request that
terminates the session. This design follows that model while keeping the final
site record inside Ceird's domain contract.

## UX Design

Site create and edit should use one compact **Location** control rather than
separate address-line, town, county, and Eircode inputs.

Default site creation fields:

- `Site name`
- `Location`
- `Access notes`

The Location control behaves like a command-style combobox:

- As the user types, Google suggestions appear.
- Selecting a suggestion shows a confirmed preview with the place name or
  formatted address, locality, and a `Google resolved` badge.
- Keeping typed text without selecting a suggestion is allowed and saves the
  site with an `Unverified Location` badge.
- Empty location is allowed if the site has a name, and the site is still
  marked `Unverified Location`.
- If Google lookup fails, the user can save the typed value as unverified or try
  again.

On edit, the location section should show current status and allow the user to
search again, replace with a Google place, or keep/edit manual text. Later, the
same section can add `Verify address` without redesigning the form.

The status copy should be calm and operational:

- `Unverified Location`: saved from user-entered text, not map-ready yet.
- `Google resolved`: selected from Google and map-ready.
- `Manually adjusted`: map-ready because a user corrected or confirmed it.
- future `Validated`: checked by Address Validation.
- future `Needs review`: conflicting or stale provider data.

## Maps, Jobs, And Agent Readiness

Maps should render only sites with usable coordinates. Sites with unverified
locations remain visible in lists, detail sheets, job selectors, and search
results, but map surfaces should show a clear count or rail section for
unverified locations.

Future spatial job queries can build on this shape:

```ts
origin: {
  latitude: number;
  longitude: number;
}
radiusKm: number;
sort: "severity_distance" | "distance" | "severity";
```

For "give me all of the jobs within X kilometers of my location, ordered by
severity", the future query should:

- require user consent before using current device location;
- filter jobs through sites with `hasUsableCoordinates`;
- compute distance in the domain repository layer;
- sort by severity first, then distance when requested;
- include an explanation of excluded jobs when sites are unverified;
- return enough site display data for the agent to produce a useful answer
  without leaking provider internals.

Severity can start from existing job status and priority, with blocked and
urgent jobs ranked above routine work. A later dispatch model can add richer
severity scoring without changing site location persistence.

## Error Handling

Provider errors should preserve user momentum:

- Autocomplete failure: keep the input usable and explain that lookup is
  unavailable.
- Place Details failure: offer to save the typed location as unverified.
- Zero results: offer to save as unverified or adjust the search.
- Schema/provider parse failure: log as provider/storage context, not a user
  validation error.
- Missing or invalid session token: reject the Google-place payload and ask the
  app to restart the location search session.

Example copy:

- "Google location lookup is unavailable. Save this site as unverified or try
  again."
- "We could not resolve that selection. Save the typed location as unverified or
  search again."

## Migration And Rollout

This project is greenfield and unreleased, so the implementation should make a
clean schema change rather than preserve awkward compatibility. Existing rows
can migrate based on available metadata:

- rows with Google geocoding metadata and coordinates become `google_resolved`
  when the existing data is trustworthy enough;
- rows with coordinates but no place identity can become `manually_adjusted`;
- rows without usable coordinates become `unverified`;
- old structured address fields can be folded into `displayLocation` and
  `rawLocationInput`.

The current database constraints requiring address line 1, county, Irish
Eircode, latitude, longitude, geocoding provider, and geocoded timestamp should
be relaxed or replaced with constraints that match the location status.

## Testing

Coverage should include:

- shared schemas for `google_place` and `manual` location inputs;
- location status response decoding;
- domain enrichment of selected places through a mocked Google location service;
- partial/manual site creation without coordinates;
- Google provider failure fallback to unverified save;
- list, detail, and option responses for unverified and resolved sites;
- map behavior that excludes unverified locations but keeps them visible in
  non-map UI;
- inline site creation from the job create sheet;
- agent action schema compatibility for site create/update;
- migration tests for existing site rows;
- future-ready tests that make spatial queries depend on
  `hasUsableCoordinates`.

## Documentation Updates During Implementation

When implemented, update:

- `docs/architecture/jobs-v1-spec.md` for the new site location model and map
  behavior;
- `docs/architecture/packages.md` for the changed `@ceird/sites-core` contract;
- `docs/architecture/api.md` for the Google location service, server-side
  endpoints, and provider errors;
- `docs/architecture/frontend.md` for the new site location control and
  keyboard behavior.

## References

- Google Places Autocomplete documentation:
  <https://developers.google.com/maps/documentation/places/web-service/place-autocomplete>
- Google Place Details documentation:
  <https://developers.google.com/maps/documentation/places/web-service/place-details>
- Google Places session token guidance:
  <https://developers.google.com/maps/documentation/places/web-service/using-session-tokens>
- Google Places session pricing:
  <https://developers.google.com/maps/documentation/places/web-service/session-pricing>
- Google Maps Platform SKU details:
  <https://developers.google.com/maps/billing-and-pricing/sku-details>
- Google Maps Platform pricing:
  <https://developers.google.com/maps/billing-and-pricing/pricing>
