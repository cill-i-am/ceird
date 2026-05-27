import {
  CommentBodySchema as SharedCommentBodySchema,
  CommentId as SharedCommentId,
} from "@ceird/comments-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { OpenApi } from "effect/unstable/httpapi";

import {
  AddJobCommentInputSchema,
  AddJobVisitInputSchema,
  AttachJobCollaboratorInputSchema,
  CommentId,
  CreateJobInputSchema,
  JobActivityJobCreatedPayloadSchema,
  JobCollaboratorAccessLevelSchema,
  JobCollaboratorRoleLabelSchema,
  JobCollaboratorSchema,
  JobCollaboratorSubjectTypeSchema,
  JobCollaboratorsResponseSchema,
  JobCommentBodySchema,
  JobCommentSchema,
  JobDetailResponseSchema,
  JobListQuerySchema,
  JobMemberOptionsResponseSchema,
  JobOptionsResponseSchema,
  JobsApi,
  JobsApiGroup,
  JobStatusSchema,
  JobTitleSchema,
  JobViewerAccessSchema,
  JOB_COLLABORATOR_ACCESS_LEVELS,
  JOB_COLLABORATOR_SUBJECT_TYPES,
  OrganizationActivityListResponseSchema,
  PatchJobInputSchema,
  TransitionJobInputSchema,
  UpdateJobCollaboratorInputSchema,
  UserId,
  WorkItemId,
} from "./index.js";

