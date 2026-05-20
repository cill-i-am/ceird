import { LabelNotFoundError } from "@ceird/labels-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import type { SiteId, SitesError } from "./index.js";
import {
  AddSiteCommentInputSchema,
  AssignSiteLabelInputSchema,
  CreateServiceAreaInputSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  ServiceAreaSchema,
  ServiceAreasApiGroup,
  SiteAccessDeniedError,
  SiteListQuerySchema,
  SiteListResponseSchema,
  SiteGeocodingFailedError,
  SiteGeocodingProviderError,
  SiteCommentSchema,
  SiteCommentsResponseSchema,
  SiteNotFoundError,
  SitesApi,
  SitesApiGroup,
  SiteStorageError,
} from "./index.js";

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

  it("decodes site responses and service-area contracts", () => {
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

  it("documents site comment API operations", () => {
    const spec = OpenApi.fromApi(SitesApi);
    const siteComments = spec.paths["/sites/{siteId}/comments"];

    expect(siteComments?.get?.operationId).toBe("sites.listSiteComments");
    expect(siteComments?.get?.responses["200"]).toBeDefined();
    expect(siteComments?.get?.responses["403"]).toBeDefined();
    expect(siteComments?.get?.responses["404"]).toBeDefined();
    expect(siteComments?.post?.operationId).toBe("sites.addSiteComment");
    expect(siteComments?.post?.requestBody).toBeDefined();
    expect(siteComments?.post?.responses["201"]).toBeDefined();
    expect(siteComments?.post?.responses["403"]).toBeDefined();
    expect(siteComments?.post?.responses["404"]).toBeDefined();
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

  it("documents site label assignment operations", () => {
    const spec = OpenApi.fromApi(SitesApi);
    const assignOperation = spec.paths["/sites/{siteId}/labels"]?.post;
    const removeOperation =
      spec.paths["/sites/{siteId}/labels/{labelId}"]?.delete;

    expect(assignOperation?.operationId).toBe("sites.assignSiteLabel");
    expect(
      assignOperation?.parameters?.map((parameter) => parameter.name)
    ).toContain("siteId");
    expect(assignOperation?.requestBody).toMatchObject({ required: true });
    expect(JSON.stringify(assignOperation?.requestBody)).toContain("labelId");
    expect(JSON.stringify(assignOperation?.responses["404"])).toContain(
      "SiteNotFoundError"
    );
    expect(JSON.stringify(assignOperation?.responses["404"])).toContain(
      "LabelNotFoundError"
    );

    expect(removeOperation?.operationId).toBe("sites.removeSiteLabel");
    expect(
      removeOperation?.parameters?.map((parameter) => parameter.name)
    ).toStrictEqual(["siteId", "labelId"]);
    expect(JSON.stringify(removeOperation?.responses["404"])).toContain(
      "SiteNotFoundError"
    );
    expect(JSON.stringify(removeOperation?.responses["404"])).toContain(
      "LabelNotFoundError"
    );
  });

  it("exports site API groups and typed errors", () => {
    expect(SitesApi).toBeDefined();
    expect(SitesApiGroup).toBeDefined();
    expect(ServiceAreasApiGroup).toBeDefined();

    const spec = OpenApi.fromApi(SitesApi);
    expect(spec.paths["/sites"]?.get?.operationId).toBe("sites.listSites");
    expect(spec.paths["/sites/options"]?.get?.operationId).toBe(
      "sites.getSiteOptions"
    );

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
        serviceAreaId: "33333333-3333-4333-8333-333333333333",
      })
    ).toString("base64url");

    expect(
      Schema.decodeUnknownSync(SiteListQuerySchema)({
        cursor,
        limit: "25",
        serviceAreaId: "33333333-3333-4333-8333-333333333333",
      })
    ).toStrictEqual({
      cursor,
      limit: 25,
      serviceAreaId: "33333333-3333-4333-8333-333333333333",
    });

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
