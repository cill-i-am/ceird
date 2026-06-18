import type { ProductActivityEvent } from "@ceird/activity-core";
import {
  decodeUserPreferences,
  OrganizationId,
  ProductActorId,
  UserId,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import type { ProductActor } from "@ceird/identity-core";
import {
  ActivityId,
  CreateJobInputSchema,
  HomeDashboardSummaryResponseSchema,
  JobCollaboratorSchema,
  JobDetailResponseSchema,
  JobListItemSchema,
  JobCommentSchema,
  JobDetailSchema,
  JobOptionsResponseSchema,
  JobSchema,
  VisitId,
} from "@ceird/jobs-core";
import type {
  Job,
  JobActivity,
  JobCollaborator,
  JobOptionsResponse,
  JobProximityFilters,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import {
  GooglePlaceId,
  ProximityAccessDeniedError,
  signProximityOriginToken,
} from "@ceird/proximity-core";
import type { TypedOrigin, UnsignedTypedOrigin } from "@ceird/proximity-core";
import { SiteOptionSchema } from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import type { RecordActivityEventInput } from "../activity/repository.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { LabelsRepository } from "../labels/repositories.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { RouteProvider } from "../proximity/route-provider.js";
import type {
  RankRoutesInput,
  RoutePreviewInput,
} from "../proximity/route-provider.js";
import { RouteProximityService } from "../proximity/service.js";
import { SiteLocationProvider } from "../sites/location-provider.js";
import { SitesRepository } from "../sites/repositories.js";
import { JobsActivityRecorder } from "./activity-recorder.js";
import { JobsAuthorization } from "./authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "./repositories.js";
import { JobsService } from "./service.js";

type ContextService<Service> = Service extends {
  readonly Service: infer Shape;
}
  ? Shape
  : never;

const decodeJob = Schema.decodeUnknownSync(JobSchema);
const decodeJobActivityId = Schema.decodeUnknownSync(ActivityId);
const decodeJobCollaborator = Schema.decodeUnknownSync(JobCollaboratorSchema);
const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeJobDetail = Schema.decodeUnknownSync(JobDetailSchema);
const decodeJobListItem = Schema.decodeUnknownSync(JobListItemSchema);
const decodeJobOptionsResponse = Schema.decodeUnknownSync(
  JobOptionsResponseSchema
);
const decodeGooglePlaceId = Schema.decodeUnknownSync(GooglePlaceId);
const decodeLabelId = Schema.decodeUnknownSync(LabelId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const decodeVisitId = Schema.decodeUnknownSync(VisitId);
const missingProductActors = new Map<string, ProductActor>();
const PROXIMITY_ORIGIN_TOKEN_SECRET = "proximity-origin-secret";
const proximityOriginConfigProvider = configProviderFromMap(
  new Map([["AGENT_INTERNAL_SECRET", PROXIMITY_ORIGIN_TOKEN_SECRET]])
);

const internalActor = {
  organizationId: decodeOrganizationId("org_123"),
  role: "admin",
  userId: decodeUserId("user_admin"),
} satisfies OrganizationActor;
const externalActor = {
  organizationId: decodeOrganizationId("org_123"),
  role: "external",
  userId: decodeUserId("user_external"),
} satisfies OrganizationActor;
const workItemId = Schema.decodeUnknownSync(JobSchema)({
  createdAt: "2026-05-20T09:00:00.000Z",
  createdByUserId: "user_owner",
  id: "11111111-1111-4111-8111-111111111111",
  kind: "job",
  labels: [],
  priority: "none",
  status: "new",
  title: "Inspect boiler",
  updatedAt: "2026-05-20T09:00:00.000Z",
}).id;
const existingJob = decodeJob({
  createdAt: "2026-05-20T09:00:00.000Z",
  createdByUserId: "user_owner",
  id: workItemId,
  kind: "job",
  labels: [],
  priority: "none",
  status: "new",
  title: "Inspect boiler",
  updatedAt: "2026-05-20T09:00:00.000Z",
});

async function makeSignedTypedOrigin(
  input: Partial<UnsignedTypedOrigin> = {}
): Promise<TypedOrigin> {
  const origin = {
    coordinates: input.coordinates ?? { latitude: 53.34, longitude: -6.26 },
    displayText: input.displayText ?? "Heuston Station",
    mode: "typed_origin" as const,
    placeId: input.placeId ?? decodeGooglePlaceId("google-place-origin"),
  } satisfies UnsignedTypedOrigin;

  return {
    ...origin,
    originToken: await signProximityOriginToken({
      origin,
      secret: PROXIMITY_ORIGIN_TOKEN_SECRET,
      ttlSeconds: 300,
    }),
  };
}

describe("JobsService contracts", () => {
  it("keeps job creation focused on title, priority, site, and contact", () => {
    expect(
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "  Replace boiler  ",
        priority: "high",
      })
    ).toStrictEqual({
      title: "Replace boiler",
      priority: "high",
    });

    expect(() =>
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "Replace boiler",
        removedField: "PO-4471",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("keeps job detail free of costing payloads", () => {
    const detail = {
      activity: [],
      comments: [],
      job: {
        createdAt: "2026-05-20T09:00:00.000Z",
        createdByUserId: "user_123",
        id: "11111111-1111-4111-8111-111111111111",
        kind: "job",
        labels: [],
        priority: "none",
        status: "new",
        title: "Inspect boiler",
        updatedAt: "2026-05-20T09:00:00.000Z",
      },
      viewerAccess: {
        canComment: true,
        visibility: "internal",
      },
      visits: [],
    };

    expect(
      Schema.decodeUnknownSync(JobDetailResponseSchema)(detail)
    ).toStrictEqual(detail);
    expect(() =>
      Schema.decodeUnknownSync(JobDetailResponseSchema)({
        ...detail,
        removedPayload: { items: [] },
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("loads bounded home dashboard summaries for internal actors", async () => {
    const summary = Schema.decodeUnknownSync(
      HomeDashboardSummaryResponseSchema
    )({
      jobs: {
        items: [
          {
            assigneeName: "Taylor",
            id: "33333333-3333-4333-8333-333333333333",
            priority: "high",
            siteName: "Docklands Campus",
            status: "in_progress",
            title: "Inspect boiler",
            updatedAt: "2026-05-20T11:00:00.000Z",
          },
        ],
        stats: {
          activeJobs: 1,
          blockedJobs: 0,
          priorityWatchJobs: 1,
          totalJobs: 2,
          unassignedJobs: 0,
        },
      },
      members: {
        total: 2,
      },
      sites: {
        items: [
          {
            activeJobCount: 1,
            displayLocation: "Docklands",
            id: "44444444-4444-4444-8444-444444444444",
            name: "Docklands Campus",
          },
        ],
        stats: {
          mappedSites: 1,
          totalSites: 1,
        },
      },
    });
    const calls = { summary: 0 };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getHomeDashboardSummary();
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsHomeDashboardSummaryTestLayer({ calls, summary })
        )
      )
    );

    expect(result).toStrictEqual(summary);
    expect(calls.summary).toBe(1);
  });

  it("denies read-only external collaborators when adding comments", async () => {
    const calls = {
      addComment: 0,
      recordCommentCreated: 0,
      withTransaction: 0,
    };
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can we get an update?",
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsServiceTestLayer({
            calls,
            grant: makeGrant("read"),
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    expect(calls.withTransaction).toBe(0);
    expect(calls.addComment).toBe(0);
    expect(calls.recordCommentCreated).toBe(0);
  });

  it("allows comment-level external collaborators to add comments", async () => {
    const calls = {
      addComment: 0,
      recordCommentCreated: 0,
      withTransaction: 0,
    };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can we get an update?",
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsServiceTestLayer({
            calls,
            grant: makeGrant("comment"),
          })
        )
      )
    );

    expect(result.body).toBe("Can we get an update?");
    expect(calls.withTransaction).toBe(1);
    expect(calls.addComment).toBe(1);
    expect(calls.recordCommentCreated).toBe(1);
  });

  it("allows long valid comments and job titles while emitting capped activity display", async () => {
    const capturedEvents: RecordActivityEventInput[] = [];
    const calls = {
      addComment: 0,
      withTransaction: 0,
    };
    const longBody = "Long maintenance note. ".repeat(18);
    const longTitle = "Long valid boiler inspection title ".repeat(8);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: longBody,
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsLongCommentActivityTestLayer({
            calls,
            capturedEvents,
            job: {
              ...existingJob,
              title: longTitle,
            },
          })
        )
      )
    );

    expect(result.body).toBe(longBody);
    expect(calls.withTransaction).toBe(1);
    expect(calls.addComment).toBe(1);
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]?.display.detail).toHaveLength(280);
    expect(capturedEvents[0]?.display.detail?.endsWith("...")).toBe(true);
    expect(capturedEvents[0]?.display.route?.label).toHaveLength(80);
    expect(capturedEvents[0]?.display.route?.label?.endsWith("...")).toBe(true);
    expect(capturedEvents[0]?.display.summary).toHaveLength(160);
    expect(capturedEvents[0]?.display.summary).toMatch(/^Commented on /);
    expect(capturedEvents[0]?.display.summary.endsWith("...")).toBe(true);
    expect(capturedEvents[0]).toMatchObject({
      actorId: "99999999-9999-4999-8999-999999999999",
      display: {
        route: {
          href: `/jobs-workspace?detailJobId=${workItemId}`,
        },
      },
      eventType: "comment.created",
      organizationId: internalActor.organizationId,
      sourceId: "33333333-3333-4333-8333-333333333333",
      sourceType: "comment",
      status: "synced",
      targetId: "33333333-3333-4333-8333-333333333333",
      targetType: "comment",
    });
    expect(capturedEvents[0]?.display.route?.href).toBe(
      `/jobs-workspace?detailJobId=${workItemId}`
    );
    expect(JSON.stringify(capturedEvents)).not.toContain(internalActor.userId);
  });

  it("emits product-safe global activity for successful job create and priority writes", async () => {
    const capturedEvents: RecordActivityEventInput[] = [];
    const addedActivities: JobActivity["payload"][] = [];
    const resolvedActors: {
      readonly organizationId: string;
      readonly userId: string;
    }[] = [];
    const updatedJob = decodeJob({
      ...existingJob,
      priority: "urgent",
      updatedAt: "2026-05-20T10:00:00.000Z",
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const recorder = yield* JobsActivityRecorder;

        yield* recorder.recordCreated(internalActor, existingJob);
        yield* recorder.recordPatched(internalActor, existingJob, updatedJob);
      }).pipe(
        Effect.provide(JobsActivityRecorder.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsActivityRecorderTestLayer({
            addedActivities,
            capturedEvents,
            resolvedActors,
          })
        )
      )
    );

    expect(resolvedActors).toStrictEqual([
      {
        organizationId: internalActor.organizationId,
        userId: internalActor.userId,
      },
      {
        organizationId: internalActor.organizationId,
        userId: internalActor.userId,
      },
    ]);
    expect(addedActivities.map((payload) => payload.eventType)).toStrictEqual([
      "job_created",
      "priority_changed",
    ]);
    expect(capturedEvents).toStrictEqual([
      expect.objectContaining({
        actorId: "99999999-9999-4999-8999-999999999999",
        display: {
          detail: "Priority: none",
          route: {
            href: `/jobs-workspace?detailJobId=${workItemId}`,
            label: "Inspect boiler",
          },
          summary: "Created Inspect boiler",
        },
        eventType: "job.created",
        organizationId: internalActor.organizationId,
        sourceId: "44444444-4444-4444-8444-444444444441",
        sourceType: "job_activity",
        status: "synced",
        targetId: workItemId,
        targetType: "job",
      }),
      expect.objectContaining({
        actorId: "99999999-9999-4999-8999-999999999999",
        display: {
          detail: "Priority changed from none to urgent",
          route: {
            href: `/jobs-workspace?detailJobId=${workItemId}`,
            label: "Inspect boiler",
          },
          summary: "Changed priority on Inspect boiler",
        },
        eventType: "job.priority_changed",
        organizationId: internalActor.organizationId,
        sourceId: "44444444-4444-4444-8444-444444444442",
        sourceType: "job_activity",
        status: "synced",
        targetId: workItemId,
        targetType: "job",
      }),
    ]);
  });

  it("emits product-safe global activity for successful job label writes", async () => {
    const capturedEvents: RecordActivityEventInput[] = [];

    await Effect.runPromise(
      Effect.gen(function* () {
        const recorder = yield* JobsActivityRecorder;

        yield* recorder.recordLabelAssigned(internalActor, existingJob, {
          createdAt: "2026-05-20T09:00:00.000Z",
          id: decodeLabelId("22222222-2222-4222-8222-222222222222"),
          name: "Fire safety",
          updatedAt: "2026-05-20T09:00:00.000Z",
        });
      }).pipe(
        Effect.provide(JobsActivityRecorder.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsActivityRecorderTestLayer({
            addedActivities: [],
            capturedEvents,
          })
        )
      )
    );

    expect(capturedEvents).toStrictEqual([
      expect.objectContaining({
        display: {
          detail: "Added label Fire safety",
          route: {
            href: `/jobs-workspace?detailJobId=${workItemId}`,
            label: "Inspect boiler",
          },
          summary: "Added label to Inspect boiler",
        },
        eventType: "job.label_added",
        sourceType: "job_activity",
        targetId: workItemId,
        targetType: "job",
      }),
    ]);
  });

  it("emits product-safe global activity for successful job visit writes", async () => {
    const capturedEvents: RecordActivityEventInput[] = [];
    const addedActivities: JobActivity["payload"][] = [];
    const resolvedActors: {
      readonly organizationId: string;
      readonly userId: string;
    }[] = [];

    await Effect.runPromise(
      Effect.gen(function* () {
        const recorder = yield* JobsActivityRecorder;

        yield* recorder.recordVisitLogged(internalActor, {
          job: existingJob,
          visitId: decodeVisitId("22222222-2222-4222-8222-222222222222"),
        });
      }).pipe(
        Effect.provide(JobsActivityRecorder.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsActivityRecorderTestLayer({
            addedActivities,
            capturedEvents,
            resolvedActors,
          })
        )
      )
    );

    expect(resolvedActors).toStrictEqual([
      {
        organizationId: internalActor.organizationId,
        userId: internalActor.userId,
      },
    ]);
    expect(addedActivities).toStrictEqual([
      {
        eventType: "visit_logged",
        visitId: decodeVisitId("22222222-2222-4222-8222-222222222222"),
      },
    ]);
    expect(capturedEvents).toStrictEqual([
      expect.objectContaining({
        display: {
          route: {
            href: `/jobs-workspace?detailJobId=${workItemId}`,
            label: "Inspect boiler",
          },
          summary: "Logged visit on Inspect boiler",
        },
        eventType: "job.visit_logged",
        organizationId: internalActor.organizationId,
        sourceId: "44444444-4444-4444-8444-444444444441",
        sourceType: "job_activity",
        targetId: workItemId,
        targetType: "job",
      }),
    ]);
  });

  it("returns empty scoped options for external collaborators with no accessible option data", async () => {
    const calls: { organizationId: string; userId: string }[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getExternalOptions();
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsExternalOptionsServiceTestLayer({
            actor: externalActor,
            calls,
            scopedOptions: decodeJobOptionsResponse({
              contacts: [],
              labels: [],
              members: [],
              sites: [],
            }),
          })
        )
      )
    );

    expect(result).toStrictEqual({
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    });
    expect(calls).toStrictEqual([
      {
        organizationId: externalActor.organizationId,
        userId: externalActor.userId,
      },
    ]);
  });

  it("keeps scoped external options partial and strips internal members", async () => {
    const calls: { organizationId: string; userId: string }[] = [];
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getExternalOptions();
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsExternalOptionsServiceTestLayer({
            actor: externalActor,
            calls,
            scopedOptions: decodeJobOptionsResponse({
              contacts: [
                {
                  email: "tenant-contact@example.com",
                  id: "33333333-3333-4333-8333-333333333333",
                  name: "Tenant Contact",
                  phone: "+353 1 555 0100",
                  siteIds: [],
                },
              ],
              labels: [
                {
                  createdAt: "2026-05-20T09:00:00.000Z",
                  id: "44444444-4444-4444-8444-444444444444",
                  name: "Urgent",
                  updatedAt: "2026-05-20T09:00:00.000Z",
                },
              ],
              members: [
                {
                  id: "55555555-5555-4555-8555-555555555555",
                  name: "Internal Member",
                },
              ],
              sites: [],
            }),
          })
        )
      )
    );

    expect(result.members).toStrictEqual([]);
    expect(result.contacts).toHaveLength(1);
    expect(result.labels).toHaveLength(1);
    expect(result.sites).toStrictEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("denies scoped external options to internal organization actors", async () => {
    const calls: { organizationId: string; userId: string }[] = [];
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getExternalOptions();
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsExternalOptionsServiceTestLayer({
            actor: internalActor,
            calls,
            scopedOptions: decodeJobOptionsResponse({
              contacts: [],
              labels: [],
              members: [],
              sites: [],
            }),
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    expect(calls).toStrictEqual([]);
  });

  it("ranks active mapped jobs by driving time and reports proximity exclusions", async () => {
    let capturedFilters: JobProximityFilters | undefined;
    let capturedRankInput: RankRoutesInput | undefined;
    let previewCalls = 0;

    const nearbyBoiler = makeJobListItem(
      "11111111-1111-4111-8111-111111111201",
      "Boiler service",
      "medium",
      "22222222-2222-4222-8222-222222222201"
    );
    const urgentLeak = makeJobListItem(
      "11111111-1111-4111-8111-111111111202",
      "Urgent leak",
      "urgent",
      "22222222-2222-4222-8222-222222222202"
    );
    const jobWithNoRoute = makeJobListItem(
      "11111111-1111-4111-8111-111111111205",
      "Tank inspection",
      "medium",
      "22222222-2222-4222-8222-222222222205"
    );
    const nearbyBoilerSite = makeMappedSite(
      "22222222-2222-4222-8222-222222222201",
      "Bridge Estate",
      53.339,
      -6.263
    );
    const urgentLeakSite = makeMappedSite(
      "22222222-2222-4222-8222-222222222202",
      "Loop Road",
      53.342,
      -6.257
    );
    const noRouteSite = makeMappedSite(
      "22222222-2222-4222-8222-222222222205",
      "Private lane",
      53.36,
      -6.31
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          origin: {
            accuracyMeters: 12,
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: (_organizationId, filters) => {
              capturedFilters = filters;
              return Effect.succeed({
                candidateCount: 5,
                candidateLimitApplied: false,
                candidates: [
                  { job: nearbyBoiler, site: nearbyBoilerSite },
                  { job: urgentLeak, site: urgentLeakSite },
                  { job: jobWithNoRoute, site: noRouteSite },
                ],
                excluded: [
                  { count: 1, reason: "no_site" },
                  { count: 1, reason: "unmapped_site" },
                ],
              });
            },
            previewRoute: (_input) => {
              previewCalls += 1;
              return Effect.die("RouteProvider.previewRoute was not expected");
            },
            rankRoutes: (input) => {
              capturedRankInput = input;
              return Effect.succeed({
                rows: [
                  {
                    destinationId: urgentLeak.id,
                    routeSummary: makeRouteSummary(240, 1100),
                  },
                  {
                    destinationId: nearbyBoiler.id,
                    routeSummary: makeRouteSummary(390, 1800),
                  },
                ],
                unavailableDestinationIds: [jobWithNoRoute.id],
              });
            },
          })
        )
      )
    );

    expect(capturedFilters?.status).toBe("active");
    expect(capturedRankInput?.destinations).toStrictEqual([
      {
        coordinates: { latitude: 53.339, longitude: -6.263 },
        destinationId: nearbyBoiler.id,
      },
      {
        coordinates: { latitude: 53.342, longitude: -6.257 },
        destinationId: urgentLeak.id,
      },
      {
        coordinates: { latitude: 53.36, longitude: -6.31 },
        destinationId: jobWithNoRoute.id,
      },
    ]);
    expect(previewCalls).toBe(0);
    expect(result.rows.map((row) => row.job.id)).toStrictEqual([
      urgentLeak.id,
      nearbyBoiler.id,
    ]);
    expect(result.rows[0]?.site).toStrictEqual(urgentLeakSite);
    expect(result.origin).toMatchObject({
      accuracyMeters: 12,
      coordinates: { latitude: 53.34, longitude: -6.26 },
      displayText: "Current location",
      mode: "current_location",
    });
    expect(result.meta).toMatchObject({
      candidateCount: 5,
      candidateLimitApplied: false,
      excluded: [
        { count: 1, reason: "no_site" },
        { count: 1, reason: "unmapped_site" },
        { count: 1, reason: "no_driving_route" },
      ],
      rankedCandidateLimit: 100,
    });
  });

  it("respects an exact job status filter before route ranking", async () => {
    let capturedFilters: JobProximityFilters | undefined;
    let capturedRankInput: RankRoutesInput | undefined;

    const completedJob = {
      ...makeJobListItem(
        "11111111-1111-4111-8111-111111111206",
        "Completed boiler service",
        "high",
        "22222222-2222-4222-8222-222222222206"
      ),
      status: "completed" as const,
    };
    const completedSite = makeMappedSite(
      "22222222-2222-4222-8222-222222222206",
      "Completed Terrace",
      53.341,
      -6.259
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          filters: {
            priority: "high",
            status: "completed",
          },
          origin: {
            accuracyMeters: 9,
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: (_organizationId, filters) => {
              capturedFilters = filters;
              return Effect.succeed({
                candidateCount: 1,
                candidateLimitApplied: false,
                candidates: [{ job: completedJob, site: completedSite }],
                excluded: [],
              });
            },
            previewRoute: (_input) =>
              Effect.die("RouteProvider.previewRoute was not expected"),
            rankRoutes: (input) => {
              capturedRankInput = input;
              return Effect.succeed({
                rows: [
                  {
                    destinationId: completedJob.id,
                    routeSummary: makeRouteSummary(300, 1400),
                  },
                ],
                unavailableDestinationIds: [],
              });
            },
          })
        )
      )
    );

    expect(capturedFilters).toMatchObject({
      priority: "high",
      status: "completed",
    });
    expect(capturedRankInput?.destinations).toStrictEqual([
      {
        coordinates: { latitude: 53.341, longitude: -6.259 },
        destinationId: completedJob.id,
      },
    ]);
    expect(result.rows.map((row) => row.job.status)).toStrictEqual([
      "completed",
    ]);
  });

  it("returns an inline route preview for a mapped job site", async () => {
    let capturedPreviewInput: RoutePreviewInput | undefined;
    const site = makeMappedSite(
      "22222222-2222-4222-8222-222222222301",
      "Bridge Terrace",
      53.339,
      -6.263
    );
    const detail = decodeJobDetail({
      activity: [],
      comments: [],
      job: {
        ...existingJob,
        siteId: site.id,
      },
      site,
      viewerAccess: {
        canComment: true,
        visibility: "internal",
      },
      visits: [],
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getJobRoutePreview(workItemId, {
          includeRouteLine: true,
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsRoutePreviewTestLayer({
            getDetail: () => Effect.succeed(Option.some(detail)),
            previewRoute: (input) => {
              capturedPreviewInput = input;
              return Effect.succeed({
                line: {
                  encodedPolyline: "encoded-route",
                  format: "encoded_polyline" as const,
                },
                routeSummary: {
                  ...makeRouteSummary(420, 1900),
                  providerRequestKind: "route_preview" as const,
                },
              });
            },
            rankRoutes: () =>
              Effect.die("RouteProvider.rankRoutes should not be called"),
          })
        )
      )
    );

    expect(capturedPreviewInput).toMatchObject({
      destination: {
        coordinates: { latitude: 53.339, longitude: -6.263 },
        destinationId: workItemId,
      },
      includeLine: true,
      origin: { latitude: 53.34, longitude: -6.26 },
    });
    expect(result.job.id).toBe(workItemId);
    expect("createdByUserId" in result.job).toBe(false);
    expect(result.site).toStrictEqual(site);
    expect(result.routeLine).toStrictEqual({
      encodedPolyline: "encoded-route",
      format: "encoded_polyline",
    });
    expect(result.routeSummary.providerRequestKind).toBe("route_preview");
  });

  it("rejects current-location job ranking when location preference is disabled", async () => {
    let candidateCalls = 0;
    let routeCalls = 0;

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: () => {
              candidateCalls += 1;
              return Effect.die(
                "JobsRepository.listProximityCandidates should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () => {
              routeCalls += 1;
              return Effect.die(
                "RouteProvider.rankRoutes should not be called"
              );
            },
            routeProximityLocationEnabled: false,
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Current location access is disabled for this user.",
      });
    }
    expect(candidateCalls).toBe(0);
    expect(routeCalls).toBe(0);
  });

  it("allows typed-origin job ranking when location preference is disabled", async () => {
    let candidateCalls = 0;
    const origin = await makeSignedTypedOrigin();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          origin,
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: () => {
              candidateCalls += 1;
              return Effect.succeed({
                candidateCount: 0,
                candidateLimitApplied: false,
                candidates: [],
                excluded: [],
              });
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: (input) =>
              Effect.succeed({
                rows: input.destinations.map((destination) => ({
                  destinationId: destination.destinationId,
                  routeSummary: makeRouteSummary(120, 1000),
                })),
                unavailableDestinationIds: [],
              }),
            routeProximityLocationEnabled: false,
          })
        ),
        withConfigProvider(proximityOriginConfigProvider)
      )
    );

    expect(candidateCalls).toBe(1);
    expect(result.origin).toMatchObject({
      displayText: "Heuston Station",
      mode: "typed_origin",
    });
  });

  it("rejects tampered typed-origin job ranking before loading candidates", async () => {
    let candidateCalls = 0;
    const signedOrigin = await makeSignedTypedOrigin();

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          origin: {
            ...signedOrigin,
            coordinates: { latitude: 53.35, longitude: -6.27 },
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: () => {
              candidateCalls += 1;
              return Effect.die(
                "JobsRepository.listProximityCandidates should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () =>
              Effect.die("RouteProvider.rankRoutes should not be called"),
            routeProximityLocationEnabled: false,
          })
        ),
        withConfigProvider(proximityOriginConfigProvider)
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Typed origin access could not be verified.",
      });
    }
    expect(candidateCalls).toBe(0);
  });

  it("rejects current-location job route previews before loading job detail when location preference is unavailable", async () => {
    let getDetailCalls = 0;

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.getJobRoutePreview(workItemId, {
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsRoutePreviewTestLayer({
            getDetail: () => {
              getDetailCalls += 1;
              return Effect.die(
                "JobsRepository.getDetail should not be called"
              );
            },
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute should not be called"),
            rankRoutes: () =>
              Effect.die("RouteProvider.rankRoutes should not be called"),
            userPreferencesGet: () =>
              Effect.fail(
                new UserPreferencesStorageError({
                  message: "User preferences storage operation failed",
                })
              ),
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

      expect(failure).toBeInstanceOf(ProximityAccessDeniedError);
      expect(failure).toMatchObject({
        message: "Current location access could not be verified.",
      });
    }
    expect(getDetailCalls).toBe(0);
  });

  it("reports how many routeable jobs were omitted by the 100-candidate cap", async () => {
    const mappedJobs = Array.from({ length: 100 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      const job = makeJobListItem(
        `11111111-1111-4111-8111-${suffix}`,
        `Job ${index + 1}`,
        "medium",
        `22222222-2222-4222-8222-${suffix}`
      );

      return {
        job,
        site: makeMappedSite(
          `22222222-2222-4222-8222-${suffix}`,
          `Site ${index + 1}`,
          53.3 + index / 10_000,
          -6.2 - index / 10_000
        ),
      };
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.rankNearbyJobs({
          origin: {
            coordinates: { latitude: 53.34, longitude: -6.26 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsProximityTestLayer({
            listProximityCandidates: () =>
              Effect.succeed({
                candidateCount: 137,
                candidateLimitApplied: true,
                candidates: mappedJobs,
                excluded: [],
              }),
            previewRoute: () =>
              Effect.die("RouteProvider.previewRoute was not expected"),
            rankRoutes: (input) =>
              Effect.succeed({
                rows: input.destinations
                  .slice(0, 10)
                  .map((destination, index) => ({
                    destinationId: destination.destinationId,
                    routeSummary: makeRouteSummary(120 + index, 1000 + index),
                  })),
                unavailableDestinationIds: [],
              }),
          })
        )
      )
    );

    expect(result.rows).toHaveLength(10);
    expect(result.meta.excluded).toContainEqual({
      count: 37,
      reason: "candidate_cap",
    });
  });
});

function makeGrant(
  accessLevel: JobCollaborator["accessLevel"]
): JobCollaborator {
  return decodeJobCollaborator({
    accessLevel,
    createdAt: "2026-05-20T09:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    roleLabel: "Site contact",
    subjectType: "user",
    updatedAt: "2026-05-20T09:00:00.000Z",
    userId: externalActor.userId,
    workItemId,
  });
}

function makeJobsActivityRecorderTestLayer(options: {
  readonly addedActivities: JobActivity["payload"][];
  readonly capturedEvents: RecordActivityEventInput[];
  readonly resolvedActors?: {
    readonly organizationId: string;
    readonly userId: string;
  }[];
}) {
  let nextActivity = 0;

  return Layer.mergeAll(
    Layer.succeed(
      ActivityEventsRepository,
      ActivityEventsRepository.of({
        recordEvent: (input: RecordActivityEventInput) => {
          options.capturedEvents.push(input);
          return Effect.succeed({} as ProductActivityEvent);
        },
      } as unknown as ContextService<typeof ActivityEventsRepository>)
    ),
    Layer.succeed(
      ProductActivityActorsRepository,
      ProductActivityActorsRepository.of({
        ensureMemberActor: (
          input: Parameters<
            ContextService<
              typeof ProductActivityActorsRepository
            >["ensureMemberActor"]
          >[0]
        ) => {
          options.resolvedActors?.push(input);
          return Effect.succeed({
            actor: {
              displayDetail: "Team member",
              displayName: "Taylor Member",
              id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
              kind: "member",
            },
            sourceUserId: input.userId,
          });
        },
        getById: () => Effect.succeed(missingProductActors.get("missing")),
      } as unknown as ContextService<typeof ProductActivityActorsRepository>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        addActivity: (
          input: Parameters<
            ContextService<typeof JobsRepository>["addActivity"]
          >[0]
        ) => {
          nextActivity += 1;
          options.addedActivities.push(input.payload);

          return Effect.succeed({
            actorUserId: input.actorUserId,
            createdAt: "2026-05-20T10:00:00.000Z",
            id: decodeJobActivityId(
              `44444444-4444-4444-8444-44444444444${nextActivity}`
            ),
            payload: input.payload,
            workItemId: input.workItemId,
          } satisfies JobActivity);
        },
      } as unknown as ContextService<typeof JobsRepository>)
    )
  );
}

function makeJobsServiceTestLayer(options: {
  readonly calls: {
    addComment: number;
    recordCommentCreated: number;
    withTransaction: number;
  };
  readonly grant: JobCollaborator;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(externalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({
        recordCommentCreated: () => {
          options.calls.recordCommentCreated += 1;
          return Effect.void;
        },
      } as unknown as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        addComment: () => {
          options.calls.addComment += 1;
          return Effect.succeed(
            decodeJobComment({
              actor: {
                displayName: "External Contact",
                id: "99999999-9999-4999-8999-999999999999",
                kind: "member",
              },
              actorId: "99999999-9999-4999-8999-999999999999",
              authorName: "External Contact",
              body: "Can we get an update?",
              createdAt: "2026-05-20T10:00:00.000Z",
              id: "33333333-3333-4333-8333-333333333333",
              workItemId,
            })
          );
        },
        findByIdForUpdate: () => Effect.succeed(Option.some(existingJob)),
        findUserCollaboratorGrant: () =>
          Effect.succeed(Option.some(options.grant)),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => {
          options.calls.withTransaction += 1;
          return effect;
        },
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer(),
    Layer.succeed(
      RouteProximityService,
      RouteProximityService.of(
        {} as ContextService<typeof RouteProximityService>
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeJobsLongCommentActivityTestLayer(options: {
  readonly calls: {
    addComment: number;
    withTransaction: number;
  };
  readonly capturedEvents: RecordActivityEventInput[];
  readonly job?: Job;
}) {
  const activityEventsLayer = Layer.succeed(
    ActivityEventsRepository,
    ActivityEventsRepository.of({
      recordEvent: (input: RecordActivityEventInput) => {
        options.capturedEvents.push(input);
        return Effect.succeed({} as ProductActivityEvent);
      },
    } as unknown as ContextService<typeof ActivityEventsRepository>)
  );
  const activityActorsLayer = Layer.succeed(
    ProductActivityActorsRepository,
    ProductActivityActorsRepository.of({
      ensureMemberActor: () =>
        Effect.succeed({
          actor: {
            displayDetail: "Team member",
            displayName: "Taylor Member",
            id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
            kind: "member",
          },
          sourceUserId: internalActor.userId,
        }),
      getById: () => Effect.succeed(missingProductActors.get("missing")),
    } as unknown as ContextService<typeof ProductActivityActorsRepository>)
  );
  const jobsRepositoryLayer = Layer.succeed(
    JobsRepository,
    JobsRepository.of({
      addComment: (input: { readonly body: string }) => {
        options.calls.addComment += 1;
        return Effect.succeed(
          decodeJobComment({
            actor: {
              displayDetail: "Team member",
              displayName: "Taylor Member",
              id: "99999999-9999-4999-8999-999999999999",
              kind: "member",
            },
            actorId: "99999999-9999-4999-8999-999999999999",
            authorName: "Taylor Member",
            body: input.body,
            createdAt: "2026-05-20T10:00:00.000Z",
            id: "33333333-3333-4333-8333-333333333333",
            workItemId,
          })
        );
      },
      findByIdForUpdate: () =>
        Effect.succeed(Option.some(options.job ?? existingJob)),
      withTransaction: <Value, Error, Requirements>(
        effect: Effect.Effect<Value, Error, Requirements>
      ) => {
        options.calls.withTransaction += 1;
        return effect;
      },
    } as unknown as ContextService<typeof JobsRepository>)
  );

  return Layer.mergeAll(
    activityEventsLayer,
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(internalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsActivityRecorder.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          activityActorsLayer,
          activityEventsLayer,
          jobsRepositoryLayer
        )
      )
    ),
    JobsAuthorization.Default,
    jobsRepositoryLayer,
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer(),
    Layer.succeed(
      RouteProximityService,
      RouteProximityService.of(
        {} as ContextService<typeof RouteProximityService>
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeJobsHomeDashboardSummaryTestLayer(options: {
  readonly calls: { summary: number };
  readonly summary: Schema.Schema.Type<
    typeof HomeDashboardSummaryResponseSchema
  >;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(internalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        getHomeDashboardSummary: () => {
          options.calls.summary += 1;
          return Effect.succeed(options.summary);
        },
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer(),
    Layer.succeed(
      RouteProximityService,
      RouteProximityService.of(
        {} as ContextService<typeof RouteProximityService>
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeJobsExternalOptionsServiceTestLayer(options: {
  readonly actor: OrganizationActor;
  readonly calls: { organizationId: string; userId: string }[];
  readonly scopedOptions: JobOptionsResponse;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(options.actor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        listExternalScopedOptions: (
          organizationId: OrganizationActor["organizationId"],
          userId: OrganizationActor["userId"]
        ) => {
          options.calls.push({ organizationId, userId });
          return Effect.succeed(options.scopedOptions);
        },
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer(),
    Layer.succeed(
      RouteProximityService,
      RouteProximityService.of(
        {} as ContextService<typeof RouteProximityService>
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeJobsProximityTestLayer(options: {
  readonly listProximityCandidates: ContextService<
    typeof JobsRepository
  >["listProximityCandidates"];
  readonly previewRoute: (
    input: RoutePreviewInput
  ) => ReturnType<ContextService<typeof RouteProvider>["previewRoute"]>;
  readonly rankRoutes: ContextService<typeof RouteProvider>["rankRoutes"];
  readonly routeProximityLocationEnabled?: boolean | undefined;
  readonly userPreferencesGet?:
    | ContextService<typeof UserPreferencesRepository>["get"]
    | undefined;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(internalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        listProximityCandidates: options.listProximityCandidates,
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer({
      get: options.userPreferencesGet,
      routeProximityLocationEnabled: options.routeProximityLocationEnabled,
    }),
    RouteProximityService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          RouteProvider,
          RouteProvider.of({
            previewRoute: options.previewRoute,
            rankRoutes: options.rankRoutes,
          })
        )
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeJobsRoutePreviewTestLayer(options: {
  readonly getDetail: ContextService<typeof JobsRepository>["getDetail"];
  readonly previewRoute: (
    input: RoutePreviewInput
  ) => ReturnType<ContextService<typeof RouteProvider>["previewRoute"]>;
  readonly rankRoutes: ContextService<typeof RouteProvider>["rankRoutes"];
  readonly routeProximityLocationEnabled?: boolean | undefined;
  readonly userPreferencesGet?:
    | ContextService<typeof UserPreferencesRepository>["get"]
    | undefined;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(internalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        getDetail: options.getDetail,
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    makeUserPreferencesRepositoryLayer({
      get: options.userPreferencesGet,
      routeProximityLocationEnabled: options.routeProximityLocationEnabled,
    }),
    RouteProximityService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.succeed(
          RouteProvider,
          RouteProvider.of({
            previewRoute: options.previewRoute,
            rankRoutes: options.rankRoutes,
          })
        )
      )
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}

function makeUserPreferencesRepositoryLayer(
  options: {
    readonly get?:
      | ContextService<typeof UserPreferencesRepository>["get"]
      | undefined;
    readonly routeProximityLocationEnabled?: boolean | undefined;
  } = {}
) {
  return Layer.succeed(
    UserPreferencesRepository,
    UserPreferencesRepository.of({
      get:
        options.get ??
        (() =>
          Effect.succeed(
            decodeUserPreferences({
              routeProximityLocationEnabled:
                options.routeProximityLocationEnabled ?? true,
              updatedAt: "2026-05-20T09:00:00.000Z",
            })
          )),
      update: () => Effect.die("UserPreferencesRepository.update not stubbed"),
    })
  );
}

function makeJobListItem(
  id: string,
  title: string,
  priority: "high" | "low" | "medium" | "none" | "urgent",
  siteId?: string
) {
  return decodeJobListItem({
    createdAt: "2026-05-20T09:00:00.000Z",
    id,
    kind: "job",
    labels: [],
    priority,
    siteId,
    status: "new",
    title,
    updatedAt: "2026-05-20T10:00:00.000Z",
  });
}

function makeMappedSite(
  id: string,
  name: string,
  latitude: number,
  longitude: number
) {
  return decodeSiteOption({
    displayLocation: `${name}, Dublin`,
    formattedAddress: `${name}, Dublin, Ireland`,
    googlePlaceId: `place-${id}`,
    hasUsableCoordinates: true,
    id,
    labels: [],
    latitude,
    locationProvider: "google_places",
    locationResolvedAt: "2026-05-20T09:00:00.000Z",
    locationStatus: "google_resolved",
    longitude,
    name,
    rawLocationInput: name,
    updatedAt: "2026-05-20T09:30:00.000Z",
  });
}

function makeRouteSummary(durationSeconds: number, distanceMeters: number) {
  return {
    computedAt: "2026-05-20T10:15:00.000Z",
    distanceMeters,
    durationSeconds,
    provider: "google_routes" as const,
    providerRequestKind: "matrix" as const,
    routeStatus: "ok" as const,
    trafficAware: true,
  };
}
