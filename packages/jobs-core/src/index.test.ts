import { OpenApi } from "@effect/platform";
import { ParseResult, Schema } from "effect";

import {
  AddJobCommentInputSchema,
  AddJobVisitInputSchema,
  CreateJobInputSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  JobActivityBlockedReasonChangedPayloadSchema,
  JobActivityJobCreatedPayloadSchema,
  JobListQuerySchema,
  JobPrioritySchema,
  JobSiteOptionSchema,
  JobStatusSchema,
  JobsApi,
  JobsApiGroup,
  JobsContextSchema,
  JobTitleSchema,
  PatchJobInputSchema,
  SitesOptionsResponseSchema,
  SitesApiGroup,
  SiteGeocodingFailedError,
  VisitDurationIncrementError,
  WorkItemId,
} from "./index.js";

describe("jobs-core", () => {
  it("exports the closed job enums", () => {
    expect(ParseResult.decodeUnknownSync(JobStatusSchema)("in_progress")).toBe(
      "in_progress"
    );
    expect(ParseResult.decodeUnknownSync(JobPrioritySchema)("urgent")).toBe(
      "urgent"
    );
  }, 5000);

  it("decodes trimmed boundary DTOs", () => {
    expect(
      ParseResult.decodeUnknownSync(CreateJobInputSchema)({
        title: "  Replace boiler  ",
        priority: "high",
        site: {
          kind: "create",
          input: {
            name: "  Example Site  ",
            addressLine1: "  1 Custom House Quay  ",
            town: "  Dublin  ",
            county: "  Dublin  ",
            country: "IE",
            eircode: "  D01 X2X2  ",
          },
        },
        contact: {
          kind: "existing",
          contactId: "550e8400-e29b-41d4-a716-446655440001",
        },
      })
    ).toStrictEqual({
      title: "Replace boiler",
      priority: "high",
      site: {
        kind: "create",
        input: {
          name: "Example Site",
          addressLine1: "1 Custom House Quay",
          town: "Dublin",
          county: "Dublin",
          country: "IE",
          eircode: "D01 X2X2",
        },
      },
      contact: {
        kind: "existing",
        contactId: "550e8400-e29b-41d4-a716-446655440001",
      },
    });

    expect(
      ParseResult.decodeUnknownSync(AddJobCommentInputSchema)({
        body: "  Confirmed on site  ",
      })
    ).toStrictEqual({
      body: "Confirmed on site",
    });
  }, 5000);

  it("rejects coordinates when creating a site", () => {
    const rejectedCoordinate = /is unexpected/;

    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        name: "Docklands Campus",
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
        eircode: "D01 X2X2",
        latitude: 53.3498,
      })
    ).toThrow(rejectedCoordinate);

    expect(() =>
      ParseResult.decodeUnknownSync(CreateJobInputSchema)({
        title: "Replace boiler",
        site: {
          kind: "create",
          input: {
            name: "Docklands Campus",
            addressLine1: "1 Custom House Quay",
            county: "Dublin",
            country: "IE",
            eircode: "D01 X2X2",
            longitude: -6.2603,
          },
        },
      })
    ).toThrow(rejectedCoordinate);

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
    ).toThrow(rejectedCoordinate);
  }, 5000);

  it("reuses the site creation DTO for standalone and inline site creation", () => {
    const standaloneInput = {
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
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)(standaloneInput)
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

    expect(
      ParseResult.decodeUnknownSync(CreateJobInputSchema)({
        site: {
          input: standaloneInput,
          kind: "create",
        },
        title: "Replace boiler",
      }).site
    ).toStrictEqual({
      input: {
        accessNotes: "Enter via reception",
        addressLine1: "1 Custom House Quay",
        addressLine2: "North Dock",
        county: "Dublin",
        country: "IE",
        eircode: "D01 X2X2",
        name: "Docklands Campus",
        town: "Dublin",
      },
      kind: "create",
    });

    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        name: "Docklands Campus",
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
      })
    ).toThrow(/Irish sites require an Eircode/);
  }, 5000);

  it("requires an Eircode for Irish site creation", () => {
    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        name: "Docklands Campus",
        addressLine1: "1 Custom House Quay",
        county: "Dublin",
        country: "IE",
      })
    ).toThrow(/Irish sites require an Eircode/);

    expect(
      ParseResult.decodeUnknownSync(CreateSiteInputSchema)({
        name: "London Depot",
        addressLine1: "10 Downing Street",
        county: "Greater London",
        country: "GB",
      })
    ).toStrictEqual({
      name: "London Depot",
      addressLine1: "10 Downing Street",
      county: "Greater London",
      country: "GB",
    });
  }, 5000);

  it("validates site option coordinates at response boundaries", () => {
    const siteOption = {
      id: "550e8400-e29b-41d4-a716-446655440010",
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      latitude: 53.3498,
      longitude: -6.2603,
      geocodingProvider: "google",
      geocodedAt: "2026-04-22T10:00:00.000Z",
    };

    expect(
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)(siteOption)
    ).toStrictEqual(siteOption);
    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)({
        ...siteOption,
        latitude: 100,
      })
    ).toThrow(/less than or equal to 90/);
    expect(() =>
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)({
        id: siteOption.id,
        name: siteOption.name,
        addressLine1: siteOption.addressLine1,
        county: siteOption.county,
        country: siteOption.country,
        latitude: 53.3498,
        geocodingProvider: siteOption.geocodingProvider,
        geocodedAt: siteOption.geocodedAt,
      })
    ).toThrow(/longitude/);
  }, 5000);

  it("keeps list filters and patch payloads shapeable", () => {
    expect(
      ParseResult.decodeUnknownSync(JobListQuerySchema)({
        limit: "25",
        status: "new",
        priority: "none",
      })
    ).toStrictEqual({
      limit: 25,
      status: "new",
      priority: "none",
    });

    expect(
      ParseResult.decodeUnknownSync(PatchJobInputSchema)({
        title: "  Adjust valve  ",
        coordinatorId: null,
      })
    ).toStrictEqual({
      title: "Adjust valve",
      coordinatorId: null,
    });

    expect(() =>
      ParseResult.decodeUnknownSync(JobListQuerySchema)({
        limit: "101",
      })
    ).toThrow(/lessThanOrEqualTo/);
  }, 5000);

  it("keeps the activity and visit DTOs well-formed", () => {
    expect(
      ParseResult.decodeUnknownSync(JobActivityJobCreatedPayloadSchema)({
        eventType: "job_created",
        title: "Replace boiler",
        kind: "job",
        priority: "none",
      })
    ).toStrictEqual({
      eventType: "job_created",
      title: "Replace boiler",
      kind: "job",
      priority: "none",
    });

    expect(
      ParseResult.decodeUnknownSync(
        JobActivityBlockedReasonChangedPayloadSchema
      )({
        eventType: "blocked_reason_changed",
        fromBlockedReason: "Waiting on access",
        toBlockedReason: null,
      })
    ).toStrictEqual({
      eventType: "blocked_reason_changed",
      fromBlockedReason: "Waiting on access",
      toBlockedReason: null,
    });

    expect(
      ParseResult.decodeUnknownSync(AddJobVisitInputSchema)({
        visitDate: "2026-04-22",
        note: "Completed intake",
        durationMinutes: 60,
      })
    ).toStrictEqual({
      visitDate: "2026-04-22",
      note: "Completed intake",
      durationMinutes: 60,
    });

    expect(
      ParseResult.decodeUnknownSync(AddJobVisitInputSchema)({
        visitDate: "2026-04-22",
        note: "Half hour entry",
        durationMinutes: 30,
      })
    ).toStrictEqual({
      visitDate: "2026-04-22",
      note: "Half hour entry",
      durationMinutes: 30,
    });
  }, 5000);

  it("keeps site options rich enough for maps and links", () => {
    const siteOption = {
      id: "550e8400-e29b-41d4-a716-446655440010",
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      addressLine2: "North Dock",
      town: "Dublin",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      accessNotes: "Enter via reception",
      latitude: 53.3498,
      longitude: -6.2603,
      geocodingProvider: "google",
      geocodedAt: "2026-04-22T10:00:00.000Z",
      regionId: "550e8400-e29b-41d4-a716-446655440011",
      regionName: "Dublin",
    };

    expect(
      ParseResult.decodeUnknownSync(JobSiteOptionSchema)(siteOption)
    ).toStrictEqual({
      id: "550e8400-e29b-41d4-a716-446655440010",
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      addressLine2: "North Dock",
      town: "Dublin",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      accessNotes: "Enter via reception",
      latitude: 53.3498,
      longitude: -6.2603,
      geocodingProvider: "google",
      geocodedAt: "2026-04-22T10:00:00.000Z",
      regionId: "550e8400-e29b-41d4-a716-446655440011",
      regionName: "Dublin",
    });
    expect(
      ParseResult.decodeUnknownSync(CreateSiteResponseSchema)(siteOption)
    ).toStrictEqual(
      ParseResult.decodeUnknownSync(JobSiteOptionSchema)(siteOption)
    );
  }, 5000);

  it("surfaces the jobs api contract with the expected paths", () => {
    const spec = OpenApi.fromApi(JobsApi);

    expect(Object.keys(spec.paths)).toStrictEqual([
      "/jobs",
      "/jobs/options",
      "/jobs/{workItemId}",
      "/jobs/{workItemId}/transitions",
      "/jobs/{workItemId}/reopen",
      "/jobs/{workItemId}/comments",
      "/jobs/{workItemId}/visits",
      "/sites/options",
      "/sites",
      "/sites/{siteId}",
    ]);

    expect(spec.paths["/jobs"]?.get?.operationId).toBe("jobs.listJobs");
    expect(spec.paths["/jobs"]?.post?.operationId).toBe("jobs.createJob");
    expect(spec.paths["/jobs/options"]?.get?.operationId).toBe(
      "jobs.getJobOptions"
    );
    expect(
      spec.paths["/jobs/{workItemId}"]?.get?.responses["404"]
    ).toBeDefined();
    expect(
      spec.paths["/jobs/{workItemId}/visits"]?.post?.responses["400"]
    ).toBeDefined();
    expect(spec.paths["/jobs"]?.post?.responses["422"]).toBeDefined();
    expect(spec.paths["/sites/options"]?.get?.operationId).toBe(
      "sites.getSiteOptions"
    );
    expect(spec.paths["/sites"]?.post?.operationId).toBe("sites.createSite");
  }, 5000);

  it("documents standalone site creation responses", () => {
    const spec = OpenApi.fromApi(JobsApi);

    expect(spec.paths["/sites"]?.post?.responses["201"]).toBeDefined();
    expect(spec.paths["/sites"]?.post?.responses["403"]).toBeDefined();
    expect(spec.paths["/sites"]?.post?.responses["404"]).toBeDefined();
    expect(spec.paths["/sites"]?.post?.responses["422"]).toBeDefined();
  }, 5000);

  it("does not document create-site coordinates as request properties", () => {
    const spec = OpenApi.fromApi(JobsApi);
    const standaloneRequestBody = JSON.stringify(
      spec.paths["/sites"]?.post?.requestBody
    );
    const jobsRequestBody = JSON.stringify(
      spec.paths["/jobs"]?.post?.requestBody
    );

    expect(standaloneRequestBody).not.toContain('"latitude"');
    expect(standaloneRequestBody).not.toContain('"longitude"');
    expect(jobsRequestBody).not.toContain('"latitude"');
    expect(jobsRequestBody).not.toContain('"longitude"');
  }, 5000);

  it("exports the shared api group", () => {
    expect(JobsApiGroup.identifier).toBe("jobs");
    expect(SitesApiGroup.identifier).toBe("sites");
  }, 5000);

  it("exports a lean sites options response", () => {
    expect(
      ParseResult.decodeUnknownSync(SitesOptionsResponseSchema)({
        regions: [
          {
            id: "550e8400-e29b-41d4-a716-446655440011",
            name: "Dublin",
          },
        ],
        sites: [
          {
            id: "550e8400-e29b-41d4-a716-446655440010",
            name: "Docklands Campus",
            addressLine1: "1 Custom House Quay",
            county: "Dublin",
            country: "IE",
            eircode: "D01 X2X2",
            latitude: 53.3498,
            longitude: -6.2603,
            geocodingProvider: "google",
            geocodedAt: "2026-04-22T10:00:00.000Z",
          },
        ],
      })
    ).toStrictEqual({
      regions: [
        {
          id: "550e8400-e29b-41d4-a716-446655440011",
          name: "Dublin",
        },
      ],
      sites: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          name: "Docklands Campus",
          addressLine1: "1 Custom House Quay",
          county: "Dublin",
          country: "IE",
          eircode: "D01 X2X2",
          latitude: 53.3498,
          longitude: -6.2603,
          geocodingProvider: "google",
          geocodedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
    });
  }, 5000);

  it("exports runtime schemas for shared context shapes", () => {
    expect(
      ParseResult.decodeUnknownSync(JobsContextSchema)({
        organizationId: "org_123",
        userId: "user_123",
      })
    ).toStrictEqual({
      organizationId: "org_123",
      userId: "user_123",
    });
  }, 5000);

  it("has tagged error schemas that can be instantiated", () => {
    const error = new VisitDurationIncrementError({
      message: "Visit durations must be whole hours",
      workItemId: Schema.decodeUnknownSync(WorkItemId)(
        "550e8400-e29b-41d4-a716-446655440000"
      ),
      durationMinutes: 30,
    });

    expect(error._tag).toBe(
      "@task-tracker/jobs-core/VisitDurationIncrementError"
    );
    expect(error.durationMinutes).toBe(30);

    const geocodingError = new SiteGeocodingFailedError({
      message: "Could not geocode site",
      country: "IE",
      eircode: "D01 X2X2",
    });

    expect(geocodingError._tag).toBe(
      "@task-tracker/jobs-core/SiteGeocodingFailedError"
    );
    expect(geocodingError.country).toBe("IE");
  }, 5000);

  it("keeps title schema trimming strict", () => {
    expect(() => Schema.decodeUnknownSync(JobTitleSchema)("   ")).toThrow(
      /Expected/
    );
  }, 5000);

  it("rejects malformed visit dates at the boundary", () => {
    expect(() =>
      ParseResult.decodeUnknownSync(AddJobVisitInputSchema)({
        visitDate: "2026-04-22T10:00:00.000Z",
        note: "Completed intake",
        durationMinutes: 60,
      })
    ).toThrow(/ISO-8601 date string/);
  }, 5000);
});
