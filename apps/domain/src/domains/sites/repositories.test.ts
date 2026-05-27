import type {
  GoogleAddressComponent,
  GooglePlaceIdType,
} from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";

import { makeSiteLocationValues } from "./repositories.js";

describe("sites repository write values", () => {
  it("serializes Google address components as jsonb text", () => {
    const addressComponents: readonly GoogleAddressComponent[] = [
      {
        languageCode: "en",
        longText: "Ireland",
        shortText: "IE",
        types: ["country", "political"],
      },
    ];

    expect(
      makeSiteLocationValues({
        addressComponents,
        displayLocation: "Ballydonohoe, Co. Kerry, Ireland",
        formattedAddress: "Ballydonohoe, Co. Kerry, Ireland",
        googlePlaceId: "ChIJlzJREVjFWkgRSUYeFQ3ywGw" as GooglePlaceIdType,
        latitude: 52.4875568,
        locationProvider: "google_places",
        locationResolvedAt: "2026-05-27T21:58:04.000Z",
        locationStatus: "google_resolved",
        longitude: -9.5752049,
        rawLocationInput: "Ballydonohoe, Lisselton",
      }).address_components
    ).toBe(JSON.stringify(addressComponents));
  });
});
