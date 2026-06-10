import {
  AGENT_THREAD_NOT_FOUND_ERROR_TAG,
  AgentThreadId,
  AgentThreadNotFoundError,
} from "@ceird/agents-core";
import {
  ORGANIZATION_SECURITY_ACTIVITY_ACCESS_DENIED_ERROR_TAG,
  OrganizationSecurityActivityAccessDeniedError,
  USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG,
  UserPreferencesAccessDeniedError,
} from "@ceird/identity-core";
import { JOB_NOT_FOUND_ERROR_TAG, JobNotFoundError } from "@ceird/jobs-core";
import type {
  JobDetailResponse,
  JobListResponse,
  JobProximityResponse,
  JobRoutePreviewResponse,
  UserIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import {
  LABEL_NOT_FOUND_ERROR_TAG,
  LabelNotFoundError,
} from "@ceird/labels-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import {
  PROXIMITY_PROVIDER_ERROR_TAG,
  ProximityProviderError,
} from "@ceird/proximity-core";
import type {
  GooglePlaceIdType as ProximityGooglePlaceIdType,
  GooglePlacesSessionTokenType as ProximityGooglePlacesSessionTokenType,
  ProximityOriginAutocompleteResponse,
  ProximityOriginPlaceDetailsResponse,
  TypedOrigin,
} from "@ceird/proximity-core";
import type {
  CreateSiteResponse,
  GooglePlaceIdType,
  SiteIdType,
  SiteProximityResponse,
  SiteRoutePreviewResponse,
  SitesOptionsResponse,
} from "@ceird/sites-core";
import { Effect, Result, Schema } from "effect";

import {
  makeBrowserAppApiClient,
  provideBrowserAppApiHttp,
  runBrowserAppApiRequest,
  runAppApiClient,
} from "#/features/api/app-api-client";
import {
  APP_API_ORIGIN_RESOLUTION_ERROR_TAG,
  APP_API_REQUEST_ERROR_TAG,
  normalizeAppApiError,
} from "#/features/api/app-api-errors";

const listResponse: JobListResponse = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
      kind: "job",
      labels: [],
      title: "Inspect boiler",
      status: "new",
      priority: "none",
      updatedAt: "2026-04-23T12:00:00.000Z",
      createdAt: "2026-04-23T11:00:00.000Z",
    },
  ],
};

const detailResponse: JobDetailResponse = {
  job: {
    id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
    kind: "job",
    labels: [],
    title: "Inspect boiler",
    status: "new",
    priority: "none",
    createdByUserId: "22222222-2222-4222-8222-222222222222" as UserIdType,
    createdAt: "2026-04-23T11:00:00.000Z",
    updatedAt: "2026-04-23T12:00:00.000Z",
  },
  comments: [],
  activity: [],
  viewerAccess: {
    canComment: true,
    visibility: "internal",
  },
  visits: [],
};

const createSiteResponse: CreateSiteResponse = {
  addressLine1: "1 Custom House Quay",
  county: "Dublin",
  country: "IE",
  displayLocation: "1 Custom House Quay, Dublin, D01 X2X2",
  eircode: "D01 X2X2",
  formattedAddress: "1 Custom House Quay, Dublin, D01 X2X2, Ireland",
  googlePlaceId: "ChIJdocklands" as GooglePlaceIdType,
  hasUsableCoordinates: true,
  id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
  labels: [],
  latitude: 53.3498,
  locationProvider: "google_places",
  locationResolvedAt: "2026-04-27T10:00:00.000Z",
  locationStatus: "google_resolved",
  longitude: -6.2603,
  name: "Docklands Campus",
  town: "Dublin",
};

const siteLabelId = "44444444-4444-4444-8444-444444444444" as LabelIdType;

const siteLabel: Label = {
  createdAt: "2026-04-27T10:00:00.000Z",
  id: siteLabelId,
  name: "Urgent",
  updatedAt: "2026-04-27T10:00:00.000Z",
};

const siteWithLabelResponse: CreateSiteResponse = {
  ...createSiteResponse,
  labels: [siteLabel],
};

const siteOptionsResponse: SitesOptionsResponse = {
  sites: [createSiteResponse],
};

const routeSummary = {
  computedAt: "2026-06-06T10:00:00.000Z",
  distanceMeters: 4200,
  durationSeconds: 840,
  provider: "google_routes",
  providerRequestKind: "matrix",
  routeStatus: "ok",
  trafficAware: true,
} as const;

