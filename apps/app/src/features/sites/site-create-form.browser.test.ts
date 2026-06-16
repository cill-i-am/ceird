import type {
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  SiteIdType,
} from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";

import {
  buildCreateSiteInputFromDraft,
  buildUpdateSiteInputFromDraft,
  createDefaultSiteCreateDraft,
  createSiteCreateDraftFromSite,
  siteCreateDraftLocationEqualsSite,
  validateSiteCreateDraft,
} from "./site-create-form";

function createDraft(
  patch: Partial<ReturnType<typeof createDefaultSiteCreateDraft>>
) {
  return {
    ...createDefaultSiteCreateDraft(),
    ...patch,
  };
}

describe("site create form helpers", () => {
  it("builds manual unverified location input from typed text", () => {
    expect(
      buildCreateSiteInputFromDraft(
        createDraft({
          country: "GB",
          locationInput: "  10 Downing Street  ",
          name: "  London Depot  ",
        })
      )
    ).toStrictEqual({
      location: {
        country: "GB",
        kind: "manual",
        rawInput: "10 Downing Street",
      },
      name: "London Depot",
    });
  });

  it("can omit location when preserving an existing site location", () => {
    expect(
      buildCreateSiteInputFromDraft(
        createDraft({
          locationInput: "Dublin Port",
          name: "Docklands Campus",
        }),
        { includeLocation: false }
      )
    ).toStrictEqual({
      name: "Docklands Campus",
    });
  });

  it("builds selected Google location input with the session token", () => {
    expect(
      buildCreateSiteInputFromDraft(
        createDraft({
          locationInput: "Dublin Port",
          locationSelection: {
            displayText: "Dublin Port",
            placeId: "ChIJabc" as GooglePlaceIdType,
            rawInput: "dub port",
            secondaryText: "Dublin, Ireland",
            sessionToken:
              "550e8400-e29b-41d4-a716-446655440000" as GooglePlacesSessionTokenType,
          },
          name: "Dublin Port",
        })
      )
    ).toStrictEqual({
      location: {
        displayText: "Dublin Port",
        kind: "google_place",
        placeId: "ChIJabc",
        rawInput: "dub port",
        secondaryText: "Dublin, Ireland",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
      },
      name: "Dublin Port",
    });
  });

  it("can explicitly clear a location on site update", () => {
    expect(
      buildUpdateSiteInputFromDraft(
        createDraft({
          locationInput: "   ",
          name: "Docklands Campus",
        }),
        { clearEmptyLocation: true }
      )
    ).toStrictEqual({
      location: null,
      name: "Docklands Campus",
    });
  });

  it("hydrates site location drafts and detects unchanged Google locations", () => {
    const siteDraft = createSiteCreateDraftFromSite({
      displayLocation: "Dublin Port",
      formattedAddress: "Dublin Port, Dublin, Ireland",
      googlePlaceId: "ChIJabc" as GooglePlaceIdType,
      hasUsableCoordinates: true,
      id: "550e8400-e29b-41d4-a716-446655440010" as SiteIdType,
      labels: [],
      latitude: 53.3478,
      locationProvider: "google_places",
      locationResolvedAt: "2026-05-26T08:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.1956,
      name: "Dublin Port",
      rawLocationInput: "dub port",
      updatedAt: "2026-05-26T08:05:00.000Z",
    });

    expect(siteDraft.locationSelection).toMatchObject({
      displayText: "Dublin Port",
      placeId: "ChIJabc",
      rawInput: "dub port",
    });
    expect(
      siteCreateDraftLocationEqualsSite(siteDraft, {
        displayLocation: "Dublin Port",
        formattedAddress: "Dublin Port, Dublin, Ireland",
        googlePlaceId: "ChIJabc" as GooglePlaceIdType,
        hasUsableCoordinates: true,
        id: "550e8400-e29b-41d4-a716-446655440010" as SiteIdType,
        labels: [],
        latitude: 53.3478,
        locationProvider: "google_places",
        locationResolvedAt: "2026-05-26T08:00:00.000Z",
        locationStatus: "google_resolved",
        longitude: -6.1956,
        name: "Dublin Port",
        rawLocationInput: "dub port",
        updatedAt: "2026-05-26T08:05:00.000Z",
      })
    ).toBe(true);
    expect(
      siteCreateDraftLocationEqualsSite(
        { ...siteDraft, locationSelection: null },
        {
          displayLocation: "Dublin Port",
          formattedAddress: "Dublin Port, Dublin, Ireland",
          googlePlaceId: "ChIJabc" as GooglePlaceIdType,
          hasUsableCoordinates: true,
          id: "550e8400-e29b-41d4-a716-446655440010" as SiteIdType,
          labels: [],
          latitude: 53.3478,
          locationProvider: "google_places",
          locationResolvedAt: "2026-05-26T08:00:00.000Z",
          locationStatus: "google_resolved",
          longitude: -6.1956,
          name: "Dublin Port",
          rawLocationInput: "dub port",
          updatedAt: "2026-05-26T08:05:00.000Z",
        }
      )
    ).toBe(false);
  });

  it("requires only the site name", () => {
    expect(
      validateSiteCreateDraft(
        createDraft({
          locationInput: "10 Downing Street",
          name: "London Depot",
        })
      )
    ).toStrictEqual({
      name: undefined,
    });

    expect(
      validateSiteCreateDraft(
        createDraft({
          locationInput: "North Wall",
          name: "",
        })
      ).name
    ).toBe("Add a site name before creating it.");
  });
});