describe("jobs-core", () => {
  it("decodes job collaborator domain contracts", () => {
    expect(JOB_COLLABORATOR_SUBJECT_TYPES).toStrictEqual(["user"]);
    expect(JOB_COLLABORATOR_ACCESS_LEVELS).toStrictEqual(["read", "comment"]);
    expect(
      Schema.decodeUnknownSync(JobCollaboratorSubjectTypeSchema)("user")
    ).toBe("user");
    expect(
      Schema.decodeUnknownSync(JobCollaboratorAccessLevelSchema)("comment")
    ).toBe("comment");
    expect(
      Schema.decodeUnknownSync(JobCollaboratorRoleLabelSchema)(
        "  Site contact  "
      )
    ).toBe("Site contact");
  });

  it("decodes job collaborator DTO contracts", () => {
    const collaborator = {
      id: "11111111-1111-4111-8111-111111111111",
      workItemId: "22222222-2222-4222-8222-222222222222",
      subjectType: "user",
      userId: "user_123",
      roleLabel: "Reviewer",
      accessLevel: "comment",
      createdAt: "2026-04-29T10:00:00.000Z",
      updatedAt: "2026-04-29T10:05:00.000Z",
    };

    expect(
      Schema.decodeUnknownSync(JobCollaboratorSchema)(collaborator)
    ).toStrictEqual(collaborator);
    expect(
      Schema.decodeUnknownSync(JobCollaboratorsResponseSchema)({
        collaborators: [collaborator],
      })
    ).toStrictEqual({
      collaborators: [collaborator],
    });
    expect(
      Schema.decodeUnknownSync(AttachJobCollaboratorInputSchema)({
        userId: "user_456",
        roleLabel: "  Viewer  ",
        accessLevel: "read",
      })
    ).toStrictEqual({
      userId: "user_456",
      roleLabel: "Viewer",
      accessLevel: "read",
    });
  });

  it("keeps job comments compatible with the shared comment contract", () => {
    expect(CommentId).toBe(SharedCommentId);
    expect(JobCommentBodySchema).toBe(SharedCommentBodySchema);

    expect(
      Schema.decodeUnknownSync(AddJobCommentInputSchema)({
        body: "  Pump room inspected.  ",
      })
    ).toStrictEqual({ body: "Pump room inspected." });
    expect(
      Schema.decodeUnknownSync(JobCommentSchema)({
        id: "77777777-7777-4777-8777-777777777777",
        workItemId: "11111111-1111-4111-8111-111111111111",
        authorUserId: "user_123",
        authorName: "Ciara",
        body: "Pump room inspected.",
        createdAt: "2026-05-16T09:30:00.000Z",
      })
    ).toMatchObject({
      authorUserId: "user_123",
      body: "Pump room inspected.",
    });
  });

  it("keeps mutation inputs strict and shapeable", () => {
    expect(() =>
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "Replace boiler",
        removedField: "PO-4471",
      })
    ).toThrow(/[Uu]nexpected/);
    expect(() =>
      Schema.decodeUnknownSync(PatchJobInputSchema)({
        removedField: "PO-4471",
      })
    ).toThrow(/[Uu]nexpected/);
    expect(() =>
      Schema.decodeUnknownSync(UpdateJobCollaboratorInputSchema)({})
    ).toThrow(/Expected at least one collaborator field/);
    expect(
      Schema.decodeUnknownSync(UpdateJobCollaboratorInputSchema)({
        roleLabel: "  Approver  ",
      })
    ).toStrictEqual({
      roleLabel: "Approver",
    });
    expect(() =>
      Schema.decodeUnknownSync(AttachJobCollaboratorInputSchema)({
        userId: "user_456",
        roleLabel: "Viewer",
        accessLevel: "read",
        extra: true,
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("decodes job detail with viewer access and selected site detail", () => {
    const site = {
      displayLocation: "Docklands Campus",
      formattedAddress: "1 Custom House Quay, Dublin, Ireland",
      googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      hasUsableCoordinates: true,
      id: "550e8400-e29b-41d4-a716-446655440010",
      latitude: 53.3498,
      locationProvider: "google_places",
      locationResolvedAt: "2026-04-22T10:00:00.000Z",
      locationStatus: "google_resolved",
      longitude: -6.2603,
      name: "Docklands Campus",
      addressLine1: "1 Custom House Quay",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      labels: [],
    };
    const detail = {
      activity: [],
      comments: [],
      job: {
        createdAt: "2026-04-23T11:00:00.000Z",
        createdByUserId: "user_123",
        id: "11111111-1111-4111-8111-111111111111",
        kind: "job",
        labels: [],
        priority: "none",
        siteId: site.id,
        status: "new",
        title: "Inspect boiler",
        updatedAt: "2026-04-23T12:00:00.000Z",
      },
      site,
      viewerAccess: {
        visibility: "external",
        canComment: true,
      },
      visits: [],
    };

    expect(
      Schema.decodeUnknownSync(JobViewerAccessSchema)({
        visibility: "internal",
        canComment: false,
      })
    ).toStrictEqual({
      visibility: "internal",
      canComment: false,
    });
    expect(
      Schema.decodeUnknownSync(JobDetailResponseSchema)(detail)
    ).toStrictEqual(detail);
  });

  it("decodes trimmed boundary DTOs", () => {
    expect(
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "  Replace boiler  ",
        priority: "high",
        site: {
          kind: "create",
          input: {
            location: {
              country: "IE",
              kind: "manual",
              rawInput: "  near the old quarry gate  ",
            },
            name: "  Example Site  ",
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
          location: {
            country: "IE",
            kind: "manual",
            rawInput: "near the old quarry gate",
          },
          name: "Example Site",
        },
      },
      contact: {
        kind: "existing",
        contactId: "550e8400-e29b-41d4-a716-446655440001",
      },
    });

    expect(
      Schema.decodeUnknownSync(PatchJobInputSchema)({
        title: "  New title  ",
        priority: "medium",
      })
    ).toStrictEqual({
      title: "New title",
      priority: "medium",
    });
  });

  it("decodes activity and visit contracts", () => {
    expect(
      Schema.decodeUnknownSync(JobActivityJobCreatedPayloadSchema)({
        eventType: "job_created",
        kind: "job",
        priority: "none",
        title: "Inspect boiler",
      })
    ).toStrictEqual({
      eventType: "job_created",
      kind: "job",
      priority: "none",
      title: "Inspect boiler",
    });
    expect(
      Schema.decodeUnknownSync(AddJobVisitInputSchema)({
        durationMinutes: 30,
        note: "  Replaced sensor.  ",
        visitDate: "2026-05-20",
      })
    ).toStrictEqual({
      durationMinutes: 30,
      note: "Replaced sensor.",
      visitDate: "2026-05-20",
    });
  });

  it("decodes list and options contracts", () => {
    expect(
      Schema.decodeUnknownSync(JobListQuerySchema)({
        limit: "25",
        status: "new",
      })
    ).toStrictEqual({
      limit: 25,
      status: "new",
    });
    expect(() =>
      Schema.decodeUnknownSync(JobListQuerySchema)({
        unexpectedFilter: "550e8400-e29b-41d4-a716-446655440010",
        limit: "25",
      })
    ).toThrow(/[Uu]nexpected/);
    expect(
      Schema.decodeUnknownSync(JobMemberOptionsResponseSchema)({
        members: [{ id: "user_123", name: "Ciara" }],
      })
    ).toStrictEqual({
      members: [{ id: "user_123", name: "Ciara" }],
    });
    expect(
      Schema.decodeUnknownSync(JobOptionsResponseSchema)({
        members: [{ id: "user_123", name: "Ciara" }],
        sites: [],
        contacts: [],
        labels: [],
      })
    ).toStrictEqual({
      members: [{ id: "user_123", name: "Ciara" }],
      sites: [],
      contacts: [],
      labels: [],
    });
  });

  it("surfaces the job API contract", () => {
    const spec = OpenApi.fromApi(JobsApi);

    expect(JobsApiGroup.identifier).toBe("jobs");
    expect(spec.paths["/jobs"]?.get?.operationId).toBe("jobs.listJobs");
    expect(spec.paths["/jobs"]?.post?.operationId).toBe("jobs.createJob");
    expect(spec.paths["/jobs/{workItemId}"]?.get?.operationId).toBe(
      "jobs.getJobDetail"
    );
    expect(spec.paths["/jobs/{workItemId}/comments"]?.post?.operationId).toBe(
      "jobs.addJobComment"
    );
    expect(spec.paths["/jobs/{workItemId}/labels"]?.post?.operationId).toBe(
      "jobs.assignJobLabel"
    );
    expect(
      spec.paths["/jobs/{workItemId}/collaborators"]?.post?.operationId
    ).toBe("jobs.attachJobCollaborator");
  });

  it("exports the closed job enums and branded ids", () => {
    expect(Schema.decodeUnknownSync(JobStatusSchema)("in_progress")).toBe(
      "in_progress"
    );
    expect(Schema.decodeUnknownSync(JobTitleSchema)("  Inspect boiler  ")).toBe(
      "Inspect boiler"
    );
    expect(() => Schema.decodeUnknownSync(UserId)("")).toThrow(
      /length of at least 1/
    );
    expect(
      Schema.decodeUnknownSync(WorkItemId)(
        "11111111-1111-4111-8111-111111111111"
      )
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("decodes organization activity responses", () => {
    expect(
      Schema.decodeUnknownSync(OrganizationActivityListResponseSchema)({
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            workItemId: "22222222-2222-4222-8222-222222222222",
            jobTitle: "Inspect boiler",
            eventType: "job_created",
            payload: {
              eventType: "job_created",
              kind: "job",
              priority: "none",
              title: "Inspect boiler",
            },
            createdAt: "2026-05-20T09:30:00.000Z",
          },
        ],
      })
    ).toMatchObject({
      items: [
        {
          eventType: "job_created",
          jobTitle: "Inspect boiler",
        },
      ],
    });
  });

  it("decodes transition inputs", () => {
    expect(
      Schema.decodeUnknownSync(TransitionJobInputSchema)({
        status: "blocked",
        blockedReason: "  Waiting for parts  ",
      })
    ).toStrictEqual({
      status: "blocked",
      blockedReason: "Waiting for parts",
    });
  });
});
