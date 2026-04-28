import { OpenApi } from "@effect/platform";
import { ParseResult, Schema } from "effect";
import * as Vitest from "vitest";

import {
  AddJobCostLineInputSchema,
  AddJobCommentInputSchema,
  AddJobVisitInputSchema,
  calculateJobCostLineTotalMinor,
  calculateJobCostSummary,
  CreateJobInputSchema,
  CreateSiteInputSchema,
  CreateSiteResponseSchema,
  JobActivityBlockedReasonChangedPayloadSchema,
  JobActivityJobCreatedPayloadSchema,
  JobDetailResponseSchema,
  JobContactOptionSchema,
  JobListQuerySchema,
  JobMemberOptionsResponseSchema,
  JobPrioritySchema,
  JobSiteOptionSchema,
  JobStatusSchema,
  JobsApi,
  JobsApiGroup,
  JobsContextSchema,
  JobCostSummaryLimitExceededError,
  JobTitleSchema,
  OrganizationActivityCursor,
  OrganizationActivityCursorInvalidError,
  OrganizationActivityListResponseSchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  SitesOptionsResponseSchema,
  SitesApiGroup,
  SiteGeocodingFailedError,
  UserId,
  VisitDurationIncrementError,
  WorkItemId,
} from "./index.js";

const { describe, expect, it } = Vitest;

