import { LabelNotFoundError } from "@ceird/labels-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import type { SitesError } from "./index.js";
import {
  AddSiteCommentInputSchema,
  AssignSiteLabelInputSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  GooglePlaceId,
  SiteAccessDeniedError,
  SiteCommentSchema,
  SiteCommentsResponseSchema,
  SiteListQuerySchema,
  SiteListResponseSchema,
  SiteLocationAutocompleteInputSchema,
  SiteLocationPlaceDetailsInputSchema,
  SiteLocationProviderError,
  SiteLocationResolutionError,
  SiteProximityInputSchema,
  SiteProximityResponseSchema,
  SiteRoutePreviewInputSchema,
  SiteId,
  SiteNotFoundError,
  SiteOptionSchema,
  SitesApi,
  SitesApiGroup,
  SiteStorageError,
  UpdateSiteInputSchema,
} from "./index.js";

describe("sites-core", () => {
  const decodeGooglePlaceId = Schema.decodeUnknownSync(GooglePlaceId);
  const decodeSiteId = Schema.decodeUnknownSync(SiteId);

  it("decodes site creation DTOs", () => {
    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        name: "  North Gate Works  ",
      })
    ).toStrictEqual({
      name: "North Gate Works",
    });

    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        accessNotes: "  Enter beside the old quarry gate  ",
        location: {
          country: "IE",
          kind: "manual",
          rawInput: "  near the old quarry gate  ",
        },
        name: "  Road entrance  ",
      })
    ).toStrictEqual({
      accessNotes: "Enter beside the old quarry gate",
      location: {
        country: "IE",
        kind: "manual",
        rawInput: "near the old quarry gate",
      },
      name: "Road entrance",
    });

    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        location: {
          displayText: "Dublin Port",
          kind: "google_place",
          placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          rawInput: "dub port",
          secondaryText: "Dublin, Ireland",
          sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        },
        name: "Dublin Port",
      })
    ).toMatchObject({
      location: {
        kind: "google_place",
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      },
    });

    expect(() =>
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        location: {
          displayText: "Dublin Port",
          kind: "google_place",
          latitude: 53.3498,
          placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
          rawInput: "dub port",
          sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        },
        name: "Dublin Port",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("decodes site location lookup inputs", () => {
    expect(
      Schema.decodeUnknownSync(SiteLocationAutocompleteInputSchema)({
        country: "IE",
        input: "  dub port  ",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toStrictEqual({
      country: "IE",
      input: "dub port",
      sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(
      Schema.decodeUnknownSync(SiteLocationPlaceDetailsInputSchema)({
        placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
        rawInput: "  dub port  ",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toStrictEqual({
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      rawInput: "dub port",
      sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(() =>
      Schema.decodeUnknownSync(SiteLocationPlaceDetailsInputSchema)({
        placeId: "places/ChIJN1t_tDeuEmsRUsoyG83frY4",
        rawInput: "dub port",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      })
    ).toThrow(/single URL path segment/);
  });

  it("decodes explicit site location clearing on update", () => {
    expect(
      Schema.decodeUnknownSync(UpdateSiteInputSchema)({
        location: null,
        name: "Docklands Campus",
      })
    ).toStrictEqual({
      location: null,
      name: "Docklands Campus",
    });
  });

  it("decodes site responses", () => {
    const unverifiedSite = {
      displayLocation: "near the old quarry gate",
      hasUsableCoordinates: false,
      id: "550e8400-e29b-41d4-a716-446655440010",
      labels: [],
      locationStatus: "unverified",
      name: "Road entrance",
      rawLocationInput: "near the old quarry gate",
    };
    const resolvedSite = {
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
      googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      hasUsableCoordinates: true,
      id: "550e8400-e29b-41d4-a716-446655440010",
      labels: [
        {
          createdAt: "2026-05-16T10:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fire safety",
          updatedAt: "2026-05-16T10:05:00.000Z",
        },
      ],
      latitude: 53.3478,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.1956,
      name: "Dublin Port",
      rawLocationInput: "dub port",
    };

    expect(
      Schema.decodeUnknownSync(SiteOptionSchema)(unverifiedSite)
    ).toStrictEqual(unverifiedSite);
    expect(
      Schema.decodeUnknownSync(CreateSiteResponseSchema)(resolvedSite)
    ).toStrictEqual(resolvedSite);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...resolvedSite,
        longitude: -181,
      })
    ).toThrow(/greater than or equal to -180/);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...resolvedSite,
        hasUsableCoordinates: false,
      })
    ).toThrow(/location fields are inconsistent/);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...resolvedSite,
        googlePlaceId: undefined,
      })
    ).toThrow(/location fields are inconsistent/);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...unverifiedSite,
        hasUsableCoordinates: false,
        latitude: 53.3498,
        longitude: -6.2603,
      })
    ).toThrow(/location fields are inconsistent/);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...unverifiedSite,
        hasUsableCoordinates: false,
        latitude: 53.3498,
      })
    ).toThrow(/location fields are inconsistent/);
  });

  it("decodes site comment contracts", () => {
    const decodeInput = Schema.decodeUnknownSync(AddSiteCommentInputSchema);
    const decodeComment = Schema.decodeUnknownSync(SiteCommentSchema);
    const decodeResponse = Schema.decodeUnknownSync(SiteCommentsResponseSchema);

    const comment = decodeComment({
      id: "77777777-7777-4777-8777-777777777777",
      siteId: "22222222-2222-4222-8222-222222222222",
      authorUserId: "user_123",
      authorName: "Ciara",
      body: "Gate code changed.",
      createdAt: "2026-05-16T09:30:00.000Z",
    });

    expect(decodeInput({ body: "  Use north gate.  " })).toStrictEqual({
      body: "Use north gate.",
    });
    expect(decodeResponse({ comments: [comment] })).toStrictEqual({
      comments: [comment],
    });
  });

  it("documents site comment and label API operations", () => {
    const spec = OpenApi.fromApi(SitesApi);
    const siteComments = spec.paths["/sites/{siteId}/comments"];
    const autocompleteOperation =
      spec.paths["/sites/location/autocomplete"]?.post;
    const placeDetailsOperation =
      spec.paths["/sites/location/place-details"]?.post;
    const assignOperation = spec.paths["/sites/{siteId}/labels"]?.post;
    const removeOperation =
      spec.paths["/sites/{siteId}/labels/{labelId}"]?.delete;

    expect(autocompleteOperation?.operationId).toBe(
      "sites.autocompleteSiteLocation"
    );
    expect(placeDetailsOperation?.operationId).toBe(
      "sites.getSiteLocationPlaceDetails"
    );
    expect(spec.paths["/sites/proximity"]?.post?.operationId).toBe(
      "sites.rankNearbySites"
    );
    expect(spec.paths["/sites/{siteId}/route-preview"]?.post?.operationId).toBe(
      "sites.getSiteRoutePreview"
    );
    expect(siteComments?.get?.operationId).toBe("sites.listSiteComments");
    expect(siteComments?.post?.operationId).toBe("sites.addSiteComment");
    expect(assignOperation?.operationId).toBe("sites.assignSiteLabel");
    expect(removeOperation?.operationId).toBe("sites.removeSiteLabel");
  });

  it("decodes site label assignment DTOs", () => {
    expect(
      Schema.decodeUnknownSync(AssignSiteLabelInputSchema)({
        labelId: "11111111-1111-4111-8111-111111111111",
      })
    ).toStrictEqual({
      labelId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("decodes route-aware site proximity contracts", () => {
    const origin = {
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      displayText: "Grand Canal Dock, Dublin, Ireland",
      mode: "typed_origin",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    };
    const decodedInput = Schema.decodeUnknownSync(SiteProximityInputSchema)({
      filters: { query: "  docklands  " },
      includeRouteLines: true,
      limit: 10,
      origin,
    });

    expect(decodedInput.filters?.query).toBe("docklands");
    expect(decodedInput.limit).toBe(10);

    expect(() =>
      Schema.decodeUnknownSync(SiteProximityInputSchema)({
        limit: 26,
        origin,
      })
    ).toThrow(/less than or equal to 25/);

    expect(
      Schema.decodeUnknownSync(SiteRoutePreviewInputSchema)({
        includeRouteLine: true,
        origin,
      })
    ).toStrictEqual({ includeRouteLine: true, origin });

    const response = Schema.decodeUnknownSync(SiteProximityResponseSchema)({
      meta: {
        candidateCount: 1,
        candidateLimitApplied: false,
        excluded: [],
        rankedCandidateLimit: 100,
      },
      origin: {
        computedAt: "2026-06-06T10:00:00.000Z",
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        displayText: "Grand Canal Dock, Dublin, Ireland",
        mode: "typed_origin",
      },
      rows: [
        {
          activeJobCount: 2,
          highestActiveJobPriority: "urgent",
          routeLine: {
            coordinates: [
              { latitude: 53.349_805, longitude: -6.260_31 },
              { latitude: 53.342_886, longitude: -6.267_428 },
            ],
            format: "geojson_linestring",
          },
          routeSummary: {
            computedAt: "2026-06-06T10:00:00.000Z",
            distanceMeters: 4200,
            durationSeconds: 840,
            provider: "google_routes",
            providerRequestKind: "matrix",
            routeStatus: "ok",
            trafficAware: true,
          },
          site: {
            displayLocation: "Dublin 8",
            googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
            hasUsableCoordinates: true,
            id: "22222222-2222-4222-8222-222222222222",
            labels: [],
            latitude: 53.342_886,
            locationProvider: "google_places",
            locationResolvedAt: "2026-06-06T09:00:00.000Z",
            locationStatus: "google_resolved",
            longitude: -6.267_428,
            name: "Dublin Boiler Room",
          },
        },
      ],
    });

    expect(response.rows[0]?.activeJobCount).toBe(2);
  });

  it("exports site API groups and typed errors", () => {
    expect(SitesApi).toBeDefined();
    expect(SitesApiGroup.identifier).toBe("sites");

    const spec = OpenApi.fromApi(SitesApi);
    expect(spec.paths["/sites"]?.get?.operationId).toBe("sites.listSites");
    expect(spec.paths["/sites/options"]?.get?.operationId).toBe(
      "sites.getSiteOptions"
    );

    expect(
      new SiteNotFoundError({
        message: "Site does not exist",
        siteId: decodeSiteId("550e8400-e29b-41d4-a716-446655440010"),
      })._tag
    ).toBe("@ceird/sites-core/SiteNotFoundError");
    expect(
      new SiteLocationResolutionError({
        message: "Location could not be resolved",
        operation: "place_details",
        placeId: decodeGooglePlaceId("ChIJmissing"),
        provider: "google_places",
      })._tag
    ).toBe("@ceird/sites-core/SiteLocationResolutionError");
    expect(
      new SiteLocationProviderError({
        message: "Location provider failed",
        operation: "autocomplete",
        provider: "google_places",
        providerStatus: "REQUEST_DENIED",
        reason: "http_error",
      })._tag
    ).toBe("@ceird/sites-core/SiteLocationProviderError");
    expect(new SiteAccessDeniedError({ message: "No access" })._tag).toBe(
      "@ceird/sites-core/SiteAccessDeniedError"
    );
    expect(new SiteStorageError({ message: "Storage failed" })._tag).toBe(
      "@ceird/sites-core/SiteStorageError"
    );
    const labelError: SitesError = new LabelNotFoundError({
      message: "Label does not exist",
    });
    expect(labelError._tag).toBe("@ceird/labels-core/LabelNotFoundError");
  });

  it("decodes cursor-paginated site list requests and responses", () => {
    const cursor = Buffer.from(
      JSON.stringify({
        id: "550e8400-e29b-41d4-a716-446655440010",
        name: "Docklands Campus",
        organizationId: "org_123",
      })
    ).toString("base64url");

    expect(
      Schema.decodeUnknownSync(SiteListQuerySchema)({
        cursor,
        limit: "25",
      })
    ).toStrictEqual({
      cursor,
      limit: 25,
    });
    expect(() =>
      Schema.decodeUnknownSync(SiteListQuerySchema)({
        unexpectedFilter: "550e8400-e29b-41d4-a716-446655440010",
        limit: "25",
      })
    ).toThrow(/[Uu]nexpected/);

    expect(
      Schema.decodeUnknownSync(SiteListResponseSchema)({
        items: [
          {
            displayLocation: "Dublin Port",
            hasUsableCoordinates: true,
            id: "550e8400-e29b-41d4-a716-446655440010",
            labels: [],
            latitude: 53.3498,
            googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
            locationProvider: "google_places",
            locationResolvedAt: "2026-05-26T08:00:00.000Z",
            locationStatus: "google_resolved",
            longitude: -6.2603,
            name: "Dublin Port",
          },
        ],
        nextCursor: cursor,
      })
    ).toMatchObject({
      items: [
        {
          name: "Dublin Port",
        },
      ],
      nextCursor: cursor,
    });
  });
});
