import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import type {
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
} from "@ceird/jobs-core";

type JobsListLookupMock = () => Promise<JobListResponse>;
type JobOptionsLookupMock = () => Promise<JobOptionsResponse>;
type JobDetailLookupMock = () => Promise<JobDetailResponse>;

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentServerJobDetail,
  mockedGetCurrentServerJobOptions,
  mockedGetCurrentUserPreferences,
  mockedListAllCurrentServerJobs,
} = vi.hoisted(() => ({
  mockedGetCurrentServerJobDetail: vi.fn<JobDetailLookupMock>(),
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
}));

vi.mock(import("#/features/jobs/jobs-server"), () => ({
  getCurrentServerJobDetail: mockedGetCurrentServerJobDetail,
  getCurrentServerJobOptions: mockedGetCurrentServerJobOptions,
  listAllCurrentServerJobs: mockedListAllCurrentServerJobs,
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

    mockedListAllCurrentServerJobs.mockImplementation(() => {
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

    mockedListAllCurrentServerJobs.mockResolvedValue(list);
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
