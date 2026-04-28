/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationActivityQuery } from "@task-tracker/jobs-core";

type ActivityLookupMock = (
  query?: OrganizationActivityQuery
) => Promise<unknown>;
type JobMemberOptionsLookupMock = () => Promise<unknown>;

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentServerJobMemberOptions,
  mockedListCurrentServerOrganizationActivity,
} = vi.hoisted(() => ({
  mockedGetCurrentServerJobMemberOptions: vi.fn<JobMemberOptionsLookupMock>(),
  mockedListCurrentServerOrganizationActivity: vi.fn<ActivityLookupMock>(),
}));

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerJobMemberOptions: mockedGetCurrentServerJobMemberOptions,
  listCurrentServerOrganizationActivity:
    mockedListCurrentServerOrganizationActivity,
}));

describe("activity route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "loads organization activity and options for %s users with filters",
    {
      timeout: 10_000,
    },
    async (role) => {
      const activity = {
        items: [],
        nextCursor: undefined,
      };
      const options = {
        members: [],
      };
      mockedListCurrentServerOrganizationActivity.mockResolvedValue(activity);
      mockedGetCurrentServerJobMemberOptions.mockResolvedValue(options);

      const { decodeActivitySearch, loadActivityRouteData } =
        await import("./_app._org.activity");
      const search = decodeActivitySearch({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });

      await expect(
        loadActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: false,
              targetOrganizationId: organizationId,
            },
            currentOrganizationRole: role,
          },
          search
        )
      ).resolves.toStrictEqual({
        activity,
        options,
      });
      expect(mockedListCurrentServerOrganizationActivity).toHaveBeenCalledWith(
        search
      );
      expect(mockedGetCurrentServerJobMemberOptions).toHaveBeenCalledOnce();
    }
  );

  it(
    "redirects members away from organization activity",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadActivityRouteData } = await import("./_app._org.activity");
      const result = loadActivityRouteData(
        {
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "member",
        },
        {}
      );

      await expect(result).rejects.toMatchObject({
        options: { to: "/" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
      expect(
        mockedListCurrentServerOrganizationActivity
      ).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobMemberOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "short-circuits while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadActivityRouteData } = await import("./_app._org.activity");

      await expect(
        loadActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: true,
              targetOrganizationId: organizationId,
            },
          },
          {}
        )
      ).resolves.toStrictEqual({
        activity: {
          items: [],
          nextCursor: undefined,
        },
        options: {
          members: [],
        },
      });
      expect(
        mockedListCurrentServerOrganizationActivity
      ).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobMemberOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "uses stable validated search fields as route loader deps",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeActivitySearch, getActivityRouteLoaderDeps } =
        await import("./_app._org.activity");
      const search = decodeActivitySearch({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "  Boiler  ",
        toDate: "2026-04-28",
        unknown: "ignored",
      });

      expect(getActivityRouteLoaderDeps(search)).toStrictEqual({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });
    }
  );

  it(
    "normalizes invalid activity search values",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeActivitySearch } = await import("./_app._org.activity");

      expect(
        decodeActivitySearch({
          actorUserId: "",
          eventType: "not_real",
          fromDate: "2026-02-31",
          ignored: "value",
          jobTitle: "   ",
          toDate: "tomorrow",
        })
      ).toStrictEqual({
        actorUserId: undefined,
        eventType: undefined,
        fromDate: undefined,
        jobTitle: undefined,
        toDate: undefined,
      });
      expect(
        decodeActivitySearch({
          actorUserId: "user_taylor",
          eventType: "job_created",
          fromDate: "2026-04-01",
          jobTitle: "  Boiler  ",
          toDate: "2026-04-28",
        })
      ).toStrictEqual({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });
    }
  );
});