describe("jobs-core", () => {
  it("exports the closed job enums", () => {
    expect(ParseResult.decodeUnknownSync(JobStatusSchema)("in_progress")).toBe(
      "in_progress"
    );
    expect(ParseResult.decodeUnknownSync(JobPrioritySchema)("urgent")).toBe(
      "urgent"
    );
  }, 5000);

  it("rejects empty user ids at DTO boundaries", () => {
    expect(() => ParseResult.decodeUnknownSync(UserId)("")).toThrow(
      /Expected a non empty string/
    );
    expect(() =>
      ParseResult.decodeUnknownSync(JobDetailResponseSchema)({
        activity: [],
        comments: [],
        costLines: [],
        costSummary: {
          subtotalMinor: 0,
        },
        job: {
          createdAt: "2026-04-23T11:00:00.000Z",
          createdByUserId: "",
          id: "11111111-1111-4111-8111-111111111111",
          kind: "job",
          priority: "none",
          status: "new",
          title: "Inspect boiler",
          updatedAt: "2026-04-23T12:00:00.000Z",
        },
        visits: [],
      })
    ).toThrow(/Expected a non empty string/);
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

    expect(
      ParseResult.decodeUnknownSync(CreateJobInputSchema)({
        title: "  Replace boiler  ",
        externalReference: "  PO-4471  ",
        contact: {
          kind: "create",
          input: {
            name: "  Alex Contact  ",
            email: "  alex@example.com  ",
            phone: "  +353 87 123 4567  ",
            notes: "  Prefers morning calls.  ",
          },
        },
      })
    ).toStrictEqual({
      title: "Replace boiler",
      externalReference: "PO-4471",
      contact: {
        kind: "create",
        input: {
          name: "Alex Contact",
          email: "alex@example.com",
          phone: "+353 87 123 4567",
          notes: "Prefers morning calls.",
        },
      },
    });

    expect(
      ParseResult.decodeUnknownSync(JobContactOptionSchema)({
        id: "550e8400-e29b-41d4-a716-446655440001",
        name: "Alex Contact",
        email: "alex@example.com",
        phone: "+353 87 123 4567",
        siteIds: [],
      })
    ).toStrictEqual({
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Alex Contact",
      email: "alex@example.com",
      phone: "+353 87 123 4567",
      siteIds: [],
    });
  }, 5000);

  it("rejects invalid contact emails at DTO boundaries", () => {
    expect(() =>
      ParseResult.decodeUnknownSync(CreateJobInputSchema)({
        title: "Replace boiler",
        contact: {
          kind: "create",
          input: {
            name: "Alex Contact",
            email: "not-an-email",
          },
        },
      })
    ).toThrow(/a valid email/);
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

  it("exports organization activity query and response DTOs", () => {
    expect(
      ParseResult.decodeUnknownSync(OrganizationActivityQuerySchema)({
        actorUserId: "user_123",
        cursor: "activity_cursor_1",
        eventType: "status_changed",
        fromDate: "2026-04-01",
        jobTitle: "  Replace boiler  ",
        limit: "25",
        toDate: "2026-04-28",
      })
    ).toStrictEqual({
      actorUserId: "user_123",
      cursor: "activity_cursor_1",
      eventType: "status_changed",
      fromDate: "2026-04-01",
      jobTitle: "Replace boiler",
      limit: 25,
      toDate: "2026-04-28",
    });

    expect(
      ParseResult.decodeUnknownSync(OrganizationActivityListResponseSchema)({
        items: [
          {
            id: "550e8400-e29b-41d4-a716-446655440020",
            workItemId: "550e8400-e29b-41d4-a716-446655440000",
            jobTitle: "Replace boiler",
            actor: {
              id: "user_123",
              name: "Ada Lovelace",
              email: "ada@example.com",
            },
            eventType: "status_changed",
            payload: {
              eventType: "status_changed",
              fromStatus: "new",
              toStatus: "in_progress",
            },
            createdAt: "2026-04-23T11:00:00.000Z",
          },
        ],
        nextCursor: "activity_cursor_2",
      })
    ).toStrictEqual({
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440020",
          workItemId: "550e8400-e29b-41d4-a716-446655440000",
          jobTitle: "Replace boiler",
          actor: {
            id: "user_123",
            name: "Ada Lovelace",
            email: "ada@example.com",
          },
          eventType: "status_changed",
          payload: {
            eventType: "status_changed",
            fromStatus: "new",
            toStatus: "in_progress",
          },
          createdAt: "2026-04-23T11:00:00.000Z",
        },
      ],
      nextCursor: "activity_cursor_2",
    });

    expect(OrganizationActivityCursor).toBeDefined();
    expect(
      ParseResult.decodeUnknownSync(JobMemberOptionsResponseSchema)({
        members: [
          {
            id: "user_123",
            name: "Ada Lovelace",
          },
        ],
      })
    ).toStrictEqual({
      members: [
        {
          id: "user_123",
          name: "Ada Lovelace",
        },
      ],
    });
    expect(() =>
      ParseResult.decodeUnknownSync(OrganizationActivityQuerySchema)({
        limit: "101",
      })
    ).toThrow(/lessThanOrEqualTo/);
  }, 5000);

  it("rejects organization activity items whose event type differs from the payload", () => {
    expect(() =>
      ParseResult.decodeUnknownSync(OrganizationActivityListResponseSchema)({
        items: [
          {
            id: "550e8400-e29b-41d4-a716-446655440020",
            workItemId: "550e8400-e29b-41d4-a716-446655440000",
            jobTitle: "Replace boiler",
            eventType: "status_changed",
            payload: {
              eventType: "priority_changed",
              fromPriority: "none",
              toPriority: "high",
            },
            createdAt: "2026-04-23T11:00:00.000Z",
          },
        ],
      })
    ).toThrow(/eventType/);
  }, 5000);

  it("validates add cost line input at the boundary", () => {
    const decode = ParseResult.decodeUnknownSync(AddJobCostLineInputSchema);

    expect(
      decode({
        description: "Install replacement valve",
        quantity: 1.23,
        taxRateBasisPoints: 2300,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toStrictEqual({
      description: "Install replacement valve",
      quantity: 1.23,
      taxRateBasisPoints: 2300,
      type: "labour",
      unitPriceMinor: 6500,
    });

    expect(() =>
      decode({
        description: "",
        quantity: 0,
        type: "material",
        unitPriceMinor: -1,
      })
    ).toThrow(/Expected/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 1,
        type: "labour",
        unitPriceMinor: 6500,
        unexpected: true,
      })
    ).toThrow(/unexpected/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: Number.POSITIVE_INFINITY,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toThrow(/positive finite quantity/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 1.234,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toThrow(/at most two decimal places/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 10_000_000_000,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toThrow(/less than or equal to 9999999999.99/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 1,
        type: "labour",
        unitPriceMinor: 65.5,
      })
    ).toThrow(/Expected an integer/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 1,
        type: "labour",
        unitPriceMinor: 2_147_483_648,
      })
    ).toThrow(/less than or equal to 2147483647/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 9_999_999_999.99,
        type: "labour",
        unitPriceMinor: 2_147_483_647,
      })
    ).toThrow(/safe integer line total/);

    expect(() =>
      decode({
        description: "Install replacement valve",
        quantity: 1,
        taxRateBasisPoints: 10_001,
        type: "labour",
        unitPriceMinor: 6500,
      })
    ).toThrow(/less than or equal to 10000/);
  }, 5000);

  it("calculates line totals and job cost summaries in minor units", () => {
    expect(
      calculateJobCostLineTotalMinor({
        quantity: 1.5,
        unitPriceMinor: 6500,
      })
    ).toBe(9750);
    expect(
      calculateJobCostLineTotalMinor({
        quantity: 0.29,
        unitPriceMinor: 50,
      })
    ).toBe(15);

    expect(
      calculateJobCostSummary([
        {
          lineTotalMinor: 9750,
        },
        {
          lineTotalMinor: 2599,
        },
      ])
    ).toStrictEqual({
      subtotalMinor: 12_349,
    });
  }, 5000);

  it("rejects job cost summaries with unsafe aggregate subtotals", () => {
    expect(() =>
      calculateJobCostSummary([
        {
          lineTotalMinor: Number.MAX_SAFE_INTEGER,
        },
        {
          lineTotalMinor: 1,
        },
      ])
    ).toThrow(/safe integer job cost subtotal/);
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
      "/jobs/member-options",
      "/activity",
      "/jobs/{workItemId}",
      "/jobs/{workItemId}/transitions",
      "/jobs/{workItemId}/reopen",
      "/jobs/{workItemId}/comments",
      "/jobs/{workItemId}/visits",
      "/jobs/{workItemId}/cost-lines",
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

  it("surfaces the job cost line api contract", () => {
    const spec = OpenApi.fromApi(JobsApi);
    const addCostLine =
      spec.paths["/jobs/{workItemId}/cost-lines"]?.post ?? null;

    expect(addCostLine?.operationId).toBe("jobs.addJobCostLine");
    expect(addCostLine?.responses["422"]).toBeDefined();
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

    const costSummaryError = new JobCostSummaryLimitExceededError({
      message: "Job cost summary subtotal would exceed a safe integer",
      workItemId: Schema.decodeUnknownSync(WorkItemId)(
        "550e8400-e29b-41d4-a716-446655440000"
      ),
    });

    expect(costSummaryError._tag).toBe(
      "@task-tracker/jobs-core/JobCostSummaryLimitExceededError"
    );

    const activityCursorError = new OrganizationActivityCursorInvalidError({
      cursor: "bad-cursor",
      message: "Organization activity cursor is invalid",
    });

    expect(activityCursorError._tag).toBe(
      "@task-tracker/jobs-core/OrganizationActivityCursorInvalidError"
    );
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
