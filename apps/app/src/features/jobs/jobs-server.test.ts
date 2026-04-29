/* oxlint-disable unicorn/no-useless-undefined */
// @vitest-environment node

import type {
  JobLabelIdType,
  JobLabelsResponse,
  ActivityIdType,
  JobMemberOptionsResponse,
  JobListResponse,
  JobOptionsResponse,
  OrganizationActivityListResponse,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";

import { JOBS_REQUEST_ERROR_TAG } from "./jobs-errors";
import {
  listAllCurrentServerJobsDirect as listAllCurrentServerJobs,
  getCurrentServerJobDetailDirect as getCurrentServerJobDetail,
  getCurrentServerJobLabelsDirect as getCurrentServerJobLabels,
  getCurrentServerJobMemberOptionsDirect as getCurrentServerJobMemberOptions,
  getCurrentServerJobOptionsDirect as getCurrentServerJobOptions,
  listCurrentServerOrganizationActivityDirect as listCurrentServerOrganizationActivity,
  listCurrentServerJobsDirect as listCurrentServerJobs,
} from "./jobs-server-ssr";

const { mockedGetRequestHeader } = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
}));

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

const optionsResponse: JobOptionsResponse = {
  contacts: [],
  labels: [],
  members: [
    {
      id: "22222222-2222-4222-8222-222222222222" as UserIdType,
      name: "Owner User",
    },
  ],
  serviceAreas: [],
  sites: [],
};

const labelsResponse: JobLabelsResponse = {
  labels: [
    {
      id: "33333333-3333-4333-8333-333333333333" as JobLabelIdType,
      name: "Waiting on PO",
      createdAt: "2026-04-28T10:00:00.000Z",
      updatedAt: "2026-04-28T10:00:00.000Z",
    },
  ],
};

const memberOptionsResponse: JobMemberOptionsResponse = {
  members: optionsResponse.members,
};

const organizationActivityResponse: OrganizationActivityListResponse = {
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333" as ActivityIdType,
      workItemId: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
      jobTitle: "Inspect boiler",
      eventType: "job_created",
      payload: {
        eventType: "job_created",
        title: "Inspect boiler",
        kind: "job",
        priority: "none",
      },
      createdAt: "2026-04-23T12:00:00.000Z",
    },
  ],
};

describe("server jobs helpers", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
  });

  it("forwards the current auth cookie when listing a single jobs page", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(listResponse));

    await expect(
      listCurrentServerJobs({
        limit: 10,
      })
    ).resolves.toStrictEqual(listResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://tt-sbx-api:4301/jobs?limit=10");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("exhausts paginated job pages before returning the full server list", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";
    const [firstItem] = listResponse.items;

    if (!firstItem) {
      throw new Error("Expected at least one seeded job item.");
    }

    const firstPage: JobListResponse = {
      items: [firstItem],
      nextCursor: "cursor_123" as NonNullable<JobListResponse["nextCursor"]>,
    };
    const secondPage: JobListResponse = {
      items: [
        {
          id: "22222222-2222-4222-8222-222222222222" as WorkItemIdType,
          kind: "job",
          labels: [],
          title: "Replace air valve",
          status: "triaged",
          priority: "high",
          updatedAt: "2026-04-23T15:00:00.000Z",
          createdAt: "2026-04-23T14:00:00.000Z",
        },
      ],
      nextCursor: undefined,
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json(secondPage));

    await expect(listAllCurrentServerJobs({})).resolves.toStrictEqual({
      items: [...firstPage.items, ...secondPage.items],
      nextCursor: undefined,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://tt-sbx-api:4301/jobs"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://tt-sbx-api:4301/jobs?cursor=cursor_123"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
    });
  }, 1000);

  it("fails closed when no configured API origin exists for server jobs requests", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.API_ORIGIN;

    await expect(
      getCurrentServerJobDetail(
        "11111111-1111-4111-8111-111111111111" as WorkItemIdType
      )
    ).rejects.toMatchObject({
      _tag: JOBS_REQUEST_ERROR_TAG,
      message: "Cannot resolve the jobs API origin for server jobs requests.",
    });
  }, 1000);

  it("does not invoke fetch when the incoming request has no auth cookie", async () => {
    mockedGetRequestHeader.mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const capturedError = await listCurrentServerJobs({}).then(
      () => {},
      (rejectedError) => rejectedError
    );

    expect(capturedError).toMatchObject({
      _tag: JOBS_REQUEST_ERROR_TAG,
      message: "Cannot query jobs without the current auth cookie.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);

  it("forwards the current auth cookie when reading job options", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(optionsResponse));

    await expect(getCurrentServerJobOptions()).resolves.toStrictEqual(
      optionsResponse
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://tt-sbx-api:4301/jobs/options");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards the current auth cookie when reading job labels", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(labelsResponse));

    await expect(getCurrentServerJobLabels()).resolves.toStrictEqual(
      labelsResponse
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://tt-sbx-api:4301/job-labels");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards the current auth cookie when reading job member options", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(memberOptionsResponse));

    await expect(getCurrentServerJobMemberOptions()).resolves.toStrictEqual(
      memberOptionsResponse
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://tt-sbx-api:4301/jobs/member-options");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards the current auth cookie when listing organization activity", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizationActivityResponse));

    await expect(
      listCurrentServerOrganizationActivity({
        limit: 10,
      })
    ).resolves.toStrictEqual(organizationActivityResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://tt-sbx-api:4301/activity?limit=10");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);
});
