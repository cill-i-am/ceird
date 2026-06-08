import {
  decodeUserPreferences,
  OrganizationId,
  UserId,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import {
  CreateJobInputSchema,
  JobCollaboratorSchema,
  JobDetailResponseSchema,
  JobListItemSchema,
  JobCommentSchema,
  JobDetailSchema,
  JobSchema,
} from "@ceird/jobs-core";
import type { JobCollaborator, JobProximityFilters } from "@ceird/jobs-core";
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
const decodeJobCollaborator = Schema.decodeUnknownSync(JobCollaboratorSchema);
const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeJobDetail = Schema.decodeUnknownSync(JobDetailSchema);
const decodeJobListItem = Schema.decodeUnknownSync(JobListItemSchema);
const decodeGooglePlaceId = Schema.decodeUnknownSync(GooglePlaceId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeSiteOption = Schema.decodeUnknownSync(SiteOptionSchema);
const decodeUserId = Schema.decodeUnknownSync(UserId);
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

  it("denies read-only external collaborators when adding comments", async () => {
    const calls = { addComment: 0, withTransaction: 0 };
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
  });

  it("allows comment-level external collaborators to add comments", async () => {
    const calls = { addComment: 0, withTransaction: 0 };
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

function makeJobsServiceTestLayer(options: {
  readonly calls: { addComment: number; withTransaction: number };
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
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        addComment: () => {
          options.calls.addComment += 1;
          return Effect.succeed(
            decodeJobComment({
              authorName: "External Contact",
              authorUserId: externalActor.userId,
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
