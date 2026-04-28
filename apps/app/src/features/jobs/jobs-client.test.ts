import type {
  CreateSiteResponse,
  JobDetailResponse,
  JobListResponse,
  SitesOptionsResponse,
  SiteIdType,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import {
  JOB_NOT_FOUND_ERROR_TAG,
  JobNotFoundError,
} from "@task-tracker/jobs-core";
import { Effect, Either } from "effect";

import {
  makeBrowserJobsClient,
  provideBrowserJobsHttp,
  runBrowserJobsRequest,
  runJobsClient,
} from "./jobs-client";
import {
  JOBS_API_ORIGIN_RESOLUTION_ERROR_TAG,
  JOBS_REQUEST_ERROR_TAG,
  normalizeJobsError,
} from "./jobs-errors";

const listResponse: JobListResponse = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
      kind: "job",
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
    title: "Inspect boiler",
    status: "new",
    priority: "none",
    createdByUserId: "22222222-2222-4222-8222-222222222222" as UserIdType,
    createdAt: "2026-04-23T11:00:00.000Z",
    updatedAt: "2026-04-23T12:00:00.000Z",
  },
  comments: [],
  activity: [],
  visits: [],
};

const createSiteResponse: CreateSiteResponse = {
  addressLine1: "1 Custom House Quay",
  county: "Dublin",
  country: "IE",
  eircode: "D01 X2X2",
  geocodedAt: "2026-04-27T10:00:00.000Z",
  geocodingProvider: "stub",
  id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
  latitude: 53.3498,
  longitude: -6.2603,
  name: "Docklands Campus",
  town: "Dublin",
};

const siteOptionsResponse: SitesOptionsResponse = {
  serviceAreas: [],
  sites: [createSiteResponse],
};

describe("jobs client", () => {
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
      runJobsClient(
        {
          requestOrigin: "https://agent-one.app.task-tracker.localhost:1355",
          cookie: "better-auth.session_token=session-token",
        },
        "JobsServer.test.listJobs",
        (client) => client.jobs.listJobs({ urlParams: {} })
      )
    ).resolves.toStrictEqual(listResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "https://agent-one.api.task-tracker.localhost:1355/jobs"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("supports browser-side client creation from the current app origin mapping", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(detailResponse));

    const client = await makeBrowserJobsClient("http://127.0.0.1:3000").pipe(
      provideBrowserJobsHttp,
      Effect.runPromise
    );

    await expect(
      client.jobs
        .getJobDetail({
          path: {
            workItemId:
              "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
          },
        })
        .pipe(provideBrowserJobsHttp, Effect.runPromise)
    ).resolves.toStrictEqual(detailResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "http://127.0.0.1:3001/jobs/11111111-1111-4111-8111-111111111111"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
  }, 1000);

  it("creates standalone sites through the shared jobs API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(createSiteResponse, { status: 201 }));

    await expect(
      runJobsClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.createSite",
        (client) =>
          client.sites.createSite({
            payload: {
              addressLine1: "1 Custom House Quay",
              country: "IE",
              county: "Dublin",
              eircode: "D01 X2X2",
              name: "Docklands Campus",
              town: "Dublin",
            },
          })
      )
    ).resolves.toStrictEqual(createSiteResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://127.0.0.1:3001/sites");
    expect(requestInit?.method).toBe("POST");
  }, 1000);

  it("loads standalone site options through the shared jobs API client", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(siteOptionsResponse));

    await expect(
      runJobsClient(
        {
          requestOrigin: "http://127.0.0.1:3000",
        },
        "SitesServer.test.getSiteOptions",
        (client) => client.sites.getSiteOptions()
      )
    ).resolves.toStrictEqual(siteOptionsResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://127.0.0.1:3001/sites/options");
    expect(requestInit?.method).toBe("GET");
  }, 1000);

  it("does not invoke fetch when the jobs API origin cannot be resolved", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const capturedError = await runJobsClient(
      {},
      "JobsServer.test.unresolvedOrigin",
      (client) => client.jobs.listJobs({ urlParams: {} })
    ).then(
      () => {},
      (rejectedError) => rejectedError
    );

    expect(capturedError).toMatchObject({
      _tag: JOBS_API_ORIGIN_RESOLUTION_ERROR_TAG,
      message: "Cannot resolve the jobs API origin.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("normalizes transport failures into a stable jobs request error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const capturedError = await runJobsClient(
      {
        requestOrigin: "http://127.0.0.1:3000",
      },
      "JobsServer.test.transportFailure",
      (client) => client.jobs.listJobs({ urlParams: {} })
    ).then(
      () => {},
      (rejectedError) => rejectedError
    );

    expect(capturedError).toMatchObject({
      _tag: JOBS_REQUEST_ERROR_TAG,
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
      runBrowserJobsRequest("JobsBrowser.test.listJobs", (client) =>
        client.jobs.listJobs({ urlParams: {} })
      ).pipe(Effect.runPromise)
    ).resolves.toStrictEqual(listResponse);

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.credentials).toBe("include");

    const failure = await runBrowserJobsRequest(
      "JobsBrowser.test.listJobs.failure",
      (client) => client.jobs.listJobs({ urlParams: {} })
    ).pipe(Effect.either, Effect.runPromise);

    if (Either.isRight(failure)) {
      throw new Error("Expected browser request to fail");
    }
    expect(failure.left).toMatchObject({
      _tag: JOBS_REQUEST_ERROR_TAG,
      message: expect.stringContaining("Transport"),
    });
  }, 1000);

  it("preserves jobs-core tagged domain errors", () => {
    const domainError = new JobNotFoundError({
      message: "Job not found",
      workItemId: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
    });

    expect(normalizeJobsError(domainError)).toBe(domainError);
    expect(normalizeJobsError(domainError)).toMatchObject({
      _tag: JOB_NOT_FOUND_ERROR_TAG,
      message: "Job not found",
    });
  }, 1000);
});
