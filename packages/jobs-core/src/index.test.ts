import { OpenApi } from "@effect/platform";
import { ParseResult, Schema } from "effect";

import {
  AddJobCommentInputSchema,
  AddJobVisitInputSchema,
  CreateJobInputSchema,
  JobActivityBlockedReasonChangedPayloadSchema,
  JobActivityJobCreatedPayloadSchema,
  JobListQuerySchema,
  JobPrioritySchema,
  JobStatusSchema,
  JobsApi,
  JobsApiGroup,
  JobsContextSchema,
  JobTitleSchema,
  PatchJobInputSchema,
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
            town: "  Dublin  ",
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
          town: "Dublin",
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

  it("surfaces the jobs api contract with the expected paths", () => {
    const spec = OpenApi.fromApi(JobsApi);

    expect(Object.keys(spec.paths)).toStrictEqual([
      "/jobs",
      "/jobs/{workItemId}",
      "/jobs/{workItemId}/transitions",
      "/jobs/{workItemId}/reopen",
      "/jobs/{workItemId}/comments",
      "/jobs/{workItemId}/visits",
    ]);

    expect(spec.paths["/jobs"]?.get?.operationId).toBe("jobs.listJobs");
    expect(spec.paths["/jobs"]?.post?.operationId).toBe("jobs.createJob");
    expect(
      spec.paths["/jobs/{workItemId}"]?.get?.responses["404"]
    ).toBeDefined();
    expect(
      spec.paths["/jobs/{workItemId}/visits"]?.post?.responses["400"]
    ).toBeDefined();
  }, 5000);

  it("exports the shared api group", () => {
    expect(JobsApiGroup.identifier).toBe("jobs");
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
