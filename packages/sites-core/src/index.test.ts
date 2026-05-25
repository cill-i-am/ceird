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
  SiteAccessDeniedError,
  SiteCommentSchema,
  SiteCommentsResponseSchema,
  SiteGeocodingFailedError,
  SiteGeocodingProviderError,
  SiteListQuerySchema,
  SiteListResponseSchema,
  SiteId,
  SiteNotFoundError,
  SitesApi,
  SitesApiGroup,
  SiteStorageError,
} from "./index.js";

describe("sites-core", () => {
  const decodeSiteId = Schema.decodeUnknownSync(SiteId);

  it("decodes site creation DTOs", () => {
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
      Schema.decodeUnknownSync(CreateSiteInputSchema)(input)
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
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        ...input,
        latitude: 53.3498,
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("requires Eircodes only for Irish sites", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        name: "Docklands Campus",
      })
    ).toThrow(/Irish sites require an Eircode/);

    expect(
      Schema.decodeUnknownSync(CreateSiteInputSchema)({
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

  it("decodes site responses", () => {
    const site = {
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-22T10:00:00.000Z",
      geocodingProvider: "google",
      id: "550e8400-e29b-41d4-a716-446655440010",
      labels: [
        {
          createdAt: "2026-05-16T10:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          name: "Fire safety",
          updatedAt: "2026-05-16T10:05:00.000Z",
        },
      ],
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
    };

    expect(
      Schema.decodeUnknownSync(CreateSiteResponseSchema)(site)
    ).toStrictEqual(site);
    expect(() =>
      Schema.decodeUnknownSync(CreateSiteResponseSchema)({
        ...site,
        longitude: -181,
      })
    ).toThrow(/greater than or equal to -180/);
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
    const assignOperation = spec.paths["/sites/{siteId}/labels"]?.post;
    const removeOperation =
      spec.paths["/sites/{siteId}/labels/{labelId}"]?.delete;

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
      new SiteGeocodingFailedError({
        country: "IE",
        eircode: "D01 X2X2",
        message: "Could not geocode site",
      })._tag
    ).toBe("@ceird/sites-core/SiteGeocodingFailedError");
    expect(
      new SiteGeocodingProviderError({
        country: "IE",
        eircode: "D01 X2X2",
        message: "Site geocoding provider failed",
        providerStatus: "REQUEST_DENIED",
        reason: "provider_status_not_ok",
      })._tag
    ).toBe("@ceird/sites-core/SiteGeocodingProviderError");
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
            addressLine1: "1 Custom House Quay",
            county: "Dublin",
            country: "IE",
            eircode: "D01 X2X2",
            geocodedAt: "2026-04-22T10:00:00.000Z",
            geocodingProvider: "google",
            id: "550e8400-e29b-41d4-a716-446655440010",
            labels: [],
            latitude: 53.3498,
            longitude: -6.2603,
            name: "Docklands Campus",
          },
        ],
        nextCursor: cursor,
      })
    ).toMatchObject({
      items: [
        {
          name: "Docklands Campus",
        },
      ],
      nextCursor: cursor,
    });
  });
});
