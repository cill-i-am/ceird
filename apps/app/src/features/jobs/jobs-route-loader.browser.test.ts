import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import type {
  JobDetailResponse,
  JobListCursorType,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";

type JobsListLookupMock = (query?: JobListQuery) => Promise<JobListResponse>;
type JobOptionsLookupMock = () => Promise<JobOptionsResponse>;
type JobDetailLookupMock = () => Promise<JobDetailResponse>;

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentServerJobDetail,
  mockedGetCurrentServerExternalJobOptions,
  mockedGetCurrentServerJobOptions,
  mockedGetCurrentUserPreferences,
  mockedListAllCurrentServerJobs,
  mockedListCurrentServerJobs,
} = vi.hoisted(() => ({
  mockedGetCurrentServerJobDetail: vi.fn<JobDetailLookupMock>(),
  mockedGetCurrentServerExternalJobOptions: vi.fn<JobOptionsLookupMock>(),
  mockedGetCurrentServerJobOptions: vi.fn<JobOptionsLookupMock>(),
  mockedGetCurrentUserPreferences: vi.fn<
    () => Promise<{
      preferences: {
        routeProximityLocationEnabled: boolean;
        updatedAt: string;
      };
    }>
  >(),
  mockedListAllCurrentServerJobs: vi.fn<JobsListLookupMock>(),
  mockedListCurrentServerJobs: vi.fn<JobsListLookupMock>(),
}));

vi.mock(import("#/features/jobs/jobs-server"), () => ({
  getCurrentServerJobDetail: mockedGetCurrentServerJobDetail,
  getCurrentServerExternalJobOptions: mockedGetCurrentServerExternalJobOptions,
  getCurrentServerJobOptions: mockedGetCurrentServerJobOptions,
  listAllCurrentServerJobs: mockedListAllCurrentServerJobs,
  listCurrentServerJobs: mockedListCurrentServerJobs,
}));

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  getCurrentUserPreferences: mockedGetCurrentUserPreferences,
}));

describe("jobs route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the jobs list and internal job options in parallel", async () => {
    const calls: string[] = [];
    let listResolved = false;
    const listDeferred = Promise.withResolvers<JobListResponse>();
    const optionsDeferred = Promise.withResolvers<JobOptionsResponse>();
    const list = {
      items: [],
      nextCursor: undefined,
    } satisfies JobListResponse;
    const options = {
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    } satisfies JobOptionsResponse;

    mockedListCurrentServerJobs.mockImplementation(() => {
      calls.push("list:start");
      return listDeferred.promise;
    });
    mockedGetCurrentServerJobOptions.mockImplementation(() => {
      calls.push(`options:start:listResolved:${String(listResolved)}`);
      return optionsDeferred.promise;
    });
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const { loadJobsRouteData } = await import("./jobs-route-loader");
    const resultPromise = loadJobsRouteData({
      activeOrganizationId: organizationId,
      activeOrganizationSync: {
        required: false,
        targetOrganizationId: organizationId,
      },
      currentOrganizationRole: "owner",
      currentUserId: decodeUserId("user_123"),
    });

    expect(calls).toStrictEqual([
      "list:start",
      "options:start:listResolved:false",
    ]);

    optionsDeferred.resolve(options);
    listResolved = true;
    listDeferred.resolve(list);

    await expect(resultPromise).resolves.toMatchObject({
      list,
      options,
      routeProximityLocationEnabled: true,
      viewer: {
        role: "owner",
        userId: "user_123",
      },
    });
  });

  it("passes bounded page and filter input to the jobs list request", async () => {
    const list = {
      items: [],
      nextCursor: "cursor-two" as JobListCursorType,
    } satisfies JobListResponse;
    const options = {
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    } satisfies JobOptionsResponse;

    mockedListCurrentServerJobs.mockResolvedValue(list);
    mockedGetCurrentServerJobOptions.mockResolvedValue(options);
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const { loadJobsRouteData } = await import("./jobs-route-loader");

    await expect(
      loadJobsRouteData(
        {
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "owner",
          currentUserId: decodeUserId("user_123"),
        },
        {
          assigneeId: "unassigned",
          cursor: "cursor-one" as JobListCursorType,
          limit: 25,
          query: "boiler",
          status: "active",
        }
      )
    ).resolves.toMatchObject({
      list,
      listScope: {
        query: {
          assigneeId: "unassigned",
          cursor: "cursor-one",
          limit: 25,
          query: "boiler",
          status: "active",
        },
      },
    });
    expect(mockedListCurrentServerJobs).toHaveBeenCalledWith({
      assigneeId: "unassigned",
      cursor: "cursor-one",
      limit: 25,
      query: "boiler",
      status: "active",
    });
  });

  it("loads the jobs list and scoped external options without detail fanout", async () => {
    const calls: string[] = [];
    let listResolved = false;
    const listDeferred = Promise.withResolvers<JobListResponse>();
    const optionsDeferred = Promise.withResolvers<JobOptionsResponse>();
    const list = {
      items: [
        {
          createdAt: "2026-06-13T08:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
          kind: "job",
          labels: [],
          priority: "none",
          status: "new",
          title: "Inspect boiler",
          updatedAt: "2026-06-13T08:00:00.000Z",
        },
      ],
      nextCursor: undefined,
    } satisfies JobListResponse;
    const options = {
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    } satisfies JobOptionsResponse;

    mockedListCurrentServerJobs.mockImplementation(() => {
      calls.push("list:start");
      return listDeferred.promise;
    });
    mockedGetCurrentServerExternalJobOptions.mockImplementation(() => {
      calls.push(`external-options:start:listResolved:${String(listResolved)}`);
      return optionsDeferred.promise;
    });
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });

    const { loadJobsRouteData } = await import("./jobs-route-loader");
    const resultPromise = loadJobsRouteData({
      activeOrganizationId: organizationId,
      activeOrganizationSync: {
        required: false,
        targetOrganizationId: organizationId,
      },
      currentOrganizationRole: "external",
      currentUserId: decodeUserId("user_external"),
    });

    expect(calls).toStrictEqual([
      "list:start",
      "external-options:start:listResolved:false",
    ]);

    optionsDeferred.resolve(options);
    listResolved = true;
    listDeferred.resolve(list);

    await expect(resultPromise).resolves.toMatchObject({
      list,
      options,
      viewer: {
        role: "external",
        userId: "user_external",
      },
    });
    expect(mockedGetCurrentServerJobDetail).not.toHaveBeenCalled();
    expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
  });

  it("keeps jobs route data available when location preference loading fails", async () => {
    const list = {
      items: [],
      nextCursor: undefined,
    } satisfies JobListResponse;
    const options = {
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    } satisfies JobOptionsResponse;

    mockedListCurrentServerJobs.mockResolvedValue(list);
    mockedGetCurrentServerJobOptions.mockResolvedValue(options);
    mockedGetCurrentUserPreferences.mockRejectedValue(new Error("offline"));

    const { loadJobsRouteData } = await import("./jobs-route-loader");

    await expect(
      loadJobsRouteData({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "owner",
        currentUserId: decodeUserId("user_123"),
      })
    ).resolves.toMatchObject({
      list,
      options,
      routeProximityLocationEnabled: false,
    });
  });
});