const originSummary = {
  computedAt: "2026-06-06T10:00:00.000Z",
  coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
  displayText: "Current location",
  mode: "current_location",
} as const;

const jobProximityResponse: JobProximityResponse = {
  meta: {
    candidateCount: 1,
    candidateLimitApplied: false,
    excluded: [],
    rankedCandidateLimit: 100,
  },
  origin: originSummary,
  rows: [
    {
      job: listResponse.items[0],
      routeSummary,
      site: createSiteResponse,
    },
  ],
};

const jobRoutePreviewResponse: JobRoutePreviewResponse = {
  job: listResponse.items[0],
  origin: originSummary,
  routeSummary,
  site: createSiteResponse,
};

const siteProximityResponse: SiteProximityResponse = {
  meta: {
    candidateCount: 1,
    candidateLimitApplied: false,
    excluded: [],
    rankedCandidateLimit: 100,
  },
  origin: originSummary,
  rows: [
    {
      activeJobCount: 1,
      highestActiveJobPriority: "urgent",
      routeSummary,
      site: createSiteResponse,
    },
  ],
};

const siteRoutePreviewResponse: SiteRoutePreviewResponse = {
  activeJobCount: 1,
  highestActiveJobPriority: "urgent",
  origin: originSummary,
  routeSummary,
  site: createSiteResponse,
};

const originAutocompleteResponse: ProximityOriginAutocompleteResponse = {
  suggestions: [
    {
      displayText: "Dublin Port",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" as ProximityGooglePlaceIdType,
      secondaryText: "Dublin, Ireland",
    },
  ],
};

const originPlaceDetailsResponse: ProximityOriginPlaceDetailsResponse = {
  origin: {
    coordinates: { latitude: 53.3478, longitude: -6.1956 },
    displayText: "Dublin Port, Dublin, Ireland",
    mode: "typed_origin",
    originToken: "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" as ProximityGooglePlaceIdType,
  },
};

