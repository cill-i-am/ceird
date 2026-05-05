import { ParseResult, Schema } from "effect";
import * as Vitest from "vitest";

import type { SiteId } from "./index.js";
import {
  CreateServiceAreaInputSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  ServiceAreaSchema,
  ServiceAreasApiGroup,
  SiteAccessDeniedError,
  SiteGeocodingFailedError,
  SiteNotFoundError,
  SitesApi,
  SitesApiGroup,
  SiteStorageError,
} from "./index.js";

const { describe, expect, it } = Vitest;

describe("sites-core", () => {
  it("decodes site-owned creation DTOs", () => {
    const input = {
      accessNotes: "  Enter via reception  ",
      addressLine1: "  1 Custom House Quay  ",
      addressLine2: "  North Dock  ",
      county: "  Dublin  ",
      country: "IE",
      eircode: "  D01 X2X2  ",
      name: "  Docklands Campus  ",
      town: "  Dublin  ",
    };

    expect(
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)(input)
    ).toStrictEqual({
      accessNotes: "Enter via reception",
      addressLine1: "1 Custom House Quay",
      addressLine2: "North Dock",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      name: "Docklands Campus",
      town: "Dublin",
    });

    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        ...input,
        latitude: 53.3498,
      })
    ).toThrow(/unexpected/);
  });

  it("requires Eircodes only for Irish sites", () => {
    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        name: "Docklands Campus",
      })
    ).toThrow(/Irish sites require an Eircode/);

    expect(
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        addressLine1: "10 Downing Street",
        country: "GB",
        county: "Greater London",
        name: "London Depot",
      })
    ).toStrictEqual({
      addressLine1: "10 Downing Street",
      country: "GB",
      county: "Greater London",
      name: "London Depot",
    });
  });

  it("decodes site responses and service-area contracts", () => {
    const site = {
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-22T10:00:00.000Z",
      geocodingProvider: "google",
      id: "550e8400-e29b-41d4-a716-446655440010",
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
    };

    expect(
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)(site)
    ).toStrictEqual(site);
    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)({
        ...site,
        longitude: -181,
      })
    ).toThrow(/greater than or equal to -180/);

    expect(
      Schema.decodeUnknownSync(CreateServiceAreaInputSchema)({
        description: "  Retail sites  ",
        name: "  Retail  ",
      })
    ).toStrictEqual({
      description: "Retail sites",
      name: "Retail",
    });

    expect(
      Schema.decodeUnknownSync(ServiceAreaSchema)({
        description: "North city",
        id: "33333333-3333-4333-8333-333333333333",
        name: "North Dublin",
      })
    ).toStrictEqual({
      description: "North city",
      id: "33333333-3333-4333-8333-333333333333",
      name: "North Dublin",
    });
  });

  it("exports site API groups and typed errors", () => {
    expect(SitesApi).toBeDefined();
    expect(SitesApiGroup).toBeDefined();
    expect(ServiceAreasApiGroup).toBeDefined();

    expect(
      new SiteNotFoundError({
        message: "Site does not exist",
        siteId: "550e8400-e29b-41d4-a716-446655440010" as SiteId,
      })._tag
    ).toBe("@ceird/sites-core/SiteNotFoundError");
    expect(
      new SiteGeocodingFailedError({
        country: "IE",
        eircode: "D01 X2X2",
        message: "Could not geocode site",
      })._tag
    ).toBe("@ceird/sites-core/SiteGeocodingFailedError");
    expect(new SiteAccessDeniedError({ message: "No access" })._tag).toBe(
      "@ceird/sites-core/SiteAccessDeniedError"
    );
    expect(new SiteStorageError({ message: "Storage failed" })._tag).toBe(
      "@ceird/sites-core/SiteStorageError"
    );
  });
});