describe("app API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the mapped API origin and forwards cookies when present", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(listResponse));

    await expect(
      runAppApiClient(
        {
          requestOrigin: "https://app.ceird.example.com",
          cookie: "better-auth.session_token=session-token",
        },
        "JobsServer.test.listJobs",
        (client) => client.jobs.listJobs({ query: {} })
      )
    ).resolves.toStrictEqual(listResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("https://api.ceird.example.com/jobs");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards the public SSR origin and API host when provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(listResponse));

    await expect(
      runAppApiClient(
        {
          apiOrigin: "https://api.example.com",
          cookie: "better-auth.session_token=session-token",
          forwardedHeaders: {
            origin: "https://app.ceird.example.com",
            "x-forwarded-host": "api.ceird.example.com",
            "x-forwarded-proto": "https",
          },
        },
        "JobsServer.test.listJobs.forwarded",
        (client) => client.jobs.listJobs({ query: {} })
      )
    ).resolves.toStrictEqual(listResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("https://api.example.com/jobs");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
      origin: "https://app.ceird.example.com",
      "x-forwarded-host": "api.ceird.example.com",
      "x-forwarded-proto": "https",
    });
  }, 1000);

  it("supports browser-side client creation from the current app origin mapping", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(detailResponse));

    const client = await makeBrowserAppApiClient("http://127.0.0.1:3000").pipe(
      provideBrowserAppApiHttp,
      Effect.runPromise
    );

    await expect(
      client.jobs
        .getJobDetail({
          params: {
            workItemId:
              "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
          },
        })
        .pipe(provideBrowserAppApiHttp, Effect.runPromise)
    ).resolves.toStrictEqual(detailResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "http://127.0.0.1:3001/jobs/11111111-1111-4111-8111-111111111111"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
  }, 1000);

  it("uses the local app proxy base path for stage-scoped Portless browser clients", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(listResponse));

    const client = await makeBrowserAppApiClient(
      "https://app.codex-portless.ceird.localhost"
    ).pipe(provideBrowserAppApiHttp, Effect.runPromise);

    await expect(
      client.jobs
        .listJobs({
          query: {},
        })
        .pipe(provideBrowserAppApiHttp, Effect.runPromise)
    ).resolves.toStrictEqual(listResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "https://app.codex-portless.ceird.localhost/api/jobs"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
  }, 1000);

  it("creates standalone sites through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(createSiteResponse, { status: 201 }));

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.createSite",
        (client) =>
          client.sites.createSite({
            payload: {
              location: {
                country: "IE",
                kind: "manual",
                rawInput: "1 Custom House Quay, Dublin D01 X2X2",
              },
              name: "Docklands Campus",
            },
          })
      )
    ).resolves.toStrictEqual(createSiteResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://127.0.0.1:3001/sites");
    expect(requestInit?.method).toBe("POST");
  }, 1000);

  it("loads standalone sites through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({ items: siteOptionsResponse.sites, nextCursor: "next" })
      );

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.listSites",
        (client) => client.sites.listSites({ query: { limit: 25 } })
      )
    ).resolves.toStrictEqual({
      items: siteOptionsResponse.sites,
      nextCursor: "next",
    });

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://127.0.0.1:3001/sites?limit=25");
    expect(requestInit?.method).toBe("GET");
  }, 1000);

  it("runs route-aware jobs and sites computations through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(jobProximityResponse))
      .mockResolvedValueOnce(Response.json(jobRoutePreviewResponse))
      .mockResolvedValueOnce(Response.json(siteProximityResponse))
      .mockResolvedValueOnce(Response.json(siteRoutePreviewResponse));
    const origin = {
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location" as const,
    };

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "ProximityServer.test.routeAwareEndpoints",
        (client) =>
          Effect.gen(function* () {
            const jobs = yield* client.jobs.rankNearbyJobs({
              payload: {
                filters: { priority: "urgent", status: "active" },
                limit: 10,
                origin,
              },
            });
            const jobRoute = yield* client.jobs.getJobRoutePreview({
              params: {
                workItemId:
                  "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
              },
              payload: { origin },
            });
            const sites = yield* client.sites.rankNearbySites({
              payload: {
                filters: { query: "docklands" },
                origin,
              },
            });
            const siteRoute = yield* client.sites.getSiteRoutePreview({
              params: { siteId: createSiteResponse.id },
              payload: { includeRouteLine: true, origin },
            });

            return { jobRoute, jobs, siteRoute, sites };
          })
      )
    ).resolves.toStrictEqual({
      jobRoute: jobRoutePreviewResponse,
      jobs: jobProximityResponse,
      siteRoute: siteRoutePreviewResponse,
      sites: siteProximityResponse,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:3001/jobs/proximity"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://127.0.0.1:3001/jobs/11111111-1111-4111-8111-111111111111/route-preview"
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://127.0.0.1:3001/sites/proximity"
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[3]?.[0])).toBe(
      "http://127.0.0.1:3001/sites/33333333-3333-4333-8333-333333333333/route-preview"
    );
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("POST");
  }, 1000);

  it("runs proximity origin lookup through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(originAutocompleteResponse))
      .mockResolvedValueOnce(Response.json(originPlaceDetailsResponse));

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "ProximityServer.test.originLookup",
        (client) =>
          Effect.gen(function* () {
            const suggestions = yield* client.proximity.autocompleteOrigin({
              payload: {
                country: "IE",
                input: "dub port",
                sessionToken:
                  "550e8400-e29b-41d4-a716-446655440000" as ProximityGooglePlacesSessionTokenType,
              },
            });
            const details = yield* client.proximity.getOriginPlaceDetails({
              payload: {
                placeId:
                  "ChIJN1t_tDeuEmsRUsoyG83frY4" as ProximityGooglePlaceIdType,
                rawInput: "dub port",
                sessionToken:
                  "550e8400-e29b-41d4-a716-446655440000" as ProximityGooglePlacesSessionTokenType,
              },
            });

            return { details, suggestions };
          })
      )
    ).resolves.toStrictEqual({
      details: originPlaceDetailsResponse,
      suggestions: originAutocompleteResponse,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:3001/proximity/origins/autocomplete"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://127.0.0.1:3001/proximity/origins/place-details"
    );
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  }, 1000);

  it("assigns labels to standalone sites through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(siteWithLabelResponse));

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.assignSiteLabel",
        (client) =>
          client.sites.assignSiteLabel({
            params: { siteId: createSiteResponse.id },
            payload: { labelId: siteLabelId },
          })
      )
    ).resolves.toStrictEqual(siteWithLabelResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "http://127.0.0.1:3001/sites/33333333-3333-4333-8333-333333333333/labels"
    );
    expect(requestInit?.method).toBe("POST");
  }, 1000);

  it("removes labels from standalone sites through the shared Ceird API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(createSiteResponse));

    await expect(
      runAppApiClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.removeSiteLabel",
        (client) =>
          client.sites.removeSiteLabel({
            params: { labelId: siteLabelId, siteId: createSiteResponse.id },
          })
      )
    ).resolves.toStrictEqual(createSiteResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "http://127.0.0.1:3001/sites/33333333-3333-4333-8333-333333333333/labels/44444444-4444-4444-8444-444444444444"
    );
    expect(requestInit?.method).toBe("DELETE");
  }, 1000);

  it("does not invoke fetch when the Ceird API origin cannot be resolved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const capturedError = await runAppApiClient(
      {},
      "JobsServer.test.unresolvedOrigin",
      (client) => client.jobs.listJobs({ query: {} })
    ).then(
      () => {},
      (rejectedError) => rejectedError
    );

    expect(capturedError).toMatchObject({
      _tag: APP_API_ORIGIN_RESOLUTION_ERROR_TAG,
      message: "Cannot resolve the Ceird API origin.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("normalizes transport failures into a stable app API request error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const capturedError = await runAppApiClient(
      {
        requestOrigin: "http://127.0.0.1:3000",
      },
      "JobsServer.test.transportFailure",
      (client) => client.jobs.listJobs({ query: {} })
    ).then(
      () => {},
      (rejectedError) => rejectedError
    );

    expect(capturedError).toMatchObject({
      _tag: APP_API_REQUEST_ERROR_TAG,
      message: expect.stringContaining("Transport"),
    });
  }, 1000);

  it("runs browser requests with HTTP provision and normalized errors", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(listResponse))
      .mockRejectedValueOnce(new Error("network down"));

    await expect(
      runBrowserAppApiRequest("JobsBrowser.test.listJobs", (client) =>
        client.jobs.listJobs({ query: {} })
      ).pipe(Effect.runPromise)
    ).resolves.toStrictEqual(listResponse);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.credentials).toBe("include");

    const failure = await runBrowserAppApiRequest(
      "JobsBrowser.test.listJobs.failure",
      (client) => client.jobs.listJobs({ query: {} })
    ).pipe(Effect.result, Effect.runPromise);

    if (Result.isSuccess(failure)) {
      throw new Error("Expected browser request to fail");
    }
    expect(failure.failure).toMatchObject({
      _tag: APP_API_REQUEST_ERROR_TAG,
      message: expect.stringContaining("Transport"),
    });
  }, 1000);

  it("preserves jobs-core tagged domain errors", () => {
    const domainError = new JobNotFoundError({
      message: "Job not found",
      workItemId: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: JOB_NOT_FOUND_ERROR_TAG,
      message: "Job not found",
    });
  }, 1000);

  it("preserves identity-core user preference tagged domain errors", () => {
    const domainError = new OrganizationSecurityActivityAccessDeniedError({
      message: "Only organization owners and admins can view security activity",
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: ORGANIZATION_SECURITY_ACTIVITY_ACCESS_DENIED_ERROR_TAG,
      message: "Only organization owners and admins can view security activity",
    });
  }, 1000);

  it("preserves labels-core tagged domain errors", () => {
    const domainError = new LabelNotFoundError({
      labelId: "44444444-4444-4444-8444-444444444444" as LabelIdType,
      message: "Label not found",
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: LABEL_NOT_FOUND_ERROR_TAG,
      message: "Label not found",
    });
  }, 1000);

  it("preserves agents-core tagged domain errors", () => {
    const threadId = Schema.decodeUnknownSync(AgentThreadId)(
      "11111111-1111-4111-8111-111111111111"
    );
    const domainError = new AgentThreadNotFoundError({
      message: "Agent thread not found",
      threadId,
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: AGENT_THREAD_NOT_FOUND_ERROR_TAG,
      message: "Agent thread not found",
    });
  }, 1000);

  it("preserves identity-core tagged domain errors", () => {
    const domainError = new UserPreferencesAccessDeniedError({
      message: "Authentication is required",
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: USER_PREFERENCES_ACCESS_DENIED_ERROR_TAG,
      message: "Authentication is required",
    });
  }, 1000);

  it("preserves proximity-core tagged domain errors", () => {
    const domainError = new ProximityProviderError({
      message: "Route provider failed",
      provider: "google_routes",
      reason: "request_denied",
    });

    expect(normalizeAppApiError(domainError)).toBe(domainError);
    expect(normalizeAppApiError(domainError)).toMatchObject({
      _tag: PROXIMITY_PROVIDER_ERROR_TAG,
      message: "Route provider failed",
    });
  }, 1000);
});
